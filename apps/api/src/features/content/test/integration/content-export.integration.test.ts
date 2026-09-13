// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Content slice — export integration tier.
 * Covers `GET /api/content/:slug/export` through the full middleware chain against real D1:
 * format negotiation, the flat-seed CSV refusal, the synchronous row cap, RBAC, soft-delete
 * exclusion and field-visibility masking. The producer's own paging/keyset behaviour is unit
 * tested in `../../export-stream.test.ts` against a stubbed repository.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed } from '@beechcms/core'
import { createTestHarness, UUID_V4_PATTERN, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

describe('content slice — export integration (real D1)', () => {
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

  describe('GET /api/content/:slug/export', () => {
    it('NDJSON happy path: one line per entry, each carrying the system fields and the branch data', async () => {
      const created = await Promise.all([
        admin.post('/api/content/categories', { name: 'Alpha', slug: 'alpha' }),
        admin.post('/api/content/categories', { name: 'Beta', slug: 'beta' }),
        admin.post('/api/content/categories', { name: 'Gamma', slug: 'gamma' }),
      ])
      const createdIds = await Promise.all(created.map(async (r) => (await r.json<{ id: string }>()).id))

      const response = await admin.get('/api/content/categories/export')

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toMatch(/^application\/x-ndjson/)
      const lines = (await response.text()).split('\n').filter(Boolean)
      expect(lines).toHaveLength(3)
      const rows = lines.map((line) => JSON.parse(line) as Record<string, unknown>)
      for (const row of rows) {
        expect(Object.keys(row)).toEqual(expect.arrayContaining(['id', 'slug', 'status', 'created_at', 'updated_at', 'name']))
      }
      const emittedIds = rows.map((row) => row.id as string)
      for (const id of emittedIds) expect(id).toMatch(UUID_V4_PATTERN)
      expect(emittedIds.sort()).toEqual([...createdIds].sort())
    })

    it('row order is id ascending, the published contract for chunked export', async () => {
      const created = await Promise.all([
        admin.post('/api/content/categories', { name: 'One', slug: 'one' }),
        admin.post('/api/content/categories', { name: 'Two', slug: 'two' }),
        admin.post('/api/content/categories', { name: 'Three', slug: 'three' }),
      ])
      const createdIds = await Promise.all(created.map(async (r) => (await r.json<{ id: string }>()).id))

      const response = await admin.get('/api/content/categories/export')

      const emittedIds = (await response.text()).split('\n').filter(Boolean).map((line) => (JSON.parse(line) as { id: string }).id)
      expect(emittedIds).toEqual([...createdIds].sort())
    })

    it('CSV happy path on a flat seed: header row, one data row per entry, download headers set', async () => {
      await admin.post('/api/content/categories', { name: 'Alpha', slug: 'alpha' })

      const response = await admin.get('/api/content/categories/export?format=csv')

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toMatch(/^text\/csv/)
      expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="categories.csv"')
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      const body = await response.text()
      const [headerLine] = body.split('\r\n')
      expect(headerLine).toBe('id,slug,status,created_at,updated_at,name')
      expect(body.split('\r\n').filter(Boolean)).toHaveLength(2)
    })

    it('CSV on a non-flat seed is refused with one errors[] entry per offending branch', async () => {
      await admin.post('/api/content/posts', { title: 'Post', slug: 'post-1' })

      const response = await admin.get('/api/content/posts/export?format=csv')

      expect(response.status).toBe(400)
      const body = await response.json<{ type: string; errors: Array<{ field: string }> }>()
      expect(body.type).toBe('https://beechcms.dev/problems/content-csv-requires-flat-seed')
      expect(new Set(body.errors.map((e) => e.field))).toEqual(new Set(['tags', 'author_id', 'category_id', 'related_posts']))
    })

    it('NDJSON on the same non-flat seed succeeds, proving the refusal is format-specific', async () => {
      await admin.post('/api/content/posts', { title: 'Post', slug: 'post-1' })

      const response = await admin.get('/api/content/posts/export')

      expect(response.status).toBe(200)
    })

    it('an unsupported format value is refused with content-invalid-export-format', async () => {
      const response = await admin.get('/api/content/categories/export?format=json')

      expect(response.status).toBe(400)
      const body = await response.json<{ type: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/content-invalid-export-format')
    })

    it('an unknown seed slug returns 404 content-seed-not-found', async () => {
      const response = await admin.get('/api/content/not-a-seed/export')

      expect(response.status).toBe(404)
      const body = await response.json<{ type: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/content-seed-not-found')
    })

    it('exceeding EXPORT_MAX_ROWS refuses with 413 before any row is streamed', async () => {
      // '2' overrides DEFAULT_EXPORT_MAX_ROWS (50 000) for this test only — the suite-local
      // harness lets a 3-row seed exceed a cap that no real deployment would set this low.
      const capHarness = await createTestHarness({
        db: env.DB,
        env: { EXPORT_MAX_ROWS: '2' },
        createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
      })
      const capAdmin = await capHarness.asUser('admin')
      await capAdmin.post('/api/content/categories', { name: 'A', slug: 'a' })
      await capAdmin.post('/api/content/categories', { name: 'B', slug: 'b' })
      await capAdmin.post('/api/content/categories', { name: 'C', slug: 'c' })

      const response = await capAdmin.get('/api/content/categories/export')

      expect(response.status).toBe(413)
      expect(response.headers.get('Content-Type')).toBe('application/problem+json')
      const body = await response.json<{ type: string; items?: unknown }>()
      expect(body.type).toBe('https://beechcms.dev/problems/content-export-too-large')
      // Regression guard: the cap MUST be enforced by the pre-flight count, before the
      // stream opens — once the first byte is written the status is already 200 and a
      // later refusal could only truncate the file. A problem document with no row data
      // proves no page was ever read.
      expect(body.items).toBeUndefined()
    })

    it('trashed entries never appear in the export', async () => {
      const trashableSeed = defineSeed({
        slug: 'trashable_widgets',
        label: 'Trashable Widget',
        labelPlural: 'Trashable Widgets',
        displayNameAlias: 'name',
        softDelete: true,
        branches: [{ id: 'br_01', alias: 'name', label: 'Name', type: 'text', requiredOnCreate: true }],
      })
      const trashHarness = await createTestHarness({
        db: env.DB,
        seeds: [trashableSeed],
        createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
      })
      const trashAdmin = await trashHarness.asUser('admin')
      const kept = await trashAdmin.post('/api/content/trashable_widgets', { name: 'Kept', slug: 'kept' })
      const { id: keptId } = await kept.json<{ id: string }>()
      const trashed = await trashAdmin.post('/api/content/trashable_widgets', { name: 'Trashed', slug: 'trashed' })
      const { id: trashedId } = await trashed.json<{ id: string }>()
      await trashAdmin.delete(`/api/content/trashable_widgets/${trashedId}`)

      const response = await trashAdmin.get('/api/content/trashable_widgets/export')

      const emittedIds = (await response.text()).split('\n').filter(Boolean).map((line) => (JSON.parse(line) as { id: string }).id)
      expect(emittedIds).toEqual([keptId])
      expect(emittedIds).not.toContain(trashedId)
    })

    it('a masked branch stays masked in the exported file, exactly as on the list endpoint', async () => {
      const maskedSeed = defineSeed({
        slug: 'masked_widgets',
        label: 'Masked Widget',
        labelPlural: 'Masked Widgets',
        displayNameAlias: 'title',
        branches: [
          { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
          { id: 'br_02', alias: 'secret', label: 'Secret', type: 'text', policies: { visibility: 'masked' } },
        ],
      })
      const maskedHarness = await createTestHarness({
        db: env.DB,
        seeds: [maskedSeed],
        createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
      })
      const maskedAdmin = await maskedHarness.asUser('admin')
      await maskedAdmin.post('/api/content/masked_widgets', { title: 'Widget', slug: 'widget', secret: 'do-not-leak' })

      const response = await maskedAdmin.get('/api/content/masked_widgets/export')

      const [row] = (await response.text()).split('\n').filter(Boolean).map((line) => JSON.parse(line) as { secret: string })
      expect(row.secret).toBe('••••••••')
    })

    it('a caller without content:read on the seed receives 403', async () => {
      // 'viewer' is editor-shaped but deliberately given no RBAC role assignment, so the
      // refusal below comes from the permission gate, not from the users.role CHECK.
      const viewer = await harness.asUser('viewer')

      const response = await viewer.get('/api/content/categories/export')

      expect(response.status).toBe(403)
    })

    it('an unauthenticated caller receives 401', async () => {
      const response = await harness.anonymous().get('/api/content/categories/export')

      expect(response.status).toBe(401)
    })
  })
})
