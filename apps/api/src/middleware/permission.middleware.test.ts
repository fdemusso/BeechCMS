// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { createBeechApp } from '../factory'
import { resolveRouteRule, requireActiveAccount } from './permission.middleware'
import { D1TestDatabase } from '../../test/helpers/d1-test-database'
import { seedTestUsers } from '../../test/helpers/seed-fixtures'
import { TEST_SEEDS, TEST_ENV } from '../../test/fixtures'

describe('resolveRouteRule', () => {
  it('every route Hono mounts under /api resolves to a rule (fail-closed regression guard)', () => {
    const app = createBeechApp({ seeds: TEST_SEEDS })
    const EXCLUDED = /^\/api\/(v1\/public|custom|webhooks|media)\b/
    const unmapped = app.routes
      .filter(r => r.path.startsWith('/api') && !EXCLUDED.test(r.path) && r.method !== 'ALL')
      .filter(r => resolveRouteRule(r.method, r.path.replace(/:([^/]+)/g, 'x')) === null)
    expect(unmapped).toEqual([])
  })

  it('does not let /api/content/notifications or /api/content/drafts fall through to :slug patterns', () => {
    expect(resolveRouteRule('GET', '/api/content/notifications')).toMatchObject({ requirement: { kind: 'authenticated' } })
    expect(resolveRouteRule('GET', '/api/content/drafts')).toMatchObject({
      requirement: { kind: 'authenticated' },
    })
  })
})

describe('resolveRouteRule — stats routes', () => {
  const STATS_REQUIREMENTS = [
    { method: 'GET', path: '/api/content/stats/total', requirement: { kind: 'authenticated' } },
    { method: 'GET', path: '/api/content/stats/breakdown', requirement: { kind: 'authenticated' } },
    { method: 'GET', path: '/api/content/stats/recent-activity', requirement: { kind: 'authenticated' } },
    { method: 'GET', path: '/api/content/stats/media-library', requirement: { kind: 'permission', permission: 'content:read', scope: 'global' } },
    { method: 'GET', path: '/api/content/stats/unused-media', requirement: { kind: 'permission', permission: 'content:read', scope: 'global' } },
    { method: 'GET', path: '/api/content/stats/setup-checklist', requirement: { kind: 'permission', permission: 'manage_users', scope: 'global' } },
    { method: 'GET', path: '/api/content/stats/health', requirement: { kind: 'permission', permission: 'view_analytics', scope: 'global' } },
    { method: 'GET', path: '/api/content/stats/cloudflare', requirement: { kind: 'permission', permission: 'view_analytics', scope: 'global' } },
    { method: 'POST', path: '/api/content/stats/storage/sync', requirement: { kind: 'permission', permission: 'view_analytics', scope: 'global' } },
  ] as const

  it('every stats route resolves to its own requirement', () => {
    const resolved = STATS_REQUIREMENTS.map(({ method, path }) => resolveRouteRule(method, path)?.requirement)

    expect(resolved).toEqual(STATS_REQUIREMENTS.map(({ requirement }) => requirement))
  })
})

describe('permissionMiddleware', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>

  const ADMIN = { id: 'user_perm_admin', email: 'perm-admin@beechcms.io' }

  beforeEach(async () => {
    db = new D1TestDatabase()
    const bcrypt = await import('bcryptjs')
    const passwordHash = await bcrypt.hash('password123', 10)
    await seedTestUsers(db, [{ ...ADMIN, password_hash: passwordHash }])
    app = createBeechApp({ seeds: TEST_SEEDS })
    // The role assignment repository decay-filters scopes against the D1 `seeds` table
    // (not the in-memory seed registry `createBeechApp` uses).
    await db.prepare(`INSERT INTO seeds (slug, definition, status) VALUES ('posts', '{}', 'active')`).run()
  })

  async function login(email: string, password = 'password123') {
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }, { ...TEST_ENV, DB: db })
    if (res.status !== 200) return ''
    const body = await res.json<{ token?: string }>()
    return body.token ?? ''
  }

  it('an unmapped path under apiProtected receives 403 route_not_registered', async () => {
    const token = await login(ADMIN.email)
    expect(token).toBeTruthy()

    const res = await app.request('/api/does-not-exist', {
      headers: { Authorization: `Bearer ${token}` },
    }, { ...TEST_ENV, DB: db })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'route_not_registered' })
  })

  it('legacy-admin routes pass the gate and are then refused by requireAdmin for a non-admin', async () => {
    const rule = resolveRouteRule('GET', '/api/seeds')
    expect(rule?.requirement).toEqual({ kind: 'legacy-admin' })
  })

  it('deactivated account is refused 403 account_disabled even on GET /api/settings/me', async () => {
    const token = await login(ADMIN.email)
    expect(token).toBeTruthy()

    await db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').bind(ADMIN.id).run()

    const res = await app.request('/api/settings/me', {
      headers: { Authorization: `Bearer ${token}` },
    }, { ...TEST_ENV, DB: db })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'account_disabled' })
  })

  it('permission-any-scope: a caller holding manage_users only on seed blog clears GET /api/rbac/users', async () => {
    const SCOPED = { id: 'user_perm_scoped', email: 'perm-scoped@beechcms.io' }
    const bcrypt = await import('bcryptjs')
    const passwordHash = await bcrypt.hash('password123', 10)
    await seedTestUsers(db, [{ ...SCOPED, password_hash: passwordHash, grantSuperAdmin: false }])

    const role = await db
      .prepare(`INSERT INTO roles (id, name, description, is_system) VALUES ('role_scoped_mu', 'ScopedManager', NULL, 0)`)
      .run()
    void role
    await db.prepare(`INSERT INTO role_permissions (role_id, permission) VALUES ('role_scoped_mu', 'manage_users')`).run()
    await db
      .prepare(
        `INSERT INTO user_role_assignments (id, user_id, role_id, scope) VALUES ('ura_scoped', ?, 'role_scoped_mu', 'posts')`,
      )
      .bind(SCOPED.id)
      .run()

    const token = await login(SCOPED.email)
    expect(token).toBeTruthy()

    const res = await app.request('/api/rbac/users', {
      headers: { Authorization: `Bearer ${token}` },
    }, { ...TEST_ENV, DB: db })
    expect(res.status).toBe(200)
  })

  it('permission-any-scope: a caller holding only content:read is refused 403 forbidden on GET /api/rbac/users', async () => {
    const READER = { id: 'user_perm_reader', email: 'perm-reader@beechcms.io' }
    const bcrypt = await import('bcryptjs')
    const passwordHash = await bcrypt.hash('password123', 10)
    await seedTestUsers(db, [{ ...READER, password_hash: passwordHash, grantSuperAdmin: false }])

    await db
      .prepare(`INSERT INTO roles (id, name, description, is_system) VALUES ('role_reader', 'Reader', NULL, 0)`)
      .run()
    await db.prepare(`INSERT INTO role_permissions (role_id, permission) VALUES ('role_reader', 'content:read')`).run()
    await db
      .prepare(
        `INSERT INTO user_role_assignments (id, user_id, role_id, scope) VALUES ('ura_reader', ?, 'role_reader', 'posts')`,
      )
      .bind(READER.id)
      .run()

    const token = await login(READER.email)
    expect(token).toBeTruthy()

    const res = await app.request('/api/rbac/users', {
      headers: { Authorization: `Bearer ${token}` },
    }, { ...TEST_ENV, DB: db })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'forbidden' })
  })

  it('self-service activity: a content:read-only account gets 200 with only its own entries on GET /api/settings/activity', async () => {
    const READER = { id: 'user_act_reader', email: 'act-reader@beechcms.io' }
    const OTHER = { id: 'user_act_other', email: 'act-other@beechcms.io' }
    const bcrypt = await import('bcryptjs')
    const passwordHash = await bcrypt.hash('password123', 10)
    await seedTestUsers(db, [
      { ...READER, password_hash: passwordHash, grantSuperAdmin: false },
      { ...OTHER, password_hash: passwordHash, grantSuperAdmin: false },
    ])

    await db
      .prepare(`INSERT INTO roles (id, name, description, is_system) VALUES ('role_act_reader', 'ActReader', NULL, 0)`)
      .run()
    await db.prepare(`INSERT INTO role_permissions (role_id, permission) VALUES ('role_act_reader', 'content:read')`).run()
    await db
      .prepare(
        `INSERT INTO user_role_assignments (id, user_id, role_id, scope) VALUES ('ura_act_reader', ?, 'role_act_reader', 'posts')`,
      )
      .bind(READER.id)
      .run()

    const insertLog = db.prepare(
      `INSERT INTO activity_logs (id, user_id, user_email, action, entity_type, entity_id) VALUES (?, ?, ?, 'update', 'entry', 'e1')`,
    )
    await insertLog.bind('log_own', READER.id, READER.email).run()
    await insertLog.bind('log_other', OTHER.id, OTHER.email).run()

    const token = await login(READER.email)
    expect(token).toBeTruthy()

    const res = await app.request('/api/settings/activity', {
      headers: { Authorization: `Bearer ${token}` },
    }, { ...TEST_ENV, DB: db })
    expect(res.status).toBe(200)
    const entries = await res.json<Array<{ id: string }>>()
    expect(entries.map(entry => entry.id)).toContain('log_own')
    expect(entries.map(entry => entry.id)).not.toContain('log_other')
  })
})

describe('requireActiveAccount', () => {
  function buildApp(findById: (id: string) => Promise<{ isActive: boolean } | null>) {
    const app = new Hono<any>()
    app.use('*', async (c, next) => {
      c.set('jwtPayload', { sub: 'user-1' })
      c.set('userRepository', { findById })
      await next()
    })
    app.use('/gated', requireActiveAccount())
    app.get('/gated', (c) => c.json({ ok: true }))
    return app
  }

  it('refuses a deactivated account with 403 account_disabled', async () => {
    const app = buildApp(async () => ({ isActive: false }))
    const res = await app.request('/gated')
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'account_disabled' })
  })

  it('refuses a missing user record with 403 account_disabled', async () => {
    const app = buildApp(async () => null)
    const res = await app.request('/gated')
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'account_disabled' })
  })

  it('calls next() for an active account', async () => {
    const app = buildApp(async () => ({ isActive: true }))
    const res = await app.request('/gated')
    expect(res.status).toBe(200)
  })
})
