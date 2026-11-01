// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { FixedClock } from '@beechcms/testing'
import { D1DashboardLayoutRepository } from './dashboard-layout.repository.d1'
import type { DashboardLayout } from '@beechcms/core'

function makeMockDb(opts: { firstResult?: unknown; allResults?: unknown[]; changes?: number } = {}) {
  const { firstResult = null, allResults = [], changes = 1 } = opts
  const runMock = vi.fn().mockResolvedValue({ success: true, meta: { changes } })
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

const FIXED_NOW_MS = Date.UTC(2026, 5, 4, 12, 0, 0)

describe('D1DashboardLayoutRepository', () => {
  describe('get', () => {
    it('returns null when the layout is not found', async () => {
      const { db } = makeMockDb({ firstResult: null })
      const repo = new D1DashboardLayoutRepository(db, new FixedClock(FIXED_NOW_MS))
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
      const repo = new D1DashboardLayoutRepository(db, new FixedClock(FIXED_NOW_MS))

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
      const repo = new D1DashboardLayoutRepository(db, new FixedClock(FIXED_NOW_MS))

      const res = await repo.get('default')
      expect(res).toBeNull()
    })
  })

  describe('save', () => {
    it('with a null expectation inserts only when no row exists, stamped from the injected clock, and returns the new version', async () => {
      const expectedTimestamp = Math.floor(FIXED_NOW_MS / 1000)
      const { db, prepareMock, bindMock } = makeMockDb({ firstResult: { updated_at: expectedTimestamp } })
      const repo = new D1DashboardLayoutRepository(db, new FixedClock(FIXED_NOW_MS))

      const result = await repo.save('default', sampleLayout, 'admin-1', null)

      expect(prepareMock).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO dashboard_layouts[\s\S]*ON CONFLICT\(scope\) DO NOTHING[\s\S]*RETURNING updated_at/))
      expect(bindMock).toHaveBeenCalledWith('default', JSON.stringify(sampleLayout), expectedTimestamp, 'admin-1')
      expect(result).toEqual({ ok: true, updatedAt: expectedTimestamp })
    })

    it('with a null expectation reports a conflict when a row already exists', async () => {
      const { db } = makeMockDb({ firstResult: null })
      const repo = new D1DashboardLayoutRepository(db, new FixedClock(FIXED_NOW_MS))

      const result = await repo.save('default', sampleLayout, 'admin-1', null)

      expect(result).toEqual({ ok: false })
    })

    it('with a number updates only the row at that version, bound in statement order, and reports a conflict when none matches', async () => {
      const expectedTimestamp = Math.floor(FIXED_NOW_MS / 1000)
      const { db, prepareMock, bindMock } = makeMockDb({ firstResult: null })
      const repo = new D1DashboardLayoutRepository(db, new FixedClock(FIXED_NOW_MS))

      const result = await repo.save('default', sampleLayout, 'admin-1', 41)

      expect(prepareMock).toHaveBeenCalledWith(expect.stringMatching(/UPDATE dashboard_layouts[\s\S]*MAX\(\?, updated_at \+ 1\)[\s\S]*WHERE scope = \? AND updated_at = \?[\s\S]*RETURNING updated_at/))
      expect(bindMock).toHaveBeenCalledWith(JSON.stringify(sampleLayout), expectedTimestamp, 'admin-1', 'default', 41)
      expect(result).toEqual({ ok: false })
    })
  })

  describe('remove', () => {
    it('with a number deletes the row at that version and reports a conflict when nothing was deleted', async () => {
      const { db, prepareMock, bindMock } = makeMockDb({ changes: 0 })
      const repo = new D1DashboardLayoutRepository(db, new FixedClock(FIXED_NOW_MS))

      const result = await repo.remove('default', 41)

      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM dashboard_layouts WHERE scope = ? AND updated_at = ?'))
      expect(bindMock).toHaveBeenCalledWith('default', 41)
      expect(result).toEqual({ ok: false })
    })

    it('with a null expectation reports a conflict when a row is present', async () => {
      const { db } = makeMockDb({ firstResult: { present: 1 } })
      const repo = new D1DashboardLayoutRepository(db, new FixedClock(FIXED_NOW_MS))

      const result = await repo.remove('default', null)

      expect(result).toEqual({ ok: false })
    })

    it('with a null expectation succeeds as a no-op when no row is stored', async () => {
      const { db } = makeMockDb({ firstResult: null })
      const repo = new D1DashboardLayoutRepository(db, new FixedClock(FIXED_NOW_MS))

      const result = await repo.remove('default', null)

      expect(result).toEqual({ ok: true, updatedAt: null })
    })
  })
})
