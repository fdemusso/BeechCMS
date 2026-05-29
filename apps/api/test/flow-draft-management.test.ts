// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import { createBeechApp } from '../src/factory'
import { StaticContentRepository } from './mocks/static-content.repository'
import { D1TestDatabase } from './helpers/d1-test-database'
import { seedTestUsers } from './helpers/seed-fixtures'
import { TEST_SEEDS, TEST_USERS, TEST_ENV } from './fixtures'

/**
 * SPRINT: BeechCMS Test Redesign
 * FLOW: Draft Management (Mirror Tables)
 * 
 * This suite verifies the "Mirror Table" logic, where pending changes are stored
 * in a separate table (_drafts) without affecting the live entry until published.
 * 
 * Architecture:
 * - Uses StaticContentRepository to simulate the two-table (Live vs Draft) system.
 * - Requires authentication via Bearer token for all operations.
 * - Only seeds with 'allowDrafts: true' can use these endpoints.
 */
describe('Flow: Draft Management (Mirror Tables)', () => {
  let repository: StaticContentRepository
  let database: D1TestDatabase
  let application: ReturnType<typeof createBeechApp>
  let adminAccessToken: string

  /**
   * SETUP: Reset state and obtain a valid admin token.
   * Input: None
   * Output: Initializes testing context and adminAccessToken.
   */
  beforeEach(async () => {
    // Note: TEST_SEEDS[0] ('posts') has allowDrafts: true (updated in fixtures.ts)
    repository = new StaticContentRepository(TEST_SEEDS)
    database = new D1TestDatabase()
    await seedTestUsers(database, TEST_USERS)
    application = createBeechApp({ 
      seeds: TEST_SEEDS, 
      repository: repository 
    })

    // Perform administrative login
    const loginResponse = await application.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        email: TEST_USERS[0].email, 
        password: 'password123' 
      })
    }, { ...TEST_ENV, DB: database })

    const loginData = await loginResponse.json<{ token: string }>()
    adminAccessToken = loginData.token
  })

  /**
   * TEST: PUT /api/content/:slug/:id/draft (Save Draft)
   * Verifies that changes are saved in the draft table while keeping live data intact.
   */
  describe('PUT /api/content/:slug/:id/draft (Save Draft)', () => {
    it('success: saves pending changes in draft table without affecting live entry', async () => {
      // Seed a live entry
      const entryId = 'p_001'
      repository.load('posts', [{ 
        id: entryId, 
        slug: 'live-post', 
        status: 'published', 
        title: 'Original Live Title' 
      }])

      // Save a draft update
      const response = await application.request(`/api/content/posts/${entryId}/draft`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${adminAccessToken}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ title: 'New Draft Title' })
      }, { ...TEST_ENV, DB: database })

      expect(response.status).toBe(200)
      
      // Verify live entry remains unchanged
      const liveEntry = await repository.findById(TEST_SEEDS[0], entryId)
      expect(liveEntry.title).toBe('Original Live Title')

      // Verify draft exists in repository
      const draftData = await repository.getDraft(TEST_SEEDS[0], entryId)
      expect(draftData?.title).toBe('New Draft Title')
    })

    it('success: overwrites existing draft for the same entry', async () => {
      const entryId = 'p_002'
      repository.load('posts', [{ id: entryId, slug: 'p2', status: 'published', title: 'Live' }])
      await repository.saveDraft(TEST_SEEDS[0], entryId, { title: 'First Draft' })

      const response = await application.request(`/api/content/posts/${entryId}/draft`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${adminAccessToken}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ title: 'Second Draft' })
      }, { ...TEST_ENV, DB: database })

      expect(response.status).toBe(200)
      const draftData = await repository.getDraft(TEST_SEEDS[0], entryId)
      expect(draftData?.title).toBe('Second Draft')
    })

    it('error: returns 405 if seed does not allow drafts', async () => {
      // 'documentation' seed has allowDrafts: false (default)
      const entryId = 'doc_001'
      repository.load('documentation', [{ id: entryId, slug: 'doc1', status: 'published', title: 'Doc' }])

      const response = await application.request(`/api/content/documentation/${entryId}/draft`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${adminAccessToken}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ title: 'Draft Not Allowed' })
      }, { ...TEST_ENV, DB: database })

      expect(response.status).toBe(405)
      const body = await response.json<{ type: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/draft-not-allowed')
    })

    it('error: returns 404 if parent entry does not exist', async () => {
      const response = await application.request('/api/content/posts/ghost-id/draft', {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${adminAccessToken}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ title: 'Ghost Draft' })
      }, { ...TEST_ENV, DB: database })

      expect(response.status).toBe(404)
    })
  })

  /**
   * TEST: GET /api/content/:slug/:id/draft (Get Draft)
   * Verifies that the pending draft can be retrieved.
   */
  describe('GET /api/content/:slug/:id/draft (Get Draft)', () => {
    it('success: returns the pending draft content', async () => {
      const entryId = 'p_003'
      repository.load('posts', [{ id: entryId, slug: 'p3', status: 'published', title: 'Live' }])
      await repository.saveDraft(TEST_SEEDS[0], entryId, { title: 'Pending Changes' })

      const response = await application.request(`/api/content/posts/${entryId}/draft`, {
        headers: { 'Authorization': `Bearer ${adminAccessToken}` }
      }, { ...TEST_ENV, DB: database })

      expect(response.status).toBe(200)
      const { data } = await response.json<{ data: any }>()
      expect(data.title).toBe('Pending Changes')
    })

    it('error: returns 404 if no draft is pending for the entry', async () => {
      const entryId = 'p_004'
      repository.load('posts', [{ id: entryId, slug: 'p4', status: 'published', title: 'Live' }])

      const response = await application.request(`/api/content/posts/${entryId}/draft`, {
        headers: { 'Authorization': `Bearer ${adminAccessToken}` }
      }, { ...TEST_ENV, DB: database })

      expect(response.status).toBe(404)
      const body = await response.json<{ type: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/draft-not-found')
    })
  })

  /**
   * TEST: POST /api/content/:slug/:id/draft/publish (Publish Draft)
   * Verifies that promoting a draft to live is atomic and clears the draft table.
   */
  describe('POST /api/content/:slug/:id/draft/publish (Publish Draft)', () => {
    it('success: promotes draft to live and deletes the draft record', async () => {
      const entryId = 'p_005'
      repository.load('posts', [{ id: entryId, slug: 'p5', status: 'published', title: 'Old Live' }])
      await repository.saveDraft(TEST_SEEDS[0], entryId, { title: 'New Live Title' })

      const response = await application.request(`/api/content/posts/${entryId}/draft/publish`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminAccessToken}` }
      }, { ...TEST_ENV, DB: database })

      expect(response.status).toBe(200)

      // Verify live entry is updated
      const liveEntry = await repository.findById(TEST_SEEDS[0], entryId)
      expect(liveEntry.title).toBe('New Live Title')

      // Verify draft is removed
      const hasDraft = await repository.hasDraft(TEST_SEEDS[0], entryId)
      expect(hasDraft).toBe(false)
    })

    it('error: returns 404 if trying to publish a non-existent draft', async () => {
      const entryId = 'p_006'
      repository.load('posts', [{ id: entryId, slug: 'p6', status: 'published', title: 'Live' }])

      const response = await application.request(`/api/content/posts/${entryId}/draft/publish`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminAccessToken}` }
      }, { ...TEST_ENV, DB: database })

      expect(response.status).toBe(404)
    })
  })

  /**
   * TEST: DELETE /api/content/:slug/:id/draft (Discard Draft)
   * Verifies that a draft can be discarded without affecting live data.
   */
  describe('DELETE /api/content/:slug/:id/draft (Discard Draft)', () => {
    it('success: removes draft record while keeping live data intact', async () => {
      const entryId = 'p_007'
      repository.load('posts', [{ id: entryId, slug: 'p7', status: 'published', title: 'Live' }])
      await repository.saveDraft(TEST_SEEDS[0], entryId, { title: 'To Be Discarded' })

      const response = await application.request(`/api/content/posts/${entryId}/draft`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminAccessToken}` }
      }, { ...TEST_ENV, DB: database })

      expect(response.status).toBe(200)

      // Verify draft is gone
      const hasDraft = await repository.hasDraft(TEST_SEEDS[0], entryId)
      expect(hasDraft).toBe(false)

      // Verify live entry is still there
      const liveEntry = await repository.findById(TEST_SEEDS[0], entryId)
      expect(liveEntry.title).toBe('Live')
    })
  })
})
