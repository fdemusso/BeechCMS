// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import type { Seed } from '@beechcms/core'
import { D1WidgetRepository } from './d1-widget.repository'

function makeMockDb(allResults: unknown[] = [], firstResult: unknown = null) {
  const allMock = vi.fn().mockResolvedValue({ results: allResults })
  const firstMock = vi.fn().mockResolvedValue(firstResult)
  const bindMock = vi.fn<(...args: any[]) => any>(() => ({ all: allMock, first: firstMock }))
  const prepareMock = vi.fn<(...args: any[]) => any>(() => ({ all: allMock, first: firstMock, bind: bindMock }))
  return { db: { prepare: prepareMock } as any, prepareMock, bindMock, allMock, firstMock }
}

const seed: Seed = {
  slug: 'posts',
  label: 'Post',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', type: 'text', label: 'Title' },
    { id: 'br_02', alias: 'price', type: 'number', label: 'Price' },
  ],
}

describe('D1WidgetRepository', () => {
  describe('aggregate', () => {
    it('returns 0 when no rows match', async () => {
      const { db } = makeMockDb([], null)
      const value = await new D1WidgetRepository(db).aggregate(seed, { op: 'count' }, 'all')
      expect(value).toBe(0)
    })

    it('builds COUNT(*) for op=count', async () => {
      const { db, prepareMock } = makeMockDb([], { computed_value: 7 })
      const value = await new D1WidgetRepository(db).aggregate(seed, { op: 'count' }, 'week')
      expect(value).toBe(7)
      const sql = prepareMock.mock.calls[0]![0] as string
      expect(sql).toMatch(/COUNT\(\*\)/)
      expect(sql).toMatch(/FROM content_posts/)
      expect(sql).toMatch(/created_at > unixepoch\('now', '-7 days'\)/)
    })

    it('throws UNSAFE_COLUMN when column alias is unknown', async () => {
      const { db } = makeMockDb()
      await expect(
        new D1WidgetRepository(db).aggregate(seed, { op: 'sum', column: 'unknown' }, 'all'),
      ).rejects.toThrow('UNSAFE_COLUMN')
    })

    it('builds SUM(CAST(... AS REAL)) for valid column', async () => {
      const { db, prepareMock } = makeMockDb([], { computed_value: 42 })
      await new D1WidgetRepository(db).aggregate(seed, { op: 'sum', column: 'price' }, 'all')
      expect(prepareMock.mock.calls[0]![0] as string).toMatch(/SUM\(CAST\(price AS REAL\)\)/)
    })

    it('builds countWhere using bound parameters for boolean, number, string, and null', async () => {
      const { db: dbBool, prepareMock: prepareBool, bindMock: bindBool } = makeMockDb([], { computed_value: 3 })
      await new D1WidgetRepository(dbBool).aggregate(seed, { op: 'countWhere', column: 'title', value: true }, 'all')
      expect(prepareBool.mock.calls[0]![0] as string).toMatch(/COUNT\(CASE WHEN title = \? THEN 1 END\)/)
      expect(bindBool).toHaveBeenCalledWith(1)

      const { db: dbNum, prepareMock: prepareNum, bindMock: bindNum } = makeMockDb([], { computed_value: 5 })
      await new D1WidgetRepository(dbNum).aggregate(seed, { op: 'countWhere', column: 'price', value: 99.9 }, 'all')
      expect(prepareNum.mock.calls[0]![0] as string).toMatch(/COUNT\(CASE WHEN CAST\(price AS REAL\) = \? THEN 1 END\)/)
      expect(bindNum).toHaveBeenCalledWith(99.9)

      const { db: dbStr, prepareMock: prepareStr, bindMock: bindStr } = makeMockDb([], { computed_value: 2 })
      await new D1WidgetRepository(dbStr).aggregate(seed, { op: 'countWhere', column: 'title', value: "O'Reilly" }, 'all')
      expect(prepareStr.mock.calls[0]![0] as string).toMatch(/COUNT\(CASE WHEN title = \? THEN 1 END\)/)
      expect(bindStr).toHaveBeenCalledWith("O'Reilly")

      const { db: dbNull, prepareMock: prepareNull, bindMock: bindNull } = makeMockDb([], { computed_value: 0 })
      await new D1WidgetRepository(dbNull).aggregate(seed, { op: 'countWhere', column: 'title', value: null }, 'all')
      expect(prepareNull.mock.calls[0]![0] as string).toMatch(/COUNT\(CASE WHEN title IS NULL THEN 1 END\)/)
      expect(bindNull).toHaveBeenCalledWith()
    })

    it('rejects prototype property keys (constructor, toString, __proto__) in aggregate column', async () => {
      const { db } = makeMockDb()
      await expect(
        new D1WidgetRepository(db).aggregate(seed, { op: 'countWhere', column: 'constructor', value: 'test' }, 'all'),
      ).rejects.toThrow('UNSAFE_COLUMN')
      await expect(
        new D1WidgetRepository(db).aggregate(seed, { op: 'countWhere', column: 'toString', value: 'test' }, 'all'),
      ).rejects.toThrow('UNSAFE_COLUMN')
    })
  })

  describe('growth', () => {
    it('runs two queries with current and previous filters', async () => {
      const allMock = vi.fn().mockResolvedValue({ results: [] })
      const firstMock = vi
        .fn()
        .mockResolvedValueOnce({ computed_value: 10 })
        .mockResolvedValueOnce({ computed_value: 5 })
      const bindMock = vi.fn(() => ({ all: allMock, first: firstMock }))
      const prepareMock = vi.fn(() => ({ all: allMock, first: firstMock, bind: bindMock }))
      const db = { prepare: prepareMock } as any

      const result = await new D1WidgetRepository(db).growth(seed, { op: 'count' }, 'month')
      expect(result).toEqual({ currentValue: 10, previousValue: 5 })
      expect(prepareMock).toHaveBeenCalledTimes(2)
      const sql0 = (prepareMock.mock.calls[0] as any[])[0] as string
      const sql1 = (prepareMock.mock.calls[1] as any[])[0] as string
      expect(sql0).toMatch(/-1 month/)
      expect(sql1).toMatch(/-2 months/)
    })

    it('returns zeros when both queries are empty', async () => {
      const { db } = makeMockDb([], null)
      const result = await new D1WidgetRepository(db).growth(seed, { op: 'count' }, 'all')
      expect(result).toEqual({ currentValue: 0, previousValue: 0 })
    })
  })

  describe('leaderboard', () => {
    it('uses ORDER BY DESC by default and binds only the limit', async () => {
      const { db, prepareMock, bindMock } = makeMockDb([
        { id: 'a', label: 'A', score: 9 },
      ])
      const entries = await new D1WidgetRepository(db).leaderboard(seed, {
        scoreColumn: 'price',
        limit: 5,
        orderDirection: 'DESC',
      })
      expect(entries).toEqual([{ id: 'a', label: 'A', score: 9 }])
      const sql = prepareMock.mock.calls[0]![0] as string
      expect(sql).toMatch(/ORDER BY CAST\(price AS REAL\) DESC/)
      expect(bindMock).toHaveBeenCalledWith(5)
    })

    it('uses ORDER BY ASC when requested', async () => {
      const { db, prepareMock } = makeMockDb([])
      await new D1WidgetRepository(db).leaderboard(seed, {
        scoreColumn: 'price',
        limit: 3,
        orderDirection: 'ASC',
      })
      expect(prepareMock.mock.calls[0]![0] as string).toMatch(/ORDER BY CAST\(price AS REAL\) ASC/)
    })

    it('falls back to id when label is null', async () => {
      const { db } = makeMockDb([{ id: 'x', label: null, score: 1 }])
      const [entry] = await new D1WidgetRepository(db).leaderboard(seed, {
        scoreColumn: 'price',
        limit: 1,
        orderDirection: 'DESC',
      })
      expect(entry).toEqual({ id: 'x', label: 'x', score: 1 })
    })
  })

  describe('list', () => {
    it('returns raw rows and totalCount', async () => {
      const allMock = vi.fn().mockResolvedValue({ results: [{ id: '1', slug: 's', status: 'published', created_at: 1, updated_at: 2, title: 'T', price: 10 }] })
      const firstMock = vi.fn().mockResolvedValue({ total: 7 })
      const bindMock = vi.fn(() => ({ all: allMock, first: firstMock }))
      const prepareMock = vi.fn(() => ({ all: allMock, first: firstMock, bind: bindMock }))
      const db = { prepare: prepareMock } as any

      const result = await new D1WidgetRepository(db).list(seed, { limit: 10, offset: 0 })
      expect(result.totalCount).toBe(7)
      expect(result.entries[0]?.title).toBe('T')
    })

    it('appends search LIKE filter against displayNameAlias column', async () => {
      const { db, prepareMock, bindMock } = makeMockDb([], { total: 0 })
      await new D1WidgetRepository(db).list(seed, { limit: 5, offset: 0, search: 'hello' })
      const sql = (prepareMock.mock.calls[1]?.[0] ?? prepareMock.mock.calls[0]![0]) as string
      expect(sql).toMatch(/title LIKE \? ESCAPE '\\'/)
      expect(bindMock).toHaveBeenCalledWith('%hello%', 5, 0)
    })

    it('escapes %, _ and \\ in search LIKE filter', async () => {
      const { db, prepareMock, bindMock } = makeMockDb([], { total: 0 })
      await new D1WidgetRepository(db).list(seed, { limit: 5, offset: 0, search: 'a%b_c\\d' })
      const sql = (prepareMock.mock.calls[1]?.[0] ?? prepareMock.mock.calls[0]![0]) as string
      expect(sql).toMatch(/title LIKE \? ESCAPE '\\'/)
      expect(bindMock).toHaveBeenCalledWith('%a\\%b\\_c\\\\d%', 5, 0)
    })

    it('skips filters with unknown operator', async () => {
      const { db, prepareMock } = makeMockDb([], { total: 0 })
      await new D1WidgetRepository(db).list(seed, {
        limit: 5,
        offset: 0,
        filters: [{ column: 'price', op: 'haxx', value: 1 }],
      })
      const dataSql = prepareMock.mock.calls[1]![0] as string
      expect(dataSql).not.toMatch(/haxx/)
    })

    it('skips filters with unsafe column', async () => {
      const { db, prepareMock } = makeMockDb([], { total: 0 })
      await new D1WidgetRepository(db).list(seed, {
        limit: 5,
        offset: 0,
        filters: [{ column: 'evil', op: 'eq', value: 1 }],
      })
      const dataSql = prepareMock.mock.calls[1]![0] as string
      expect(dataSql).not.toMatch(/evil/)
    })

    it('uses ORDER BY DESC branch when requested', async () => {
      const { db, prepareMock } = makeMockDb([], { total: 0 })
      await new D1WidgetRepository(db).list(seed, {
        limit: 5,
        offset: 0,
        orderByColumn: 'price',
        orderDirection: 'DESC',
      })
      const dataSql = prepareMock.mock.calls[1]![0] as string
      expect(dataSql).toMatch(/ORDER BY price DESC/)
    })

    it('falls back to created_at when orderByColumn is unsafe', async () => {
      const { db, prepareMock } = makeMockDb([], { total: 0 })
      await new D1WidgetRepository(db).list(seed, {
        limit: 5,
        offset: 0,
        orderByColumn: 'evil',
      })
      const dataSql = prepareMock.mock.calls[1]![0] as string
      expect(dataSql).toMatch(/ORDER BY created_at/)
    })
  })

  describe('timeseries', () => {
    it('groups by date bucket on created_at', async () => {
      const { db, prepareMock } = makeMockDb([
        { bucket_label: '2026-01-01', bucket_value: 3 },
      ])
      const points = await new D1WidgetRepository(db).timeseries(
        seed,
        { op: 'count' },
        'all',
        'created_at',
      )
      expect(points).toEqual([{ label: '2026-01-01', value: 3 }])
      const sql = prepareMock.mock.calls[0]![0] as string
      expect(sql).toMatch(/strftime\('%Y-%m-%d', created_at, 'unixepoch'\)/)
      expect(sql).toMatch(/GROUP BY bucket_label/)
    })

    it('CASTs non-system group columns as INTEGER', async () => {
      const { db, prepareMock } = makeMockDb([])
      await new D1WidgetRepository(db).timeseries(seed, { op: 'count' }, 'all', 'price')
      const sql = prepareMock.mock.calls[0]![0] as string
      expect(sql).toMatch(/CAST\(price AS INTEGER\)/)
    })

    it('throws UNSAFE_COLUMN for invalid groupColumn', async () => {
      const { db } = makeMockDb()
      await expect(
        new D1WidgetRepository(db).timeseries(seed, { op: 'count' }, 'all', 'evil'),
      ).rejects.toThrow('UNSAFE_COLUMN')
    })
  })

  describe('distribution', () => {
    it('groups by column value, descending by count', async () => {
      const { db, prepareMock, bindMock } = makeMockDb([
        { label: 'published', value: 5 },
        { label: 'draft', value: 2 },
      ])
      const slices = await new D1WidgetRepository(db).distribution(seed, 'title', 'all', 8)
      expect(slices).toEqual([
        { label: 'published', value: 5 },
        { label: 'draft', value: 2 },
      ])
      const sql = prepareMock.mock.calls[0]![0] as string
      expect(sql).toMatch(/SELECT title as label, COUNT\(\*\) as value/)
      expect(sql).toMatch(/FROM content_posts/)
      expect(sql).toMatch(/GROUP BY title/)
      expect(sql).toMatch(/ORDER BY value DESC/)
      expect(bindMock).toHaveBeenCalledWith(8)
    })

    it('labels NULL values as ∅', async () => {
      const { db } = makeMockDb([{ label: null, value: 3 }])
      const slices = await new D1WidgetRepository(db).distribution(seed, 'title', 'all', 8)
      expect(slices).toEqual([{ label: '∅', value: 3 }])
    })

    it('returns [] on empty results', async () => {
      const { db } = makeMockDb([])
      const slices = await new D1WidgetRepository(db).distribution(seed, 'title', 'all', 8)
      expect(slices).toEqual([])
    })

    it('applies the time window bracket', async () => {
      const { db, prepareMock } = makeMockDb([])
      await new D1WidgetRepository(db).distribution(seed, 'title', 'week', 8)
      const sql = prepareMock.mock.calls[0]![0] as string
      expect(sql).toMatch(/created_at > unixepoch\('now', '-7 days'\)/)
    })

    it('throws UNSAFE_COLUMN for invalid column', async () => {
      const { db } = makeMockDb()
      await expect(
        new D1WidgetRepository(db).distribution(seed, 'evil', 'all', 8),
      ).rejects.toThrow('UNSAFE_COLUMN')
    })
  })
})
