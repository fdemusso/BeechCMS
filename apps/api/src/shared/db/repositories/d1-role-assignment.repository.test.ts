// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import { GLOBAL_SCOPE } from '@beechcms/core'
import { D1TestDatabase } from '../../../../test/helpers/d1-test-database'
import { SequentialIdGenerator } from '../../services/id-generator/sequential-id-generator'
import { seedTestUsers } from '../../../../test/helpers/seed-fixtures'
import { D1RoleAssignmentRepository } from './d1-role-assignment.repository'
import { D1RoleRepository } from './d1-role.repository'

let db: D1TestDatabase
let ids: SequentialIdGenerator
let repo: D1RoleAssignmentRepository
let roles: D1RoleRepository

const USER_ID = 'user_test_01'

beforeEach(async () => {
  db = new D1TestDatabase()
  ids = new SequentialIdGenerator()
  repo = new D1RoleAssignmentRepository(db, ids)
  roles = new D1RoleRepository(db, ids)
  await seedTestUsers(db, [{ id: USER_ID, email: 'rbac-test@beechcms.io', password_hash: 'x', grantSuperAdmin: false }])
})

describe('D1RoleAssignmentRepository', () => {
  it('listActiveForUser returns a GLOBAL_SCOPE assignment even though no seeds row matches *', async () => {
    const roleId = await roles.create({ name: 'GlobalRole', description: null, permissions: ['content:read'] })
    await repo.create({ userId: USER_ID, roleId, scope: GLOBAL_SCOPE })

    const active = await repo.listActiveForUser(USER_ID)

    expect(active).toHaveLength(1)
    expect(active[0].scope).toBe(GLOBAL_SCOPE)
  })

  it('scope decay: revives when the seed goes active -> deleted -> active again', async () => {
    const roleId = await roles.create({ name: 'ScopedRole', description: null, permissions: ['content:read'] })
    await db
      .prepare(`INSERT INTO seeds (slug, definition, status) VALUES ('postsOnly', '{}', 'active')`)
      .run()
    await repo.create({ userId: USER_ID, roleId, scope: 'postsOnly' })

    expect(await repo.listActiveForUser(USER_ID)).toHaveLength(1)

    await db.prepare(`UPDATE seeds SET status = 'deleted' WHERE slug = 'postsOnly'`).run()
    expect(await repo.listActiveForUser(USER_ID)).toHaveLength(0)

    await db.prepare(`UPDATE seeds SET status = 'active' WHERE slug = 'postsOnly'`).run()
    expect(await repo.listActiveForUser(USER_ID)).toHaveLength(1)
  })

  it('an assignment scoped to a slug with no row in seeds at all is NOT returned', async () => {
    const roleId = await roles.create({ name: 'OrphanRole', description: null, permissions: ['content:read'] })
    await repo.create({ userId: USER_ID, roleId, scope: 'missingSlug' })

    expect(await repo.listActiveForUser(USER_ID)).toHaveLength(0)
  })

  it('create twice with the same triple yields the same id and one row', async () => {
    const roleId = await roles.create({ name: 'DupeRole', description: null, permissions: ['content:read'] })

    const firstId = await repo.create({ userId: USER_ID, roleId, scope: GLOBAL_SCOPE })
    const secondId = await repo.create({ userId: USER_ID, roleId, scope: GLOBAL_SCOPE })

    expect(secondId).toBe(firstId)
    const row = await db
      .prepare(`SELECT COUNT(*) AS n FROM user_role_assignments WHERE user_id = ? AND role_id = ? AND scope = ?`)
      .bind(USER_ID, roleId, GLOBAL_SCOPE)
      .first<{ n: number }>()
    expect(row?.n).toBe(1)
  })

  it('countActiveGlobalAdmins ignores inactive users, roles lacking manage_users, and dedupes a doubled grant', async () => {
    const adminRoleId = await roles.create({ name: 'Admin', description: null, permissions: ['manage_users'] })
    const nonAdminRoleId = await roles.create({ name: 'NonAdmin', description: null, permissions: ['content:read'] })

    await seedTestUsers(db, [
      { id: 'user_inactive_01', email: 'inactive@beechcms.io', password_hash: 'x', grantSuperAdmin: false },
      { id: 'user_nonadmin_01', email: 'nonadmin@beechcms.io', password_hash: 'x', grantSuperAdmin: false },
    ])
    await db.prepare(`UPDATE users SET is_active = 0 WHERE id = 'user_inactive_01'`).run()

    // Active user holds manage_users twice at GLOBAL_SCOPE (via two roles) -> counted once.
    const adminRoleId2 = await roles.create({ name: 'Admin2', description: null, permissions: ['manage_users'] })
    await repo.create({ userId: USER_ID, roleId: adminRoleId, scope: GLOBAL_SCOPE })
    await repo.create({ userId: USER_ID, roleId: adminRoleId2, scope: GLOBAL_SCOPE })

    // Inactive user holds manage_users too -> excluded.
    await repo.create({ userId: 'user_inactive_01', roleId: adminRoleId, scope: GLOBAL_SCOPE })

    // Active user with a role lacking manage_users -> excluded.
    await repo.create({ userId: 'user_nonadmin_01', roleId: nonAdminRoleId, scope: GLOBAL_SCOPE })

    expect(await repo.countActiveGlobalAdmins()).toBe(1)
  })

  it('findById returns the row, or null when absent', async () => {
    const roleId = await roles.create({ name: 'FindMe', description: null, permissions: ['content:read'] })
    const id = await repo.create({ userId: USER_ID, roleId, scope: GLOBAL_SCOPE })

    expect((await repo.findById(id))?.roleId).toBe(roleId)
    expect(await repo.findById('missing-id')).toBeNull()
  })

  it('listAll returns rows across several users', async () => {
    const roleId = await roles.create({ name: 'ListAllRole', description: null, permissions: ['content:read'] })
    await seedTestUsers(db, [{ id: 'user_second_01', email: 'second@beechcms.io', password_hash: 'x', grantSuperAdmin: false }])
    await repo.create({ userId: USER_ID, roleId, scope: GLOBAL_SCOPE })
    await repo.create({ userId: 'user_second_01', roleId, scope: GLOBAL_SCOPE })

    const all = await repo.listAll()
    expect(all.map(a => a.userId).sort()).toEqual([USER_ID, 'user_second_01'].sort())
  })

  it('listAllForUser includes an assignment on a deleted seed, unlike listActiveForUser', async () => {
    const roleId = await roles.create({ name: 'DecayRole', description: null, permissions: ['content:read'] })
    await db.prepare(`INSERT INTO seeds (slug, definition, status) VALUES ('gone', '{}', 'deleted')`).run()
    await repo.create({ userId: USER_ID, roleId, scope: 'gone' })

    expect(await repo.listAllForUser(USER_ID)).toHaveLength(1)
    expect(await repo.listActiveForUser(USER_ID)).toHaveLength(0)
  })

  it('countActiveGlobalAdminsExcludingUser returns 0 with a single admin and 1 with two', async () => {
    const adminRoleId = await roles.create({ name: 'ExclUserAdmin', description: null, permissions: ['manage_users'] })
    await repo.create({ userId: USER_ID, roleId: adminRoleId, scope: GLOBAL_SCOPE })
    expect(await repo.countActiveGlobalAdminsExcludingUser(USER_ID)).toBe(0)

    await seedTestUsers(db, [{ id: 'user_second_admin', email: 'admin2@beechcms.io', password_hash: 'x', grantSuperAdmin: false }])
    await repo.create({ userId: 'user_second_admin', roleId: adminRoleId, scope: GLOBAL_SCOPE })
    expect(await repo.countActiveGlobalAdminsExcludingUser(USER_ID)).toBe(1)
  })

  it('countActiveGlobalAdminsExcludingRole returns 0 when that role is the only source of admins and 1 when another role also grants it', async () => {
    const adminRoleId = await roles.create({ name: 'ExclRoleAdmin', description: null, permissions: ['manage_users'] })
    await repo.create({ userId: USER_ID, roleId: adminRoleId, scope: GLOBAL_SCOPE })
    expect(await repo.countActiveGlobalAdminsExcludingRole(adminRoleId)).toBe(0)

    const otherAdminRoleId = await roles.create({ name: 'OtherAdminRole', description: null, permissions: ['manage_users'] })
    await seedTestUsers(db, [{ id: 'user_other_admin', email: 'other-admin@beechcms.io', password_hash: 'x', grantSuperAdmin: false }])
    await repo.create({ userId: 'user_other_admin', roleId: otherAdminRoleId, scope: GLOBAL_SCOPE })
    expect(await repo.countActiveGlobalAdminsExcludingRole(adminRoleId)).toBe(1)
  })
})
