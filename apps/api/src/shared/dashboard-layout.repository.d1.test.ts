// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { D1DashboardLayoutRepository } from './dashboard-layout.repository.d1'
import type { DashboardLayout } from '@beechcms/core'

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

const sampleLayout: DashboardLayout = {
  version: 1,
  pages: [
    {
      id: 'page-1',
      slug: 'overview',
      label: 'Overview',
      sections: [
        {
          id: 'section-1',
          columns: [{ id: 'col-1', widgets: [] }],
        },
      ],
    },
  ],
}

describe('D1DashboardLayoutRepository', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('get', () => {
    it('returns null when the layout is not found', async () => {
      const { db } = makeMockDb({ firstResult: null })
      const repo = new D1DashboardLayoutRepository(db)
      const res = await repo.get('default')
      expect(res).toBeNull()
    })

    it('returns mapped record when layout is found and layout JSON is parsed', async () => {
      const row = {
        scope: 'default',
        layout: JSON.stringify(sampleLayout),
        updated_at: 123456,
        updated_by: 'admin-user',
      }
      const { db, prepareMock, bindMock } = makeMockDb({ firstResult: row })
      const repo = new D1DashboardLayoutRepository(db)

      const res = await repo.get('default')
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('SELECT scope, layout, updated_at, updated_by FROM dashboard_layouts'))
      expect(bindMock).toHaveBeenCalledWith('default')
      expect(res).toEqual({
        scope: 'default',
        layout: sampleLayout,
        updatedAt: 123456,
        updatedBy: 'admin-user',
      })
    })

    it('returns null without throwing when the stored layout JSON is corrupt', async () => {
      const row = {
        scope: 'default',
        layout: '{invalid-json',
        updated_at: 123456,
        updated_by: 'admin-user',
      }
      const { db } = makeMockDb({ firstResult: row })
      const repo = new D1DashboardLayoutRepository(db)

      const res = await repo.get('default')
      expect(res).toBeNull()
    })
  })

  describe('listScopes', () => {
    it('returns an empty array when there are no rows', async () => {
      const { db } = makeMockDb({ allResults: [] })
      const repo = new D1DashboardLayoutRepository(db)
      const scopes = await repo.listScopes()
      expect(scopes).toEqual([])
    })

    it('returns the stored scopes', async () => {
      const allResults = [{ scope: 'default' }, { scope: 'role:admin' }]
      const { db, prepareMock } = makeMockDb({ allResults })
      const repo = new D1DashboardLayoutRepository(db)

      const scopes = await repo.listScopes()
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('SELECT scope FROM dashboard_layouts'))
      expect(scopes).toEqual(['default', 'role:admin'])
    })
  })

  describe('upsert', () => {
    it('prepares and binds the correct layout JSON and timestamp', async () => {
      const mockDate = new Date('2026-06-04T12:00:00Z')
      vi.setSystemTime(mockDate)
      const expectedTimestamp = Math.floor(mockDate.getTime() / 1000)

      const { db, prepareMock, bindMock } = makeMockDb()
      const repo = new D1DashboardLayoutRepository(db)

      await repo.upsert('default', sampleLayout, 'admin-1')

      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO dashboard_layouts'))
      expect(bindMock).toHaveBeenCalledWith('default', JSON.stringify(sampleLayout), expectedTimestamp, 'admin-1')
    })
  })

  describe('remove', () => {
    it('deletes the layout by scope', async () => {
      const { db, prepareMock, bindMock } = makeMockDb()
      const repo = new D1DashboardLayoutRepository(db)

      await repo.remove('default')
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM dashboard_layouts WHERE scope = ?'))
      expect(bindMock).toHaveBeenCalledWith('default')
    })
  })
})
