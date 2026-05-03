import { describe, it, expect, beforeEach } from 'vitest'
import { createBeechApp } from '../src/factory'
import { StaticContentRepository } from './mocks/static-content.repository'
import { StaticIdempotencyRepository } from './mocks/static-idempotency.repository'
import { TEST_SEEDS, TEST_ENV } from './fixtures'

/**
 * Flow: Guest Access — GET /api/v1/public/:seed (List)
 * This block tests the ability of external clients to retrieve public content lists.
 * Verifies: API Key, Pagination, Field Visibility, Error Handling.
 * Uses centralized data from fixtures.ts.
 */
describe('Flow: Guest Access — GET /api/v1/public/posts (List)', () => {
  let repo: StaticContentRepository
  let idempotencyRepo: StaticIdempotencyRepository
  let app: ReturnType<typeof createBeechApp>

  beforeEach(() => {
    repo = new StaticContentRepository(TEST_SEEDS)
    idempotencyRepo = new StaticIdempotencyRepository()
    app = createBeechApp({ seeds: TEST_SEEDS, repository: repo, idempotencyRepository: idempotencyRepo })
  })

  it('valid API key returns paginated list with realistic data', async () => {
    repo.load('posts', [
      { id: 'p_001', slug: 'announcing-beechcms', status: 'published', title: 'Announcing BeechCMS v1.0', body: 'We are thrilled to launch...', internal_note: null, contact_email: null, view_count: 1500, created_at: 1714752000, updated_at: 1714752000 },
      { id: 'p_002', slug: 'vertical-slice-architecture', status: 'published', title: 'Why Vertical Slice Architecture?', body: 'Layered architecture is often...', internal_note: null, contact_email: null, view_count: 850, created_at: 1714838400, updated_at: 1714838400 },
    ])

    const res = await app.request('/api/v1/public/posts', {
      headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
    }, TEST_ENV)

    expect(res.status).toBe(200)
    const body = await res.json<{ data: any[]; meta: any }>()
    expect(body.data.length).toBe(2)
    expect(body.data[0].title).toBe('Why Vertical Slice Architecture?')
    expect(body.data[1].title).toBe('Announcing BeechCMS v1.0')
    expect(body.meta.total).toBe(2)
  })

  it('pagination: page and limit return correct subset', async () => {
    repo.load('posts', [
      { id: '1', slug: 'post-1', status: 'published', title: 'Post 1', created_at: 1000, updated_at: 1000 },
      { id: '2', slug: 'post-2', status: 'published', title: 'Post 2', created_at: 1001, updated_at: 1001 },
      { id: '3', slug: 'post-3', status: 'published', title: 'Post 3', created_at: 1002, updated_at: 1002 },
    ])

    const res = await app.request('/api/v1/public/posts?page=2&limit=1', {
      headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
    }, TEST_ENV)

    expect(res.status).toBe(200)
    const body = await res.json<{ data: any[]; meta: any }>()
    expect(body.data.length).toBe(1)
    expect(body.meta.page).toBe(2)
    expect(body.meta.total).toBe(3)
  })

  it('security: fields with public: false are excluded from response', async () => {
    repo.load('posts', [
      { id: 'p_sec_01', slug: 'secure-post', status: 'published', title: 'Public Title', internal_note: 'PRIVATE_ADMIN_ONLY_DATA', created_at: 1000, updated_at: 1000 },
    ])

    const res = await app.request('/api/v1/public/posts', {
      headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
    }, TEST_ENV)

    const body = await res.json<{ data: any[] }>()
    expect(body.data[0].internal_note).toBeUndefined()
    expect(body.data[0].title).toBe('Public Title')
  })

  it('error: missing API key returns 401', async () => {
    const res = await app.request('/api/v1/public/posts', {}, TEST_ENV)
    expect(res.status).toBe(401)
  })

  it('error: invalid API key returns 401', async () => {
    const res = await app.request('/api/v1/public/posts', {
      headers: { 'X-API-Key': 'invalid_key_123' },
    }, TEST_ENV)
    expect(res.status).toBe(401)
  })

  it('error: nonexistent seed returns 404', async () => {
    const res = await app.request('/api/v1/public/ghost_collection', {
      headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
    }, TEST_ENV)
    expect(res.status).toBe(404)
  })

  it('error: seed with allowPublicRead: false returns 403', async () => {
    const res = await app.request('/api/v1/public/documentation', {
      headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
    }, TEST_ENV)
    expect(res.status).toBe(403)
  })

  it('edge case: requesting extremely high page returns empty list', async () => {
    repo.load('posts', [{ id: '1', slug: 'p1', status: 'published', title: 'T1', created_at: 1000, updated_at: 1000 }])

    const res = await app.request('/api/v1/public/posts?page=9999&limit=10', {
      headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
    }, TEST_ENV)

    const body = await res.json<{ data: any[] }>()
    expect(body.data).toEqual([])
  })

  it('edge case: pageSize exceeding 100 is capped', async () => {
    const res = await app.request('/api/v1/public/posts?limit=999', {
      headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
    }, TEST_ENV)

    const body = await res.json<{ meta: any }>()
    expect(body.meta.limit).toBe(100)
  })
})

/**
 * Flow: Guest Access — GET /api/v1/public/:seed?id=... (Detail)
 * This block tests retrieving a single entry via ID or slug.
 * Verifies: Visibility filters (published only), public field restriction.
 */
describe('Flow: Guest Access — GET /api/v1/public/posts/:id_or_slug (Detail)', () => {
  let repo: StaticContentRepository
  let idempotencyRepo: StaticIdempotencyRepository
  let app: ReturnType<typeof createBeechApp>

  beforeEach(() => {
    repo = new StaticContentRepository(TEST_SEEDS)
    idempotencyRepo = new StaticIdempotencyRepository()
    app = createBeechApp({ seeds: TEST_SEEDS, repository: repo, idempotencyRepository: idempotencyRepo })
  })

  it('success: fetch by ID returns full public entry', async () => {
    repo.load('posts', [
      { id: 'p_042', slug: 'getting-started', status: 'published', title: 'Getting Started with BeechCMS', body: 'Follow these steps...', internal_note: 'hidden note', created_at: 1714752000, updated_at: 1714752000 },
    ])

    const res = await app.request('/api/v1/public/posts?id=p_042', {
      headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
    }, TEST_ENV)

    expect(res.status).toBe(200)
    const body = await res.json<{ data: any }>()
    expect(body.data.id).toBe('p_042')
    expect(body.data.internal_note).toBeUndefined()
  })

  it('error: draft entries are hidden from public (404)', async () => {
    repo.load('posts', [
      { id: 'p_draft_01', slug: 'work-in-progress', status: 'draft', title: 'Upcoming Feature', created_at: 1000, updated_at: 1000 },
    ])

    const res = await app.request('/api/v1/public/posts?id=p_draft_01', {
      headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY },
    }, TEST_ENV)

    expect(res.status).toBe(404)
  })
})

/**
 * Flow: Guest Access — POST /api/v1/public/:seed/add (Submit)
 * This block tests public data submission (e.g., contact forms, community posts).
 * Verifies: Idempotency, Schema validation, Security.
 */
describe('Flow: Guest Access — POST /api/v1/public/posts/add (Submit)', () => {
  let repo: StaticContentRepository
  let idempotencyRepo: StaticIdempotencyRepository
  let app: ReturnType<typeof createBeechApp>

  beforeEach(() => {
    repo = new StaticContentRepository(TEST_SEEDS)
    idempotencyRepo = new StaticIdempotencyRepository()
    app = createBeechApp({ seeds: TEST_SEEDS, repository: repo, idempotencyRepository: idempotencyRepo })
  })

  it('success: valid payload creates a new entry', async () => {
    const res = await app.request('/api/v1/public/posts/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY },
      body: JSON.stringify({ data: { title: 'New Community Post', body: 'Shared by a visitor' } }),
    }, TEST_ENV)

    expect(res.status).toBe(201)
    const body = await res.json<{ success: boolean; id: string }>()
    expect(body.success).toBe(true)
    expect(body.id).toBeDefined()
  })

  it('idempotency: multiple submissions with same key return identical response', async () => {
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY,
      'Idempotency-Key': 'idem-key-999-v1',
    }
    const payload = JSON.stringify({ status: 'published', data: { title: 'Idempotent Submission' } })

    const res1 = await app.request('/api/v1/public/posts/add', { method: 'POST', headers, body: payload }, TEST_ENV)
    const body1 = await res1.json<{ id: string }>()

    const res2 = await app.request('/api/v1/public/posts/add', { method: 'POST', headers, body: payload }, TEST_ENV)
    const body2 = await res2.json<{ id: string }>()

    expect(body1.id).toBe(body2.id)
    
    // Ensure only one record was actually created in the repo
    const listRes = await app.request('/api/v1/public/posts', { headers: { 'X-API-Key': TEST_ENV.PUBLIC_READ_API_KEY } }, TEST_ENV)
    const list = await listRes.json<{ data: any[] }>()
    expect(list.data.filter(i => i.title === 'Idempotent Submission')).toHaveLength(1)
  })

  it('validation: missing required fields returns 400', async () => {
    const res = await app.request('/api/v1/public/posts/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_ENV.PUBLIC_WRITE_API_KEY },
      body: JSON.stringify({ data: { body: 'Missing title' } }),
    }, TEST_ENV)

    expect(res.status).toBe(400)
    const body = await res.json<{ detail: string }>()
    expect(body.detail).toBe('Validation failed')
  })
})
