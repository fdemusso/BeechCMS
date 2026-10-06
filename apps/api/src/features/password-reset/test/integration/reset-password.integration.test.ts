// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Password-reset slice — integration tier. POST /auth/reset-password must consume a one-time token
 * atomically (#589) and land the token burn, the password rewrite and the session revoke as one
 * unit (#590). The repository unit test only asserts the statements are issued, so it cannot see
 * that two requests holding the same token both pass the validity read and both write, nor that a
 * failure mid-way leaves a burned token with the old password.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { createExecutionContext, env } from 'cloudflare:test'
import { sha256hex } from '@beechcms/core'
import { CANONICAL_USERS, createTestHarness, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const RESET_TOKEN = 'reset-token-plaintext-0123456789'
const TOKEN_ID = 'prt-race-1'

describe('password-reset slice — integration (real D1)', () => {
  let harness: TestHarness
  const user = CANONICAL_USERS.editor

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      env: { RESEND_API_KEY: 'test-key' },
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
  })

  // The handler stamps validity with wall-clock `Date.now()`, not the injected IClock, so the
  // frozen harness clock would make every seeded token look expired.
  async function issueResetToken(): Promise<void> {
    await harness.db.prepare('DELETE FROM password_reset_tokens').run()
    await harness.db
      .prepare('INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
      .bind(TOKEN_ID, user.id, await sha256hex(RESET_TOKEN), Math.floor(Date.now() / 1000) + 1800)
      .run()
  }

  // The handler reads `executionCtx` eagerly and Hono throws when none is supplied; the harness
  // client passes none, so this route is driven through the app with a real ExecutionContext.
  async function reset(password: string): Promise<Response> {
    return harness.app.request(
      '/auth/reset-password',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: RESET_TOKEN, password }),
      },
      harness.env,
      createExecutionContext(),
    )
  }

  async function storedPasswordHash(): Promise<string> {
    const row = await harness.db.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<{ password_hash: string }>()
    return row!.password_hash
  }

  async function seedSessions(): Promise<void> {
    await harness.db.prepare('DELETE FROM refresh_tokens').run()
    const expiresAt = Math.floor(Date.now() / 1000) + 3600
    await harness.db.batch(
      ['rt-1', 'rt-2'].map((id) =>
        harness.db
          .prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
          .bind(id, user.id, `hash-${id}`, expiresAt),
      ),
    )
  }

  async function revokedSessionCount(): Promise<number> {
    const row = await harness.db
      .prepare('SELECT COUNT(*) AS n FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NOT NULL')
      .bind(user.id)
      .first<{ n: number }>()
    return row!.n
  }

  async function usedTokenCount(): Promise<number> {
    const row = await harness.db
      .prepare('SELECT COUNT(*) AS n FROM password_reset_tokens WHERE id = ? AND used_at IS NOT NULL')
      .bind(TOKEN_ID)
      .first<{ n: number }>()
    return row!.n
  }

  describe('POST /auth/reset-password', () => {
    it('accepts a valid token once and persists the new password', async () => {
      await issueResetToken()

      const response = await reset('first-new-password')

      expect(response.status).toBe(200)
      expect(bcrypt.compareSync('first-new-password', await storedPasswordHash())).toBe(true)
      expect(await usedTokenCount()).toBe(1)
    })

    it('revokes every session of the user when the password is reset', async () => {
      await issueResetToken()
      await seedSessions()

      const response = await reset('first-new-password')

      expect(response.status).toBe(200)
      expect(await revokedSessionCount()).toBe(2)
    })

    it('persists nothing when the session revoke fails mid-way', async () => {
      await issueResetToken()
      await seedSessions()
      const hashBefore = await storedPasswordHash()
      await harness.db.exec(
        `CREATE TRIGGER fail_session_revoke BEFORE UPDATE ON refresh_tokens BEGIN SELECT RAISE(ABORT, 'injected revoke failure'); END`,
      )

      try {
        const response = await reset('first-new-password')

        expect(response.status).toBeGreaterThanOrEqual(500)
        expect(await storedPasswordHash()).toBe(hashBefore)
        expect(await usedTokenCount()).toBe(0)
        expect(await revokedSessionCount()).toBe(0)
      } finally {
        await harness.db.exec('DROP TRIGGER fail_session_revoke')
      }
    })

    it('rejects a sequential replay of a consumed token and keeps the first password', async () => {
      await issueResetToken()
      const first = await reset('first-new-password')
      expect(first.status).toBe(200)

      const replay = await reset('attacker-password-1')

      expect(replay.status).toBe(400)
      expect(bcrypt.compareSync('first-new-password', await storedPasswordHash())).toBe(true)
    })

    it('lets only one of two concurrent requests redeem the same token', async () => {
      await issueResetToken()

      // Both requests pass the validity read before either consumes the token: the bcrypt hash
      // sits between check and write, so Promise.all reliably interleaves them.
      const [responseA, responseB] = await Promise.all([reset('password-from-a'), reset('password-from-b')])

      expect([responseA.status, responseB.status].sort()).toEqual([200, 400])
      const winnerPassword = responseA.status === 200 ? 'password-from-a' : 'password-from-b'
      const loserPassword = responseA.status === 200 ? 'password-from-b' : 'password-from-a'
      const stored = await storedPasswordHash()
      expect(bcrypt.compareSync(winnerPassword, stored)).toBe(true)
      expect(bcrypt.compareSync(loserPassword, stored)).toBe(false)
    })
  })
})
