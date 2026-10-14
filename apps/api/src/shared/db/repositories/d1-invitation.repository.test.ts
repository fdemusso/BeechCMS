// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import { GLOBAL_SCOPE } from '@beechcms/core'
import { D1TestDatabase } from '../../../../test/helpers/d1-test-database'
import { SequentialIdGenerator } from '../../services/id-generator/sequential-id-generator'
import { seedTestUsers } from '../../../../test/helpers/seed-fixtures'
import { D1InvitationRepository } from './d1-invitation.repository'
import { D1RoleRepository } from './d1-role.repository'

let db: D1TestDatabase
let ids: SequentialIdGenerator
let repo: D1InvitationRepository
let roles: D1RoleRepository

const INVITER_ID = 'user_inviter_01'
const INVITER_ID_EMAIL = 'inviter@beechcms.io'
const NOW = 1_700_000_000

beforeEach(async () => {
  db = new D1TestDatabase()
  ids = new SequentialIdGenerator()
  repo = new D1InvitationRepository(db, ids)
  roles = new D1RoleRepository(db, ids)
  await seedTestUsers(db, [{ id: INVITER_ID, email: INVITER_ID_EMAIL, password_hash: 'x', grantSuperAdmin: false }])
})

async function makeRole(): Promise<string> {
  return roles.create({ name: 'InviteRole', description: null, permissions: ['content:read'] })
}

function redemption(invitationId: string, roleId: string, email: string) {
  return {
    invitationId,
    user: { id: `user_${invitationId}`, email, passwordHash: 'x', role: 'editor', name: null, surname: null },
    assignmentId: `assignment_${invitationId}`,
    roleId,
    scope: GLOBAL_SCOPE,
    usedAt: NOW,
  }
}

describe('D1InvitationRepository', () => {
  it('create + findValidByHash round-trip; the stored value is hash-only', async () => {
    const roleId = await makeRole()
    const id = await repo.create({
      email: 'invitee@beechcms.io',
      tokenHash: 'hashed-token-value',
      roleId,
      scope: GLOBAL_SCOPE,
      invitedBy: INVITER_ID,
      expiresAt: NOW + 1000,
    })

    const row = await db.prepare('SELECT token_hash FROM invitations WHERE id = ?').bind(id).first<{ token_hash: string }>()
    expect(row?.token_hash).toBe('hashed-token-value')
    expect(row?.token_hash).not.toBe('plaintext-token')

    const found = await repo.findValidByHash('hashed-token-value', NOW)
    expect(found?.id).toBe(id)
    expect(found?.email).toBe('invitee@beechcms.io')
    expect(found?.roleId).toBe(roleId)
    expect(found?.scope).toBe(GLOBAL_SCOPE)
    expect(found?.invitedBy).toBe(INVITER_ID)
  })

  it('findValidByHash returns null for expired, already used, and unknown hashes', async () => {
    const roleId = await makeRole()

    const expiredId = await repo.create({
      email: 'expired@beechcms.io',
      tokenHash: 'hash-expired',
      roleId,
      scope: GLOBAL_SCOPE,
      invitedBy: INVITER_ID,
      expiresAt: NOW - 1,
    })
    expect(await repo.findValidByHash('hash-expired', NOW)).toBeNull()

    const usedId = await repo.create({
      email: 'used@beechcms.io',
      tokenHash: 'hash-used',
      roleId,
      scope: GLOBAL_SCOPE,
      invitedBy: INVITER_ID,
      expiresAt: NOW + 1000,
    })
    await repo.redeem(redemption(usedId, roleId, 'used@beechcms.io'))
    expect(await repo.findValidByHash('hash-used', NOW)).toBeNull()

    expect(await repo.findValidByHash('hash-unknown', NOW)).toBeNull()
    expect(expiredId).toBeTruthy()
  })

  it('redeem creates the account and its assignment, consumes the invitation, and refuses a second call', async () => {
    const roleId = await makeRole()
    const id = await repo.create({
      email: 'single-use@beechcms.io',
      tokenHash: 'hash-single-use',
      roleId,
      scope: GLOBAL_SCOPE,
      invitedBy: INVITER_ID,
      expiresAt: NOW + 1000,
    })
    const input = redemption(id, roleId, 'single-use@beechcms.io')

    expect(await repo.redeem(input)).toBe(true)
    expect(await repo.redeem({ ...input, user: { ...input.user, id: 'user_second', email: 'second@beechcms.io' }, assignmentId: 'assignment_second' })).toBe(false)

    const users = await db.prepare('SELECT COUNT(*) AS n FROM users WHERE email IN (?, ?)').bind('single-use@beechcms.io', 'second@beechcms.io').first<{ n: number }>()
    expect(users?.n).toBe(1)
    const assignment = await db.prepare('SELECT role_id, scope FROM user_role_assignments WHERE user_id = ?').bind(input.user.id).first<{ role_id: string; scope: string }>()
    expect(assignment).toEqual({ role_id: roleId, scope: GLOBAL_SCOPE })
  })

  it('redeem rolls back account, assignment and consumption when the email is already registered', async () => {
    const roleId = await makeRole()
    const id = await repo.create({
      email: INVITER_ID_EMAIL,
      tokenHash: 'hash-taken',
      roleId,
      scope: GLOBAL_SCOPE,
      invitedBy: INVITER_ID,
      expiresAt: NOW + 1000,
    })

    await expect(repo.redeem(redemption(id, roleId, INVITER_ID_EMAIL))).rejects.toThrow('UNIQUE constraint failed')

    expect(await repo.findValidByHash('hash-taken', NOW)).not.toBeNull()
    const assignments = await db.prepare('SELECT COUNT(*) AS n FROM user_role_assignments WHERE role_id = ?').bind(roleId).first<{ n: number }>()
    expect(assignments?.n).toBe(0)
  })

  it('invalidatePending consumes only pending rows for that email', async () => {
    const roleId = await makeRole()
    const pendingId = await repo.create({
      email: 'repeat@beechcms.io',
      tokenHash: 'hash-pending',
      roleId,
      scope: GLOBAL_SCOPE,
      invitedBy: INVITER_ID,
      expiresAt: NOW + 1000,
    })
    const otherId = await repo.create({
      email: 'someone-else@beechcms.io',
      tokenHash: 'hash-other',
      roleId,
      scope: GLOBAL_SCOPE,
      invitedBy: INVITER_ID,
      expiresAt: NOW + 1000,
    })

    await repo.invalidatePending('repeat@beechcms.io', NOW)

    expect((await repo.findById(pendingId))?.usedAt).toBe(NOW)
    expect((await repo.findById(otherId))?.usedAt).toBeNull()
  })

  it('regenerate swaps hash+expiry, preserves email/role/scope, and refuses a used row', async () => {
    const roleId = await makeRole()
    const id = await repo.create({
      email: 'regen@beechcms.io',
      tokenHash: 'hash-original',
      roleId,
      scope: GLOBAL_SCOPE,
      invitedBy: INVITER_ID,
      expiresAt: NOW + 1000,
    })

    const ok = await repo.regenerate(id, 'hash-regenerated', NOW + 2000)
    expect(ok).toBe(true)

    const row = await repo.findById(id)
    expect(row?.email).toBe('regen@beechcms.io')
    expect(row?.roleId).toBe(roleId)
    expect(row?.scope).toBe(GLOBAL_SCOPE)
    expect(row?.expiresAt).toBe(NOW + 2000)
    expect(await repo.findValidByHash('hash-regenerated', NOW)).not.toBeNull()

    await repo.redeem(redemption(id, roleId, 'regen@beechcms.io'))
    expect(await repo.regenerate(id, 'hash-again', NOW + 3000)).toBe(false)
  })

  it('deleting the role cascades the invitation away', async () => {
    const roleId = await makeRole()
    const id = await repo.create({
      email: 'cascade@beechcms.io',
      tokenHash: 'hash-cascade',
      roleId,
      scope: GLOBAL_SCOPE,
      invitedBy: INVITER_ID,
      expiresAt: NOW + 1000,
    })

    await db.prepare('DELETE FROM roles WHERE id = ?').bind(roleId).run()

    expect(await repo.findById(id)).toBeNull()
  })

  it('listAll returns rows newest first', async () => {
    const roleId = await makeRole()
    const firstId = await repo.create({
      email: 'a@beechcms.io',
      tokenHash: 'hash-a',
      roleId,
      scope: GLOBAL_SCOPE,
      invitedBy: INVITER_ID,
      expiresAt: NOW + 1000,
    })
    const secondId = await repo.create({
      email: 'b@beechcms.io',
      tokenHash: 'hash-b',
      roleId,
      scope: GLOBAL_SCOPE,
      invitedBy: INVITER_ID,
      expiresAt: NOW + 1000,
    })

    const all = await repo.listAll()
    expect(all.map(row => row.id).sort()).toEqual([firstId, secondId].sort())
  })

  it('delete removes a row and returns false when absent', async () => {
    const roleId = await makeRole()
    const id = await repo.create({
      email: 'delete-me@beechcms.io',
      tokenHash: 'hash-delete',
      roleId,
      scope: GLOBAL_SCOPE,
      invitedBy: INVITER_ID,
      expiresAt: NOW + 1000,
    })

    expect(await repo.delete(id)).toBe(true)
    expect(await repo.findById(id)).toBeNull()
    expect(await repo.delete(id)).toBe(false)
  })
})
