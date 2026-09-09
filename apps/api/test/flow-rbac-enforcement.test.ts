// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'
import { createBeechApp } from '../src/factory'
import { D1TestDatabase } from './helpers/d1-test-database'
import { seedTestUsers } from './helpers/seed-fixtures'
import { StaticContentRepository } from './mocks/static-content.repository'
import { SequentialIdGenerator } from '../src/shared/services/id-generator/sequential-id-generator'
import { D1RoleRepository } from '../src/shared/db/repositories/d1-role.repository'
import { D1RoleAssignmentRepository } from '../src/shared/db/repositories/d1-role-assignment.repository'
import { TEST_SEEDS, TEST_ENV } from './fixtures'

describe('Flow: RBAC enforcement', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>

  const SCOPED_USER = { id: 'user_scoped_01', email: 'scoped@beechcms.io' }

  beforeEach(async () => {
    db = new D1TestDatabase()
    app = createBeechApp({ seeds: TEST_SEEDS, repository: new StaticContentRepository(TEST_SEEDS) })

    const passwordHash = await bcrypt.hash('password123', 10)
    await seedTestUsers(db, [{ ...SCOPED_USER, password_hash: passwordHash, grantSuperAdmin: false }])

    // The role assignment repository decay-filters scopes against the D1 `seeds` table
    // (not the in-memory seed registry `createBeechApp` uses), so the scope this test
    // assigns to must have a matching active row there.
    await db.prepare(`INSERT INTO seeds (slug, definition, status) VALUES ('posts', '{}', 'active')`).run()

    const ids = new SequentialIdGenerator()
    const roles = new D1RoleRepository(db, ids)
    const assignments = new D1RoleAssignmentRepository(db, ids)
    const roleId = await roles.create({
      name: 'PostsEditor',
      description: null,
      permissions: ['content:read', 'content:update'],
    })
    await assignments.create({ userId: SCOPED_USER.id, roleId, scope: 'posts' })
  })

  async function login() {
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: SCOPED_USER.email, password: 'password123' }),
    }, { ...TEST_ENV, DB: db })
    const body = await res.json<{ token?: string }>()
    return body.token ?? ''
  }

  async function authed(path: string, method = 'GET', token?: string) {
    return app.request(path, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    }, { ...TEST_ENV, DB: db })
  }

  it('scoped editor: 200 on own seed, 403 on missing permission/wrong scope/no analytics', async () => {
    const token = await login()
    expect(token).toBeTruthy()

    expect((await authed('/api/content/posts', 'GET', token)).status).toBe(200)
    expect((await authed('/api/content/posts/nonexistent-id', 'DELETE', token)).status).toBe(403)
    expect((await authed('/api/content/pages', 'GET', token)).status).toBe(403)
    expect((await authed('/api/settings/activity', 'GET', token)).status).toBe(403)
    expect((await authed('/api/settings/me', 'GET', token)).status).toBe(200)
  })

  it('deactivating the account turns every prior 200/403 into 403 account_disabled', async () => {
    const token = await login()
    await db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').bind(SCOPED_USER.id).run()

    for (const [path, method] of [
      ['/api/content/posts', 'GET'],
      ['/api/content/posts/nonexistent-id', 'DELETE'],
      ['/api/content/pages', 'GET'],
      ['/api/settings/activity', 'GET'],
      ['/api/settings/me', 'GET'],
    ] as const) {
      const res = await authed(path, method, token)
      expect(res.status).toBe(403)
      expect(await res.json()).toMatchObject({ error: 'account_disabled' })
    }
  })
})
