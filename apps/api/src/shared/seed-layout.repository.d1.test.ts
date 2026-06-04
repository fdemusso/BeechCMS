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
})
