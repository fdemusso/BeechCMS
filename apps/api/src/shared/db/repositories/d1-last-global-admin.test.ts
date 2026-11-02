// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * The last-global-admin invariant, enforced inside each mutating statement of the D1
 * repositories. Concurrent behaviour is covered by last-admin.integration.test.ts.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { GLOBAL_SCOPE } from '@beechcms/core'
import { D1TestDatabase } from '../../../../test/helpers/d1-test-database'
import { seedTestUsers } from '../../../../test/helpers/seed-fixtures'
import { SequentialIdGenerator } from '../../services/id-generator/sequential-id-generator'
import { D1RoleAssignmentRepository } from './d1-role-assignment.repository'
import { D1RoleRepository } from './d1-role.repository'
import { D1UserRepository } from './d1-user.repository'

let db: D1TestDatabase
let roles: D1RoleRepository
let assignments: D1RoleAssignmentRepository
let users: D1UserRepository

const ALICE = 'user_alice'
const BOB = 'user_bob'

beforeEach(async () => {
  db = new D1TestDatabase()
  const ids = new SequentialIdGenerator()
  roles = new D1RoleRepository(db, ids)
  assignments = new D1RoleAssignmentRepository(db, ids)
  users = new D1UserRepository(db)
  await seedTestUsers(db, [
    { id: ALICE, email: 'alice@beechcms.io', password_hash: 'x', grantSuperAdmin: false },
    { id: BOB, email: 'bob@beechcms.io', password_hash: 'x', grantSuperAdmin: false },
  ])
})

const adminRole = (name: string) => roles.create({ name, description: null, permissions: ['manage_users', 'manage_roles'] })

describe('assignment delete', () => {
  it('refuses the only global manage_users assignment and keeps the row', async () => {
    const roleId = await adminRole('Only')
    const id = await assignments.create({ userId: ALICE, roleId, scope: GLOBAL_SCOPE })

    const result = await assignments.delete(id)

    expect(result).toBe('last-global-admin')
    expect(await assignments.findById(id)).not.toBeNull()
  })

  it('removes one of two assignments held by the same sole administrator', async () => {
    const id = await assignments.create({ userId: ALICE, roleId: await adminRole('A'), scope: GLOBAL_SCOPE })
    await assignments.create({ userId: ALICE, roleId: await adminRole('B'), scope: GLOBAL_SCOPE })

    expect(await assignments.delete(id)).toBe('applied')
  })

  it('does not count an inactive account as a remaining administrator', async () => {
    const roleId = await adminRole('Shared')
    const alice = await assignments.create({ userId: ALICE, roleId, scope: GLOBAL_SCOPE })
    await assignments.create({ userId: BOB, roleId, scope: GLOBAL_SCOPE })
    await db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').bind(BOB).run()

    expect(await assignments.delete(alice)).toBe('last-global-admin')
  })

  it('deletes freely an assignment whose role lacks manage_users', async () => {
    const readerRole = await roles.create({ name: 'Reader', description: null, permissions: ['content:read'] })
    const reader = await assignments.create({ userId: ALICE, roleId: readerRole, scope: GLOBAL_SCOPE })

    expect(await assignments.delete(reader)).toBe('applied')
  })

  it('reports not-found for an unknown id', async () => {
    expect(await assignments.delete('missing')).toBe('not-found')
  })
})

describe('account deactivation', () => {
  it('refuses deactivating the only active global administrator and leaves it active', async () => {
    await assignments.create({ userId: ALICE, roleId: await adminRole('Only'), scope: GLOBAL_SCOPE })

    const result = await users.setActive(ALICE, false)

    expect(result).toBe('last-global-admin')
    expect(await db.prepare('SELECT is_active FROM users WHERE id = ?').bind(ALICE).first()).toEqual({ is_active: 1 })
  })

  it('deactivates one of two administrators, then refuses the second', async () => {
    const roleId = await adminRole('Shared')
    await assignments.create({ userId: ALICE, roleId, scope: GLOBAL_SCOPE })
    await assignments.create({ userId: BOB, roleId, scope: GLOBAL_SCOPE })

    expect(await users.setActive(ALICE, false)).toBe('applied')
    expect(await users.setActive(BOB, false)).toBe('last-global-admin')
  })

  it('always allows reactivation and deactivating a non-administrator', async () => {
    expect(await users.setActive(BOB, false)).toBe('applied')
    expect(await users.setActive(BOB, true)).toBe('applied')
  })

  it('reports not-found for an unknown account', async () => {
    expect(await users.setActive('missing', false)).toBe('not-found')
  })
})

describe('role update and delete', () => {
  it('refuses stripping manage_users from the role of the only administrator and rewrites nothing', async () => {
    const roleId = await adminRole('Only')
    await assignments.create({ userId: ALICE, roleId, scope: GLOBAL_SCOPE })

    const result = await roles.update(roleId, { name: 'Renamed', description: null, permissions: ['manage_roles'] })

    expect(result).toBe('last-global-admin')
    const stored = await roles.findById(roleId)
    expect(stored?.name).toBe('Only')
    expect(new Set(stored?.permissions)).toEqual(new Set(['manage_users', 'manage_roles']))
  })

  it('allows the same edit when another role keeps an administrator', async () => {
    const roleId = await adminRole('First')
    await assignments.create({ userId: ALICE, roleId, scope: GLOBAL_SCOPE })
    await assignments.create({ userId: BOB, roleId: await adminRole('Second'), scope: GLOBAL_SCOPE })

    const result = await roles.update(roleId, { name: 'First', description: null, permissions: ['manage_roles'] })

    expect(result).toBe('applied')
    expect((await roles.findById(roleId))?.permissions).toEqual(['manage_roles'])
  })

  it('allows editing the role of the only administrator while manage_users stays', async () => {
    const roleId = await adminRole('Only')
    await assignments.create({ userId: ALICE, roleId, scope: GLOBAL_SCOPE })

    const result = await roles.update(roleId, { name: 'Only', description: null, permissions: ['manage_users'] })

    expect(result).toBe('applied')
  })

  it('refuses deleting the role of the only administrator and keeps it', async () => {
    const roleId = await adminRole('Only')
    await assignments.create({ userId: ALICE, roleId, scope: GLOBAL_SCOPE })

    const result = await roles.delete(roleId)

    expect(result).toBe('last-global-admin')
    expect(await roles.findById(roleId)).not.toBeNull()
  })

  it('deletes an unassigned admin role', async () => {
    expect(await roles.delete(await adminRole('Unassigned'))).toBe('applied')
  })
})
