// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { D1NotificationRepository } from './d1-notification.repository'
import { FixedClock } from '../../services/clock/fixed-clock'
import { SequentialIdGenerator } from '../../services/id-generator/sequential-id-generator'

const clock = new FixedClock(1700000000_000)
const makeIdGen = () => new SequentialIdGenerator()

function makeMockDb(opts: { firstResult?: unknown; allResults?: unknown[] } = {}) {
  const { firstResult = null, allResults = [] } = opts
  const runMock = vi.fn().mockResolvedValue({ success: true })
  const firstMock = vi.fn().mockResolvedValue(firstResult)
  const allMock = vi.fn().mockResolvedValue({ results: allResults })
  const bindMock = vi.fn(() => ({ first: firstMock, all: allMock, run: runMock }))
  const prepareMock = vi.fn(() => ({
    bind: bindMock,
    first: firstMock,
    all: allMock,
    run: runMock,
  }))
  return { db: { prepare: prepareMock } as any, prepareMock, bindMock, runMock, firstMock, allMock }
}

describe('D1NotificationRepository', () => {
  describe('list', () => {
    it('maps rows to NotificationRecord with isRead boolean', async () => {
      const { db } = makeMockDb({
        allResults: [
          {
            id: 'n-1',
            title: 'T',
            message: 'M',
            type: 'success',
            is_read: 0,
            created_at: 100,
          },
          {
            id: 'n-2',
            title: 'T2',
            message: 'M2',
            type: 'info',
            is_read: 1,
            created_at: 99,
          },
        ],
      })
      const records = await new D1NotificationRepository(db, clock, makeIdGen()).list(10)
      expect(records).toEqual([
        { id: 'n-1', title: 'T', message: 'M', type: 'success', isRead: false, createdAt: 100 },
        { id: 'n-2', title: 'T2', message: 'M2', type: 'info', isRead: true, createdAt: 99 },
      ])
    })

    it('orders by created_at DESC with LIMIT bound', async () => {
      const { db, prepareMock, bindMock } = makeMockDb()
      await new D1NotificationRepository(db, clock, makeIdGen()).list(25)
      expect(prepareMock.mock.calls[0][0]).toMatch(/ORDER BY created_at DESC/)
      expect(bindMock).toHaveBeenCalledWith(25)
    })
  })

  describe('stats', () => {
    it('returns aggregate counters mapped to camelCase', async () => {
      const { db } = makeMockDb({
        firstResult: { total_count: 7, latest_created_at: 1234, read_count: 3 },
      })
      const stats = await new D1NotificationRepository(db, clock, makeIdGen()).stats()
      expect(stats).toEqual({ totalCount: 7, latestCreatedAt: 1234, readCount: 3 })
    })

    it('returns zeros when the table is empty', async () => {
      const { db } = makeMockDb({
        firstResult: { total_count: 0, latest_created_at: null, read_count: null },
      })
      const stats = await new D1NotificationRepository(db, clock, makeIdGen()).stats()
      expect(stats).toEqual({ totalCount: 0, latestCreatedAt: 0, readCount: 0 })
    })
  })

  describe('create', () => {
    it('inserts a new notification and returns the generated id', async () => {
      const { db, prepareMock, bindMock } = makeMockDb()
      const id = await new D1NotificationRepository(db, clock, makeIdGen()).create({
        title: 'Hello',
        message: 'World',
        type: 'info',
      })
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
      expect(prepareMock.mock.calls[0][0]).toMatch(/INSERT INTO notifications/)
      expect(bindMock).toHaveBeenCalledWith(id, 'Hello', 'World', 'info')
    })
  })

  describe('markRead / markUnread / delete / markAllRead', () => {
    it('markRead binds the given id', async () => {
      const { db, prepareMock, bindMock } = makeMockDb()
      await new D1NotificationRepository(db, clock, makeIdGen()).markRead('n-1')
      expect(prepareMock.mock.calls[0][0]).toMatch(/UPDATE notifications SET is_read = 1 WHERE id = \?/)
      expect(bindMock).toHaveBeenCalledWith('n-1')
    })

    it('markUnread binds the given id', async () => {
      const { db, prepareMock, bindMock } = makeMockDb()
      await new D1NotificationRepository(db, clock, makeIdGen()).markUnread('n-2')
      expect(prepareMock.mock.calls[0][0]).toMatch(/UPDATE notifications SET is_read = 0 WHERE id = \?/)
      expect(bindMock).toHaveBeenCalledWith('n-2')
    })

    it('delete binds the given id', async () => {
      const { db, prepareMock, bindMock } = makeMockDb()
      await new D1NotificationRepository(db, clock, makeIdGen()).delete('n-3')
      expect(prepareMock.mock.calls[0][0]).toMatch(/DELETE FROM notifications WHERE id = \?/)
      expect(bindMock).toHaveBeenCalledWith('n-3')
    })

    it('markAllRead runs without bindings', async () => {
      const { db, prepareMock, runMock } = makeMockDb()
      await new D1NotificationRepository(db, clock, makeIdGen()).markAllRead()
      expect(prepareMock.mock.calls[0][0]).toMatch(/^UPDATE notifications SET is_read = 1$/)
      expect(runMock).toHaveBeenCalled()
    })
  })
})
