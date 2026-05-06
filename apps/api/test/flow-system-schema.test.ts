import { describe, it, expect, beforeEach } from 'vitest'
import { createBeechApp } from '../src/factory'
import { TEST_SEEDS, TEST_USERS, TEST_ENV } from './fixtures'
import { StaticContentRepository } from './mocks/static-content.repository'
import { StaticIdempotencyRepository } from './mocks/static-idempotency.repository'
import { MockD1Database } from './mocks/mock-d1-database'

/**
 * Flow: System & Schema
 * 
 * This test suite verifies the core engine metadata APIs:
 * - GET /api/schema: Returns the content model definitions (Seeds).
 * - GET /api/settings: Returns general site configurations.
 * 
 * These APIs are critical for the Dashboard to render the UI dynamically.
 */
describe('Flow: System & Schema', () => {
  let app: ReturnType<typeof createBeechApp>
  let authToken: string
  let db: MockD1Database

  beforeEach(async () => {
    // Setup app with static repositories and mock DB
    db = new MockD1Database({ users: TEST_USERS })
    const repo = new StaticContentRepository(TEST_SEEDS)
    const idempotencyRepo = new StaticIdempotencyRepository()

    app = createBeechApp({
      seeds: TEST_SEEDS,
      repository: repo,
      idempotencyRepository: idempotencyRepo,
    })

    // Mock the DB in the app environment
    // Note: in a real integration test, we'd use the actual D1 implementation,
    // but for flow tests we inject the mock DB via the Hono context.
    
    // Login to get a valid token
    const loginRes = await app.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: TEST_USERS[0].email, password: 'password123' }),
      headers: { 'Content-Type': 'application/json' }
    }, { ...TEST_ENV, DB: db })

    const loginData = await loginRes.json() as { token: string }
    authToken = loginData.token
  })

  /**
   * Test: GET /api/schema
   * Verifies that the registry returns all registered seeds with their full structure.
   */
  it('GET /api/schema returns all registered seeds', async () => {
    const res = await app.request('/api/schema', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    }, { ...TEST_ENV, DB: db as any })

    expect(res.status).toBe(200)
    const schema = await res.json() as any[]
    
    expect(Array.isArray(schema)).toBe(true)
    expect(schema.length).toBe(TEST_SEEDS.length)

    // Check structure of first seed (posts)
    const postsSeed = schema.find(s => s.slug === 'posts')
    expect(postsSeed).toBeDefined()
    expect(postsSeed.label).toBe('Post')
    expect(postsSeed.branches).toBeDefined()
    expect(Array.isArray(postsSeed.branches)).toBe(true)
    expect(postsSeed.branches.length).toBe(TEST_SEEDS[0].branches.length)
  })

  /**
   * Test: GET /api/schema (Unauthorized)
   * Verifies that the schema API is protected.
   */
  it('GET /api/schema requires authentication', async () => {
    const res = await app.request('/api/schema', {}, { ...TEST_ENV, DB: db as any })
    expect(res.status).toBe(401)
  })

  /**
   * Test: GET /api/settings
   * Verifies that general settings are returned correctly.
   * Note: This test might fail if the endpoint is not yet implemented.
   */
  it('GET /api/settings returns general site configuration', async () => {
    const res = await app.request('/api/settings', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    }, { ...TEST_ENV, DB: db as any })

    // If it's 404, it means it's not implemented yet.
    // Given the user's request to proceed with Phase 6, I should ensure it's implemented.
    if (res.status === 404) {
      console.warn('GET /api/settings returned 404. Implementation might be missing.')
    }
    
    expect(res.status).toBe(200)
    const settings = await res.json() as any
    expect(settings).toHaveProperty('siteTitle')
  })
})
