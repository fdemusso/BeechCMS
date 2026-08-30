// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { describe, it, expect, vi } from 'vitest'
import { D1TimeTrapTokenRepository } from './time-trap-token.repository.d1.js'

function makeMockDb(opts: { firstResult?: unknown } = {}) {
  const { firstResult = null } = opts
  const runMock = vi.fn().mockResolvedValue({ success: true })
  const firstMock = vi.fn().mockResolvedValue(firstResult)
  const bindMock = vi.fn<(...args: any[]) => any>(() => ({ run: runMock, first: firstMock }))
  const prepareMock = vi.fn<(...args: any[]) => any>(() => ({ bind: bindMock }))
  return { db: { prepare: prepareMock } as any, prepareMock, bindMock, runMock }
}

describe('D1TimeTrapTokenRepository', () => {
  describe('isTokenUsed', () => {
    it('returns true when token hash is found', async () => {
      const { db } = makeMockDb({ firstResult: { token_hash: 'hash-123' } })
      const repo = new D1TimeTrapTokenRepository(db)
      const used = await repo.isTokenUsed('hash-123')
      expect(used).toBe(true)
    })

    it('returns false when token hash is not found', async () => {
      const { db } = makeMockDb({ firstResult: null })
      const repo = new D1TimeTrapTokenRepository(db)
      const used = await repo.isTokenUsed('hash-missing')
      expect(used).toBe(false)
    })

    it('queries public_time_trap_tokens table', async () => {
      const { db, prepareMock } = makeMockDb()
      const repo = new D1TimeTrapTokenRepository(db)
      await repo.isTokenUsed('hash-query')
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('public_time_trap_tokens'))
    })
  })

  describe('markTokenUsed', () => {
    it('inserts token into public_time_trap_tokens table with upsert', async () => {
      const { db, prepareMock, bindMock } = makeMockDb()
      const repo = new D1TimeTrapTokenRepository(db)
      await repo.markTokenUsed('hash-abc', 1000, 4600)
      const sql = prepareMock.mock.calls[0][0] as string
      expect(sql).toContain('INSERT INTO public_time_trap_tokens')
      expect(sql).toContain('ON CONFLICT(token_hash)')
      expect(bindMock).toHaveBeenCalledWith('hash-abc', 1000, 4600)
    })
  })

  describe('cleanup', () => {
    it('deletes expired entries from public_time_trap_tokens', async () => {
      const { db, prepareMock, bindMock } = makeMockDb()
      const repo = new D1TimeTrapTokenRepository(db)
      await repo.cleanup(5000)
      const sql = prepareMock.mock.calls[0][0] as string
      expect(sql).toContain('DELETE FROM public_time_trap_tokens WHERE expires_at < ?')
      expect(bindMock).toHaveBeenCalledWith(5000)
    })
  })
})
