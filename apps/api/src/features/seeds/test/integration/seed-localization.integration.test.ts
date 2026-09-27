// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Seeds slice — localization integration tier. Covers the schema-level rules of field localization
 * through the real Seeds API and D1: illegal combinations are refused, the toggle is metadata-only,
 * and retype refuses localized branches. Content read/write behaviour is covered by the content and
 * public slices in later sprints.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

interface SeedBranchBody {
  id: string
  alias: string
  type: string
  localized?: boolean
}

interface SeedRecordBody {
  slug: string
  definition: { branches: SeedBranchBody[] }
  status: 'active' | 'deleted'
  source: 'code' | 'runtime'
}

describe('seeds slice — localization (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
  })

  describe('POST /api/seeds', () => {
    it('refuses localized on number, a repeater sub-field and confidential text with 422 and creates no table', async () => {
      const cases: Array<{ slug: string; branches: unknown[] }> = [
        {
          slug: 'loc_bad_number',
          branches: [
            { alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
            { alias: 'price', label: 'Price', type: 'number', localized: true },
          ],
        },
        {
          slug: 'loc_bad_sub',
          branches: [
            { alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
            {
              alias: 'items',
              label: 'Items',
              type: 'repeater',
              fields: [{ alias: 'name', label: 'Name', type: 'text', localized: true }],
            },
          ],
        },
        {
          slug: 'loc_bad_conf',
          branches: [
            { alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
            { alias: 'secret', label: 'Secret', type: 'text', localized: true, policies: { classification: 'confidential' } },
          ],
        },
      ]

      for (const candidate of cases) {
        const response = await admin.post('/api/seeds', { slug: candidate.slug, label: 'Test', branches: candidate.branches })

        expect(response.status).toBe(422)
        const body = await response.json<{ type: string }>()
        expect(body.type).toContain('validation-failed')

        const tableCheck = await harness.db
          .prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?`)
          .bind(`content_${candidate.slug}`)
          .first<{ n: number }>()
        expect(tableCheck?.n).toBe(0)
      }
    })

    it('accepts localized text, richtext and json branches and persists the flag', async () => {
      const response = await admin.post('/api/seeds', {
        slug: 'loc_accept',
        label: 'Accept',
        branches: [
          { alias: 'title', label: 'Title', type: 'text', localized: true, requiredOnCreate: true },
          { alias: 'body', label: 'Body', type: 'richtext', localized: true },
          { alias: 'meta', label: 'Meta', type: 'json', localized: true },
        ],
      })
      expect(response.status).toBe(201)

      const stored = await admin.get('/api/seeds/loc_accept')
      const record = await stored.json<SeedRecordBody>()
      const localizedAliases = record.definition.branches.filter(b => b.localized === true).map(b => b.alias)
      expect(localizedAliases).toEqual(['title', 'body', 'meta'])
    })
  })

  describe('PUT /api/seeds/:slug', () => {
    it('toggles localized on a text branch with existing rows without touching columns or stored values', async () => {
      const created = await admin.post('/api/seeds', {
        slug: 'loc_toggle',
        label: 'Toggle',
        branches: [{ alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true }],
      })
      expect(created.status).toBe(201) // precondition

      const entryResponse = await admin.post('/api/content/loc_toggle', { title: 'Scarpa', slug: 'scarpa' })
      expect(entryResponse.status).toBe(201) // precondition

      const columnsBefore = await harness.db.prepare('PRAGMA table_info(content_loc_toggle)').all()
      const existing = await (await admin.get('/api/seeds/loc_toggle')).json<SeedRecordBody>()

      const response = await admin.put('/api/seeds/loc_toggle', {
        ...existing.definition,
        branches: existing.definition.branches.map(b => (b.alias === 'title' ? { ...b, localized: true } : b)),
      })

      expect(response.status).toBe(200)

      const afterStored = await admin.get('/api/seeds/loc_toggle')
      const afterRecord = await afterStored.json<SeedRecordBody>()
      const titleBranch = afterRecord.definition.branches.find(b => b.alias === 'title')
      expect(titleBranch?.localized).toBe(true)

      const columnsAfter = await harness.db.prepare('PRAGMA table_info(content_loc_toggle)').all()
      expect(columnsAfter.results).toEqual(columnsBefore.results)

      const row = await harness.db
        .prepare(`SELECT title FROM content_loc_toggle WHERE slug = ?`)
        .bind('scarpa')
        .first<{ title: string }>()
      expect(row?.title).toBe('Scarpa')
    })
  })

  describe('PATCH /api/seeds/:slug/branches/:branchId/retype', () => {
    it('refuses to retype a localized branch with 422 and leaves its type and column intact', async () => {
      await admin.post('/api/seeds', {
        slug: 'loc_retype',
        label: 'Retype',
        branches: [
          { alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
          { alias: 'subtitle', label: 'Subtitle', type: 'text', localized: true },
        ],
      })
      const existing = await (await admin.get('/api/seeds/loc_retype')).json<SeedRecordBody>()
      const subtitleBranch = existing.definition.branches.find(b => b.alias === 'subtitle')
      if (!subtitleBranch) throw new Error('subtitle branch not found in stored definition')

      const response = await admin.patch(`/api/seeds/loc_retype/branches/${subtitleBranch.id}/retype`, {
        newType: 'number',
        confirm: 'loc_retype.subtitle',
      })

      expect(response.status).toBe(422)
      const body = await response.json<{ type: string }>()
      expect(body.type).toContain('retype-localized-not-supported')

      const afterStored = await admin.get('/api/seeds/loc_retype')
      const afterRecord = await afterStored.json<SeedRecordBody>()
      const afterSubtitle = afterRecord.definition.branches.find(b => b.alias === 'subtitle')
      expect(afterSubtitle?.type).toBe('text')
      expect(afterSubtitle?.localized).toBe(true)

      const columns = await harness.db.prepare('PRAGMA table_info(content_loc_retype)').all()
      const subtitleColumn = columns.results?.find((c: unknown) => (c as { name: string }).name === 'subtitle')
      expect((subtitleColumn as { type: string } | undefined)?.type).toBe('TEXT')
    })
  })
})
