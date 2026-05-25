import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createBeechApp } from '../src/factory'
import { StaticContentRepository } from './mocks/static-content.repository'
import { StaticIdempotencyRepository } from './mocks/static-idempotency.repository'
import { D1TestDatabase } from './helpers/d1-test-database'
import { seedTestUsers } from './helpers/seed-fixtures'
import { S3Client } from '@aws-sdk/client-s3'
import { TEST_SEEDS, TEST_USERS, TEST_ENV } from './fixtures'

/**
 * SPRINT: BeechCMS Test Redesign
 * FLOW: Content Management (Protected API)
 * 
 * This suite verifies the administrative operations for content management.
 * It ensures that authenticated users can perform CRUD operations on all fields,
 * including those marked as private or restricted in the Public API.
 */
describe('Flow: Content Management (Protected API)', () => {
  let repo: StaticContentRepository
  let idempotencyRepo: StaticIdempotencyRepository
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>
  let adminToken: string
  let s3SendSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    repo = new StaticContentRepository(TEST_SEEDS)
    idempotencyRepo = new StaticIdempotencyRepository()
    db = new D1TestDatabase()
    await seedTestUsers(db, TEST_USERS)
    app = createBeechApp({ seeds: TEST_SEEDS, repository: repo, idempotencyRepository: idempotencyRepo })

    s3SendSpy = vi.spyOn(S3Client.prototype, 'send')
    s3SendSpy.mockReset()

    const loginRes = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_USERS[0].email, password: 'password123' })
    }, { ...TEST_ENV, DB: db })

    const loginBody = await loginRes.json<{ token: string }>()
    adminToken = loginBody.token
  })

  describe('GET /api/content/:slug (Admin List)', () => {
    it('success: returns all fields including non-public ones', async () => {
      repo.load('posts', [
        { id: 'p_001', slug: 'admin-post', status: 'published', title: 'Admin Title', internal_note: 'SECRET', created_at: 1000, updated_at: 1000 },
      ])

      const res = await app.request('/api/content/posts', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(200)
      const body = await res.json<any[]>()
      expect(body[0].internal_note).toBe('SECRET')
    })

    it('success: complex filters work correctly', async () => {
      repo.load('posts', [
        { id: '1', status: 'published', title: 'A', view_count: 10 },
        { id: '2', status: 'draft', title: 'B', view_count: 20 },
      ])

      const filters = JSON.stringify({
        view: { columnId: 'view_count', type: 'number', conditions: [{ op: 'gt', value: 15 }] }
      })

      const res = await app.request(`/api/content/posts?filters=${encodeURIComponent(filters)}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db })

      const body = await res.json<{ items: any[] }>()
      expect(body.items.length).toBe(1)
      expect(body.items[0].id).toBe('2')
    })
  })

  describe('GET /api/content/:slug/facets (Admin Facets)', () => {
    it('success: returns unique statuses with counts', async () => {
      repo.load('posts', [
        { id: '1', status: 'published', tags: ['news', 'tech'] },
        { id: '2', status: 'draft', tags: ['news'] },
        { id: '3', status: 'published', tags: ['tutorial'] },
      ])

      const res = await app.request('/api/content/posts/facets', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(200)
      const body = await res.json<{ statuses: string[]; tagsByColumnId: Record<string, string[]> }>()
      expect(body.statuses).toContain('published')
      expect(body.statuses).toContain('draft')
    })

    it('success: returns unique tags grouped by column alias', async () => {
      repo.load('posts', [
        { id: '1', status: 'published', tags: ['news', 'tech'] },
        { id: '2', status: 'draft', tags: ['news'] },
        { id: '3', status: 'published', tags: ['tutorial'] },
      ])

      const res = await app.request('/api/content/posts/facets', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(200)
      const body = await res.json<{ statuses: string[]; tagsByColumnId: Record<string, string[]> }>()
      // 'posts' seed has a 'tags' branch of type 'tags'
      const tagsForColumn = body.tagsByColumnId?.['tags'] ?? []
      expect(tagsForColumn).toContain('news')
      expect(tagsForColumn).toContain('tech')
      expect(tagsForColumn).toContain('tutorial')
      // 'news' appears twice but must be deduplicated
      expect(tagsForColumn.filter((t: string) => t === 'news')).toHaveLength(1)
    })
  })

  describe('GET /api/content/:slug/by-slug/:slug', () => {
    it('success: returns entry by slug', async () => {
      repo.load('posts', [{ id: 'id123', slug: 'find-me', status: 'published', title: 'Found' }])

      const res = await app.request('/api/content/posts/by-slug/find-me', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(200)
      const body = await res.json<{ id: string }>()
      expect(body.id).toBe('id123')
    })

    it('error: returns 404 if slug not found', async () => {
      const res = await app.request('/api/content/posts/by-slug/ghost', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/content/:slug (Admin Create)', () => {
    it('success: creates entry and logs activity', async () => {
      const res = await app.request('/api/content/posts', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Admin Post' })
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(201)
      const logCount = await db.prepare('SELECT COUNT(*) as count FROM activity_logs').first<{ count: number }>()
      expect(logCount?.count).toBeGreaterThan(0)
    })

    it('error: malformed JSON returns 400', async () => {
      const res = await app.request('/api/content/posts', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: '{"invalid":'
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(400)
    })
  })

  describe('PUT /api/content/:slug/:id (Admin Update)', () => {
    it('success: updates existing entry fields and persists changes', async () => {
      repo.load('posts', [{ id: 'p_upd', slug: 'old-slug', status: 'published', title: 'Old Title' }])

      const res = await app.request('/api/content/posts/p_upd', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated Title' }),
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(200)
      const updated = await repo.findById(TEST_SEEDS[0], 'p_upd')
      expect(updated.title).toBe('Updated Title')
    })

    it('error: update non-existent entry returns 404', async () => {
      const res = await app.request('/api/content/posts/ghost-id', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Will not be saved' }),
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(404)
    })

    it('success: successive updates apply correctly (last-write-wins)', async () => {
      repo.load('posts', [{ id: 'p_multi', slug: 'multi-slug', status: 'published', title: 'V1' }])

      // First update
      await app.request('/api/content/posts/p_multi', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'V2' }),
      }, { ...TEST_ENV, DB: db })

      // Second update
      const res = await app.request('/api/content/posts/p_multi', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'V3' }),
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(200)
      const entry = await repo.findById(TEST_SEEDS[0], 'p_multi')
      expect(entry.title).toBe('V3')
    })
  })

  describe('DELETE /api/content/:slug/:id', () => {
    it('success: removes entry and triggers R2 cleanup', async () => {
      s3SendSpy.mockResolvedValue({ ContentLength: 100 } as any)
      repo.load('posts', [{ id: 'p_del', status: 'published', image: 'https://ex.com/api/media/f.png' }])

      const res = await app.request('/api/content/posts/p_del', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(200)
      expect(s3SendSpy).toHaveBeenCalled()
    })
  })
})
