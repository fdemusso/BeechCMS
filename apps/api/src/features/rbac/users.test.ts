// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'
import { createBeechApp } from '../../factory'
import { D1TestDatabase } from '../../../test/helpers/d1-test-database'
import { seedTestUsers } from '../../../test/helpers/seed-fixtures'
import { TEST_ENV } from '../../../test/fixtures'

describe('features/rbac/users', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>

  const ADMIN = { id: 'user_rbac_admin', email: 'rbac-admin@beechcms.io' }

  beforeEach(async () => {
    db = new D1TestDatabase()
    const passwordHash = await bcrypt.hash('password123', 10)
    await seedTestUsers(db, [{ ...ADMIN, password_hash: passwordHash }])
    app = createBeechApp({ seeds: [] })
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

  describe('POST /api/rbac/users', () => {
    it('creates a zero-trust account with role=editor and no assignments', async () => {
      const token = await login(ADMIN.email)
      const res = await authed('/api/rbac/users', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'partner@beechcms.io', password: 'password123' }),
      })
      expect(res.status).toBe(201)
      const body = await res.json<{ id: string; role: string; assignments: unknown[] }>()
      expect(body.role).toBe('editor')
      expect(body.assignments).toEqual([])

      const row = await db.prepare('SELECT role FROM users WHERE id = ?').bind(body.id).first<{ role: string }>()
      expect(row?.role).toBe('editor')
    })

    it('rejects a duplicate email with 409 email-taken', async () => {
      const token = await login(ADMIN.email)
      await authed('/api/rbac/users', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'dupe@beechcms.io', password: 'password123' }),
      })
      const res = await authed('/api/rbac/users', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'dupe@beechcms.io', password: 'password123' }),
      })
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ type: expect.stringContaining('email-taken') })
    })

    it('a request body field cannot set users.role to admin', async () => {
      const token = await login(ADMIN.email)
      const res = await authed('/api/rbac/users', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'sneaky@beechcms.io', password: 'password123', role: 'admin' }),
      })
      expect(res.status).toBe(201)
      const body = await res.json<{ id: string }>()
      const row = await db.prepare('SELECT role FROM users WHERE id = ?').bind(body.id).first<{ role: string }>()
      expect(row?.role).toBe('editor')
    })
  })

  describe('GET /api/rbac/users/:userId', () => {
    it('returns 404, never 403, for an account outside the caller scope', async () => {
      const token = await login(ADMIN.email)
      const createRes = await authed('/api/rbac/users', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'zero-trust@beechcms.io', password: 'password123' }),
      })
      const { id } = await createRes.json<{ id: string }>()

      // A scoped manager with manage_users only on 'posts' cannot see a zero-trust account.
      const scopedPasswordHash = await bcrypt.hash('password123', 10)
      await seedTestUsers(db, [{ id: 'user_scoped_mgr', email: 'scoped-mgr@beechcms.io', password_hash: scopedPasswordHash, grantSuperAdmin: false }])
      await db.prepare(`INSERT INTO seeds (slug, definition, status) VALUES ('posts', '{}', 'active')`).run()
      await db.prepare(`INSERT INTO roles (id, name, description, is_system) VALUES ('role_scoped_mgr', 'ScopedManager', NULL, 0)`).run()
      await db.prepare(`INSERT INTO role_permissions (role_id, permission) VALUES ('role_scoped_mgr', 'manage_users')`).run()
      await db.prepare(`INSERT INTO user_role_assignments (id, user_id, role_id, scope) VALUES ('ura_scoped_mgr', 'user_scoped_mgr', 'role_scoped_mgr', 'posts')`).run()

      const scopedToken = await login('scoped-mgr@beechcms.io')
      const res = await authed(`/api/rbac/users/${id}`, scopedToken)
      expect(res.status).toBe(404)
    })
  })
})
