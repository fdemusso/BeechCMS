import { describe, it, expect, beforeEach } from 'vitest'
import { createBeechApp } from '../src/factory'
import { StaticContentRepository } from './mocks/static-content.repository'
import { StaticIdempotencyRepository } from './mocks/static-idempotency.repository'
import { MockD1Database } from './mocks/mock-d1-database'
import { mockR2 } from './mocks/mock-r2-client'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import { TEST_SEEDS, TEST_USERS, TEST_ENV } from './fixtures'

/**
 * SPRINT: BeechCMS Test Redesign
 * FLOW: Content Management (Protected API)
 * 
 * This suite verifies the administrative operations for content management.
 * It ensures that authenticated users can perform CRUD operations on all fields,
 * including those marked as private or restricted in the Public API.
 * 
 * Architecture:
 * - Uses StaticContentRepository for deterministic persistence.
 * - Uses MockD1Database for authentication state.
 * - Centralizes data in fixtures.ts.
 */
describe('Flow: Content Management (Protected API)', () => {
  let repo: StaticContentRepository
  let idempotencyRepo: StaticIdempotencyRepository
  let db: MockD1Database
  let app: ReturnType<typeof createBeechApp>
  let adminToken: string

  /**
   * SETUP: Before each test, reset repositories and authenticate.
   * Input: None
   * Output: Populates adminToken and initializes app context.
   */
  beforeEach(async () => {
    repo = new StaticContentRepository(TEST_SEEDS)
    idempotencyRepo = new StaticIdempotencyRepository()
    db = new MockD1Database({ users: TEST_USERS })
    app = createBeechApp({ seeds: TEST_SEEDS, repository: repo, idempotencyRepository: idempotencyRepo })

    // Reset R2 mock state
    mockR2.reset()

    // Perform login to get a valid session token for protected routes
    const loginRes = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_USERS[0].email, password: 'password123' })
    }, { ...TEST_ENV, DB: db as any })

    const loginBody = await loginRes.json<{ token: string }>()
    adminToken = loginBody.token
  })

  /**
   * TEST: GET /api/content/:slug (Admin List)
   * Verifies that admins can see all fields and use complex filters.
   */
  describe('GET /api/content/:slug (Admin List)', () => {
    it('success: returns all fields including non-public ones', async () => {
      repo.load('posts', [
        { 
          id: 'p_001', 
          slug: 'admin-post', 
          status: 'published', 
          title: 'Admin Title', 
          internal_note: 'SECRET_NOTE', 
          created_at: 1000, 
          updated_at: 1000 
        },
      ])

      const res = await app.request('/api/content/posts', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(200)
      const body = await res.json<any[]>() // Handler returns array directly if no query params
      
      // Unlike Public API, Admin API must return private fields
      expect(body[0].internal_note).toBe('SECRET_NOTE')
      expect(body[0].title).toBe('Admin Title')
    })

    it('success: complex filters (status) work correctly', async () => {
      repo.load('posts', [
        { id: '1', slug: 'p1', status: 'published', title: 'Pub' },
        { id: '2', slug: 'p2', status: 'draft', title: 'Dra' },
      ])

      // The API expects filters as a JSON string in the 'filters' query parameter
      const filters = JSON.stringify({
        status: {
          columnId: 'status',
          type: 'text',
          conditions: [{ op: 'eq', value: 'draft' }]
        }
      })

      const res = await app.request(`/api/content/posts?filters=${encodeURIComponent(filters)}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db as any })

      const body = await res.json<{ items: any[] }>()
      expect(body.items.length).toBe(1)
      expect(body.items[0].status).toBe('draft')
    })

    it('success: search filter works across branches', async () => {
      repo.load('posts', [
        { id: '1', slug: 'p1', status: 'published', title: 'Hello World' },
        { id: '2', slug: 'p2', status: 'published', title: 'Goodbye' },
      ])

      const res = await app.request('/api/content/posts?search=hello', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db as any })

      const body = await res.json<{ items: any[] }>()
      expect(body.items.length).toBe(1)
      expect(body.items[0].title).toBe('Hello World')
    })
  })

  /**
   * TEST: POST /api/content/:slug (Admin Create)
   * Verifies entry creation, slug generation, and conflict handling.
   */
  describe('POST /api/content/:slug (Admin Create)', () => {
    it('success: creates a new entry with explicit status and auto-slug', async () => {
      const res = await app.request('/api/content/posts', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ 
          status: 'published',
          title: 'Manual Admin Post'
        })
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(201)
      const { id } = await res.json<{ id: string }>()
      
      // Verify persistence in repository
      const created = await repo.findById(TEST_SEEDS[0], id)
      expect(created.status).toBe('published')
      expect(created.title).toBe('Manual Admin Post')
      // Note: slugify has a 15-character limit in core/slug-utils.ts
      expect(created.slug).toBe('manual-admin-po') 
    })

    it('success: uses provided slug instead of generating one', async () => {
      const res = await app.request('/api/content/posts', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ 
          slug: 'custom-slug-123',
          title: 'Post with Custom Slug'
        })
      }, { ...TEST_ENV, DB: db as any })

      const { id } = await res.json<{ id: string }>()
      const created = await repo.findById(TEST_SEEDS[0], id)
      expect(created.slug).toBe('custom-slug-123')
    })

    it('error: unauthorized access returns 401', async () => {
      const res = await app.request('/api/content/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'No Token' })
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(401)
    })

    it('error: slug conflict returns 409', async () => {
      repo.load('posts', [{ id: 'existing', slug: 'conflict', status: 'published', title: 'Old' }])

      const res = await app.request('/api/content/posts', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ 
          slug: 'conflict',
          title: 'New'
        })
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(409)
    })

    it('edge case: unicode characters in slug are sanitized', async () => {
      const res = await app.request('/api/content/posts', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ title: 'Caffè degli Emoji 🚀' })
      }, { ...TEST_ENV, DB: db as any })

      const { id } = await res.json<{ id: string }>()
      const created = await repo.findById(TEST_SEEDS[0], id)
      // Note: slugify has a 15-character limit
      expect(created.slug).toBe('caffe-degli-emo')
    })
  })

  /**
   * TEST: PUT /api/content/:slug/:id (Admin Update)
   * Verifies data modification and validation.
   */
  describe('PUT /api/content/:slug/:id (Admin Update)', () => {
    it('success: updates existing entry fields', async () => {
      repo.load('posts', [{ id: 'p_upd', slug: 'old-slug', status: 'draft', title: 'Old Title' }])

      const res = await app.request('/api/content/posts/p_upd', {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ title: 'Updated Title', status: 'published' })
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(200)
      const updated = await repo.findById(TEST_SEEDS[0], 'p_upd')
      expect(updated.title).toBe('Updated Title')
      expect(updated.status).toBe('published')
      expect(updated.slug).toBe('old-slug') // Slug should remain unchanged by default
    })

    it('error: nonexistent ID returns 404', async () => {
      const res = await app.request('/api/content/posts/ghost-id', {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ title: 'Ghost' })
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(404)
    })

    it('error: invalid data types return 400', async () => {
      repo.load('posts', [{ id: 'p_val', slug: 'validate', status: 'published', title: 'Valid' }])

      const res = await app.request('/api/content/posts/p_val', {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ view_count: 'not-a-number' }) // branch 'view_count' is 'number'
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(400)
    })
  })

  /**
   * TEST: DELETE /api/content/:slug/:id (Admin Delete)
   * Verifies entry removal from the database.
   */
  describe('DELETE /api/content/:slug/:id (Admin Delete)', () => {
    it('success: removes entry from repository', async () => {
      repo.load('posts', [{ id: 'p_del', slug: 'to-delete', status: 'published', title: 'Delete Me' }])

      const res = await app.request('/api/content/posts/p_del', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(200)
      
      // Verify it's gone
      await expect(repo.findById(TEST_SEEDS[0], 'p_del')).rejects.toThrow()
    })

    it('success: removes entry and triggers R2 cleanup for associated files', async () => {
      // Simulate file existing on R2 with 5000 bytes
      mockR2.setupSuccess({ fileSize: 5000 })
      
      repo.load('posts', [{ 
        id: 'p_r2', 
        slug: 'r2-post', 
        status: 'published', 
        title: 'R2 cleanup test',
        image: 'https://example.com/api/media/123-test.png' // Associated file
      }])

      const res = await app.request('/api/content/posts/p_r2', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(200)
      
      // Verify R2 cleanup calls: HeadObject (for size) and DeleteObject
      expect(mockR2.send).toHaveBeenCalled()
      
      // Extract the DeleteObjectCommand call to verify the key
      const deleteCall = mockR2.send.mock.calls.find(c => c[0] instanceof DeleteObjectCommand)
      expect(deleteCall).toBeDefined()
      const command = deleteCall![0] as DeleteObjectCommand
      expect(command.input.Key).toBe('123-test.png')
    })

    it('edge case: deletion succeeds even if R2 file is already missing', async () => {
      // Simulate file missing (404) on R2
      mockR2.setupFileNotFound()
      
      repo.load('posts', [{ 
        id: 'p_missing', 
        slug: 'missing-r2', 
        status: 'published', 
        title: 'Missing R2 file',
        image: 'https://example.com/api/media/not-there.png'
      }])

      const res = await app.request('/api/content/posts/p_missing', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db as any })

      // App should not crash even if R2 fails to delete/head
      expect(res.status).toBe(200)
      expect(mockR2.send).toHaveBeenCalled() 
    })

    it('error: deleting nonexistent entry returns 404', async () => {
      const res = await app.request('/api/content/posts/no-id', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(404)
    })
  })
})
