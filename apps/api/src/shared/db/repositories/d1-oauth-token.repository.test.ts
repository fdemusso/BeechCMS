// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { D1OAuthTokenRepository } from './d1-oauth-token.repository'
import { FixedClock } from '@beechcms/testing'

const FIXED_NOW_MS = 1700000000_000
const NOW = Math.floor(FIXED_NOW_MS / 1000)
const FUTURE = NOW + 600
const clock = new FixedClock(FIXED_NOW_MS)

function makeMockDb(opts: { firstResult?: unknown; runChanges?: number } = {}) {
  const { firstResult = null, runChanges = 1 } = opts
  const runMock = vi.fn().mockResolvedValue({ success: true, meta: { changes: runChanges } })
  const firstMock = vi.fn().mockResolvedValue(firstResult)
  const bindMock = vi.fn(() => ({ first: firstMock, run: runMock }))
  const prepareMock = vi.fn(() => ({ bind: bindMock }))
  return { db: { prepare: prepareMock } as any, prepareMock, bindMock, runMock, firstMock }
}

describe('D1OAuthTokenRepository', () => {
  describe('revokeByAuthorizationCode', () => {
    it('revokes both the access and refresh token of a family and returns 2', async () => {
      const { db } = makeMockDb({ runChanges: 2 })
      const revoked = await new D1OAuthTokenRepository(db, clock).revokeByAuthorizationCode('code-hash', NOW)
      expect(revoked).toBe(2)
    })
  })

  describe('revokeAllForClientAndUser', () => {
    it('revokes both token types for that pair, scoped by client and user', async () => {
      const { db, bindMock } = makeMockDb({ runChanges: 2 })
      const revoked = await new D1OAuthTokenRepository(db, clock).revokeAllForClientAndUser(
        'beech-mcp-cli',
        'u1',
        NOW,
      )
      expect(revoked).toBe(2)
      expect(bindMock).toHaveBeenCalledWith(NOW, 'beech-mcp-cli', 'u1')
    })

    it('does not affect a different client (scoping proven by bound clientId)', async () => {
      const { db, bindMock } = makeMockDb({ runChanges: 0 })
      const revoked = await new D1OAuthTokenRepository(db, clock).revokeAllForClientAndUser(
        'other-client',
        'u1',
        NOW,
      )
      expect(revoked).toBe(0)
      expect(bindMock).toHaveBeenCalledWith(NOW, 'other-client', 'u1')
    })
  })

  describe('findActiveByHash', () => {
    it('rejects an expired row', async () => {
      const { db } = makeMockDb({ firstResult: null })
      const record = await new D1OAuthTokenRepository(db, clock).findActiveByHash('h', 'access', NOW)
      expect(record).toBeNull()
    })

    it('rejects a revoked row', async () => {
      const { db } = makeMockDb({ firstResult: null })
      const record = await new D1OAuthTokenRepository(db, clock).findActiveByHash('h', 'refresh', NOW)
      expect(record).toBeNull()
    })

    it('binds the requested tokenType so a hash matched with the wrong type is rejected', async () => {
      const { db, bindMock } = makeMockDb({ firstResult: null })
      await new D1OAuthTokenRepository(db, clock).findActiveByHash('h', 'access', NOW)
      expect(bindMock).toHaveBeenCalledWith('h', 'access', NOW)
    })

    it('returns the mapped record when an active row is found', async () => {
      const row = {
        id: 't1',
        token_hash: 'h',
        token_type: 'access',
        client_id: 'beech-mcp-cli',
        user_id: 'u1',
        scope: 'schema:read',
        authorization_code_hash: 'code-hash',
        expires_at: FUTURE,
        created_at: NOW,
        revoked_at: null,
      }
      const { db } = makeMockDb({ firstResult: row })
      const record = await new D1OAuthTokenRepository(db, clock).findActiveByHash('h', 'access', NOW)
      expect(record).toEqual({
        id: 't1',
        tokenHash: 'h',
        tokenType: 'access',
        clientId: 'beech-mcp-cli',
        userId: 'u1',
        scope: ['schema:read'],
        authorizationCodeHash: 'code-hash',
        expiresAt: FUTURE,
        createdAt: NOW,
        revokedAt: null,
      })
    })
  })
})
