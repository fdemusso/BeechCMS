// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { readFileSync, readdirSync } from 'node:fs'
import { describe, it, expect, afterEach } from 'vitest'
import { FixedClock, UUID_V4_PATTERN, CANONICAL_USERS, provisionSeeds } from '@beechcms/testing'
import { createBeechApp } from '../../src/factory'
import { JoseTokenService } from '../../src/auth/providers/jwt-token.service'
import { D1TestDatabase } from '../helpers/d1-test-database'
import { TEST_ENV, TEST_SEEDS } from '../fixtures'

const migrationsDir = new URL('../../migrations/', import.meta.url)
const files = readdirSync(migrationsDir).filter(file => /^\d{4}_.+\.sql$/.test(file)).sort()
const readMigration = (file: string) => readFileSync(new URL(file, migrationsDir), 'utf8')
const TEST_USERS = [CANONICAL_USERS.admin, CANONICAL_USERS.editor]
const clock = new FixedClock(1700000000000)

describe('Flow: RBAC upgrade from legacy accounts', () => {
  const databases: D1TestDatabase[] = []
  afterEach(() => databases.splice(0).forEach(db => db.close()))

  async function legacyDatabase() {
    const db = new D1TestDatabase({ applyMigrations: false })
    databases.push(db)
    await db.exec(readFileSync(new URL('../fixtures/legacy-migrations/0000_v040_base.sql', import.meta.url), 'utf8'))
    await db.exec(readMigration('0030_test_seeds.sql'))
    await provisionSeeds(db, TEST_SEEDS, clock.nowSeconds())
    for (const [index, user] of TEST_USERS.entries()) {
      await db.prepare('INSERT INTO users (id, email, password_hash, role, name, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(user.id, user.email, user.passwordHash, index === 0 ? 'admin' : 'editor', user.name, clock.nowSeconds()).run()
    }
    return db
  }

  it.each([
    { index: 0, role: 'admin' as const, expectedRole: 'SuperAdmin', rbacStatus: 200, rbacBody: { roles: expect.arrayContaining([expect.objectContaining({ name: 'SuperAdmin' })]) } },
    { index: 1, role: 'editor' as const, expectedRole: 'LegacyEditor', rbacStatus: 403, rbacBody: { error: 'forbidden' } },
  ])('preserves $role content access after applying pending migrations', async ({ index, role, expectedRole, rbacStatus, rbacBody }) => {
    const db = await legacyDatabase()
    const app = createBeechApp({ seeds: TEST_SEEDS, authProviders: { clock } })
    const user = TEST_USERS[index]
    const token = await new JoseTokenService(TEST_ENV.JWT_SECRET, {}, clock).issue({ sub: user.id, email: user.email, role })

    // Fresh fixtures conceal missing backfills.
    for (const file of files.filter(file => file > '0030_test_seeds.sql')) await db.exec(readMigration(file))

    const contentResponse = await app.request('/api/content/posts', { headers: { Authorization: `Bearer ${token}` } }, { ...TEST_ENV, DB: db })
    expect(contentResponse.status).toBe(200)
    expect(await contentResponse.json<Record<string, unknown>[]>()).toEqual([])
    const rbacResponse = await app.request('/api/rbac/roles', { headers: { Authorization: `Bearer ${token}` } }, { ...TEST_ENV, DB: db })
    expect(rbacResponse.status).toBe(rbacStatus)
    expect(await rbacResponse.json<{ roles?: { name: string }[]; error?: string }>()).toMatchObject(rbacBody)

    const assignments = await db.prepare(`SELECT a.id, a.scope, r.name FROM user_role_assignments a JOIN roles r ON r.id = a.role_id WHERE a.user_id = ?`).bind(user.id).all<{ id: string; scope: string; name: string }>()
    expect(assignments.results).toHaveLength(1)
    expect(assignments.results[0]).toMatchObject({ scope: '*', name: expectedRole })
    expect(assignments.results[0].id).toMatch(UUID_V4_PATTERN)
    const permissions = await db.prepare(`SELECT p.permission FROM role_permissions p JOIN roles r ON r.id = p.role_id WHERE r.name = ? ORDER BY p.permission`).bind(expectedRole).all<{ permission: string }>()
    expect(permissions.results.map(row => row.permission)).toEqual(role === 'admin'
      ? ['content:create', 'content:delete', 'content:read', 'content:update', 'manage_roles', 'manage_users', 'view_analytics']
      : ['content:create', 'content:delete', 'content:read', 'content:update'])
  })

  it('preserves scoped assignments and excludes post-RBAC accounts when replayed', async () => {
    const db = await legacyDatabase()
    for (const file of files.filter(file => file > '0030_test_seeds.sql' && file < '0035')) await db.exec(readMigration(file))
    const assignmentId = '512e0000-0000-4000-8000-000000000002'
    await db.prepare(`INSERT INTO user_role_assignments (id, user_id, role_id, scope)
      SELECT ?, ?, id, 'posts' FROM roles WHERE name = 'SuperAdmin'`).bind(assignmentId, TEST_USERS[1].id).run()
    const newUserId = '512e0000-0000-4000-8000-000000000003'
    await db.prepare(`INSERT INTO users (id, email, password_hash, role, created_at)
      SELECT ?, 'new@example.test', ?, 'editor', created_at + 1 FROM roles WHERE name = 'SuperAdmin'`)
      .bind(newUserId, TEST_USERS[1].passwordHash).run()
    const migration = readMigration('0035_backfill_legacy_role_assignments.sql')

    await db.exec(migration)
    await db.exec(migration)

    const assignments = await db.prepare('SELECT id, user_id, scope FROM user_role_assignments ORDER BY user_id').all<{ id: string; user_id: string; scope: string }>()
    expect(assignments.results).toHaveLength(2)
    expect(assignments.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ user_id: TEST_USERS[0].id, scope: '*' }),
      { id: assignmentId, user_id: TEST_USERS[1].id, scope: 'posts' },
    ]))
    expect(await db.prepare('SELECT count(*) AS count FROM user_role_assignments WHERE user_id = ?').bind(newUserId).first<{ count: number }>()).toEqual({ count: 0 })
    expect(await db.prepare("SELECT count(*) AS count FROM roles WHERE name = 'LegacyEditor'").first<{ count: number }>()).toEqual({ count: 0 })
  })

  it('leaves a fresh database without assignments or a legacy editor role', async () => {
    const db = new D1TestDatabase({ applyMigrations: false })
    databases.push(db)

    for (const file of files) await db.exec(readMigration(file))

    expect(await db.prepare('SELECT count(*) AS count FROM user_role_assignments').first<{ count: number }>()).toEqual({ count: 0 })
    expect(await db.prepare("SELECT count(*) AS count FROM roles WHERE name = 'LegacyEditor'").first<{ count: number }>()).toEqual({ count: 0 })
  })
})
