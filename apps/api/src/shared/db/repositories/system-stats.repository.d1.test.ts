// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { D1SystemStatsRepository } from './system-stats.repository.d1'

function makeMockDb(firstResult: unknown = null) {
  const runMock = vi.fn().mockResolvedValue({ success: true })
  const firstMock = vi.fn().mockResolvedValue(firstResult)
  // bind() returns the same statement interface for chained calls.
  // The statement also exposes first() directly for queries without bind (e.g. getStorageUsage).
  const bindMock = vi.fn(() => ({ run: runMock, first: firstMock }))
  const stmt = { bind: bindMock, run: runMock, first: firstMock }
  const prepareMock = vi.fn(() => stmt)
  return { db: { prepare: prepareMock } as any, prepareMock, bindMock, runMock, firstMock }
}

describe('D1SystemStatsRepository', () => {
  describe('incrementStorage', () => {
    it('calls UPDATE system_stats with the byte count', async () => {
      const { db, prepareMock, bindMock } = makeMockDb()
      await new D1SystemStatsRepository(db).incrementStorage(512)
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('UPDATE system_stats'))
      expect(bindMock).toHaveBeenCalledWith(512)
    })
  })

  describe('decrementStorage', () => {
    it('calls UPDATE system_stats with MAX(0, ...) and the byte count', async () => {
      const { db, prepareMock, bindMock } = makeMockDb()
      await new D1SystemStatsRepository(db).decrementStorage(256)
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('MAX(0'))
      expect(bindMock).toHaveBeenCalledWith(256)
    })
  })

  describe('setStorage', () => {
    it('calls UPDATE system_stats with the stringified byte count', async () => {
      const { db, prepareMock, bindMock } = makeMockDb()
      await new D1SystemStatsRepository(db).setStorage(1024)
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('UPDATE system_stats'))
      expect(bindMock).toHaveBeenCalledWith('1024')
    })
  })

  describe('getStorageUsage', () => {
    it('parses and returns the integer value from D1', async () => {
      const { db } = makeMockDb({ value: '2048' })
      expect(await new D1SystemStatsRepository(db).getStorageUsage()).toBe(2048)
    })

    it('returns 0 when D1 returns null (stat not initialised)', async () => {
      const { db } = makeMockDb(null)
      expect(await new D1SystemStatsRepository(db).getStorageUsage()).toBe(0)
    })
  })
})
