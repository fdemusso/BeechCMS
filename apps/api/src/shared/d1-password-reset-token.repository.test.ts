// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { D1PasswordResetTokenRepository } from './d1-password-reset-token.repository'

const NOW = Math.floor(Date.now() / 1000)
const fixedIdGen = { uuid: () => 'prt-1' }

function makeMockDb(opts: { firstResult?: unknown; runChanges?: number } = {}) {
  const { firstResult = null, runChanges = 1 } = opts
  const runMock = vi.fn().mockResolvedValue({ success: true, meta: { changes: runChanges } })
  const firstMock = vi.fn().mockResolvedValue(firstResult)
  const bindMock = vi.fn(() => ({ first: firstMock, run: runMock }))
  const prepareMock = vi.fn(() => ({ bind: bindMock }))
  return { db: { prepare: prepareMock } as any, prepareMock, bindMock, runMock }
}

describe('D1PasswordResetTokenRepository', () => {
  describe('create', () => {
    it('calls INSERT INTO password_reset_tokens', async () => {
      const { db, prepareMock } = makeMockDb()
      await new D1PasswordResetTokenRepository(db, fixedIdGen).create({
        userId: 'u1', tokenHash: 'h', expiresAt: NOW + 1800,
      })
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO password_reset_tokens'))
    })

    it('binds id, userId, tokenHash, and expiresAt in the correct order', async () => {
      const { db, bindMock } = makeMockDb()
      await new D1PasswordResetTokenRepository(db, fixedIdGen).create({
        userId: 'u1', tokenHash: 'h', expiresAt: NOW + 1800,
      })
      expect(bindMock).toHaveBeenCalledWith('prt-1', 'u1', 'h', NOW + 1800)
    })
  })

  describe('findValidByHashWithEmail', () => {
    it('returns a ValidatedResetToken with the userId and email from the JOIN', async () => {
      const row = { id: 'prt-1', user_id: 'u1', email: 'user@test.com' }
      const { db } = makeMockDb({ firstResult: row })
      const result = await new D1PasswordResetTokenRepository(db, fixedIdGen).findValidByHashWithEmail('h', NOW)
      expect(result).toEqual({ id: 'prt-1', userId: 'u1', email: 'user@test.com' })
    })

    it('returns null when the token is not found, expired, or already used', async () => {
      const { db } = makeMockDb({ firstResult: null })
      expect(await new D1PasswordResetTokenRepository(db, fixedIdGen).findValidByHashWithEmail('bad-hash', NOW)).toBeNull()
    })

    it('passes tokenHash and nowTimestamp as bound values', async () => {
      const { db, bindMock } = makeMockDb()
      await new D1PasswordResetTokenRepository(db, fixedIdGen).findValidByHashWithEmail('my-hash', NOW)
      expect(bindMock).toHaveBeenCalledWith('my-hash', NOW)
    })
  })

  describe('markUsed', () => {
    it('calls UPDATE password_reset_tokens SET used_at', async () => {
      const { db, prepareMock } = makeMockDb()
      await new D1PasswordResetTokenRepository(db, fixedIdGen).markUsed('prt-1', NOW)
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('used_at'))
    })

    it('binds nowTimestamp and tokenId in the correct order', async () => {
      const { db, bindMock } = makeMockDb()
      await new D1PasswordResetTokenRepository(db, fixedIdGen).markUsed('prt-1', NOW)
      expect(bindMock).toHaveBeenCalledWith(NOW, 'prt-1')
    })
  })

  describe('invalidatePending', () => {
    it('calls UPDATE password_reset_tokens and includes the userId in the bound values', async () => {
      const { db, prepareMock, bindMock } = makeMockDb()
      await new D1PasswordResetTokenRepository(db, fixedIdGen).invalidatePending('u1', NOW)
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('UPDATE password_reset_tokens'))
      expect((bindMock.mock.calls[0] as unknown[]).includes('u1')).toBe(true)
    })
  })
})
