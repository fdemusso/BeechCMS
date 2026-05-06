import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createBeechApp } from '../src/factory'
import { StaticContentRepository } from './mocks/static-content.repository'
import { StaticIdempotencyRepository } from './mocks/static-idempotency.repository'
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
  })
})
