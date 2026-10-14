// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Password-reset slice — integration tier. POST /auth/forgot-password is unauthenticated, so every
 * malformed or hostile body must be answered with a counted 4xx instead of an unhandled 500, and
 * the token issued after the response (inside waitUntil) must really land in D1. The unit suite
 * fakes the token repository and cannot see what is persisted. Clock and id-generator injection
 * are covered in request.test.ts because the harness clock does not reach the handlers.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const SUPERSEDED_TOKEN_ID = 'prt-superseded-1'
// Far-future expiry so the pending token still counts as live whatever the wall clock reads.
const FAR_FUTURE_EXPIRY = 4_102_444_800
// Matches the forgotPassword IP bucket capacity in rate-limit.middleware.ts.
const IP_BUCKET_CAPACITY = 5

describe('password-reset slice — forgot-password integration (real D1)', () => {
  let harness: TestHarness
  const user = CANONICAL_USERS.editor

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      // The mail provider is pointed at a closed local port: the send runs inside waitUntil and
      // its failure is swallowed by the handler, so no suite ever reaches a real mail service.
      env: { EMAIL_PROVIDER: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1' },
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    await harness.db.prepare('DELETE FROM password_reset_tokens').run()
    // seedUsers is INSERT OR IGNORE, so an account deactivated by an earlier test stays inactive.
    await harness.db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').bind(user.id).run()
  })

  // The handler reads `executionCtx` eagerly and Hono throws when none is supplied; the harness
  // client passes none, so the route is driven through the app with a real ExecutionContext.
  async function forgotPassword(rawBody: string): Promise<Response> {
    const executionCtx = createExecutionContext()
    const response = await harness.app.request(
      '/auth/forgot-password',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: rawBody },
      harness.env,
      executionCtx,
    )
    await waitOnExecutionContext(executionCtx)
    return response
  }

  async function pendingTokens(): Promise<{ id: string; user_id: string; token_hash: string }[]> {
    const { results } = await harness.db
      .prepare('SELECT id, user_id, token_hash FROM password_reset_tokens WHERE used_at IS NULL')
      .all<{ id: string; user_id: string; token_hash: string }>()
    return results
  }

  describe('POST /auth/forgot-password', () => {
    it.each([
      ['null', 'null'],
      ['an array', '[]'],
      ['a string', '"user@beechcms.com"'],
      ['a number', '42'],
    ])('rejects a JSON body that is %s with 400 instead of crashing', async (_label, rawBody) => {
      const response = await forgotPassword(rawBody)

      expect(response.status).toBe(400)
      expect(await pendingTokens()).toEqual([])
    })

    // A body that parses but is not an object used to throw before any limiter ran, so a client
    // could send unlimited uncounted requests. It must drain the same IP bucket as other rejects.
    it('counts non-object bodies against the IP rate limit', async () => {
      const statuses: number[] = []
      for (let attempt = 0; attempt <= IP_BUCKET_CAPACITY; attempt += 1) {
        statuses.push((await forgotPassword('null')).status)
      }

      expect(statuses).toEqual([...Array<number>(IP_BUCKET_CAPACITY).fill(400), 429])
    })

    it('rejects an email longer than 254 characters with 400 and issues no token', async () => {
      const oversizedEmail = `${'a'.repeat(250)}@beechcms.com`

      const response = await forgotPassword(JSON.stringify({ email: oversizedEmail }))

      expect(response.status).toBe(400)
      expect(await pendingTokens()).toEqual([])
    })

    it('persists a hashed token for an active account and burns the one it supersedes', async () => {
      await harness.db
        .prepare('INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
        .bind(SUPERSEDED_TOKEN_ID, user.id, 'superseded-hash', FAR_FUTURE_EXPIRY)
        .run()

      const response = await forgotPassword(JSON.stringify({ email: user.email }))

      expect(response.status).toBe(200)
      const pending = await pendingTokens()
      expect(pending).toHaveLength(1)
      expect(pending[0]).toMatchObject({ user_id: user.id })
      expect(pending[0].id).not.toBe(SUPERSEDED_TOKEN_ID)
      expect(pending[0].token_hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('answers 200 but issues no token for a deactivated account', async () => {
      await harness.db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').bind(user.id).run()

      const response = await forgotPassword(JSON.stringify({ email: user.email }))

      expect(response.status).toBe(200)
      expect(await response.json<{ success: boolean }>()).toEqual({ success: true })
      expect(await pendingTokens()).toEqual([])
    })
  })
})
