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
const NOW = 1_700_000_000

beforeEach(async () => {
  db = new D1TestDatabase()
  ids = new SequentialIdGenerator()
  repo = new D1InvitationRepository(db, ids)
  roles = new D1RoleRepository(db, ids)
  await seedTestUsers(db, [{ id: INVITER_ID, email: 'inviter@beechcms.io', password_hash: 'x', grantSuperAdmin: false }])
})

async function makeRole(): Promise<string> {
  return roles.create({ name: 'InviteRole', description: null, permissions: ['content:read'] })
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
    await repo.markUsed(usedId, NOW)
    expect(await repo.findValidByHash('hash-used', NOW)).toBeNull()

    expect(await repo.findValidByHash('hash-unknown', NOW)).toBeNull()
    expect(expiredId).toBeTruthy()
  })

  it('markUsed returns true once and false on the second call', async () => {
    const roleId = await makeRole()
    const id = await repo.create({
      email: 'single-use@beechcms.io',
      tokenHash: 'hash-single-use',
      roleId,
      scope: GLOBAL_SCOPE,
      invitedBy: INVITER_ID,
      expiresAt: NOW + 1000,
    })

    expect(await repo.markUsed(id, NOW)).toBe(true)
    expect(await repo.markUsed(id, NOW)).toBe(false)
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

    await repo.markUsed(id, NOW)
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
