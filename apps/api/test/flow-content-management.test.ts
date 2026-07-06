// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createBeechApp } from '../src/factory'
import { StaticContentRepository } from './mocks/static-content.repository'
import { StaticIdempotencyRepository } from './mocks/static-idempotency.repository'
import { D1TestDatabase } from './helpers/d1-test-database'
import { seedTestUsers } from './helpers/seed-fixtures'
import { S3Client } from '@aws-sdk/client-s3'
import { TEST_SEEDS, TEST_USERS, TEST_ENV } from './fixtures'
import { defineSeed } from '@beechcms/core'
import { __resetSeedRegistryCache } from '../src/shared/services/cache/seed-registry-cache'
import * as applyPolicies from '../src/shared/policies/apply-policies'
import * as uploadModule from '../src/shared/storage/upload'

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
    __resetSeedRegistryCache()
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

    it('success: updates slug and persists changes', async () => {
      repo.load('posts', [{ id: 'p_slug_upd', slug: 'original-slug', status: 'published', title: 'Title' }])

      const res = await app.request('/api/content/posts/p_slug_upd', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'new-valid-slug' }),
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(200)
      const updated = await repo.findById(TEST_SEEDS[0], 'p_slug_upd')
      expect(updated.slug).toBe('new-valid-slug')
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
      // Insert mock media record in database to pass the existence constraint check
      await db.prepare('INSERT INTO media_objects (key, filename, mime_type, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?)').bind('f.png', 'f.png', 'image/png', 100, TEST_USERS[0].id).run()

      repo.load('posts', [{ id: 'p_del', status: 'published', image: 'https://ex.com/api/media/f.png' }])

      const res = await app.request('/api/content/posts/p_del', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(200)
      expect(s3SendSpy).toHaveBeenCalled()
    })

    it('error: delete non-existent seed returns 404', async () => {
      const res = await app.request('/api/content/nonexistent/p_del', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(404)
    })

    it('error: delete repository throws generic error returns 500', async () => {
      repo.load('posts', [{ id: 'p_del', status: 'published' }])
      vi.spyOn(repo, 'delete').mockRejectedValueOnce(new Error('Delete DB error'))
      const res = await app.request('/api/content/posts/p_del', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(500)
    })

    it('success: R2 cleanup failure on delete is logged but does not fail the request', async () => {
      repo.load('posts', [{ id: 'p_del_r2', status: 'published', image: 'https://ex.com/api/media/f.png' }])
      vi.spyOn(uploadModule, 'deleteR2Objects').mockRejectedValueOnce(new Error('R2 unreachable'))
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const res = await app.request('/api/content/posts/p_del_r2', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(200)
      expect(warnSpy).toHaveBeenCalledWith('R2 cleanup on delete failed (orphaned files):', expect.any(Error))
    })
  })

  describe('Additional coverage: Admin content handlers sad paths', () => {
    // facets.ts
    it('GET /api/content/:slug/facets errors', async () => {
      // Seed not found
      let res = await app.request('/api/content/nonexistent/facets', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(404)

      // DB error
      vi.spyOn(repo, 'getFacets').mockRejectedValueOnce(new Error('Facets DB error'))
      res = await app.request('/api/content/posts/facets', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(500)
    })

    // get.ts
    it('GET /api/content/:slug/:id errors', async () => {
      // Seed not found
      let res = await app.request('/api/content/nonexistent/p_001', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(404)

      // allowDrafts = false (documentation seed has allowDrafts: false)
      repo.load('documentation', [{ id: 'doc_001', slug: 'doc-1', status: 'published', title: 'Doc' }])
      res = await app.request('/api/content/documentation/doc_001', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(200)
      const body = await res.json<any>()
      expect(body.has_pending_draft).toBe(false)

      // DB error on findById
      vi.spyOn(repo, 'findById').mockRejectedValueOnce(new Error('FindById DB error'))
      res = await app.request('/api/content/posts/p_001', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(500)
    })

    it('GET /api/content/:schema_slug/by-slug/:entry_slug errors', async () => {
      // Seed not found
      let res = await app.request('/api/content/nonexistent/by-slug/some-slug', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(404)

      // allowDrafts = false on by-slug
      repo.load('documentation', [{ id: 'doc_002', slug: 'doc-2', status: 'published', title: 'Doc2' }])
      res = await app.request('/api/content/documentation/by-slug/doc-2', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(200)

      // Entry not found on by-slug
      res = await app.request('/api/content/posts/by-slug/ghost-slug', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(404)

      // DB error on findBySlug
      vi.spyOn(repo, 'findBySlug').mockRejectedValueOnce(new Error('FindBySlug DB error'))
      res = await app.request('/api/content/posts/by-slug/some-slug', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(500)
    })

    // create.ts
    it('POST /api/content/:slug errors', async () => {
      // Seed not found
      let res = await app.request('/api/content/nonexistent', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New' })
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(404)

      // Status not valid
      res = await app.request('/api/content/posts', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New', status: 'invalid-status' })
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(400)

      // Dangerous markup
      res = await app.request('/api/content/posts', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New', body: '<script>alert(1)</script>' })
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(422)

      // Validation details > 0 (missing required field 'title')
      res = await app.request('/api/content/posts', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: { type: 'doc', content: [] } }) // title is missing
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(400)

      // PrivacyPolicyError (privacy encrypt)
      const ENCRYPTED_SEED = defineSeed({
        slug: 'encrypted',
        label: 'Encrypted',
        labelPlural: 'Encrypteds',
        displayNameAlias: 'secret',
        branches: [
          { id: 'br_01', alias: 'secret', label: 'Secret', type: 'text', policies: { privacy: 'encrypt' } }
        ]
      })
      const localRepo = new StaticContentRepository([ENCRYPTED_SEED])
      const encryptedApp = createBeechApp({ seeds: [ENCRYPTED_SEED], repository: localRepo, idempotencyRepository: idempotencyRepo })
      __resetSeedRegistryCache()
      res = await encryptedApp.request('/api/content/encrypted', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: 'secret-val' })
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(501)

      // DB error
      vi.spyOn(repo, 'create').mockRejectedValueOnce(new Error('Create DB error'))
      __resetSeedRegistryCache()
      res = await app.request('/api/content/posts', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Post title' })
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(500)

      // Unexpected (non-PrivacyPolicyError) error from applyPrivacy is rethrown -> 500
      vi.spyOn(applyPolicies, 'applyPrivacy').mockRejectedValueOnce(new Error('Unexpected privacy error'))
      __resetSeedRegistryCache()
      res = await app.request('/api/content/posts', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Post title' })
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(500)
    })

    it('POST /api/content/:slug success: uses provided slug instead of generating one', async () => {
      const res = await app.request('/api/content/posts', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Post', slug: 'custom-slug' })
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(201)
      const body = await res.json<{ id: string }>()
      const created = await repo.findById(TEST_SEEDS[0], body.id)
      expect(created.slug).toBe('custom-slug')
    })

    // update.ts
    it('PUT /api/content/:slug/:id errors', async () => {
      repo.load('posts', [{ id: 'p_upd_err', slug: 'upd-slug', status: 'published', title: 'Title' }])

      // Seed not found
      let res = await app.request('/api/content/nonexistent/p_upd_err', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New' })
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(404)

      // JSON body malformed
      res = await app.request('/api/content/posts/p_upd_err', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: 'invalid-json'
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(400)

      // Status not valid
      res = await app.request('/api/content/posts/p_upd_err', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'invalid-status' })
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(400)

      // Missing slug (when slug is set to empty string)
      res = await app.request('/api/content/posts/p_upd_err', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: '' })
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(400)

      // Sensitive field edit (secret has privacy policy other than plain or public: false)
      const SENSITIVE_SEED = defineSeed({
        slug: 'sensitive_test',
        label: 'Sensitive',
        labelPlural: 'Sensitives',
        displayNameAlias: 'secret',
        branches: [
          { id: 'br_01', alias: 'secret', label: 'Secret', type: 'text', policies: { privacy: 'encrypt' } }
        ]
      })
      const sensRepo = new StaticContentRepository([SENSITIVE_SEED])
      const sensitiveApp = createBeechApp({ seeds: [SENSITIVE_SEED], repository: sensRepo, idempotencyRepository: idempotencyRepo })
      sensRepo.load('sensitive_test', [{ id: 'sens_001', slug: 'sens-1', status: 'published', secret: 'old' }])
      __resetSeedRegistryCache()
      res = await sensitiveApp.request('/api/content/sensitive_test/sens_001', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: 'new-secret' })
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(422)

      // Dangerous markup
      __resetSeedRegistryCache()
      res = await app.request('/api/content/posts/p_upd_err', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: '<script>alert(1)</script>' })
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(422)

      // Validation details > 0 (invalid richtext body)
      __resetSeedRegistryCache()
      res = await app.request('/api/content/posts/p_upd_err', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: { invalid: 'object' } })
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(400)

      // PrivacyPolicyError (privacy encrypt)
      vi.spyOn(applyPolicies, 'applyPrivacy').mockRejectedValueOnce(new applyPolicies.PrivacyPolicyError('Mocked PrivacyPolicyError'))
      __resetSeedRegistryCache()
      res = await app.request('/api/content/posts/p_upd_err', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Title' })
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(501)

      // Slug conflict
      repo.load('posts', [
        { id: 'p1', slug: 'slug1', status: 'published', title: 'P1' },
        { id: 'p2', slug: 'slug2', status: 'published', title: 'P2' }
      ])
      __resetSeedRegistryCache()
      res = await app.request('/api/content/posts/p1', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'slug2' })
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(409)

      // DB error on update
      vi.spyOn(repo, 'update').mockRejectedValueOnce(new Error('Update DB error'))
      res = await app.request('/api/content/posts/p1', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New title' })
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(500)
    })

    // list.ts
    it('GET /api/content/:slug list errors and relation mapping paths', async () => {
      // Seed not found
      let res = await app.request('/api/content/nonexistent', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(404)

      // DB error
      vi.spyOn(repo, 'findMany').mockRejectedValueOnce(new Error('List DB error'))
      res = await app.request('/api/content/posts', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(500)

      // buildRelationsMap when the relation table doesn't exist/throws (covered by catch in buildRelationsMap)
      // Define a custom seed with a relation branch
      const REL_SEED = defineSeed({
        slug: 'reltest',
        label: 'RelTest',
        labelPlural: 'RelTests',
        displayNameAlias: 'title',
        branches: [
          { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
          { id: 'br_02', alias: 'target_id', label: 'Target', type: 'relation', targetSeed: 'missing_target' }
        ]
      })
      const localRepo = new StaticContentRepository([REL_SEED])
      const relApp = createBeechApp({ seeds: [REL_SEED], repository: localRepo })
      localRepo.load('reltest', [{ id: 'r1', slug: 'r-1', status: 'published', title: 'Rel 1', target_id: 't1' }])
      __resetSeedRegistryCache()
      
      // Request with filters or page/limit to trigger buildRelationsMap (hasQueryParams = true)
      res = await relApp.request('/api/content/reltest?limit=5', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(200)
      const body = await res.json<any>()
      expect(body.relations).toEqual({}) // target seed 'missing_target' registry lookup returns undefined
    })
  })
})
