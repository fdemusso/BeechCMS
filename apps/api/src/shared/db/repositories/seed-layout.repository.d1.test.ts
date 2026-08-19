// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { D1SeedLayoutRepository } from './seed-layout.repository.d1'
import type { FormLayout } from '@beechcms/core'

function makeMockDb(opts: { firstResult?: unknown; allResults?: unknown[] } = {}) {
  const { firstResult = null, allResults = [] } = opts
  const runMock = vi.fn().mockResolvedValue({ success: true })
  const firstMock = vi.fn().mockResolvedValue(firstResult)
  const allMock = vi.fn().mockResolvedValue({ results: allResults })
  const bindMock = vi.fn(() => ({ run: runMock, first: firstMock, all: allMock }))
  const stmt = { bind: bindMock, run: runMock, first: firstMock, all: allMock }
  const prepareMock = vi.fn(() => stmt)
  return { db: { prepare: prepareMock } as any, prepareMock, bindMock, runMock, firstMock, allMock }
}

describe('D1SeedLayoutRepository', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('get', () => {
    it('returns null when the layout is not found', async () => {
      const { db } = makeMockDb({ firstResult: null })
      const repo = new D1SeedLayoutRepository(db)
      const res = await repo.get('non-existent')
      expect(res).toBeNull()
    })

    it('returns mapped record when layout is found and layout JSON is parsed', async () => {
      const mockLayout: FormLayout = { tabs: [] }
      const row = {
        slug: 'pages',
        layout: JSON.stringify(mockLayout),
        updated_at: 123456,
        updated_by: 'admin-user',
      }
      const { db, prepareMock, bindMock } = makeMockDb({ firstResult: row })
      const repo = new D1SeedLayoutRepository(db)

      const res = await repo.get('pages')
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('SELECT slug, layout, updated_at, updated_by FROM seed_layouts'))
      expect(bindMock).toHaveBeenCalledWith('pages')
      expect(res).toEqual({
        slug: 'pages',
        layout: mockLayout,
        updatedAt: 123456,
        updatedBy: 'admin-user',
      })
    })
  })

  describe('getAllAsMap', () => {
    it('returns an empty map when there are no records', async () => {
      const { db } = makeMockDb({ allResults: [] })
      const repo = new D1SeedLayoutRepository(db)
      const map = await repo.getAllAsMap()
      expect(map).toBeInstanceOf(Map)
      expect(map.size).toBe(0)
    })

    it('returns a populated map and skips corrupt JSON rows', async () => {
      const allResults = [
        { slug: 'pages', layout: JSON.stringify({ tabs: [{ id: 't1', label: 'T1', sections: [] }] }) },
        { slug: 'corrupted', layout: '{invalid-json' },
        { slug: 'posts', layout: JSON.stringify({ tabs: [{ id: 't2', label: 'T2', sections: [] }] }) },
      ]
      const { db, prepareMock } = makeMockDb({ allResults })
      const repo = new D1SeedLayoutRepository(db)

      const map = await repo.getAllAsMap()
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('SELECT slug, layout FROM seed_layouts'))
      expect(map.size).toBe(2)
      expect(map.get('pages')).toEqual({ tabs: [{ id: 't1', label: 'T1', sections: [] }] })
      expect(map.get('posts')).toEqual({ tabs: [{ id: 't2', label: 'T2', sections: [] }] })
      expect(map.has('corrupted')).toBe(false)
    })
  })

  describe('upsert', () => {
    it('prepares and binds the correct layout layout JSON and timestamp', async () => {
      const mockDate = new Date('2026-06-04T12:00:00Z')
      vi.setSystemTime(mockDate)
      const expectedTimestamp = Math.floor(mockDate.getTime() / 1000)

      const { db, prepareMock, bindMock } = makeMockDb()
      const repo = new D1SeedLayoutRepository(db)

      const layout: FormLayout = { tabs: [{ id: 'tab-1', label: 'Tab 1', sections: [] }] }
      await repo.upsert('articles', layout, 'editor-1')

      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO seed_layouts'))
      expect(bindMock).toHaveBeenCalledWith('articles', JSON.stringify(layout), expectedTimestamp, 'editor-1')
    })
  })

  describe('remove', () => {
    it('deletes the layout by slug', async () => {
      const { db, prepareMock, bindMock } = makeMockDb()
      const repo = new D1SeedLayoutRepository(db)

      await repo.remove('products')
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM seed_layouts WHERE slug = ?'))
      expect(bindMock).toHaveBeenCalledWith('products')
    })
  })

  describe('getViewConfig', () => {
    it('returns null when no row exists', async () => {
      const { db } = makeMockDb({ firstResult: null })
      const repo = new D1SeedLayoutRepository(db)
      expect(await repo.getViewConfig('articles')).toBeNull()
    })

    it('returns null when view_config column is null', async () => {
      const { db } = makeMockDb({ firstResult: { view_config: null } })
      const repo = new D1SeedLayoutRepository(db)
      expect(await repo.getViewConfig('articles')).toBeNull()
    })

    it('returns null when database query throws an error (e.g. missing view_config column in D1)', async () => {
      const db = {
        prepare: vi.fn(() => {
          throw new Error('D1_ERROR: no such column: view_config')
        }),
      } as any
      const repo = new D1SeedLayoutRepository(db)
      expect(await repo.getViewConfig('articles')).toBeNull()
    })

    it('returns null when view_config JSON is corrupt or invalid', async () => {
      const { db } = makeMockDb({ firstResult: { view_config: '{invalid-json' } })
      const repo = new D1SeedLayoutRepository(db)
      expect(await repo.getViewConfig('articles')).toBeNull()
    })

    it('parses and returns a valid view config', async () => {
      const config = { kanban: { axisBranchId: 'br_01', sort: null } }
      const { db, prepareMock, bindMock } = makeMockDb({ firstResult: { view_config: JSON.stringify(config) } })
      const repo = new D1SeedLayoutRepository(db)

      const result = await repo.getViewConfig('articles')
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('SELECT view_config FROM seed_layouts'))
      expect(bindMock).toHaveBeenCalledWith('articles')
      expect(result).toEqual(config)
    })
  })

  describe('setViewConfig', () => {
    it('upserts the view_config column', async () => {
      const { db, prepareMock, bindMock } = makeMockDb()
      const repo = new D1SeedLayoutRepository(db)
      const config = { kanban: { axisBranchId: 'br_02', sort: null } }

      await repo.setViewConfig('posts', config, 'user-1')
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO seed_layouts'))
      expect(bindMock).toHaveBeenCalledWith('posts', JSON.stringify(config), 'user-1')
    })

    it('safely handles reserved prototype property names (e.g. constructor, toString)', async () => {
      const { db, prepareMock, bindMock } = makeMockDb({ firstResult: null })
      const repo = new D1SeedLayoutRepository(db)
      const inputSlug = 'constructor'
      const updatedBy = 'toString'

      const res = await repo.getViewConfig(inputSlug)
      expect(res).toBeNull()
      expect(bindMock).toHaveBeenCalledWith('constructor')

      const config = { kanban: { axisBranchId: 'br_03', sort: null } }
      await repo.setViewConfig(inputSlug, config, updatedBy)
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO seed_layouts'))
      expect(bindMock).toHaveBeenCalledWith('constructor', JSON.stringify(config), 'toString')
    })
  })
})
