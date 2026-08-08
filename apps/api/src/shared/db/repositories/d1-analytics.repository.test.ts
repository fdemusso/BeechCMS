// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { D1AnalyticsRepository } from './d1-analytics.repository'
import { FixedClock } from '../../services/clock/fixed-clock'

const FIXED_NOW_MS = 1700000000_000
const EXPECTED_DAY_BUCKET = Math.floor(FIXED_NOW_MS / 1000 / 86400) * 86400

function makeMockDb(allResults: unknown[] = [], firstResult: unknown = null) {
  const allMock = vi.fn().mockResolvedValue({ results: allResults })
  const firstMock = vi.fn().mockResolvedValue(firstResult)
  const runMock = vi.fn().mockResolvedValue({ success: true })
  const bindMock = vi.fn<(...args: any[]) => any>(() => ({ all: allMock, first: firstMock, run: runMock }))
  const prepareMock = vi.fn<(...args: any[]) => any>(() => ({ bind: bindMock }))
  return { db: { prepare: prepareMock } as any, prepareMock, bindMock, allMock, firstMock, runMock }
}

describe('D1AnalyticsRepository', () => {
  describe('recordRequest', () => {
    it('issues an INSERT ... ON CONFLICT upsert with seed and computed day bucket', async () => {
      const { db, prepareMock, bindMock, runMock } = makeMockDb()
      await new D1AnalyticsRepository(db, new FixedClock(FIXED_NOW_MS)).recordRequest('posts')
      const sql = prepareMock.mock.calls[0]![0] as string
      expect(sql).toMatch(/INSERT INTO analytics/)
      expect(sql).toMatch(/ON CONFLICT\(day_ts, metric, seed\) DO UPDATE SET value = value \+ 1/)
      expect(bindMock).toHaveBeenCalledWith(EXPECTED_DAY_BUCKET, 'posts')
      expect(runMock).toHaveBeenCalled()
    })
  })

  describe('sumByMetric', () => {
    it('binds requests metric, seed and since', async () => {
      const { db, prepareMock, bindMock } = makeMockDb([], { total: 99 })
      const total = await new D1AnalyticsRepository(db, new FixedClock(FIXED_NOW_MS)).sumByMetric('requests', 'posts', 1)
      expect(total).toBe(99)
      const sql = prepareMock.mock.calls[0]![0] as string
      expect(sql).toMatch(/SELECT SUM\(value\) as total/)
      expect(sql).toMatch(/WHERE metric = \? AND seed = \? AND day_ts >= \?/)
      expect(bindMock).toHaveBeenCalledWith('requests', 'posts', 1)
    })

    it('returns 0 when SUM is null', async () => {
      const { db } = makeMockDb([], { total: null })
      const total = await new D1AnalyticsRepository(db, new FixedClock(FIXED_NOW_MS)).sumByMetric('visitors', '', 0)
      expect(total).toBe(0)
    })

    it('returns 0 when no row matches', async () => {
      const { db } = makeMockDb([], null)
      const total = await new D1AnalyticsRepository(db, new FixedClock(FIXED_NOW_MS)).sumByMetric('requests', '', 0)
      expect(total).toBe(0)
    })
  })

  describe('groupByMetric', () => {
    it('returns a date_label → count map filtered to metric=requests', async () => {
      const { db, prepareMock, bindMock } = makeMockDb([
        { date_label: '2026-01-01', daily_count: 10 },
        { date_label: '2026-01-02', daily_count: 20 },
      ])
      const result = await new D1AnalyticsRepository(db, new FixedClock(FIXED_NOW_MS)).groupByMetric('posts', 1)
      expect(result).toEqual({ '2026-01-01': 10, '2026-01-02': 20 })
      const sql = prepareMock.mock.calls[0]![0] as string
      expect(sql).toMatch(/strftime\('%Y-%m-%d', day_ts, 'unixepoch'\)/)
      expect(sql).toMatch(/metric = 'requests'/)
      expect(bindMock).toHaveBeenCalledWith('posts', 1)
    })

    it('skips rows with null date_label', async () => {
      const { db } = makeMockDb([{ date_label: null, daily_count: 5 }])
      const result = await new D1AnalyticsRepository(db, new FixedClock(FIXED_NOW_MS)).groupByMetric('', 0)
      expect(result).toEqual({})
    })
  })
})
