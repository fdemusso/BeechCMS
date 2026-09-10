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

describe('features/rbac/invitations', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>

  const ADMIN = { id: 'user_rbac_inv_admin', email: 'rbac-inv-admin@beechcms.io' }

  beforeEach(async () => {
    db = new D1TestDatabase()
    const passwordHash = await bcrypt.hash('password123', 10)
    await seedTestUsers(db, [{ ...ADMIN, password_hash: passwordHash }])
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

  async function assign(token: string, userId: string, roleId: string, scope: string) {
    await authed('/api/rbac/assignments', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, roleId, scope }),
    })
  }

  async function invite(token: string, email: string, roleId: string, scope: string) {
    return authed('/api/rbac/invitations', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, roleId, scope }),
    })
  }

  it('a scoped manage_users holder cannot invite on another scope (403 forbidden)', async () => {
    const token = await login(ADMIN.email)
    const managerId = await createUser(token, 'inv-manager1@beechcms.io')
    const managerRoleId = await createRole(token, 'InvManager1', ['manage_users'])
    await assign(token, managerId, managerRoleId, 'posts')
    const managerToken = await login('inv-manager1@beechcms.io')

    const targetRoleId = await createRole(token, 'InvTargetRole1', ['content:read'])
    const res = await invite(managerToken, 'invitee1@beechcms.io', targetRoleId, '*')

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ type: expect.stringContaining('forbidden') })
  })

  it('a scoped holder cannot invite with a role carrying a permission they lack there (403 escalation-refused)', async () => {
    const token = await login(ADMIN.email)
    const managerId = await createUser(token, 'inv-manager2@beechcms.io')
    const managerRoleId = await createRole(token, 'InvManager2', ['manage_users', 'content:read'])
    await assign(token, managerId, managerRoleId, 'posts')
    const managerToken = await login('inv-manager2@beechcms.io')

    const powerfulRoleId = await createRole(token, 'InvPowerfulRole', ['content:delete'])
    const res = await invite(managerToken, 'invitee2@beechcms.io', powerfulRoleId, 'posts')

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ type: expect.stringContaining('escalation-refused') })
  })

  it('refuses inviting an email that already has an account (409 email-taken)', async () => {
    const token = await login(ADMIN.email)
    await createUser(token, 'existing@beechcms.io')
    const roleId = await createRole(token, 'InvExistingRole', ['content:read'])

    const res = await invite(token, 'existing@beechcms.io', roleId, '*')
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ type: expect.stringContaining('email-taken') })
  })

  it('refuses an unknown scope (422 unknown-scope)', async () => {
    const token = await login(ADMIN.email)
    const roleId = await createRole(token, 'InvGhostRole', ['content:read'])

    const res = await invite(token, 'ghost@beechcms.io', roleId, 'does-not-exist')
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ type: expect.stringContaining('unknown-scope') })
  })

  it('GET /invitations as a seed-scoped holder lists only that seed\'s invitations', async () => {
    const token = await login(ADMIN.email)
    const globalRoleId = await createRole(token, 'InvGlobalRole', ['content:read'])
    await invite(token, 'global-invitee@beechcms.io', globalRoleId, '*')
    await invite(token, 'posts-invitee@beechcms.io', globalRoleId, 'posts')

    const managerId = await createUser(token, 'inv-manager3@beechcms.io')
    const managerRoleId = await createRole(token, 'InvManager3', ['manage_users'])
    await assign(token, managerId, managerRoleId, 'posts')
    const managerToken = await login('inv-manager3@beechcms.io')

    const res = await authed('/api/rbac/invitations', managerToken)
    expect(res.status).toBe(200)
    const body = await res.json<{ invitations: { email: string; scope: string }[] }>()
    expect(body.invitations).toHaveLength(1)
    expect(body.invitations[0].scope).toBe('posts')
    expect(body.invitations[0].email).toBe('posts-invitee@beechcms.io')
  })

  it('refuses regenerating an already-accepted invitation (409 invitation-already-used)', async () => {
    const token = await login(ADMIN.email)
    const roleId = await createRole(token, 'InvRegenRole', ['content:read'])
    const createRes = await invite(token, 'regen@beechcms.io', roleId, '*')
    const { id } = await createRes.json<{ id: string }>()

    await db.prepare('UPDATE invitations SET used_at = 1700000000 WHERE id = ?').bind(id).run()

    const res = await authed(`/api/rbac/invitations/${id}/regenerate`, token, { method: 'POST' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ type: expect.stringContaining('invitation-already-used') })
  })

  it('revoke by a caller without manage_users on the row\'s scope answers 404, not 403', async () => {
    const token = await login(ADMIN.email)
    const roleId = await createRole(token, 'InvRevokeRole', ['content:read'])
    const createRes = await invite(token, 'revoke-me@beechcms.io', roleId, '*')
    const { id } = await createRes.json<{ id: string }>()

    const managerId = await createUser(token, 'inv-manager4@beechcms.io')
    const managerRoleId = await createRole(token, 'InvManager4', ['manage_users'])
    await assign(token, managerId, managerRoleId, 'posts')
    const managerToken = await login('inv-manager4@beechcms.io')

    const res = await authed(`/api/rbac/invitations/${id}`, managerToken, { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})
