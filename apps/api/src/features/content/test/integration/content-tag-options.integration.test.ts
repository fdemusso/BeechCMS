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
  })
})
