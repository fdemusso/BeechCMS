// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineSeed, sha256hex, generateTimeTrapToken } from '@beechcms/core'
import { createBeechApp } from '../src/factory'
import type { IRateLimiterRegistry } from '../src/middleware/rate-limit.middleware'
import { StaticAutomationRepository } from './mocks/static-automation.repository'
import { StaticContentRepository } from './mocks/static-content.repository'
import { StaticIdempotencyRepository } from './mocks/static-idempotency.repository'
import { __resetSeedRegistryCache } from '../src/shared/services/cache/seed-registry-cache'
import { TEST_SEEDS, TEST_ENV } from './fixtures'

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
    app = createBeechApp({ seeds: TEST_SEEDS, repository: repo, idempotencyRepository: idempotencyRepo, automationRepository: new StaticAutomationRepository() })
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
      const blockedLimiter = { checkLimit: vi.fn().mockResolvedValue({ isAllowed: false }) }
      const blockedRegistry: IRateLimiterRegistry = { getLimiter: () => blockedLimiter }
      const rateLimitedApp = createBeechApp({
        seeds: TEST_SEEDS,
        repository: repo,
        idempotencyRepository: idempotencyRepo,
        automationRepository: new StaticAutomationRepository(),
        rateLimiterRegistry: blockedRegistry,
      })
      const res = await rateLimitedApp.request('/api/v1/public/posts', {
        headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
      }, TEST_ENV)

      expect(res.status).toBe(429)
    })

    it('security: rate limiter key contains the seed slug to ensure distinct buckets per registered seed', async () => {
      const checkedKeys: string[] = []
      const spyLimiter = {
        checkLimit: vi.fn().mockImplementation(async (key: string) => {
          checkedKeys.push(key)
          return { isAllowed: true }
        }),
      }
      const spyRegistry: IRateLimiterRegistry = { getLimiter: () => spyLimiter }
      const spyApp = createBeechApp({
        seeds: TEST_SEEDS,
        repository: repo,
        idempotencyRepository: idempotencyRepo,
        automationRepository: new StaticAutomationRepository(),
        rateLimiterRegistry: spyRegistry,
      })

      await spyApp.request('/api/v1/public/posts', {
        headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
      }, TEST_ENV)
      expect(checkedKeys.at(-1)).toContain(':posts:')

      await spyApp.request('/api/v1/public/documentation', {
        headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
      }, TEST_ENV)
      expect(checkedKeys.at(-1)).toContain(':documentation:')

      await spyApp.request('/api/v1/public/health', {
        headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
      }, TEST_ENV)
      expect(checkedKeys.at(-1)).toContain(':no-seed:')
    })

    it('security: unregistered seed segments collapse into a single shared bucket, not one per segment', async () => {
      const checkedKeys: string[] = []
      const spyLimiter = {
        checkLimit: vi.fn().mockImplementation(async (key: string) => {
          checkedKeys.push(key)
          return { isAllowed: true }
        }),
      }
      const spyRegistry: IRateLimiterRegistry = { getLimiter: () => spyLimiter }
      const spyApp = createBeechApp({
        seeds: TEST_SEEDS,
        repository: repo,
        idempotencyRepository: idempotencyRepo,
        automationRepository: new StaticAutomationRepository(),
        rateLimiterRegistry: spyRegistry,
      })

      for (const segment of ['aaaa1', 'aaaa2', 'aaaa3', 'constructor', '__proto__']) {
        await spyApp.request(`/api/v1/public/${segment}`, {
          headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
        }, TEST_ENV)

        expect(checkedKeys.at(-1)).toContain(':invalid-seed:')
      }
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
      const t0 = Math.floor(Date.now() / 1000) - 2
      const token = await generateTimeTrapToken('beech-public-timetrap-default-secret', t0)
      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { title: 'User Submission' }, _timeTrapToken: token }),
      }, TEST_ENV)

      expect(res.status).toBe(201)
    })

    it('error: missing time-trap token returns 422', async () => {
      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { title: 'User Submission' } }),
      }, TEST_ENV)

      expect(res.status).toBe(422)
    })

    it('error: invalid JSON body returns 400', async () => {
      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      }, TEST_ENV)
      expect(res.status).toBe(400)
    })

    it('error: missing data object returns 400', async () => {
      const t0 = Math.floor(Date.now() / 1000) - 2
      const token = await generateTimeTrapToken('beech-public-timetrap-default-secret', t0)
      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Missing data wrapper', _timeTrapToken: token }),
      }, TEST_ENV)
      expect(res.status).toBe(400)
    })

    it('success: client status is ignored and backend default status is used', async () => {
      const t0 = Math.floor(Date.now() / 1000) - 2
      const token = await generateTimeTrapToken('beech-public-timetrap-default-secret', t0)
      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { title: 'X' }, status: 'draft', _timeTrapToken: token }),
      }, TEST_ENV)
      expect(res.status).toBe(201)
    })

    it('error: slug conflict returns 409', async () => {
      repo.load('posts', [{ id: 'existing', slug: 'conflict', status: 'published', title: 'Existing' }])
      const t0 = Math.floor(Date.now() / 1000) - 2
      const token = await generateTimeTrapToken('beech-public-timetrap-default-secret', t0)
      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { title: 'X' }, slug: 'conflict', _timeTrapToken: token }),
      }, TEST_ENV)
      expect(res.status).toBe(409)
    })

    it('success: idempotency-key returns cached result', async () => {
      const key = 'test-key'
      const t0 = Math.floor(Date.now() / 1000) - 2
      const token = await generateTimeTrapToken('beech-public-timetrap-default-secret', t0)
      const payload = JSON.stringify({ data: { title: 'Idempotent' }, _timeTrapToken: token })
      
      const res1 = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
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
          'Idempotency-Key': key
        },
        body: payload,
      }, TEST_ENV)
      expect(res2.status).toBe(201)
      const body2 = await res2.json<{ id: string }>()
      expect(body1.id).toBe(body2.id)
    })

    it('security: ignores reserved prototype keys in data payload and resolves safely', async () => {
      const t0 = Math.floor(Date.now() / 1000) - 2
      const token = await generateTimeTrapToken('beech-public-timetrap-default-secret', t0)
      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { title: 'Prototype Test', constructor: 'evil', toString: 'bad' }, slug: 'constructor', status: 'constructor', _timeTrapToken: token }),
      }, TEST_ENV)
      
      // Since 'constructor' and 'toString' are not defined in the seed branches,
      // they are considered unknown aliases and should be rejected with a 400 error.
      expect(res.status).toBe(400)
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

    it('feature: properly clears fields on explicit null', async () => {
      repo.load('posts', [{ id: validUuid, status: 'published', title: 'Old Title', contact_email: 'test@example.com' }])

      const res = await app.request(`/api/v1/public/posts/edit/${validUuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY },
        body: JSON.stringify({ data: { contact_email: null } }),
      }, TEST_ENV)

      expect(res.status).toBe(200)
      const updated = await repo.findById(TEST_SEEDS[0], validUuid)
      expect(updated.contact_email).toBeNull()
    })

    it('security: ignores or rejects prototype pollution attempts', async () => {
      repo.load('posts', [{ id: validUuid, status: 'published', title: 'Old Title', excerpt: 'Some excerpt' }])

      const res = await app.request(`/api/v1/public/posts/edit/${validUuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY },
        body: JSON.stringify({ data: { constructor: { name: 'Evil' }, toString: 'exploit' } }),
      }, TEST_ENV)

      expect(res.status).not.toBe(200) // Should be rejected (400 or 422)
      const updated = await repo.findById(TEST_SEEDS[0], validUuid)
      expect(updated.constructor).not.toEqual({ name: 'Evil' })
      expect(updated.toString).not.toEqual('exploit')
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
      const dangerousBody = { type: 'doc', content: [{ type: 'script', attrs: { src: 'http://evil.com' } }] }

      const res = await app.request(`/api/v1/public/posts/edit/${validUuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY },
        body: JSON.stringify({ data: { body: dangerousBody } }),
      }, TEST_ENV)
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

    it('security: ignores reserved prototype keys in data payload and resolves safely', async () => {
      repo.load('posts', [{ id: validUuid, status: 'published', title: 'Old Title', slug: 'proto-test-edit' }])
      const res = await app.request(`/api/v1/public/posts/edit/${validUuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY },
        body: JSON.stringify({ data: { title: 'Prototype Test Edit', constructor: 'evil', toString: 'bad' }, slug: 'constructor' }),
      }, TEST_ENV)
      
      expect(res.status).toBe(400)
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
      const dangerousBody = { type: 'doc', content: [{ type: 'script', attrs: { src: 'http://evil.com' } }] }
      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY },
        body: JSON.stringify({ data: { title: 'Valid Title', body: dangerousBody } }),
      }, TEST_ENV)
      expect(res.status).toBe(422)
    })

    it('POST /api/v1/public/:seed/add returns 400 when missing required fields', async () => {
      const t0 = Math.floor(Date.now() / 1000) - 2
      const token = await generateTimeTrapToken('beech-public-timetrap-default-secret', t0)
      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { body: 'Just body, no required title' }, _timeTrapToken: token }),
      }, TEST_ENV)
      expect(res.status).toBe(400)
    })

    it('POST /api/v1/public/:seed/add returns 409 on idempotency key fingerprint conflict', async () => {
      const key = 'test-conflict-key'
      const t0 = Math.floor(Date.now() / 1000) - 2
      const token1 = await generateTimeTrapToken('beech-public-timetrap-default-secret', t0)
      const token2 = await generateTimeTrapToken('beech-public-timetrap-default-secret', t0)

      // First call
      await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ data: { title: 'First call' }, _timeTrapToken: token1 }),
      }, TEST_ENV)

      // Second call with different body but same key
      const res2 = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ data: { title: 'Different call' }, _timeTrapToken: token2 }),
      }, TEST_ENV)
      expect(res2.status).toBe(409)
    })

    it('POST /api/v1/public/:seed/add returns 500 when repository throws generic error', async () => {
      const t0 = Math.floor(Date.now() / 1000) - 2
      const token = await generateTimeTrapToken('beech-public-timetrap-default-secret', t0)
      vi.spyOn(repo, 'create').mockRejectedValueOnce(new Error('Generic create error'))
      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { title: 'Testing 500 error' }, _timeTrapToken: token }),
      }, TEST_ENV)
      expect(res.status).toBe(500)
    })

    // Regression: GH #201 - public-add never applied privacy policy
    it('error: returns 422 when writing an internal-only (public: false) field', async () => {
      const t0 = Math.floor(Date.now() / 1000) - 2
      const token = await generateTimeTrapToken('beech-public-timetrap-default-secret', t0)
      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { title: 'X', internal_note: 'sneaky seed' }, _timeTrapToken: token }),
      }, TEST_ENV)
      expect(res.status).toBe(422)
    })

    it('success: hashes a privacy:"hash" field instead of storing it raw', async () => {
      const HASH_SEED = defineSeed({
        slug: 'hash_test',
        label: 'HashTest',
        labelPlural: 'HashTests',
        displayNameAlias: 'title',
        allowPublicPost: true,
        branches: [
          { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true, policies: { public: true } },
          { id: 'br_02', alias: 'pin', label: 'Pin', type: 'text', policies: { privacy: 'hash', public: true } },
        ],
      })
      const localRepo = new StaticContentRepository([HASH_SEED])
      const localApp = createBeechApp({ seeds: [HASH_SEED], repository: localRepo, idempotencyRepository: idempotencyRepo, automationRepository: new StaticAutomationRepository() })
      __resetSeedRegistryCache()

      const t0 = Math.floor(Date.now() / 1000) - 2
      const token = await generateTimeTrapToken('beech-public-timetrap-default-secret', t0)

      const res = await localApp.request('/api/v1/public/hash_test/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { title: 'X', pin: '1234' }, _timeTrapToken: token }),
      }, TEST_ENV)

      expect(res.status).toBe(201)
      const body = await res.json<{ id: string }>()
      const created = await localRepo.findById(HASH_SEED, body.id)
      expect(created.pin).toBe(await sha256hex('1234'))
      expect(created.pin).not.toBe('1234')
    })

    it('creates entry with a privacy:"encrypt" field successfully', async () => {
      const ENCRYPT_SEED = defineSeed({
        slug: 'encrypt_test',
        label: 'EncryptTest',
        labelPlural: 'EncryptTests',
        displayNameAlias: 'secret',
        allowPublicPost: true,
        branches: [
          { id: 'br_01', alias: 'secret', label: 'Secret', type: 'text', policies: { privacy: 'encrypt', public: true } },
        ],
      })
      const localRepo = new StaticContentRepository([ENCRYPT_SEED])
      const localApp = createBeechApp({ seeds: [ENCRYPT_SEED], repository: localRepo, idempotencyRepository: idempotencyRepo, automationRepository: new StaticAutomationRepository() })
      __resetSeedRegistryCache()

      const t0 = Math.floor(Date.now() / 1000) - 2
      const token = await generateTimeTrapToken('beech-public-timetrap-default-secret', t0)

      const res = await localApp.request('/api/v1/public/encrypt_test/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { secret: 'secret-val' }, _timeTrapToken: token }),
      }, TEST_ENV)
      expect(res.status).toBe(201)
    })
  })
})
