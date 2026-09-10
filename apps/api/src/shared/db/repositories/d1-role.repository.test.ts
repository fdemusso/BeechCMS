// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import { D1TestDatabase } from '../../../../test/helpers/d1-test-database'
import { SequentialIdGenerator } from '../../services/id-generator/sequential-id-generator'
import { D1RoleRepository } from './d1-role.repository'

let db: D1TestDatabase
let ids: SequentialIdGenerator
let repo: D1RoleRepository

beforeEach(() => {
  db = new D1TestDatabase()
  ids = new SequentialIdGenerator()
  repo = new D1RoleRepository(db, ids)
})

describe('D1RoleRepository', () => {
  it('create then findById round-trips name, description, icon, isSystem and the exact permission set', async () => {
    const roleId = await repo.create({
      name: 'Editor',
      description: 'Content editor',
      icon: 'Users',
      permissions: ['content:read', 'content:update'],
    })

    const found = await repo.findById(roleId)

    expect(found).not.toBeNull()
    expect(found?.name).toBe('Editor')
    expect(found?.description).toBe('Content editor')
    expect(found?.icon).toBe('Users')
    expect(found?.isSystem).toBe(false)
    expect(new Set(found?.permissions)).toEqual(new Set(['content:read', 'content:update']))
  })

  it('update fully replaces the permission set and updates icon and returns true', async () => {
    const roleId = await repo.create({
      name: 'Editor',
      description: null,
      icon: 'Users',
      permissions: ['content:read', 'content:update'],
    })

    const updated = await repo.update(roleId, {
      name: 'Editor',
      description: null,
      icon: 'Shield',
      permissions: ['content:delete'],
    })

    expect(updated).toBe(true)
    const found = await repo.findById(roleId)
    expect(found?.icon).toBe('Shield')
    expect(found?.permissions).toEqual(['content:delete'])
  })

  it('update on the seeded SuperAdmin returns false and leaves its 7 permissions byte-identical', async () => {
    const superAdmin = await db
      .prepare(`SELECT id FROM roles WHERE name = 'SuperAdmin'`)
      .first<{ id: string }>()
    const before = await repo.findById(superAdmin!.id)

    const updated = await repo.update(superAdmin!.id, {
      name: 'Hijacked',
      description: 'nope',
      permissions: ['content:read'],
    })

    expect(updated).toBe(false)
    const after = await repo.findById(superAdmin!.id)
    expect(after?.name).toBe('SuperAdmin')
    expect(new Set(after?.permissions)).toEqual(new Set(before?.permissions))
  })

  it('update on a missing role id returns false', async () => {
    const updated = await repo.update('does-not-exist', {
      name: 'X',
      description: null,
      permissions: ['content:read'],
    })
    expect(updated).toBe(false)
  })

  it('delete on a system role returns false and leaves the row present', async () => {
    const superAdmin = await db
      .prepare(`SELECT id FROM roles WHERE name = 'SuperAdmin'`)
      .first<{ id: string }>()
    expect(superAdmin).not.toBeNull()

    const deleted = await repo.delete(superAdmin!.id)

    expect(deleted).toBe(false)
    const stillThere = await repo.findById(superAdmin!.id)
    expect(stillThere).not.toBeNull()
  })

  it('the migration-seeded SuperAdmin role has exactly the 7 permissions and isSystem true', async () => {
    const superAdmin = await db
      .prepare(`SELECT id FROM roles WHERE name = 'SuperAdmin'`)
      .first<{ id: string }>()

    const found = await repo.findById(superAdmin!.id)

    expect(found?.isSystem).toBe(true)
    expect(found?.icon).toBe('Shield')
    expect(new Set(found?.permissions)).toEqual(
      new Set([
        'content:read',
        'content:create',
        'content:update',
        'content:delete',
        'manage_users',
        'manage_roles',
        'view_analytics',
      ]),
    )
  })

  it('the CHECK constraint rejects manage_seeds — unknown permissions cannot reach storage', async () => {
    const roleId = await repo.create({ name: 'Bogus', description: null, permissions: [] })

    await expect(
      db
        .prepare(`INSERT INTO role_permissions (role_id, permission) VALUES (?, 'manage_seeds')`)
        .bind(roleId)
        .run(),
    ).rejects.toThrow()
  })

  it('findByIds([]) returns [] without preparing a statement with an empty IN ()', async () => {
    const found = await repo.findByIds([])
    expect(found).toEqual([])
  })
})
