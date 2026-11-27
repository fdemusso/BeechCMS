// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it } from 'vitest'
import type { IClock } from '@beechcms/core'
import { D1TestDatabase } from '../../../../test/helpers/d1-test-database'
import { seedTestUsers } from '../../../../test/helpers/seed-fixtures'
import { D1MfaEnrolmentRepository } from './d1-mfa-enrolment.repository'
import { D1SessionRepository } from './d1-session.repository'

const USER_ID = 'user_mfa_a'
const OTHER_USER_ID = 'user_mfa_b'
const NOW = 1_700_000_000
const SESSION_EXPIRY = NOW + 86_400
const PENDING_CIPHERTEXT = 'v1:aXY=:cGVuZGluZw=='
const REPLACED_CIPHERTEXT = 'v1:aXYy:cmVwbGFjZWQ='
const CURRENT_SESSION_HASH = 'hash_current'
const OTHER_SESSION_HASH = 'hash_other'
const FOREIGN_SESSION_HASH = 'hash_foreign'

interface EnrolmentRow {
  status: string
  secret_ciphertext: string
  last_used_step: number | null
  created_at: number
  activated_at: number | null
}

interface TokenRow {
  token_hash: string
  revoked_at: number | null
}

const fixedClock: IClock = { now: () => NOW * 1000, nowSeconds: () => NOW }

describe('D1MfaEnrolmentRepository', () => {
  let db: D1TestDatabase
  let repository: D1MfaEnrolmentRepository
  let sessions: D1SessionRepository

  beforeEach(async () => {
    db = new D1TestDatabase()
    repository = new D1MfaEnrolmentRepository(db)
    sessions = new D1SessionRepository(db, fixedClock)
    await seedTestUsers(db, [
      { id: USER_ID, email: 'mfa-a@beechcms.io', password_hash: 'x', grantSuperAdmin: false },
      { id: OTHER_USER_ID, email: 'mfa-b@beechcms.io', password_hash: 'x', grantSuperAdmin: false },
    ])
  })

  async function saveSessions(): Promise<void> {
    await sessions.saveRefreshToken({ id: 'rt_current', userId: USER_ID, tokenHash: CURRENT_SESSION_HASH, expiresAt: SESSION_EXPIRY })
    await sessions.saveRefreshToken({ id: 'rt_other', userId: USER_ID, tokenHash: OTHER_SESSION_HASH, expiresAt: SESSION_EXPIRY })
    await sessions.saveRefreshToken({ id: 'rt_foreign', userId: OTHER_USER_ID, tokenHash: FOREIGN_SESSION_HASH, expiresAt: SESSION_EXPIRY })
  }

  async function activeEnrolment(): Promise<void> {
    await repository.savePending(USER_ID, PENDING_CIPHERTEXT, NOW)
    await repository.activate(USER_ID, PENDING_CIPHERTEXT, 10, NOW, null)
  }

  async function readEnrolment(userId = USER_ID): Promise<EnrolmentRow | null> {
    return db
      .prepare('SELECT status, secret_ciphertext, last_used_step, created_at, activated_at FROM user_mfa WHERE user_id = ?')
      .bind(userId)
      .first<EnrolmentRow>()
  }

  async function readRevocations(): Promise<Record<string, number | null>> {
    const { results } = await db
      .prepare('SELECT token_hash, revoked_at FROM refresh_tokens')
      .all<TokenRow>()
    return Object.fromEntries(results.map(row => [row.token_hash, row.revoked_at]))
  }

  describe('findByUserId', () => {
    it('returns null for a user without enrolment', async () => {
      const record = await repository.findByUserId(USER_ID)

      expect(record).toBeNull()
    })
  })

  describe('savePending', () => {
    it('creates a pending row', async () => {
      const saved = await repository.savePending(USER_ID, PENDING_CIPHERTEXT, NOW)

      expect(saved).toBe(true)
      expect(await readEnrolment()).toEqual({
        status: 'pending',
        secret_ciphertext: PENDING_CIPHERTEXT,
        last_used_step: null,
        created_at: NOW,
        activated_at: null,
      })
    })

    it('replaces the secret of a pending row', async () => {
      await repository.savePending(USER_ID, PENDING_CIPHERTEXT, NOW)

      const saved = await repository.savePending(USER_ID, REPLACED_CIPHERTEXT, NOW + 5)

      expect(saved).toBe(true)
      expect(await readEnrolment()).toMatchObject({ status: 'pending', secret_ciphertext: REPLACED_CIPHERTEXT, created_at: NOW + 5 })
    })

    it('returns false and leaves an active row unchanged', async () => {
      await activeEnrolment()
      const before = await readEnrolment()

      const saved = await repository.savePending(USER_ID, REPLACED_CIPHERTEXT, NOW + 5)

      expect(saved).toBe(false)
      expect(await readEnrolment()).toEqual(before)
    })
  })

  describe('activate', () => {
    it('activates a pending row, records the step and revokes every other session but the kept one', async () => {
      await repository.savePending(USER_ID, PENDING_CIPHERTEXT, NOW)
      await saveSessions()

      const activated = await repository.activate(USER_ID, PENDING_CIPHERTEXT, 42, NOW + 1, CURRENT_SESSION_HASH)

      expect(activated).toBe(true)
      expect(await readEnrolment()).toMatchObject({ status: 'active', last_used_step: 42, activated_at: NOW + 1 })
      expect(await readRevocations()).toEqual({
        [CURRENT_SESSION_HASH]: null,
        [OTHER_SESSION_HASH]: NOW + 1,
        [FOREIGN_SESSION_HASH]: null,
      })
    })

    it('revokes all sessions when no session is kept', async () => {
      await repository.savePending(USER_ID, PENDING_CIPHERTEXT, NOW)
      await saveSessions()

      const activated = await repository.activate(USER_ID, PENDING_CIPHERTEXT, 42, NOW + 1, null)

      expect(activated).toBe(true)
      expect(await readRevocations()).toEqual({
        [CURRENT_SESSION_HASH]: NOW + 1,
        [OTHER_SESSION_HASH]: NOW + 1,
        [FOREIGN_SESSION_HASH]: null,
      })
    })

    it('returns false and revokes nothing when the pending secret changed', async () => {
      await repository.savePending(USER_ID, REPLACED_CIPHERTEXT, NOW)
      await saveSessions()

      // Regression guard: the revocation must carry the same guard as the activation, or a stale confirm still logs users out.
      const activated = await repository.activate(USER_ID, PENDING_CIPHERTEXT, 42, NOW + 1, CURRENT_SESSION_HASH)

      expect(activated).toBe(false)
      expect(await readEnrolment()).toMatchObject({ status: 'pending', secret_ciphertext: REPLACED_CIPHERTEXT, last_used_step: null })
      expect(await readRevocations()).toEqual({
        [CURRENT_SESSION_HASH]: null,
        [OTHER_SESSION_HASH]: null,
        [FOREIGN_SESSION_HASH]: null,
      })
    })

    it('never touches another user\'s sessions', async () => {
      await repository.savePending(USER_ID, PENDING_CIPHERTEXT, NOW)
      await saveSessions()

      await repository.activate(USER_ID, PENDING_CIPHERTEXT, 42, NOW + 1, null)

      expect((await readRevocations())[FOREIGN_SESSION_HASH]).toBeNull()
    })
  })

  describe('consumeStep', () => {
    it('accepts a strictly newer step and rejects an equal or older one', async () => {
      await activeEnrolment()

      const results = [
        await repository.consumeStep(USER_ID, 11),
        await repository.consumeStep(USER_ID, 11),
        await repository.consumeStep(USER_ID, 10),
        await repository.consumeStep(USER_ID, 12),
      ]

      expect(results).toEqual([true, false, false, true])
      expect((await readEnrolment())?.last_used_step).toBe(12)
    })

    it('returns false for a pending row', async () => {
      await repository.savePending(USER_ID, PENDING_CIPHERTEXT, NOW)

      const consumed = await repository.consumeStep(USER_ID, 11)

      expect(consumed).toBe(false)
      expect((await readEnrolment())?.last_used_step).toBeNull()
    })
  })

  describe('remove', () => {
    it('deletes the enrolment and revokes the other sessions', async () => {
      await activeEnrolment()
      await saveSessions()

      const removed = await repository.remove(USER_ID, NOW + 1, CURRENT_SESSION_HASH)

      expect(removed).toBe(true)
      expect(await readEnrolment()).toBeNull()
      expect(await readRevocations()).toEqual({
        [CURRENT_SESSION_HASH]: null,
        [OTHER_SESSION_HASH]: NOW + 1,
        [FOREIGN_SESSION_HASH]: null,
      })
    })

    it('returns false and revokes nothing for a user without enrolment', async () => {
      await saveSessions()

      const removed = await repository.remove(USER_ID, NOW + 1, null)

      expect(removed).toBe(false)
      expect(await readRevocations()).toEqual({
        [CURRENT_SESSION_HASH]: null,
        [OTHER_SESSION_HASH]: null,
        [FOREIGN_SESSION_HASH]: null,
      })
    })
  })

  describe('cascade', () => {
    it('drops the enrolment when the user is deleted', async () => {
      await repository.savePending(USER_ID, PENDING_CIPHERTEXT, NOW)

      await db.prepare('DELETE FROM users WHERE id = ?').bind(USER_ID).run()

      const remaining = await db.prepare('SELECT COUNT(*) AS n FROM user_mfa').first<{ n: number }>()
      expect(remaining?.n).toBe(0)
    })
  })
})
