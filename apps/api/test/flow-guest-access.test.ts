// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createBeechApp } from '../src/factory'
import { StaticContentRepository } from './mocks/static-content.repository'
import { StaticIdempotencyRepository } from './mocks/static-idempotency.repository'
import { TEST_SEEDS, TEST_ENV } from './fixtures'
import { validateAndSanitizeSeedPayload } from '@beechcms/core'

/**
 * SPRINT: BeechCMS Test Redesign
 * FLOW: Guest Access (Public API)
 */
describe('Flow: Guest Access (Public API)', () => {
  let repo: StaticContentRepository
  let idempotencyRepo: StaticIdempotencyRepository
  let app: ReturnType<typeof createBeechApp>

  beforeEach(() => {
    repo = new StaticContentRepository(TEST_SEEDS)
    idempotencyRepo = new StaticIdempotencyRepository()
    app = createBeechApp({ seeds: TEST_SEEDS, repository: repo, idempotencyRepository: idempotencyRepo })
  })

  describe('Configuration & Authentication', () => {
    it('error: returns 403 when public keys are not configured', async () => {
      const res = await app.request('/api/v1/public/posts', {}, { ...TEST_ENV, PUBLIC_READ_API_KEY: undefined })
      expect(res.status).toBe(403)
    })

    it('error: returns 401 when API key is missing', async () => {
      const res = await app.request('/api/v1/public/posts', {}, TEST_ENV)
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/v1/public/:seed (List)', () => {
    it('success: returns paginated list with correct sort', async () => {
      repo.load('posts', [
        { id: '1', status: 'published', title: 'A' },
        { id: '2', status: 'published', title: 'C' },
        { id: '3', status: 'published', title: 'B' },
      ])

      const res = await app.request('/api/v1/public/posts?orderBy=title&orderDir=asc', {
        headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
      }, TEST_ENV)

      expect(res.status).toBe(200)
      const body = await res.json<{ data: any[] }>()
      expect(body.data[0].title).toBe('A')
      expect(body.data[1].title).toBe('B')
      expect(body.data[2].title).toBe('C')
    })

    it('success: filter=JSON returns only matching entries', async () => {
      repo.load('posts', [
        { id: '1', status: 'published', title: 'Alpha' },
        { id: '2', status: 'published', title: 'Beta' },
        { id: '3', status: 'published', title: 'Gamma' },
      ])

      const filter = JSON.stringify({ where: [{ field: 'title', op: 'eq', value: 'Beta' }] })
      const res = await app.request(`/api/v1/public/posts?filter=${encodeURIComponent(filter)}`, {
        headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
      }, TEST_ENV)

      expect(res.status).toBe(200)
      const body = await res.json<{ data: any[] }>()
      expect(body.data).toHaveLength(1)
      expect(body.data[0].id).toBe('2')
    })

    it('success: filter with contains operator returns partial matches', async () => {
      repo.load('posts', [
        { id: '1', status: 'published', title: 'Hello World' },
        { id: '2', status: 'published', title: 'Goodbye World' },
        { id: '3', status: 'published', title: 'No match here' },
      ])

      const filter = JSON.stringify({ where: [{ field: 'title', op: 'contains', value: 'World' }] })
      const res = await app.request(`/api/v1/public/posts?filter=${encodeURIComponent(filter)}`, {
        headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
      }, TEST_ENV)

      expect(res.status).toBe(200)
      const body = await res.json<{ data: any[] }>()
      expect(body.data).toHaveLength(2)
    })

    it('error: unknown seed returns 404', async () => {
      const res = await app.request('/api/v1/public/nonexistent-seed', {
        headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
      }, TEST_ENV)
      expect(res.status).toBe(404)
    })

    it('security: read rate limiting returns 429 when too many requests', async () => {
      const mockLimiter = { limit: vi.fn().mockResolvedValue({ success: false }) }
      const res = await app.request('/api/v1/public/posts', {
        headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
      }, { ...TEST_ENV, PUBLIC_READ_RATE_LIMITER: mockLimiter as any })

      expect(res.status).toBe(429)
    })
  })

  describe('GET /api/v1/public/:seed?slug=...', () => {
    it('success: fetch by slug returns entry', async () => {
      repo.load('posts', [{ id: 'p_slug', slug: 'find-me', status: 'published', title: 'Slug Test' }])

      const res = await app.request('/api/v1/public/posts?slug=find-me', {
        headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
      }, TEST_ENV)

      expect(res.status).toBe(200)
      const body = await res.json<{ data: any }>()
      expect(body.data.id).toBe('p_slug')
    })
  })

  describe('POST /api/v1/public/:seed/add (Submit)', () => {
    it('success: valid payload creates a new entry', async () => {
      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY },
        body: JSON.stringify({ data: { title: 'User Submission' } }),
      }, TEST_ENV)

      expect(res.status).toBe(201)
    })

    it('error: invalid JSON body returns 400', async () => {
      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY },
        body: 'not-json',
      }, TEST_ENV)
      expect(res.status).toBe(400)
    })

    it('error: missing data object returns 400', async () => {
      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY },
        body: JSON.stringify({ title: 'Missing data wrapper' }),
      }, TEST_ENV)
      expect(res.status).toBe(400)
    })

    it('error: invalid status returns 400', async () => {
      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY },
        body: JSON.stringify({ data: { title: 'X' }, status: 'invalid' }),
      }, TEST_ENV)
      expect(res.status).toBe(400)
    })

    it('error: slug conflict returns 409', async () => {
      repo.load('posts', [{ id: 'existing', slug: 'conflict', status: 'published', title: 'Existing' }])
      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY },
        body: JSON.stringify({ data: { title: 'X' }, slug: 'conflict' }),
      }, TEST_ENV)
      expect(res.status).toBe(409)
    })

    it('success: idempotency-key returns cached result', async () => {
      const key = 'test-key'
      const payload = JSON.stringify({ data: { title: 'Idempotent' } })
      
      const res1 = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY,
          'Idempotency-Key': key
        },
        body: payload,
      }, TEST_ENV)
      expect(res1.status).toBe(201)
      const body1 = await res1.json<{ id: string }>()

      const res2 = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY,
          'Idempotency-Key': key
        },
        body: payload,
      }, TEST_ENV)
      expect(res2.status).toBe(201)
      const body2 = await res2.json<{ id: string }>()
      expect(body1.id).toBe(body2.id)
    })
  })

  describe('PUT /api/v1/public/:seed/edit/:id (Public Edit)', () => {
    const validUuid = '550e8400-e29b-41d4-a716-446655440000'

    it('success: allows editing an existing entry', async () => {
      repo.load('posts', [{ id: validUuid, status: 'published', title: 'Old Title' }])

      const res = await app.request(`/api/v1/public/posts/edit/${validUuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY },
        body: JSON.stringify({ data: { title: 'New Public Title' } }),
      }, TEST_ENV)

      expect(res.status).toBe(200)
      const updated = await repo.findById(TEST_SEEDS[0], validUuid)
      expect(updated.title).toBe('New Public Title')
    })

    it('error: returns 403 if seed does not allow public edit', async () => {
      const res = await app.request(`/api/v1/public/documentation/edit/${validUuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY },
        body: JSON.stringify({ data: { title: 'X' } }),
      }, TEST_ENV)

      expect(res.status).toBe(403)
    })

    it('error: returns 404 if entry does not exist', async () => {
      const res = await app.request(`/api/v1/public/posts/edit/${validUuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY },
        body: JSON.stringify({ data: { title: 'X' } }),
      }, TEST_ENV)
      expect(res.status).toBe(404)
    })

    it('error: returns 400 if ID is not a UUID', async () => {
      const res = await app.request('/api/v1/public/posts/edit/invalid-id', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY },
        body: JSON.stringify({ data: { title: 'X' } }),
      }, TEST_ENV)
      expect(res.status).toBe(400)
    })

    it('error: returns 409 if new slug conflicts', async () => {
      repo.load('posts', [
        { id: validUuid, status: 'published', title: 'Target', slug: 'target' },
        { id: 'other-id', status: 'published', title: 'Other', slug: 'other' }
      ])

      const res = await app.request(`/api/v1/public/posts/edit/${validUuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY },
        body: JSON.stringify({ slug: 'other' }),
      }, TEST_ENV)
      expect(res.status).toBe(409)
    })

    it('error: returns 422 when trying to edit sensitive fields', async () => {
      repo.load('posts', [{ id: validUuid, status: 'published', title: 'X' }])
      // In TEST_SEEDS, internal_note is private
      const res = await app.request(`/api/v1/public/posts/edit/${validUuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY },
        body: JSON.stringify({ data: { internal_note: 'Sneaky update' } }),
      }, TEST_ENV)
      expect(res.status).toBe(422)
    })

    // Ad-hoc tests to maximize coverage of public-edit.ts
    it('error: returns 400 when slug is empty string', async () => {
      repo.load('posts', [{ id: validUuid, status: 'published', title: 'X' }])
      const res = await app.request(`/api/v1/public/posts/edit/${validUuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY },
        body: JSON.stringify({ slug: '' }),
      }, TEST_ENV)
      expect(res.status).toBe(400)
    })

    it('error: returns 400 when data is not an object', async () => {
      repo.load('posts', [{ id: validUuid, status: 'published', title: 'X' }])
      const res = await app.request(`/api/v1/public/posts/edit/${validUuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY },
        body: JSON.stringify({ data: 'not-an-object' }),
      }, TEST_ENV)
      expect(res.status).toBe(400)
    })

    it('error: returns 422 when data has dangerous content', async () => {
      repo.load('posts', [{ id: validUuid, status: 'published', title: 'X' }])
      const valResult = validateAndSanitizeSeedPayload(TEST_SEEDS[0], { body: '<script>alert(1)</script>' }, { operation: 'update', allowNull: true })
      console.log("DIRECT VALIDATION RESULT:", valResult)

      const res = await app.request(`/api/v1/public/posts/edit/${validUuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY },
        body: JSON.stringify({ data: { body: '<script>alert(1)</script>' } }),
      }, TEST_ENV)
      console.log("RESPONSE DATA:", await res.json())
      expect(res.status).toBe(422)
    })

    it('error: returns 500 when repository update throws', async () => {
      repo.load('posts', [{ id: validUuid, status: 'published', title: 'X' }])
      vi.spyOn(repo, 'update').mockRejectedValueOnce(new Error('DB error'))
      const res = await app.request(`/api/v1/public/posts/edit/${validUuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY },
        body: JSON.stringify({ data: { title: 'New Title' } }),
      }, TEST_ENV)
      expect(res.status).toBe(500)
    })
  })

  // Ad-hoc tests to maximize coverage of public-read.ts, public-add.ts, query-builder.ts
  describe('Additional coverage: public reads, adds and query builder', () => {
    it('GET /api/v1/public/:seed with invalid filters returns 400', async () => {
      // Invalid logic value type
      let res = await app.request(`/api/v1/public/posts?filter=${encodeURIComponent('{"logic":123}')}`, {
        headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
      }, TEST_ENV)
      expect(res.status).toBe(400)

      // Malformed JSON
      res = await app.request('/api/v1/public/posts?filter=malformed', {
        headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
      }, TEST_ENV)
      expect(res.status).toBe(400)

      // Filter object not an object
      res = await app.request(`/api/v1/public/posts?filter=${encodeURIComponent('123')}`, {
        headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
      }, TEST_ENV)
      expect(res.status).toBe(400)

      // Invalid logic name
      res = await app.request(`/api/v1/public/posts?filter=${encodeURIComponent('{"logic":"INVALID"}')}`, {
        headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
      }, TEST_ENV)
      expect(res.status).toBe(400)

      // Where is not an array
      res = await app.request(`/api/v1/public/posts?filter=${encodeURIComponent('{"where":"not-array"}')}`, {
        headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
      }, TEST_ENV)
      expect(res.status).toBe(400)

      // Invalid operator
      res = await app.request(`/api/v1/public/posts?filter=${encodeURIComponent('{"where":[{"field":"title","op":"unknown"}]}')}`, {
        headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
      }, TEST_ENV)
      expect(res.status).toBe(400)
    })

    it('GET /api/v1/public/:seed with latest counts checks limits', async () => {
      repo.load('posts', [
        { id: '1', status: 'published', title: 'A' }
      ])
      let res = await app.request('/api/v1/public/posts?latest=abc', {
        headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
      }, TEST_ENV)
      expect(res.status).toBe(200)

      res = await app.request('/api/v1/public/posts?latest=0', {
        headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
      }, TEST_ENV)
      expect(res.status).toBe(200)

      res = await app.request('/api/v1/public/posts?latest=150', {
        headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
      }, TEST_ENV)
      expect(res.status).toBe(200)
    })

    it('GET /api/v1/public/:seed by slug returns 404 if status is not published', async () => {
      repo.load('posts', [{ id: 'p_draft', slug: 'draft-slug', status: 'draft', title: 'Draft' }])
      const res = await app.request('/api/v1/public/posts?slug=draft-slug', {
        headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
      }, TEST_ENV)
      expect(res.status).toBe(404)
    })

    it('GET /api/v1/public/:seed by id/slug returns 404 if not found', async () => {
      const res = await app.request('/api/v1/public/posts?id=ghost-id', {
        headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
      }, TEST_ENV)
      expect(res.status).toBe(404)
    })

    it('GET /api/v1/public/:seed returns 500 when repository throws generic error', async () => {
      vi.spyOn(repo, 'findMany').mockRejectedValueOnce(new Error('Generic list error'))
      const res = await app.request('/api/v1/public/posts', {
        headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
      }, TEST_ENV)
      expect(res.status).toBe(500)
    })

    it('GET /api/v1/public/:seed single entry returns 500 when repository throws generic error', async () => {
      vi.spyOn(repo, 'findBySlug').mockRejectedValueOnce(new Error('Generic detail error'))
      const res = await app.request('/api/v1/public/posts?slug=find-me', {
        headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
      }, TEST_ENV)
      expect(res.status).toBe(500)
    })

    it('POST /api/v1/public/:seed/add returns 422 for dangerous content', async () => {
      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY },
        body: JSON.stringify({ data: { title: 'Valid Title', body: '<script>alert(1)</script>' } }),
      }, TEST_ENV)
      expect(res.status).toBe(422)
    })

    it('POST /api/v1/public/:seed/add returns 400 when missing required fields', async () => {
      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY },
        body: JSON.stringify({ data: { body: 'Just body, no required title' } }),
      }, TEST_ENV)
      expect(res.status).toBe(400)
    })

    it('POST /api/v1/public/:seed/add returns 409 on idempotency key fingerprint conflict', async () => {
      const key = 'test-conflict-key'
      // First call
      await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY, 'Idempotency-Key': key },
        body: JSON.stringify({ data: { title: 'First call' } }),
      }, TEST_ENV)

      // Second call with different body but same key
      const res2 = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY, 'Idempotency-Key': key },
        body: JSON.stringify({ data: { title: 'Different call' } }),
      }, TEST_ENV)
      expect(res2.status).toBe(409)
    })

    it('POST /api/v1/public/:seed/add returns 500 when repository throws generic error', async () => {
      vi.spyOn(repo, 'create').mockRejectedValueOnce(new Error('Generic create error'))
      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY },
        body: JSON.stringify({ data: { title: 'Testing 500 error' } }),
      }, TEST_ENV)
      expect(res.status).toBe(500)
    })
  })
})
