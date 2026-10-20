// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import { createBeechApp } from '../../src/factory'
import { D1TestDatabase } from '../helpers/d1-test-database'
import { StaticContentRepository } from '../mocks/static-content.repository'
import { TEST_SEEDS, TEST_ENV } from '../fixtures'

describe('Flow: RBAC admin API lifecycle', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>

  beforeEach(async () => {
    db = new D1TestDatabase()
    app = createBeechApp({ seeds: TEST_SEEDS, repository: new StaticContentRepository(TEST_SEEDS) })
    // The role assignment repository decay-filters scopes against the D1 `seeds` table
    // (not the in-memory seed registry `createBeechApp` uses).
    await db.prepare(`INSERT INTO seeds (slug, definition, status) VALUES ('posts', '{}', 'active')`).run()
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

  it('setup -> roles -> zero-trust account -> scoped delegation -> escalation refusals -> visibility -> guardrails', async () => {
    // 1. POST /auth/setup -> SuperAdmin at '*'
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

    // 2. SuperAdmin creates role SeedEditor (content:read, content:update)
    const seedEditorRes = await authed('/api/rbac/roles', superToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'SeedEditor', permissions: ['content:read', 'content:update'] }),
    })
    expect(seedEditorRes.status).toBe(201)
    const { id: seedEditorRoleId } = await seedEditorRes.json<{ id: string }>()

    // 3. SuperAdmin creates account partner@... -> 201, zero-trust
    const partnerRes = await authed('/api/rbac/users', superToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'partner@beech.local', password: 'password123' }),
    })
    expect(partnerRes.status).toBe(201)
    const { id: partnerId, assignments: partnerAssignments } = await partnerRes.json<{ id: string; assignments: unknown[] }>()
    expect(partnerAssignments).toEqual([])

    const partnerToken = await login('partner@beech.local')
    const partnerSchemaRes = await authed('/api/schema', partnerToken)
    expect(partnerSchemaRes.status).toBe(200) // GET /api/schema is AUTHED (dashboard chrome), not permission-gated

    // 4. SuperAdmin creates role SeedManager (manage_users, content:read) and assigns it to
    //    a second account at scope 'posts'.
    const seedManagerRoleRes = await authed('/api/rbac/roles', superToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'SeedManager', permissions: ['manage_users', 'content:read', 'content:update'] }),
    })
    const { id: seedManagerRoleId } = await seedManagerRoleRes.json<{ id: string }>()

    const managerRes = await authed('/api/rbac/users', superToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'manager@beech.local', password: 'password123' }),
    })
    const { id: managerId } = await managerRes.json<{ id: string }>()

    const managerAssignRes = await authed('/api/rbac/assignments', superToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: managerId, roleId: seedManagerRoleId, scope: 'posts' }),
    })
    expect(managerAssignRes.status).toBe(201)
    const managerToken = await login('manager@beech.local')

    // 5. The scoped manager assigns SeedEditor to partner at 'posts' -> 201; partner now
    //    reads /api/content/posts (200) and is refused on another seed (403).
    const grantRes = await authed('/api/rbac/assignments', managerToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: partnerId, roleId: seedEditorRoleId, scope: 'posts' }),
    })
    expect(grantRes.status).toBe(201)

    expect((await authed('/api/content/posts', partnerToken)).status).toBe(200)
    expect((await authed('/api/content/pages', partnerToken)).status).toBe(403)

    // 6. The scoped manager attempts three escalations, all refused.
    const globalAssignRes = await authed('/api/rbac/assignments', managerToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: partnerId, roleId: seedEditorRoleId, scope: '*' }),
    })
    expect(globalAssignRes.status).toBe(403)
    expect(await globalAssignRes.json()).toMatchObject({ type: expect.stringContaining('forbidden') })

    const powerfulRoleRes = await authed('/api/rbac/roles', superToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'PowerfulRole', permissions: ['content:delete'] }),
    })
    const { id: powerfulRoleId } = await powerfulRoleRes.json<{ id: string }>()
    const escalatedAssignRes = await authed('/api/rbac/assignments', managerToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: partnerId, roleId: powerfulRoleId, scope: 'posts' }),
    })
    expect(escalatedAssignRes.status).toBe(403)
    expect(await escalatedAssignRes.json()).toMatchObject({ type: expect.stringContaining('escalation-refused') })

    const roleAuthoringRes = await authed('/api/rbac/roles', managerToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ManagerMintedRole', permissions: ['manage_roles'] }),
    })
    // The manager holds no `manage_roles` at all, so the coarse route gate (§4.7) refuses
    // before the handler's own escalation check is ever reached.
    expect(roleAuthoringRes.status).toBe(403)
    expect(await roleAuthoringRes.json()).toMatchObject({ error: 'forbidden' })

    // 7. The scoped manager GET /api/rbac/users -> sees partner and itself, NOT SuperAdmin.
    const listRes = await authed('/api/rbac/users', managerToken)
    expect(listRes.status).toBe(200)
    const { users } = await listRes.json<{ users: Array<{ id: string; email: string }> }>()
    const emails = users.map(u => u.email).sort()
    expect(emails).toEqual(['manager@beech.local', 'partner@beech.local'].sort())
    expect(emails).not.toContain('super@beech.local')

    // 8. SuperAdmin deactivates partner -> 200; partner's unexpired access JWT -> 403
    //    account_disabled; refresh token revoked; reactivation restores access.
    const deactivateRes = await authed(`/api/rbac/users/${partnerId}/active`, superToken, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    })
    expect(deactivateRes.status).toBe(200)

    const disabledRes = await authed('/api/content/posts', partnerToken)
    expect(disabledRes.status).toBe(403)
    expect(await disabledRes.json()).toMatchObject({ error: 'account_disabled' })

    const reactivateRes = await authed(`/api/rbac/users/${partnerId}/active`, superToken, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: true }),
    })
    expect(reactivateRes.status).toBe(200)
    const restoredRes = await authed('/api/content/posts', partnerToken)
    expect(restoredRes.status).toBe(200)

    // 9. SuperAdmin deactivates itself -> 409 last-global-admin; deleting its own '*'
    //    assignment -> 409; PUT on the SuperAdmin role -> 409 system-role-immutable.
    const superRow = await db.prepare('SELECT id FROM users WHERE email = ?').bind('super@beech.local').first<{ id: string }>()
    const selfDeactivateRes = await authed(`/api/rbac/users/${superRow!.id}/active`, superToken, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    })
    expect(selfDeactivateRes.status).toBe(409)
    expect(await selfDeactivateRes.json()).toMatchObject({ type: expect.stringContaining('last-global-admin') })

    const superAssignment = await db
      .prepare(`SELECT id FROM user_role_assignments WHERE user_id = ? AND scope = '*'`)
      .bind(superRow!.id)
      .first<{ id: string }>()
    const selfDeleteRes = await authed(`/api/rbac/assignments/${superAssignment!.id}`, superToken, { method: 'DELETE' })
    expect(selfDeleteRes.status).toBe(409)
    expect(await selfDeleteRes.json()).toMatchObject({ type: expect.stringContaining('last-global-admin') })

    const superAdminRole = await db.prepare(`SELECT id FROM roles WHERE name = 'SuperAdmin'`).first<{ id: string }>()
    const editSuperAdminRes = await authed(`/api/rbac/roles/${superAdminRole!.id}`, superToken, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Hijacked', permissions: ['content:read'] }),
    })
    expect(editSuperAdminRes.status).toBe(409)
    expect(await editSuperAdminRes.json()).toMatchObject({ type: expect.stringContaining('system-role-immutable') })

    // 10. POST /api/rbac/users never produces users.role = 'admin'.
    const roles = await db.prepare(`SELECT DISTINCT role FROM users WHERE email IN ('partner@beech.local', 'manager@beech.local')`).all<{ role: string }>()
    for (const row of roles.results ?? []) {
      expect(row.role).toBe('editor')
    }
  })
})
