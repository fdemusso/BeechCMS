// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Content slice — Trash request contract, integration tier.
 * Covers what the route chain refuses and in which order: unknown seed, then the body, then the
 * ids. The happy paths (restore, purge, list, permissions) live in soft-delete.integration.test.ts.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const PROBLEM = 'https://beechcms.dev/problems/'

interface ProblemBody {
  type: string
}

interface TrashPage {
  items: unknown[]
  page: number
  limit: number
}

describe('content slice — trash contract (real D1)', () => {
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

  async function createTrashedPost(slug: string): Promise<string> {
    const created = await admin.post('/api/content/posts', { title: 'Trashed', slug })
    const { id } = await created.json<{ id: string }>()
    await admin.delete(`/api/content/posts/${id}`)
    return id
  }

  async function isStillTrashed(id: string): Promise<boolean> {
    const row = await harness.db.prepare('SELECT deleted_at FROM content_posts WHERE id = ?').bind(id).first<{ deleted_at: number | null }>()
    return row?.deleted_at != null
  }

  describe.each(['bulk-restore', 'bulk-purge'])('POST /api/content/:slug/trash/%s', (action) => {
    it('an unknown seed answers 404 content-seed-not-found before the body is read', async () => {
      // Regression guard: the seed lookup is a middleware ahead of zodJson. Swapped, a malformed
      // body would answer 400 here and a writer would learn the body contract of a missing seed.
      const response = await admin.post(`/api/content/no-such-seed/trash/${action}`, undefined, { body: '{not json' })

      expect(response.status).toBe(404)
      const body = await response.json<ProblemBody>()
      expect(body.type).toBe(`${PROBLEM}content-seed-not-found`)
    })

    it('a body that is not JSON is refused 400 content-invalid-json and the entry stays trashed', async () => {
      const id = await createTrashedPost('trash-contract-json')

      const response = await admin.post(`/api/content/posts/trash/${action}`, undefined, { body: '{not json' })

      expect(response.status).toBe(400)
      const body = await response.json<ProblemBody>()
      expect(body.type).toBe(`${PROBLEM}content-invalid-json`)
      expect(await isStillTrashed(id)).toBe(true)
    })

    it.each([[{}], [{ ids: [] }], [{ ids: 'an-id' }], [{ ids: [1] }], [null], [[]]])(
      'a body of %j is refused 400 bulk-invalid-ids and the entry stays trashed',
      async (payload) => {
        const id = await createTrashedPost('trash-contract-ids')

        const response = await admin.post(`/api/content/posts/trash/${action}`, payload)

        expect(response.status).toBe(400)
        const body = await response.json<ProblemBody>()
        expect(body.type).toBe(`${PROBLEM}bulk-invalid-ids`)
        expect(await isStillTrashed(id)).toBe(true)
      },
    )

    it('more than 500 ids are refused 400 bulk-size-exceeded and the entry stays trashed', async () => {
      const id = await createTrashedPost('trash-contract-size')
      const ids = Array.from({ length: 501 }, (_, index) => `id-${index}`)

      const response = await admin.post(`/api/content/posts/trash/${action}`, { ids })

      expect(response.status).toBe(400)
      const body = await response.json<ProblemBody>()
      expect(body.type).toBe(`${PROBLEM}bulk-size-exceeded`)
      expect(await isStillTrashed(id)).toBe(true)
    })

    it('an oversized list holding a non-string id reads as bulk-invalid-ids, as the element check ran first', async () => {
      const ids: unknown[] = Array.from({ length: 501 }, (_, index) => `id-${index}`)
      ids[0] = 7

      const response = await admin.post(`/api/content/posts/trash/${action}`, { ids })

      expect(response.status).toBe(400)
      const body = await response.json<ProblemBody>()
      expect(body.type).toBe(`${PROBLEM}bulk-invalid-ids`)
    })
  })

  describe('GET /api/content/:slug/trash', () => {
    it('an unknown seed answers 404 content-seed-not-found', async () => {
      const response = await admin.get('/api/content/no-such-seed/trash')

      expect(response.status).toBe(404)
      const body = await response.json<ProblemBody>()
      expect(body.type).toBe(`${PROBLEM}content-seed-not-found`)
    })

    it('a non-numeric page and a zero limit fall back to page 1 and 25 rows', async () => {
      const response = await admin.get('/api/content/posts/trash?page=abc&limit=0')

      expect(response.status).toBe(200)
      const body = await response.json<TrashPage>()
      expect(body).toMatchObject({ page: 1, limit: 25 })
    })

    it('a limit above 100 is clamped to 100', async () => {
      const response = await admin.get('/api/content/posts/trash?limit=1000')

      expect(response.status).toBe(200)
      const body = await response.json<TrashPage>()
      expect(body.limit).toBe(100)
    })
  })

  describe('POST /api/content/:slug/:id/restore', () => {
    it('an unknown seed answers 404 content-seed-not-found', async () => {
      const response = await admin.post('/api/content/no-such-seed/some-id/restore')

      expect(response.status).toBe(404)
      const body = await response.json<ProblemBody>()
      expect(body.type).toBe(`${PROBLEM}content-seed-not-found`)
    })

    it('an id that is not in the Trash answers 404 content-not-found', async () => {
      const response = await admin.post('/api/content/posts/no-such-entry/restore')

      expect(response.status).toBe(404)
      const body = await response.json<ProblemBody>()
      expect(body.type).toBe(`${PROBLEM}content-not-found`)
    })
  })
})
