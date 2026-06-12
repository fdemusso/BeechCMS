// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { D1SchemaMutator } from './schema-mutator.d1'

function makeMockDb() {
  const runMock = vi.fn().mockResolvedValue({ success: true })
  const firstMock = vi.fn().mockResolvedValue(null)
  const allMock = vi.fn().mockResolvedValue({ results: [] })
  const bindMock = vi.fn(() => ({ run: runMock, first: firstMock, all: allMock }))
  const stmt = { bind: bindMock, run: runMock, first: firstMock, all: allMock }
  const prepareMock = vi.fn(() => stmt)
  const batchMock = vi.fn().mockResolvedValue([])

  return {
    db: {
      prepare: prepareMock,
      batch: batchMock,
    } as unknown as D1Database,
    prepareMock,
    bindMock,
    runMock,
    firstMock,
    allMock,
    batchMock,
  }
}

describe('D1SchemaMutator', () => {
  describe('getColumns', () => {
    it('returns null if table has no columns (empty result)', async () => {
      const { db, allMock } = makeMockDb()
      allMock.mockResolvedValueOnce({ results: [] })
      const mutator = new D1SchemaMutator(db)
      const cols = await mutator.getColumns('users')
      expect(cols).toBeNull()
    })

    it('returns set of column names when columns are found', async () => {
      const { db, allMock, prepareMock } = makeMockDb()
      allMock.mockResolvedValueOnce({
        results: [{ name: 'id' }, { name: 'email' }],
      })
      const mutator = new D1SchemaMutator(db)
      const cols = await mutator.getColumns('users')
      expect(prepareMock).toHaveBeenCalledWith('PRAGMA table_info(users)')
      expect(cols).toEqual(new Set(['id', 'email']))
    })

    it('throws error if table name is unsafe', async () => {
      const { db } = makeMockDb()
      const mutator = new D1SchemaMutator(db)
      await expect(mutator.getColumns('users; DROP TABLE users;')).rejects.toThrow(
        'Unsafe table name',
      )
    })
  })

  describe('execDdl', () => {
    it('returns early if statements are empty', async () => {
      const { db, batchMock } = makeMockDb()
      const mutator = new D1SchemaMutator(db)
      await mutator.execDdl([])
      expect(batchMock).not.toHaveBeenCalled()
    })

    it('prepares and executes batch DDL statements', async () => {
      const { db, batchMock, prepareMock } = makeMockDb()
      const mutator = new D1SchemaMutator(db)
      await mutator.execDdl(['CREATE TABLE test (id TEXT)', 'CREATE INDEX idx ON test (id)'])
      expect(prepareMock).toHaveBeenCalledTimes(2)
      expect(batchMock).toHaveBeenCalled()
    })
  })

  describe('dropTable', () => {
    it('executes DROP TABLE IF EXISTS for a safe identifier', async () => {
      const { db, prepareMock, runMock } = makeMockDb()
      const mutator = new D1SchemaMutator(db)
      await mutator.dropTable('articles')
      expect(prepareMock).toHaveBeenCalledWith('DROP TABLE IF EXISTS articles')
      expect(runMock).toHaveBeenCalled()
    })

    it('throws error on unsafe table name', async () => {
      const { db } = makeMockDb()
      const mutator = new D1SchemaMutator(db)
      await expect(mutator.dropTable('articles; --')).rejects.toThrow('Unsafe identifier')
    })
  })

  describe('dropColumn', () => {
    it('executes ALTER TABLE DROP COLUMN for safe identifiers', async () => {
      const { db, prepareMock, runMock } = makeMockDb()
      const mutator = new D1SchemaMutator(db)
      await mutator.dropColumn('articles', 'title')
      expect(prepareMock).toHaveBeenCalledWith('ALTER TABLE articles DROP COLUMN title')
      expect(runMock).toHaveBeenCalled()
    })

    it('throws error on unsafe column name', async () => {
      const { db } = makeMockDb()
      const mutator = new D1SchemaMutator(db)
      await expect(mutator.dropColumn('articles', 'title;')).rejects.toThrow('Unsafe identifier')
    })
  })

  describe('renameColumn', () => {
    it('executes ALTER TABLE RENAME COLUMN for safe identifiers', async () => {
      const { db, prepareMock, runMock } = makeMockDb()
      const mutator = new D1SchemaMutator(db)
      await mutator.renameColumn('articles', 'old_name', 'new_name')
      expect(prepareMock).toHaveBeenCalledWith('ALTER TABLE articles RENAME COLUMN old_name TO new_name')
      expect(runMock).toHaveBeenCalled()
    })

    it('throws error on unsafe parameters', async () => {
      const { db } = makeMockDb()
      const mutator = new D1SchemaMutator(db)
      await expect(mutator.renameColumn('articles', 'old', 'new --')).rejects.toThrow('Unsafe identifier')
    })
  })

  describe('execDestructive', () => {
    it('returns early if statements are empty', async () => {
      const { db, batchMock } = makeMockDb()
      const mutator = new D1SchemaMutator(db)
      await mutator.execDestructive([])
      expect(batchMock).not.toHaveBeenCalled()
    })

    it('prepares and executes batch destructive statements', async () => {
      const { db, batchMock, prepareMock } = makeMockDb()
      const mutator = new D1SchemaMutator(db)
      await mutator.execDestructive(['DROP TABLE test'])
      expect(prepareMock).toHaveBeenCalledWith('DROP TABLE test')
      expect(batchMock).toHaveBeenCalled()
    })
  })
})
