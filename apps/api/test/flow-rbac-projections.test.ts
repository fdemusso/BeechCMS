// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import { createBeechApp } from '../src/factory'
import { D1TestDatabase } from './helpers/d1-test-database'
import { StaticContentRepository } from './mocks/static-content.repository'
import { seedTestUsers } from './helpers/seed-fixtures'
import { TEST_SEEDS, TEST_ENV } from './fixtures'

/**
 * SPRINT: RbacScopedProjections
 * FLOW: a listing returns exactly what the caller could open one-by-one, never more.
 *
 * Covers all 8 T7 steps: /api/schema, /api/content/drafts and /api/search narrow to the
 * caller's readable seeds, /api/settings/me emits the raw authority + isDeveloper, and a
 * zero-trust account gets 200-with-empty-payload everywhere, never a 403 or a 500.
 */
describe('Flow: RBAC scoped projections', () => {
  let db: D1TestDatabase
  let repository: StaticContentRepository
  let app: ReturnType<typeof createBeechApp>

  beforeEach(async () => {
    db = new D1TestDatabase()
    repository = new StaticContentRepository(TEST_SEEDS)
    app = createBeechApp({ seeds: TEST_SEEDS, repository })
    // The role assignment repository decay-filters scopes against the D1 `seeds` table
    // (not the in-memory seed registry `createBeechApp` uses).
    await db.prepare(`INSERT INTO seeds (slug, definition, status) VALUES ('posts', '{}', 'active')`).run()
    await db.prepare(`INSERT INTO seeds (slug, definition, status) VALUES ('documentation', '{}', 'active')`).run()

    // D1SearchRepository queries the real content + FTS tables for every readable,
    // full-text-searchable seed — 'posts' is one (title/body are public+search branches).
    // These tables are normally created at runtime by the Botanical Engine's schema apply,
    // which this suite does not exercise; create the minimal shape by hand instead.
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS content_posts (
        id TEXT NOT NULL PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'draft',
        title TEXT,
        body TEXT
      )
    `).run()
    await db.prepare(`
      CREATE VIRTUAL TABLE IF NOT EXISTS fts_posts USING fts5(
        entry_id UNINDEXED, title, body, tokenize = 'unicode61'
      )
    `).run()
  })

  async function login(email: string) {
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' }),
    }, { ...TEST_ENV, DB: db })
    const body = await res.json<{ token: string }>()
    return body.token
  }

  async function authed(path: string, token: string, init: RequestInit = {}) {
    return app.request(path, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    }, { ...TEST_ENV, DB: db })
  }

  it('a seed-scoped account sees only its own seed across all four endpoints', async () => {
    // 1. Setup: SuperAdmin at '*' + a second account granted content:read on 'posts' only.
    const setupRes = await app.request('/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'super@beech.local',
        password: 'password123',
        settings: { language: 'en', timezone: 'Europe/Rome', currency: 'EUR' },
        track: 'developer',
      }),
    }, { ...TEST_ENV, DB: db })
    expect(setupRes.status).toBe(201)
    const superToken = await login('super@beech.local')

    const postsReaderRoleRes = await authed('/api/rbac/roles', superToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'PostsReader', permissions: ['content:read'] }),
    })
    const { id: postsReaderRoleId } = await postsReaderRoleRes.json<{ id: string }>()

    const scopedUserRes = await authed('/api/rbac/users', superToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'scoped@beech.local', password: 'password123' }),
    })
    const { id: scopedUserId } = await scopedUserRes.json<{ id: string }>()

    const assignRes = await authed('/api/rbac/assignments', superToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: scopedUserId, roleId: postsReaderRoleId, scope: 'posts' }),
    })
    expect(assignRes.status).toBe(201)
    const scopedToken = await login('scoped@beech.local')

    // 2. GET /api/schema: SuperAdmin sees every seed; the scoped account sees only 'posts'.
    const superSchemaRes = await authed('/api/schema', superToken)
    const superSchema = await superSchemaRes.json<Array<{ slug: string }>>()
    expect(superSchema.map(s => s.slug).sort()).toEqual(TEST_SEEDS.map(s => s.slug).sort())

    const scopedSchemaRes = await authed('/api/schema', scopedToken)
    expect(scopedSchemaRes.status).toBe(200)
    const scopedSchema = await scopedSchemaRes.json<Array<{ slug: string }>>()
    expect(scopedSchema.map(s => s.slug)).toEqual(['posts'])

    // 3. GET /api/content/drafts: 200 (was 403 before this sprint), every draft belongs
    //    to the caller's seed.
    repository.load('posts', [{ id: 'p_1', slug: 'draft-post', status: 'draft', title: 'Draft Post' }])
    await repository.saveDraft(TEST_SEEDS[0], 'p_1', { title: 'Draft Post' })

    const scopedDraftsRes = await authed('/api/content/drafts', scopedToken)
    expect(scopedDraftsRes.status).toBe(200)
    const scopedDrafts = await scopedDraftsRes.json<Array<{ seedSlug: string }>>()
    for (const draft of scopedDrafts) {
      expect(draft.seedSlug).toBe('posts')
    }

    // 4. GET /api/search: 200, no result from an unreadable seed.
    const scopedSearchRes = await authed('/api/search?q=draft', scopedToken)
    expect(scopedSearchRes.status).toBe(200)
    const scopedSearch = await scopedSearchRes.json<{ items: Array<{ schema_slug: string }> }>()
    expect(scopedSearch.items.every(item => item.schema_slug === 'posts')).toBe(true)

    // 5. GET /api/search?schema_slug=<unreadable seed>: 200 with items: [], never 403/404.
    const unreadableSearchRes = await authed('/api/search?q=draft&schema_slug=documentation', scopedToken)
    expect(unreadableSearchRes.status).toBe(200)
    expect(await unreadableSearchRes.json()).toEqual({ items: [], nextCursor: null, total: 0 })

    // 6. GET /api/settings/me as the scoped account.
    const scopedMeRes = await authed('/api/settings/me', scopedToken)
    expect(scopedMeRes.status).toBe(200)
    const scopedMe = await scopedMeRes.json<{ permissions: { global: string[]; byScope: Record<string, string[]> }; isDeveloper: boolean }>()
    expect(scopedMe.permissions.global).toEqual([])
    expect(scopedMe.permissions.byScope.posts).toContain('content:read')
    expect(scopedMe.isDeveloper).toBe(false)

    // 7. GET /api/settings/me as the setup admin.
    const superMeRes = await authed('/api/settings/me', superToken)
    const superMe = await superMeRes.json<{ permissions: { global: string[] }; isDeveloper: boolean }>()
    expect(superMe.isDeveloper).toBe(true)
    expect(superMe.permissions.global.sort()).toEqual(
      ['content:read', 'content:create', 'content:update', 'content:delete', 'manage_users', 'manage_roles', 'view_analytics'].sort(),
    )

    // 8. A zero-trust account (created, never assigned): 200 with empty payloads
    //    everywhere, never a 500 and never a 403.
    const zeroTrustRes = await authed('/api/rbac/users', superToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'zerotrust@beech.local', password: 'password123' }),
    })
    const { assignments: zeroTrustAssignments } = await zeroTrustRes.json<{ assignments: unknown[] }>()
    expect(zeroTrustAssignments).toEqual([])
    const zeroTrustToken = await login('zerotrust@beech.local')

    const zeroTrustMeRes = await authed('/api/settings/me', zeroTrustToken)
    expect(zeroTrustMeRes.status).toBe(200)
    expect((await zeroTrustMeRes.json<{ permissions: unknown }>()).permissions).toEqual({ global: [], byScope: {} })

    const zeroTrustSchemaRes = await authed('/api/schema', zeroTrustToken)
    expect(zeroTrustSchemaRes.status).toBe(200)
    expect(await zeroTrustSchemaRes.json()).toEqual([])

    const zeroTrustDraftsRes = await authed('/api/content/drafts', zeroTrustToken)
    expect(zeroTrustDraftsRes.status).toBe(200)
    expect(await zeroTrustDraftsRes.json()).toEqual([])

    const zeroTrustSearchRes = await authed('/api/search?q=draft', zeroTrustToken)
    expect(zeroTrustSearchRes.status).toBe(200)
    expect(await zeroTrustSearchRes.json()).toEqual({ items: [], nextCursor: null, total: 0 })
  })
})
