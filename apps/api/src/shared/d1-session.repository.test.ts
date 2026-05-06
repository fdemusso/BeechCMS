import { describe, it, expect, vi } from 'vitest'
import { D1SessionRepository } from './d1-session.repository'

const NOW = Math.floor(Date.now() / 1000)
const FUTURE = NOW + 7 * 24 * 3600

function makeMockDb(opts: {
  firstResult?: unknown
  runChanges?: number
  allResults?: unknown[]
} = {}) {
  const { firstResult = null, runChanges = 1, allResults = [] } = opts
  const runMock = vi.fn().mockResolvedValue({ success: true, meta: { changes: runChanges } })
  const firstMock = vi.fn().mockResolvedValue(firstResult)
  const allMock = vi.fn().mockResolvedValue({ results: allResults })
  const bindMock = vi.fn(() => ({ first: firstMock, all: allMock, run: runMock }))
  const prepareMock = vi.fn(() => ({ bind: bindMock }))
  return { db: { prepare: prepareMock } as any, prepareMock, bindMock, runMock, firstMock, allMock }
}

describe('D1SessionRepository', () => {
  describe('saveRefreshToken', () => {
    it('calls INSERT INTO refresh_tokens with the correct bound values', async () => {
      const { db, prepareMock, bindMock } = makeMockDb()
      await new D1SessionRepository(db).saveRefreshToken({
        id: 'rt-1', userId: 'u1', tokenHash: 'h', expiresAt: FUTURE,
      })
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO refresh_tokens'))
      expect(bindMock).toHaveBeenCalledWith('rt-1', 'u1', 'h', FUTURE)
    })
  })

  describe('findActiveByHash', () => {
    it('returns a RefreshTokenRecord with camelCase keys mapped from the snake_case row', async () => {
      const row = {
        id: 'rt-1', user_id: 'u1', token_hash: 'h',
        expires_at: FUTURE, created_at: NOW, revoked_at: null,
      }
      const { db } = makeMockDb({ firstResult: row })
      const result = await new D1SessionRepository(db).findActiveByHash('h', NOW)
      expect(result).toEqual({
        id: 'rt-1', userId: 'u1', tokenHash: 'h',
        expiresAt: FUTURE, createdAt: NOW, revokedAt: null,
      })
    })

    it('returns null when no active token is found', async () => {
      const { db } = makeMockDb({ firstResult: null })
      expect(await new D1SessionRepository(db).findActiveByHash('missing', NOW)).toBeNull()
    })

    it('passes tokenHash and nowTimestamp as bound values', async () => {
      const { db, bindMock } = makeMockDb()
      await new D1SessionRepository(db).findActiveByHash('my-hash', NOW)
      expect(bindMock).toHaveBeenCalledWith('my-hash', NOW)
    })
  })

  describe('revokeByHash', () => {
    it('returns true when one row is updated (changes = 1)', async () => {
      const { db } = makeMockDb({ runChanges: 1 })
      expect(await new D1SessionRepository(db).revokeByHash('h', NOW)).toBe(true)
    })

    it('returns false when no row is updated (token already revoked or not found)', async () => {
      const { db } = makeMockDb({ runChanges: 0 })
      expect(await new D1SessionRepository(db).revokeByHash('h', NOW)).toBe(false)
    })
  })

  describe('revokeAllForUser', () => {
    it('calls UPDATE refresh_tokens and includes the userId in the bound values', async () => {
      const { db, prepareMock, bindMock } = makeMockDb()
      await new D1SessionRepository(db).revokeAllForUser('u1', NOW)
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('UPDATE refresh_tokens'))
      expect((bindMock.mock.calls[0] as unknown[]).includes('u1')).toBe(true)
    })
  })

  describe('listActiveForUser', () => {
    it('returns mapped ActiveSessionSummary objects in the original order', async () => {
      const rows = [
        { id: 's1', created_at: NOW - 100, expires_at: FUTURE },
        { id: 's2', created_at: NOW - 200, expires_at: FUTURE },
      ]
      const { db } = makeMockDb({ allResults: rows })
      const sessions = await new D1SessionRepository(db).listActiveForUser('u1', NOW, 20)
      expect(sessions).toHaveLength(2)
      expect(sessions[0]).toEqual({ id: 's1', createdAt: NOW - 100, expiresAt: FUTURE })
      expect(sessions[1]).toEqual({ id: 's2', createdAt: NOW - 200, expiresAt: FUTURE })
    })

    it('returns an empty array when no active sessions exist', async () => {
      const { db } = makeMockDb({ allResults: [] })
      expect(await new D1SessionRepository(db).listActiveForUser('u1', NOW, 20)).toEqual([])
    })
  })

  describe('revokeById', () => {
    it('returns true when the session is revoked (changes = 1)', async () => {
      const { db } = makeMockDb({ runChanges: 1 })
      expect(await new D1SessionRepository(db).revokeById('s1', 'u1', NOW)).toBe(true)
    })

    it('returns false when the session is not found or belongs to another user (changes = 0)', async () => {
      const { db } = makeMockDb({ runChanges: 0 })
      expect(await new D1SessionRepository(db).revokeById('s1', 'other-user', NOW)).toBe(false)
    })

    it('binds both sessionId and userId to prevent cross-user revocation', async () => {
      const { db, bindMock } = makeMockDb({ runChanges: 1 })
      await new D1SessionRepository(db).revokeById('my-session', 'my-user', NOW)
      const args = bindMock.mock.calls[0] as unknown[]
      expect(args).toContain('my-session')
      expect(args).toContain('my-user')
    })
  })
})
