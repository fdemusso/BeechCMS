// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { D1OAuthAuthorizationCodeRepository } from './d1-oauth-authorization-code.repository'
import { FixedClock } from '@beechcms/testing'

const FIXED_NOW_MS = 1700000000_000
const NOW = Math.floor(FIXED_NOW_MS / 1000)
const FUTURE = NOW + 600
const PAST = NOW - 600
const clock = new FixedClock(FIXED_NOW_MS)

function makeMockDb(opts: { firstResult?: unknown; runChanges?: number } = {}) {
  const { firstResult = null, runChanges = 1 } = opts
  const runMock = vi.fn().mockResolvedValue({ success: true, meta: { changes: runChanges } })
  const firstMock = vi.fn().mockResolvedValue(firstResult)
  const bindMock = vi.fn(() => ({ first: firstMock, run: runMock }))
  const prepareMock = vi.fn(() => ({ bind: bindMock }))
  return { db: { prepare: prepareMock } as any, prepareMock, bindMock, runMock, firstMock }
}

describe('D1OAuthAuthorizationCodeRepository', () => {
  describe('consumeByHash', () => {
    it('returns true on first consumption and false on the second (single-use)', async () => {
      const repo = new D1OAuthAuthorizationCodeRepository(makeMockDb({ runChanges: 1 }).db, clock)
      expect(await repo.consumeByHash('code-hash', NOW)).toBe(true)

      const repoSecond = new D1OAuthAuthorizationCodeRepository(makeMockDb({ runChanges: 0 }).db, clock)
      expect(await repoSecond.consumeByHash('code-hash', NOW)).toBe(false)
    })
  })

  describe('findByHash', () => {
    it('still returns the row after consumption, with consumedAt set (replay detection)', async () => {
      const row = {
        code_hash: 'code-hash',
        client_id: 'beech-mcp-cli',
        user_id: 'u1',
        scope: 'schema:read',
        redirect_uri: 'http://127.0.0.1/callback',
        code_challenge: 'challenge',
        code_challenge_method: 'S256',
        expires_at: FUTURE,
        created_at: NOW,
        consumed_at: NOW,
      }
      const { db } = makeMockDb({ firstResult: row })
      const record = await new D1OAuthAuthorizationCodeRepository(db, clock).findByHash('code-hash', NOW)
      expect(record?.consumedAt).toBe(NOW)
    })

    it('returns null for an expired code', async () => {
      const { db } = makeMockDb({ firstResult: null })
      const record = await new D1OAuthAuthorizationCodeRepository(db, clock).findByHash('expired-hash', PAST)
      expect(record).toBeNull()
    })
  })
})
