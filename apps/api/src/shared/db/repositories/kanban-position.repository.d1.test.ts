// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { D1KanbanPositionRepository } from './kanban-position.repository.d1'

function makeMockDb(opts: { allResults?: unknown[]; batchResult?: unknown } = {}) {
  const { allResults = [], batchResult = [] } = opts
  const runMock = vi.fn().mockResolvedValue({ success: true })
  const allMock = vi.fn().mockResolvedValue({ results: allResults })
  const batchMock = vi.fn().mockResolvedValue(batchResult)
  const bindMock = vi.fn(() => ({ run: runMock, all: allMock }))
  const stmt = { bind: bindMock, run: runMock, all: allMock }
  const prepareMock = vi.fn(() => stmt)
  return { db: { prepare: prepareMock, batch: batchMock } as any, prepareMock, bindMock, runMock, allMock, batchMock }
}

describe('D1KanbanPositionRepository', () => {
  describe('getColumn', () => {
    it('returns empty map when no rows found', async () => {
      const { db } = makeMockDb({ allResults: [] })
      const repo = new D1KanbanPositionRepository(db)
      const map = await repo.getColumn('tasks', 'br_01')
      expect(map.size).toBe(0)
    })

    it('returns map of entryId → position', async () => {
      const { db } = makeMockDb({ allResults: [
        { entry_id: 'e1', position: 'a0' },
        { entry_id: 'e2', position: 'b0' },
      ] })
      const repo = new D1KanbanPositionRepository(db)
      const map = await repo.getColumn('tasks', 'br_01')
      expect(map.get('e1')).toBe('a0')
      expect(map.get('e2')).toBe('b0')
    })

    it('queries with correct seed_slug and axis_branch_id bindings', async () => {
      const { db, bindMock } = makeMockDb()
      const repo = new D1KanbanPositionRepository(db)
      await repo.getColumn('tasks', 'br_42')
      expect(bindMock).toHaveBeenCalledWith('tasks', 'br_42')
    })
  })

  describe('setPosition', () => {
    it('calls prepare with upsert SQL and correct bindings', async () => {
      const { db, prepareMock, bindMock } = makeMockDb()
      const repo = new D1KanbanPositionRepository(db)
      await repo.setPosition('tasks', 'e1', 'br_01', 'a0')
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO kanban_positions'))
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT'))
      expect(bindMock).toHaveBeenCalledWith('tasks', 'e1', 'br_01', 'a0')
    })
  })

  describe('remove', () => {
    it('calls DELETE with correct bindings', async () => {
      const { db, prepareMock, bindMock } = makeMockDb()
      const repo = new D1KanbanPositionRepository(db)
      await repo.remove('tasks', 'e1', 'br_01')
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM kanban_positions'))
      expect(bindMock).toHaveBeenCalledWith('tasks', 'e1', 'br_01')
    })
  })

  describe('rebalance', () => {
    it('does nothing when ordered list is empty', async () => {
      const { db, batchMock } = makeMockDb()
      const repo = new D1KanbanPositionRepository(db)
      await repo.rebalance('tasks', 'br_01', [])
      expect(batchMock).not.toHaveBeenCalled()
    })

    it('calls db.batch with one statement per record', async () => {
      const { db, batchMock } = makeMockDb()
      const repo = new D1KanbanPositionRepository(db)
      await repo.rebalance('tasks', 'br_01', [
        { entryId: 'e1', position: 'a0' },
        { entryId: 'e2', position: 'b0' },
      ])
      expect(batchMock).toHaveBeenCalledTimes(1)
      const stmts = batchMock.mock.calls[0][0]
      expect(stmts).toHaveLength(2)
    })
  })
})
