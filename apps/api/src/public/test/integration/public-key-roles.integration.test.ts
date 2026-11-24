// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Public slice — key roles integration tier. Covers the publishable and secret keys through the full
 * middleware chain against real D1: the key authenticates, the seed policy still authorizes.
 * Key matrices per method live in the unit tier (api-key-middleware.test.ts).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, TEST_PUBLISHABLE_KEY, TEST_SECRET_KEY, UUID_V4_PATTERN, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../factory'
import { __resetSeedRegistryCache } from '../../../shared/services/cache/seed-registry-cache'
import { DEV_SECRET_KEY } from '../../middleware/public-key-auth'
import { createBeechServerClient } from '../../../../../../packages/client/src/server/index.js'

const PROBLEM_BASE = 'https://beechcms.dev/problems/'

interface PublicList {
  data: Array<{ title: string }>
  meta: { total: number }
}

interface Problem {
  type: string
}

describe('public slice — key roles (real D1)', () => {
  let harness: TestHarness
  let publishableClient: TestClient
  let secretClient: TestClient

  async function buildHarness(extraEnv: Record<string, unknown> = {}): Promise<TestHarness> {
    __resetSeedRegistryCache()
    return createTestHarness({
      db: env.DB,
      env: extraEnv,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
  }

  async function countPosts(): Promise<number> {
    const response = await harness.anonymous().withHeaders({ 'X-API-Key': TEST_PUBLISHABLE_KEY }).get('/api/v1/public/posts')
    return (await response.json<PublicList>()).meta.total
  }

  beforeEach(async () => {
    harness = await buildHarness()
    publishableClient = harness.anonymous().withHeaders({ 'X-API-Key': TEST_PUBLISHABLE_KEY })
    secretClient = harness.anonymous().withHeaders({ 'X-API-Key': TEST_SECRET_KEY })
  })

  describe('GET /api/v1/public/:seed', () => {
    it('the publishable key lists posts', async () => {
      const response = await publishableClient.get('/api/v1/public/posts')

      expect(response.status).toBe(200)
      const body = await response.json<PublicList>()
      expect(body.meta.total).toBe(0)
    })

    it('the secret key lists posts', async () => {
      const response = await secretClient.get('/api/v1/public/posts')

      expect(response.status).toBe(200)
      const body = await response.json<PublicList>()
      expect(body.meta.total).toBe(0)
    })

    it('a request without a key gets 401 key-unauthorized', async () => {
      const response = await harness.anonymous().get('/api/v1/public/posts')

      expect(response.status).toBe(401)
      const body = await response.json<Problem>()
      expect(body.type).toBe(`${PROBLEM_BASE}public-api-key-unauthorized`)
    })
  })

  describe('POST /api/v1/public/:seed/add', () => {
    it('the secret key creates a posts entry without a Time-Trap token', async () => {
      const response = await secretClient.post('/api/v1/public/posts/add', { data: { title: 'From the server' } })

      expect(response.status).toBe(201)
      const body = await response.json<{ id: string }>()
      expect(body.id).toMatch(UUID_V4_PATTERN)
      const listed = await publishableClient.get('/api/v1/public/posts')
      const listedBody = await listed.json<PublicList>()
      expect(listedBody.data.map((entry) => entry.title)).toEqual(['From the server'])
    })

    it('the publishable key gets 403 secret-key-required and the posts list is unchanged', async () => {
      const response = await publishableClient.post('/api/v1/public/posts/add', { data: { title: 'From the browser' } })

      expect(response.status).toBe(403)
      const body = await response.json<Problem>()
      expect(body.type).toBe(`${PROBLEM_BASE}public-api-secret-key-required`)
      expect(await countPosts()).toBe(0)
    })

    it('the secret key on categories gets 403 operation-not-allowed and nothing is written', async () => {
      // The key authenticates, the seed authorizes: categories has no allowPublicPost (the split is tracked in #1022).
      const response = await secretClient.post('/api/v1/public/categories/add', { data: { name: 'Nope' } })

      expect(response.status).toBe(403)
      const body = await response.json<Problem>()
      expect(body.type).toBe(`${PROBLEM_BASE}operation-not-allowed`)
      const listed = await publishableClient.get('/api/v1/public/categories')
      const listedBody = await listed.json<PublicList>()
      expect(listedBody.meta.total).toBe(0)
    })

    it('ENV production refuses the dev secret key with 403 dev-secret-key and nothing is written', async () => {
      harness = await buildHarness({ ENV: 'production', BEECH_SECRET_KEY: DEV_SECRET_KEY })
      const devSecretClient = harness.anonymous().withHeaders({ 'X-API-Key': DEV_SECRET_KEY })

      const response = await devSecretClient.post('/api/v1/public/posts/add', { data: { title: 'Dev key in prod' } })

      expect(response.status).toBe(403)
      const body = await response.json<Problem>()
      expect(body.type).toBe(`${PROBLEM_BASE}public-api-dev-secret-key`)
      expect(await countPosts()).toBe(0)
    })

    it('an anonymous submission without a Time-Trap token still gets 422 time-trap-missing', async () => {
      const response = await harness.anonymous().post('/api/v1/public/posts/add', { data: { title: 'Bot' } })

      expect(response.status).toBe(422)
      const body = await response.json<Problem>()
      expect(body.type).toBe(`${PROBLEM_BASE}time-trap-missing`)
      expect(await countPosts()).toBe(0)
    })

    it('the secret key with a malformed category_id gets 400 validation_failed, not 500', async () => {
      // Relation branch: it used to throw in core because the public adapter passed no id generator.
      const response = await secretClient.post('/api/v1/public/posts/add', { data: { title: 'Bad relation', category_id: 'not-a-uuid' } })

      expect(response.status).toBe(400)
      const body = await response.json<Problem & { errors: unknown }>()
      expect(body.type).toBe(`${PROBLEM_BASE}validation_failed`)
      expect(JSON.stringify(body.errors)).toContain('category_id')
      expect(await countPosts()).toBe(0)
    })
  })

  describe('PUT /api/v1/public/:seed/edit/:id', () => {
    async function createPost(title: string): Promise<string> {
      const created = await secretClient.post('/api/v1/public/posts/add', { data: { title } })
      return (await created.json<{ id: string }>()).id
    }

    it('the secret key updates the title of a posts entry it created', async () => {
      const id = await createPost('Before')

      const response = await secretClient.put(`/api/v1/public/posts/edit/${id}`, { title: 'After' })

      expect(response.status).toBe(200)
      const listed = await publishableClient.get('/api/v1/public/posts')
      const listedBody = await listed.json<PublicList>()
      expect(listedBody.data.map((entry) => entry.title)).toEqual(['After'])
    })

    it('the publishable key gets 403 secret-key-required and the title is unchanged', async () => {
      const id = await createPost('Before')

      const response = await publishableClient.put(`/api/v1/public/posts/edit/${id}`, { title: 'After' })

      expect(response.status).toBe(403)
      const body = await response.json<Problem>()
      expect(body.type).toBe(`${PROBLEM_BASE}public-api-secret-key-required`)
      const listed = await publishableClient.get('/api/v1/public/posts')
      const listedBody = await listed.json<PublicList>()
      expect(listedBody.data.map((entry) => entry.title)).toEqual(['Before'])
    })
  })

  describe('createBeechServerClient — one instance, one key', () => {
    it('an instance built with only secretKey creates an entry that its own list and first then return', async () => {
      // In-process bridge, no network: the client's fetch lands directly on the app under test.
      const bridgedFetch: typeof fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
        return harness.app.request(url, init, harness.env)
      }
      const client = createBeechServerClient<{ posts: { title: string } }>({
        baseUrl: 'https://api.beechcms.local',
        secretKey: TEST_SECRET_KEY,
        fetch: bridgedFetch,
      })
      const posts = client.collection('posts')

      const created = await posts.create({ title: 'One key, one instance' })

      expect(created.error).toBeNull()
      const listed = await posts.list()
      expect(listed.error).toBeNull()
      expect(listed.data?.data.map((entry) => entry.title)).toEqual(['One key, one instance'])
      const first = await posts.first()
      expect(first.data?.data.title).toBe('One key, one instance')
    })
  })
})
