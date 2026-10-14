// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Content slice — tags options integration tier. A closed-vocabulary `tags` branch is enforced
 * on write through the full middleware chain. The lenient read of an obsolete stored value is not
 * covered here: writing one requires naming the physical column (testing rule 3.7), and reads
 * never pass through the validator.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

interface ValidationProblem {
  type: string
  errors: Array<{ field: string; expected: string; received: string }>
}

describe('content slice — integration (real D1)', () => {
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

  async function countPosts(): Promise<number> {
    const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM content_posts').first<{ n: number }>()
    return row?.n ?? 0
  }

  describe('POST /api/content/:slug', () => {
    it('persists a single-choice tags value that is one of the options', async () => {
      const response = await admin.post('/api/content/posts', { title: 'Tagged', slug: 'tagged', priority: ['high'] })

      expect(response.status).toBe(201)
      const { id } = await response.json<{ id: string }>()
      const fetched = await admin.get(`/api/content/posts/${id}`)
      expect(fetched.status).toBe(200)
      const entry = await fetched.json<{ data: { priority: string[] } }>()
      expect(entry.data.priority).toEqual(['high'])
    })

    it('rejects a value outside the options with 400 tags(one-of) and persists nothing', async () => {
      const before = await countPosts()

      const response = await admin.post('/api/content/posts', { title: 'Tagged', slug: 'tagged', priority: ['urgent'] })

      expect(response.status).toBe(400)
      const problem = await response.json<ValidationProblem>()
      expect(problem.type).toContain('content-validation-failed')
      expect(problem.errors[0]).toMatchObject({ field: 'priority', expected: 'tags(one-of:low|high)' })
      expect(await countPosts()).toBe(before)
    })

    it('rejects two values on a single-choice branch with 400 tags(max:1) and persists nothing', async () => {
      const before = await countPosts()

      const response = await admin.post('/api/content/posts', { title: 'Tagged', slug: 'tagged', priority: ['low', 'high'] })

      expect(response.status).toBe(400)
      const problem = await response.json<ValidationProblem>()
      expect(problem.errors[0]).toMatchObject({ field: 'priority', expected: 'tags(max:1)' })
      expect(await countPosts()).toBe(before)
    })

    it('rejects a bare string with 400 expected array and persists nothing', async () => {
      const before = await countPosts()

      const response = await admin.post('/api/content/posts', { title: 'Tagged', slug: 'tagged', priority: 'low' })

      expect(response.status).toBe(400)
      const problem = await response.json<ValidationProblem>()
      expect(problem.errors[0]).toMatchObject({ field: 'priority', expected: 'array', received: 'string' })
      expect(await countPosts()).toBe(before)
    })

    it('rejects 11 free tags with 400 tags(max:10) and persists nothing', async () => {
      const before = await countPosts()
      const eleven = Array.from({ length: 11 }, (_, i) => `t${i}`)

      const response = await admin.post('/api/content/posts', { title: 'Tagged', slug: 'tagged', tags: eleven })

      expect(response.status).toBe(400)
      const problem = await response.json<ValidationProblem>()
      expect(problem.errors[0]).toMatchObject({ field: 'tags', expected: 'tags(max:10)' })
      expect(await countPosts()).toBe(before)
    })

    it('rejects a 26-character tag with 400 tags(item-max:25) and persists nothing', async () => {
      const before = await countPosts()

      const response = await admin.post('/api/content/posts', { title: 'Tagged', slug: 'tagged', tags: ['a'.repeat(26)] })

      expect(response.status).toBe(400)
      const problem = await response.json<ValidationProblem>()
      expect(problem.errors[0]).toMatchObject({ field: 'tags', expected: 'tags(item-max:25)' })
      expect(await countPosts()).toBe(before)
    })

    it('rejects a tag that differs from another only by a zero-width space as tags(unique)', async () => {
      const before = await countPosts()

      const response = await admin.post('/api/content/posts', { title: 'Tagged', slug: 'tagged', tags: ['news', 'news\u200B'] })

      expect(response.status).toBe(400)
      const problem = await response.json<ValidationProblem>()
      expect(problem.errors[0]).toMatchObject({ field: 'tags', expected: 'tags(unique)' })
      expect(await countPosts()).toBe(before)
    })

    // The stored form is what filters and sorting compare against, so it must be the canonical one.
    it('persists a decomposed, padded, tab-split tag in its canonical form', async () => {
      const response = await admin.post('/api/content/posts', { title: 'Tagged', slug: 'tagged', tags: [' cafe\u0301 \u200B ', 'a\t b'] })

      expect(response.status).toBe(201)
      const { id } = await response.json<{ id: string }>()
      const fetched = await admin.get(`/api/content/posts/${id}`)
      const entry = await fetched.json<{ data: { tags: string[] } }>()
      expect(entry.data.tags).toEqual(['caf\u00E9', 'a b'])
    })
  })

  describe('PUT /api/content/:slug/:id', () => {
    it('rejects duplicate tags with 400 tags(unique) and keeps the stored row', async () => {
      const created = await admin.post('/api/content/posts', { title: 'Tagged', slug: 'tagged', tags: ['a'] })
      expect(created.status).toBe(201)
      const { id } = await created.json<{ id: string }>()

      const response = await admin.put(`/api/content/posts/${id}`, { tags: ['a', 'a'] })

      expect(response.status).toBe(400)
      const problem = await response.json<ValidationProblem>()
      expect(problem.errors[0]).toMatchObject({ field: 'tags', expected: 'tags(unique)' })
      const fetched = await admin.get(`/api/content/posts/${id}`)
      const entry = await fetched.json<{ data: { tags: string[] } }>()
      expect(entry.data.tags).toEqual(['a'])
    })

    it('rejects an over-long tag with 400 tags(item-max:25) and keeps the stored row', async () => {
      const created = await admin.post('/api/content/posts', { title: 'Tagged', slug: 'tagged', tags: ['a'] })
      expect(created.status).toBe(201)
      const { id } = await created.json<{ id: string }>()

      const response = await admin.put(`/api/content/posts/${id}`, { tags: ['a', 'b'.repeat(26)] })

      expect(response.status).toBe(400)
      const problem = await response.json<ValidationProblem>()
      expect(problem.errors[0]).toMatchObject({ field: 'tags', expected: 'tags(item-max:25)' })
      const fetched = await admin.get(`/api/content/posts/${id}`)
      const entry = await fetched.json<{ data: { tags: string[] } }>()
      expect(entry.data.tags).toEqual(['a'])
    })
  })

  describe('GET /api/content/:slug', () => {
    async function createPost(slug: string, priority: string[]): Promise<string> {
      const response = await admin.post('/api/content/posts', { title: slug, slug, priority })
      expect(response.status).toBe(201) // precondition
      return (await response.json<{ id: string }>()).id
    }

    it('sorts by a single-choice tags branch in option order with empty values last', async () => {
      const highId = await createPost('p-high', ['high'])
      const emptyId = await createPost('p-empty', [])
      const lowId = await createPost('p-low', ['low'])

      const ascending = await admin.get('/api/content/posts?sortBy=priority&sortDir=asc&page=1&limit=10')

      expect(ascending.status).toBe(200)
      const ascendingBody = await ascending.json<{ items: { id: string }[] }>()
      expect(ascendingBody.items.map((item) => item.id)).toEqual([lowId, highId, emptyId])

      const descending = await admin.get('/api/content/posts?sortBy=priority&sortDir=desc&page=1&limit=10')

      expect(descending.status).toBe(200)
      const descendingBody = await descending.json<{ items: { id: string }[] }>()
      expect(descendingBody.items.map((item) => item.id)).toEqual([highId, lowId, emptyId])
    })

    it('filters a tags column with eq by membership', async () => {
      const highId = await createPost('p-high', ['high'])
      await createPost('p-low', ['low'])
      await createPost('p-empty', [])

      const filters = encodeURIComponent(JSON.stringify({
        priority: { columnId: 'priority', type: 'tags', conditions: [{ op: 'eq', value: 'high' }] },
      }))
      const response = await admin.get(`/api/content/posts?page=1&limit=10&filters=${filters}`)

      expect(response.status).toBe(200)
      const body = await response.json<{ items: { id: string }[]; total: number }>()
      expect(body.total).toBe(1)
      expect(body.items[0].id).toBe(highId)
    })

    it('finds an entry by a decomposed needle because stored tags and the filter share one canonical form', async () => {
      const created = await admin.post('/api/content/posts', { title: 'cafe', slug: 'cafe', tags: ['caf\u00E9'] })
      expect(created.status).toBe(201) // precondition
      const { id } = await created.json<{ id: string }>()

      const filters = encodeURIComponent(JSON.stringify({
        tags: { columnId: 'tags', type: 'tags', conditions: [{ op: 'has_tag', value: 'cafe\u0301' }] },
      }))
      const response = await admin.get(`/api/content/posts?page=1&limit=10&filters=${filters}`)

      expect(response.status).toBe(200)
      const body = await response.json<{ items: { id: string }[]; total: number }>()
      expect(body.items.map((item) => item.id)).toEqual([id])
    })
  })
})
