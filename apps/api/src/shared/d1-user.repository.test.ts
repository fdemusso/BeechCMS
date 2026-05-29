// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { D1UserRepository } from './d1-user.repository'

const USER_ROW = {
  id: 'u1',
  email: 'test@test.com',
  name: 'Test User',
  password_hash: 'hash-abc',
  role: 'admin',
  avatar_url: null,
  notification_prefs: '{}',
}

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
  // prepare() may be called without bind() for countAll (which calls .first() directly)
  const prepareMock = vi.fn(() => ({ bind: bindMock, first: firstMock, run: runMock }))
  return { db: { prepare: prepareMock } as any, prepareMock, bindMock, runMock, firstMock }
}

describe('D1UserRepository', () => {
  describe('countAll', () => {
    it('returns the count value from the database', async () => {
      const { db, firstMock } = makeMockDb()
      firstMock.mockResolvedValue({ count: 5 })
      expect(await new D1UserRepository(db).countAll()).toBe(5)
    })

    it('returns 0 when the query returns null', async () => {
      const { db } = makeMockDb({ firstResult: null })
      expect(await new D1UserRepository(db).countAll()).toBe(0)
    })
  })

  describe('findByEmail', () => {
    it('returns a UserRecord with camelCase keys mapped from the snake_case row', async () => {
      const { db } = makeMockDb({ firstResult: USER_ROW })
      const result = await new D1UserRepository(db).findByEmail('test@test.com')
      expect(result).toEqual({
        id: 'u1',
        email: 'test@test.com',
        name: 'Test User',
        passwordHash: 'hash-abc',
        role: 'admin',
        avatarUrl: null,
        notificationPreferences: '{}',
      })
    })

    it('returns null when no user is found', async () => {
      const { db } = makeMockDb({ firstResult: null })
      expect(await new D1UserRepository(db).findByEmail('nobody@test.com')).toBeNull()
    })
  })

  describe('findById', () => {
    it('returns a mapped UserRecord when found', async () => {
      const { db } = makeMockDb({ firstResult: USER_ROW })
      const result = await new D1UserRepository(db).findById('u1')
      expect(result?.id).toBe('u1')
      expect(result?.passwordHash).toBe('hash-abc')
    })

    it('returns null when the user is not found', async () => {
      const { db } = makeMockDb({ firstResult: null })
      expect(await new D1UserRepository(db).findById('unknown')).toBeNull()
    })
  })

  describe('create', () => {
    it('calls prepare with an INSERT INTO users statement', async () => {
      const { db, prepareMock } = makeMockDb()
      await new D1UserRepository(db).create({
        id: 'u1', email: 'a@b.com', passwordHash: 'hash', role: 'admin', name: 'Test', surname: null,
      })
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO users'))
    })

    it('binds id, email, passwordHash, role, name, surname in the correct order', async () => {
      const { db, bindMock } = makeMockDb()
      await new D1UserRepository(db).create({
        id: 'u1', email: 'a@b.com', passwordHash: 'hash', role: 'admin', name: 'Test', surname: null,
      })
      expect(bindMock).toHaveBeenCalledWith('u1', 'a@b.com', 'hash', 'admin', 'Test', null)
    })
  })

  describe('updateProfile', () => {
    it('does nothing when no fields are provided', async () => {
      const { db, prepareMock } = makeMockDb()
      await new D1UserRepository(db).updateProfile('u1', {})
      expect(prepareMock).not.toHaveBeenCalled()
    })

    it('generates a SET clause containing only the provided field', async () => {
      const { db, prepareMock } = makeMockDb()
      await new D1UserRepository(db).updateProfile('u1', { name: 'New Name' })
      const sql: string = prepareMock.mock.calls[0][0]
      expect(sql).toContain('name = ?')
      expect(sql).not.toContain('email = ?')
    })

    it('includes both fields when both name and email are provided', async () => {
      const { db, prepareMock } = makeMockDb()
      await new D1UserRepository(db).updateProfile('u1', { name: 'N', email: 'e@e.com' })
      const sql: string = prepareMock.mock.calls[0][0]
      expect(sql).toContain('name = ?')
      expect(sql).toContain('email = ?')
    })
  })

  describe('updatePasswordHash', () => {
    it('calls UPDATE users SET password_hash', async () => {
      const { db, prepareMock } = makeMockDb()
      await new D1UserRepository(db).updatePasswordHash('u1', 'new-hash')
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('password_hash'))
    })
  })

  describe('updateAvatarUrl', () => {
    it('calls UPDATE users SET avatar_url', async () => {
      const { db, prepareMock } = makeMockDb()
      await new D1UserRepository(db).updateAvatarUrl('u1', 'https://cdn.example.com/avatar.jpg')
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('avatar_url'))
    })
  })

  describe('emailBelongsToAnotherUser', () => {
    it('returns true when another user row is found with that email', async () => {
      const { db } = makeMockDb({ firstResult: { id: 'other-user' } })
      expect(await new D1UserRepository(db).emailBelongsToAnotherUser('taken@test.com', 'current')).toBe(true)
    })

    it('returns false when no other user owns the email', async () => {
      const { db } = makeMockDb({ firstResult: null })
      expect(await new D1UserRepository(db).emailBelongsToAnotherUser('free@test.com', 'current')).toBe(false)
    })
  })
})
