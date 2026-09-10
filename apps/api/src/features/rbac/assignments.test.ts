// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'
import { createBeechApp } from '../../factory'
import { D1TestDatabase } from '../../../test/helpers/d1-test-database'
import { seedTestUsers } from '../../../test/helpers/seed-fixtures'
import { StaticContentRepository } from '../../../test/mocks/static-content.repository'
import { TEST_SEEDS, TEST_ENV } from '../../../test/fixtures'

describe('features/rbac/assignments', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>

  const ADMIN = { id: 'user_rbac_asg_admin', email: 'rbac-asg-admin@beechcms.io' }

  beforeEach(async () => {
    db = new D1TestDatabase()
    const passwordHash = await bcrypt.hash('password123', 10)
    await seedTestUsers(db, [{ ...ADMIN, password_hash: passwordHash }])
    // The role assignment repository decay-filters scopes against the D1 `seeds` table
    // (not the in-memory seed registry `createBeechApp` uses).
    await db.prepare(`INSERT INTO seeds (slug, definition, status) VALUES ('posts', '{}', 'active')`).run()
    app = createBeechApp({ seeds: TEST_SEEDS, repository: new StaticContentRepository(TEST_SEEDS) })
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

  async function createUser(token: string, email: string) {
    const res = await authed('/api/rbac/users', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' }),
    })
    return (await res.json<{ id: string }>()).id
  }

  async function createRole(token: string, name: string, permissions: string[]) {
    const res = await authed('/api/rbac/roles', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, permissions }),
    })
    return (await res.json<{ id: string }>()).id
  }

  it('creates an assignment at scope posts and is idempotent', async () => {
    const token = await login(ADMIN.email)
    const userId = await createUser(token, 'partner@beechcms.io')
    const roleId = await createRole(token, 'PostsEditor', ['content:read'])

    const first = await authed('/api/rbac/assignments', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, roleId, scope: 'posts' }),
    })
    expect(first.status).toBe(201)
    const { id: firstId } = await first.json<{ id: string }>()

    const second = await authed('/api/rbac/assignments', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, roleId, scope: 'posts' }),
    })
    const { id: secondId } = await second.json<{ id: string }>()
    expect(secondId).toBe(firstId)
  })

  it('rejects an unknown scope with 422 unknown-scope', async () => {
    const token = await login(ADMIN.email)
    const userId = await createUser(token, 'partner2@beechcms.io')
    const roleId = await createRole(token, 'GhostRole', ['content:read'])

    const res = await authed('/api/rbac/assignments', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, roleId, scope: 'does-not-exist' }),
    })
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ type: expect.stringContaining('unknown-scope') })
  })

  it('a seed-scoped manage_users holder cannot create an assignment at GLOBAL_SCOPE (403)', async () => {
    const token = await login(ADMIN.email)
    const managerId = await createUser(token, 'manager@beechcms.io')
    const managerRoleId = await createRole(token, 'ScopedManager', ['manage_users'])
    await authed('/api/rbac/assignments', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: managerId, roleId: managerRoleId, scope: 'posts' }),
    })
    await db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').bind(managerId).run()
    const managerToken = await login('manager@beechcms.io')

    const targetId = await createUser(token, 'target@beechcms.io')
    const roleId = await createRole(token, 'TargetRole', ['content:read'])

    const res = await authed('/api/rbac/assignments', managerToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: targetId, roleId, scope: '*' }),
    })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ type: expect.stringContaining('forbidden') })
  })

  it('canGrant refuses assigning a role with a permission the actor lacks at that scope (403 escalation-refused)', async () => {
    const token = await login(ADMIN.email)
    const managerId = await createUser(token, 'manager2@beechcms.io')
    const managerRoleId = await createRole(token, 'ScopedManager2', ['manage_users', 'content:read'])
    await authed('/api/rbac/assignments', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: managerId, roleId: managerRoleId, scope: 'posts' }),
    })
    const managerToken = await login('manager2@beechcms.io')

    const targetId = await createUser(token, 'target2@beechcms.io')
    const powerfulRoleId = await createRole(token, 'PowerfulRole', ['content:delete'])

    const res = await authed('/api/rbac/assignments', managerToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: targetId, roleId: powerfulRoleId, scope: 'posts' }),
    })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ type: expect.stringContaining('escalation-refused') })
  })

  it('DELETE refuses removing the last global administrator assignment (409)', async () => {
    const token = await login(ADMIN.email)

    // ADMIN.id is the fixture's plain string id, not a UUID, so it cannot be submitted as
    // a body field to POST /api/rbac/assignments (`idGenerator.isValid` rejects it). Insert
    // the replacement assignment directly, with a UUID-shaped id, then remove the
    // fixture-seeded SuperAdmin grant so this is ADMIN's only surviving global admin source.
    const soleRoleId = await createRole(token, 'SoleAdminAssignmentRole', ['manage_users'])
    const soleAssignmentId = '11111111-1111-4111-8111-111111111111'
    await db
      .prepare(`INSERT INTO user_role_assignments (id, user_id, role_id, scope) VALUES (?, ?, ?, '*')`)
      .bind(soleAssignmentId, ADMIN.id, soleRoleId)
      .run()
    await db.prepare(`DELETE FROM user_role_assignments WHERE user_id = ? AND id != ?`).bind(ADMIN.id, soleAssignmentId).run()

    const res = await authed(`/api/rbac/assignments/${soleAssignmentId}`, token, { method: 'DELETE' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ type: expect.stringContaining('last-global-admin') })
  })
})
