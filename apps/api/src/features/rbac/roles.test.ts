// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'
import { createBeechApp } from '../../factory'
import { D1TestDatabase } from '../../../test/helpers/d1-test-database'
import { seedTestUsers } from '../../../test/helpers/seed-fixtures'
import { TEST_ENV } from '../../../test/fixtures'
import { __resetSeedRegistryCache } from '../../shared/services/cache/seed-registry-cache'

describe('features/rbac/roles', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>

  const ADMIN = { id: 'user_rbac_role_admin', email: 'rbac-role-admin@beechcms.io' }

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

  /** Seeds a role-authoring-only manager (holds only manage_roles, at GLOBAL_SCOPE). */
  async function seedRoleAuthorOnly() {
    const passwordHash = await bcrypt.hash('password123', 10)
    await seedTestUsers(db, [{ id: 'user_role_author', email: 'role-author@beechcms.io', password_hash: passwordHash, grantSuperAdmin: false }])
    await db.prepare(`INSERT INTO roles (id, name, description, is_system) VALUES ('role_author_only', 'RoleAuthorOnly', NULL, 0)`).run()
    await db.prepare(`INSERT INTO role_permissions (role_id, permission) VALUES ('role_author_only', 'manage_roles')`).run()
    await db.prepare(`INSERT INTO user_role_assignments (id, user_id, role_id, scope) VALUES ('ura_role_author', 'user_role_author', 'role_author_only', '*')`).run()
    return login('role-author@beechcms.io')
  }

  describe('POST /api/rbac/roles', () => {
    it('creates a role and returns 201', async () => {
      const token = await login(ADMIN.email)
      const res = await authed('/api/rbac/roles', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'SeedEditor', permissions: ['content:read', 'content:update'] }),
      })
      expect(res.status).toBe(201)
    })

    it('refuses 403 escalation-refused when the role carries a permission the actor holds nowhere', async () => {
      const scopedToken = await seedRoleAuthorOnly()
      const res = await authed('/api/rbac/roles', scopedToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'TooPowerful', permissions: ['manage_users'] }),
      })
      expect(res.status).toBe(403)
      expect(await res.json()).toMatchObject({ type: expect.stringContaining('escalation-refused') })
    })

    it('rejects a duplicate role name with 409', async () => {
      const token = await login(ADMIN.email)
      await authed('/api/rbac/roles', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'DupRole', permissions: ['content:read'] }),
      })
      const res = await authed('/api/rbac/roles', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'DupRole', permissions: ['content:read'] }),
      })
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ type: expect.stringContaining('role-name-taken') })
    })
  })

  describe('PUT /api/rbac/roles/:roleId', () => {
    it('returns 409 system-role-immutable for SuperAdmin', async () => {
      const token = await login(ADMIN.email)
      const superAdmin = await db.prepare(`SELECT id FROM roles WHERE name = 'SuperAdmin'`).first<{ id: string }>()
      const res = await authed(`/api/rbac/roles/${superAdmin!.id}`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hijacked', permissions: ['content:read'] }),
      })
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ type: expect.stringContaining('system-role-immutable') })
    })
  })

  describe('DELETE /api/rbac/roles/:roleId', () => {
    it('returns 409 when the role carries the last global administrator', async () => {
      const token = await login(ADMIN.email)
      const createRes = await authed('/api/rbac/roles', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'SoleAdminRole', permissions: ['manage_users'] }),
      })
      const { id: roleId } = await createRes.json<{ id: string }>()

      // The actor must keep `manage_roles` (from a separate role) to clear the gate and
      // the delete handler's own holdsAll check, while SoleAdminRole stays the ONLY
      // source of `manage_users` at GLOBAL_SCOPE once the fixture-seeded SuperAdmin
      // assignment is removed.
      const roleManagerRoleId = await authed('/api/rbac/roles', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'RoleManagerOnly', permissions: ['manage_roles'] }),
      }).then(res => res.json<{ id: string }>()).then(body => body.id)

      await db.prepare(`DELETE FROM user_role_assignments WHERE user_id = ?`).bind(ADMIN.id).run()
      await db.prepare(`INSERT INTO user_role_assignments (id, user_id, role_id, scope) VALUES ('ura_sole', ?, ?, '*')`).bind(ADMIN.id, roleId).run()
      await db.prepare(`INSERT INTO user_role_assignments (id, user_id, role_id, scope) VALUES ('ura_role_mgr', ?, ?, '*')`).bind(ADMIN.id, roleManagerRoleId).run()

      const res = await authed(`/api/rbac/roles/${roleId}`, token, { method: 'DELETE' })
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ type: expect.stringContaining('last-global-admin') })
    })
  })

  describe('scoped manage_roles actor (#595)', () => {
    const insertRole = (id: string, perms: string[]) => db.batch([
      db.prepare(`INSERT INTO roles (id, name, description, is_system) VALUES (?, ?, NULL, 0)`).bind(id, `N_${id}`),
      ...perms.map(p => db.prepare(`INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)`).bind(id, p)),
    ])
    const assign = (id: string, userId: string, roleId: string, scope: string) =>
      db.prepare(`INSERT INTO user_role_assignments (id, user_id, role_id, scope) VALUES (?, ?, ?, ?)`).bind(id, userId, roleId, scope).run()

    async function seedScopedActor() {
      const passwordHash = await bcrypt.hash('password123', 10)
      await seedTestUsers(db, [{ id: 'user_scoped', email: 'scoped@beechcms.io', password_hash: passwordHash, grantSuperAdmin: false }])
      for (const slug of ['posts', 'blog2']) {
        await db.prepare(`INSERT INTO seeds (slug, definition, status) VALUES (?, ?, 'active')`)
          .bind(slug, JSON.stringify({ slug, label: slug, displayNameAlias: 'title', branches: [] }))
          .run()
      }
      await insertRole('00000000-0000-4000-8000-0000000000b1', ['manage_roles', 'content:read'])
      await insertRole('00000000-0000-4000-8000-0000000000b2', ['content:delete'])
      await insertRole('00000000-0000-4000-8000-0000000000b3', ['content:read'])
      await assign('ura_blog', 'user_scoped', '00000000-0000-4000-8000-0000000000b1', 'posts')
      await assign('ura_news', 'user_scoped', '00000000-0000-4000-8000-0000000000b2', 'blog2')
      await assign('ura_shared_actor', 'user_scoped', '00000000-0000-4000-8000-0000000000b3', 'posts')
      await assign('ura_shared_victim', ADMIN.id, '00000000-0000-4000-8000-0000000000b3', '*')
      // Drop the isolate cache so the seeds just inserted are parsed from D1.
      __resetSeedRegistryCache()
      return login('scoped@beechcms.io')
    }

    const put = (token: string, id: string, permissions: string[]) =>
      authed(`/api/rbac/roles/${id}`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `N_${id}`, permissions }),
      })

    it('refuses self-escalation with a permission held only on another scope', async () => {
      const token = await seedScopedActor()
      const res = await put(token, '00000000-0000-4000-8000-0000000000b1', ['manage_roles', 'content:read', 'content:delete'])
      expect(res.status).toBe(403)
    })

    it('refuses editing a role assigned at a scope the actor does not administer', async () => {
      const token = await seedScopedActor()
      const res = await put(token, '00000000-0000-4000-8000-0000000000b3', ['content:read', 'content:delete'])
      expect(res.status).toBe(403)
    })

    it('refuses deleting a role assigned at a scope the actor does not administer', async () => {
      const token = await seedScopedActor()
      const res = await authed('/api/rbac/roles/00000000-0000-4000-8000-0000000000b3', token, { method: 'DELETE' })
      expect(res.status).toBe(403)
      const row = await db.prepare(`SELECT id FROM user_role_assignments WHERE id = 'ura_shared_victim'`).first()
      expect(row).not.toBeNull()
    })
  })
})
