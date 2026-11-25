// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Public slice — existence oracle integration tier. A caller holding only the publishable key must not
 * learn which private seeds or unpublished entries exist: they answer exactly like unknown ones.
 * The `authors` canonical seed has no public flag, `import_jobs` is a system seed the API hides on purpose.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, TEST_PUBLISHABLE_KEY, TEST_SECRET_KEY, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../factory'
import { __resetSeedRegistryCache } from '../../../shared/services/cache/seed-registry-cache'

interface Problem {
  type: string
  title: string
  detail: string
}

const MISSING_ID = '3f6b1f0e-5c1a-4a8e-9a53-2f8f6d0c7a11'

/** The detail names the requested slug or id, so equality is checked after masking it. */
function masked(problem: Problem, requested: string): string {
  return problem.detail.split(requested).join('<requested>')
}

describe('public slice — existence oracle (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  let publishableClient: TestClient
  let secretClient: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    publishableClient = harness.anonymous().withHeaders({ 'X-API-Key': TEST_PUBLISHABLE_KEY })
    secretClient = harness.anonymous().withHeaders({ 'X-API-Key': TEST_SECRET_KEY })
  })

  describe('GET /api/v1/public/:seed', () => {
    it('a seed without allowPublicRead answers the same 404 problem as an unknown seed', async () => {
      const unknown = await publishableClient.get('/api/v1/public/ghost')
      const unknownBody = await unknown.json<Problem>()

      const response = await publishableClient.get('/api/v1/public/authors')

      expect(response.status).toBe(404)
      expect(unknown.status).toBe(404)
      const body = await response.json<Problem>()
      expect(body.type).toBe(unknownBody.type)
      expect(body.title).toBe(unknownBody.title)
      expect(masked(body, 'authors')).toBe(masked(unknownBody, 'ghost'))
    })

    it('the 404 for an unknown seed names no seed other than the requested one', async () => {
      const response = await publishableClient.get('/api/v1/public/ghost')

      expect(response.status).toBe(404)
      const raw = await response.text()
      for (const registered of ['import_jobs', 'authors', 'categories', 'posts']) {
        expect(raw).not.toContain(registered)
      }
    })

    it('an unpublished entry answers the same 404 problem as a missing entry', async () => {
      const draft = await admin.post('/api/content/posts', { title: 'Hidden draft', slug: 'hidden-draft', status: 'draft' })
      expect(draft.status).toBe(201)
      const { id } = await draft.json<{ id: string }>()
      const missing = await publishableClient.get(`/api/v1/public/posts?id=${MISSING_ID}`)
      const missingBody = await missing.json<Problem>()

      const response = await publishableClient.get(`/api/v1/public/posts?id=${id}`)

      expect(response.status).toBe(404)
      expect(missing.status).toBe(404)
      const body = await response.json<Problem>()
      expect(body.type).toBe(missingBody.type)
      expect(masked(body, id)).toBe(masked(missingBody, MISSING_ID))
    })

    it('an unpublished slug answers the same 404 problem as a missing slug', async () => {
      const draft = await admin.post('/api/content/posts', { title: 'Hidden draft', slug: 'hidden-draft', status: 'draft' })
      expect(draft.status).toBe(201)
      const missing = await publishableClient.get('/api/v1/public/posts?slug=no-such-post')
      const missingBody = await missing.json<Problem>()

      const response = await publishableClient.get('/api/v1/public/posts?slug=hidden-draft')

      expect(response.status).toBe(404)
      expect(missing.status).toBe(404)
      const body = await response.json<Problem>()
      expect(body.type).toBe(missingBody.type)
      expect(masked(body, 'hidden-draft')).toBe(masked(missingBody, 'no-such-post'))
    })
  })

  describe('GET /api/v1/public/:seed/schema', () => {
    it('a seed with no public flag answers the same 404 problem as an unknown seed', async () => {
      const unknown = await publishableClient.get('/api/v1/public/ghost/schema')
      const unknownBody = await unknown.json<Problem>()

      const response = await publishableClient.get('/api/v1/public/authors/schema')

      expect(response.status).toBe(404)
      expect(unknown.status).toBe(404)
      const body = await response.json<Problem>()
      expect(body.type).toBe(unknownBody.type)
      expect(masked(body, 'authors')).toBe(masked(unknownBody, 'ghost'))
    })
  })

  describe('POST /api/v1/public/:seed/add', () => {
    it('a seed with no public flag answers the same 404 problem as an unknown seed and nothing is written', async () => {
      const unknown = await secretClient.post('/api/v1/public/ghost/add', { data: { name: 'Nobody' } })
      const unknownBody = await unknown.json<Problem>()

      const response = await secretClient.post('/api/v1/public/authors/add', { data: { name: 'Nobody' } })

      expect(response.status).toBe(404)
      expect(unknown.status).toBe(404)
      const body = await response.json<Problem>()
      expect(body.type).toBe(unknownBody.type)
      expect(masked(body, 'authors')).toBe(masked(unknownBody, 'ghost'))
      const written = await harness.db.prepare('SELECT COUNT(*) AS n FROM content_authors').first<{ n: number }>()
      expect(written?.n).toBe(0)
    })
  })

  describe('PUT /api/v1/public/:seed/edit/:id', () => {
    it('a seed with no public flag answers the same 404 problem as an unknown seed', async () => {
      const unknown = await secretClient.put(`/api/v1/public/ghost/edit/${MISSING_ID}`, { name: 'Nobody' })
      const unknownBody = await unknown.json<Problem>()

      const response = await secretClient.put(`/api/v1/public/authors/edit/${MISSING_ID}`, { name: 'Nobody' })

      expect(response.status).toBe(404)
      expect(unknown.status).toBe(404)
      const body = await response.json<Problem>()
      expect(body.type).toBe(unknownBody.type)
      expect(masked(body, 'authors')).toBe(masked(unknownBody, 'ghost'))
    })
  })
})
