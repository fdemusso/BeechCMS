// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Content slice — entry slug derivation, integration tier.
 * Covers the slug an entry is stored under when it is derived from the display name or sent
 * explicitly. Slug uniqueness under concurrent writes lives in the soft-delete suite.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

describe('content slice — entry slugs (real D1)', () => {
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

  async function slugOf(id: string): Promise<string | undefined> {
    const row = await harness.db.prepare('SELECT slug FROM content_posts WHERE id = ?').bind(id).first<{ slug: string }>()
    return row?.slug
  }

  describe('POST /api/content/:slug', () => {
    // Regression guard: slugify used to cut every slug at 15 characters, so two names sharing a
    // brand-and-model prefix collapsed onto one slug and the second create answered 409.
    it('two names sharing their first 15 characters are created under distinct slugs', async () => {
      const first = await admin.post('/api/content/posts', { title: 'Michelin Primacy 4 205/55 R16 94V' })
      expect(first.status).toBe(201) // precondition

      const second = await admin.post('/api/content/posts', { title: 'Michelin Primacy 4 225/45 R17 94Y' })

      expect(second.status).toBe(201)
      const firstId = (await first.json<{ id: string }>()).id
      const secondId = (await second.json<{ id: string }>()).id
      // slugify drops `/` rather than turning it into a dash, hence `20555`.
      expect(await slugOf(firstId)).toBe('michelin-primacy-4-20555-r16-94v')
      expect(await slugOf(secondId)).toBe('michelin-primacy-4-22545-r17-94y')
    })

    it('two explicit slugs sharing their first 15 characters are stored as sent', async () => {
      const first = await admin.post('/api/content/posts', { title: 'Row one', slug: 'riga-2026-0101-1' })
      expect(first.status).toBe(201) // precondition

      const second = await admin.post('/api/content/posts', { title: 'Row two', slug: 'riga-2026-0101-2' })

      expect(second.status).toBe(201)
      const secondId = (await second.json<{ id: string }>()).id
      expect(await slugOf(secondId)).toBe('riga-2026-0101-2')
    })

    it('an identical slug is still refused 409 content-slug-conflict and nothing is created', async () => {
      const first = await admin.post('/api/content/posts', { title: 'Same', slug: 'same-slug' })
      expect(first.status).toBe(201) // precondition

      const duplicate = await admin.post('/api/content/posts', { title: 'Same again', slug: 'same-slug' })

      expect(duplicate.status).toBe(409)
      expect((await duplicate.json<{ type: string }>()).type).toBe('https://beechcms.dev/problems/content-slug-conflict')
      const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM content_posts').first<{ n: number }>()
      expect(row?.n).toBe(1)
    })
  })
})
