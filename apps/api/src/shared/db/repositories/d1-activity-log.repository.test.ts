// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { D1ActivityLogRepository } from './d1-activity-log.repository'

function makeMockDb(allResults: unknown[], firstResult: unknown = null) {
  const allMock = vi.fn().mockResolvedValue({ results: allResults })
  const firstMock = vi.fn().mockResolvedValue(firstResult)
  const bindMock = vi.fn<(...args: any[]) => any>(() => ({ all: allMock, first: firstMock }))
  const prepareMock = vi.fn<(...args: any[]) => any>(() => ({ bind: bindMock }))
  return { db: { prepare: prepareMock } as any, prepareMock, bindMock, allMock, firstMock }
}

describe('D1ActivityLogRepository', () => {
  it('maps snake_case rows to camelCase records and parses the details JSON', async () => {
    const row = {
      id: 'log-1',
      user_id: 'u1',
      user_email: 'a@b.com',
      user_name: 'Admin',
      action: 'create',
      entity_type: 'content',
      entity_id: 'e1',
      entity_slug: 'posts',
      details: '{"title":"Hello"}',
      created_at: 1234,
    }
    const { db } = makeMockDb([row])
    const result = await new D1ActivityLogRepository(db).list({ limit: 10 })
    expect(result).toEqual([
      {
        id: 'log-1',
        userId: 'u1',
        userEmail: 'a@b.com',
        userName: 'Admin',
        action: 'create',
        entityType: 'content',
        entityId: 'e1',
        entitySlug: 'posts',
        details: { title: 'Hello' },
        createdAt: 1234,
      },
    ])
  })

  it('returns null details when the column is null', async () => {
    const { db } = makeMockDb([
      {
        id: 'l',
        user_id: 'u',
        user_email: 'a',
        user_name: null,
        action: 'delete',
        entity_type: 'content',
        entity_id: 'e',
        entity_slug: null,
        details: null,
        created_at: 1,
      },
    ])
    const [record] = await new D1ActivityLogRepository(db).list({ limit: 1 })
    expect(record.details).toBeNull()
    expect(record.userName).toBeNull()
    expect(record.entitySlug).toBeNull()
  })

  it('omits the WHERE clause when no filters are provided', async () => {
    const { db, prepareMock, bindMock } = makeMockDb([])
    await new D1ActivityLogRepository(db).list({ limit: 5 })
    expect(prepareMock.mock.calls[0][0]).not.toMatch(/WHERE/)
    expect(bindMock).toHaveBeenCalledWith(5)
  })

  it('builds a userId WHERE clause when the option is set', async () => {
    const { db, prepareMock, bindMock } = makeMockDb([])
    await new D1ActivityLogRepository(db).list({ userId: 'u-9', limit: 3 })
    expect(prepareMock.mock.calls[0][0]).toMatch(/WHERE user_id = \?/)
    expect(bindMock).toHaveBeenCalledWith('u-9', 3)
  })

  it('builds a combined userId + entitySlug WHERE clause with AND', async () => {
    const { db, prepareMock, bindMock } = makeMockDb([])
    await new D1ActivityLogRepository(db).list({ userId: 'u', entitySlug: 'posts', limit: 7 })
    expect(prepareMock.mock.calls[0][0]).toMatch(/WHERE user_id = \? AND entity_slug = \?/)
    expect(bindMock).toHaveBeenCalledWith('u', 'posts', 7)
  })

  it('always orders by created_at DESC and applies LIMIT', async () => {
    const { db, prepareMock } = makeMockDb([])
    await new D1ActivityLogRepository(db).list({ limit: 1 })
    expect(prepareMock.mock.calls[0][0]).toMatch(/ORDER BY created_at DESC/)
    expect(prepareMock.mock.calls[0][0]).toMatch(/LIMIT \?/)
  })

  describe('countSince', () => {
    it('binds action, entityType and sinceTimestamp and returns the count', async () => {
      const { db, prepareMock, bindMock } = makeMockDb([], { count: 42 })
      const result = await new D1ActivityLogRepository(db).countSince({
        action: 'create',
        entityType: 'content',
        sinceTimestamp: 1000,
      })
      expect(result).toBe(42)
      expect(prepareMock.mock.calls[0][0]).toMatch(/COUNT\(\*\)/)
      expect(prepareMock.mock.calls[0][0]).toMatch(/WHERE action = \?\s+AND entity_type = \?\s+AND created_at >= \?/)
      expect(bindMock).toHaveBeenCalledWith('create', 'content', 1000)
    })

    it('returns 0 when no rows match', async () => {
      const { db } = makeMockDb([], null)
      const result = await new D1ActivityLogRepository(db).countSince({
        action: 'delete',
        entityType: 'media',
        sinceTimestamp: 0,
      })
      expect(result).toBe(0)
    })
  })

  it('returns null details when the JSON payload cannot be parsed', async () => {
    const { db } = makeMockDb([
      {
        id: 'l',
        user_id: 'u',
        user_email: 'a',
        user_name: null,
        action: 'create',
        entity_type: 'content',
        entity_id: 'e',
        entity_slug: null,
        details: 'not-json',
        created_at: 1,
      },
    ])
    const [record] = await new D1ActivityLogRepository(db).list({ limit: 1 })
    expect(record.details).toBeNull()
  })
})
