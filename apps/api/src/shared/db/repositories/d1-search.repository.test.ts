// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import type { Seed } from '@beechcms/core'
import { D1SearchRepository } from './d1-search.repository'

function makeMockDb(allResults: unknown[] = [], firstResult: unknown = null) {
  const allMock = vi.fn().mockResolvedValue({ results: allResults })
  const firstMock = vi.fn().mockResolvedValue(firstResult)
  const bindMock = vi.fn<(...args: any[]) => any>(() => ({ all: allMock, first: firstMock }))
  const prepareMock = vi.fn<(...args: any[]) => any>(() => ({ bind: bindMock }))
  return { db: { prepare: prepareMock } as any, prepareMock, bindMock, allMock, firstMock }
}

const seeds: Seed[] = [
  {
    slug: 'posts',
    label: 'Post',
    displayNameAlias: 'title',
    branches: [
      { id: 'br_01', alias: 'title', type: 'text', label: 'Title' },
      { id: 'br_02', alias: 'body',  type: 'richtext', label: 'Body' },
    ],
  },
]

describe('D1SearchRepository', () => {
  it('maps FtsRow to camelCase SearchResultRow', async () => {
    const ftsRow = {
      entry_id: 'e1',
      schema_slug: 'posts',
      slug: 'hello',
      status: 'published',
      updated_at: 1_700_000_000,
      title: 'Hello',
      excerpt: '<mark>Hi</mark>',
      rank: -3.2,
    }
    const { db } = makeMockDb([ftsRow])
    const result = await new D1SearchRepository(db).search(
      { queryText: 'hello world', schemaSlug: null, statusFilter: null, limit: 10, cursor: null },
      seeds,
    )
    expect(result).toEqual([
      {
        entryId: 'e1',
        schemaSlug: 'posts',
        slug: 'hello',
        status: 'published',
        updatedAt: 1_700_000_000,
        title: 'Hello',
        excerpt: '<mark>Hi</mark>',
        rank: -3.2,
      },
    ])
  })

  it('the per-seed SELECT and the empty sentinel both project updated_at right after status', async () => {
    const searchable = makeMockDb()
    const sentinel = makeMockDb()
    const noSearchableSeeds: Seed[] = [{ slug: 'plain', label: 'Plain', displayNameAlias: 'name', branches: [] }]

    await new D1SearchRepository(searchable.db).search(
      { queryText: 'hello', schemaSlug: null, statusFilter: null, limit: 10, cursor: null },
      seeds,
    )
    await new D1SearchRepository(sentinel.db).search(
      { queryText: 'hello', schemaSlug: null, statusFilter: null, limit: 10, cursor: null },
      noSearchableSeeds,
    )

    // UNION ALL is positional: both arms must list updated_at in the same column slot.
    expect(searchable.prepareMock.mock.calls[0]![0]).toContain('ce.slug, ce.status, ce.updated_at,')
    expect(sentinel.prepareMock.mock.calls[0]![0]).toContain('NULL as status, NULL as updated_at, NULL as title')
  })

  it('returns [] on EMPTY_QUERY (single-character terms)', async () => {
    const { db, prepareMock } = makeMockDb()
    const result = await new D1SearchRepository(db).search(
      { queryText: 'a', schemaSlug: null, statusFilter: null, limit: 10, cursor: null },
      seeds,
    )
    expect(result).toEqual([])
    expect(prepareMock).not.toHaveBeenCalled()
  })

  it('count returns { total: 0 } on EMPTY_QUERY', async () => {
    const { db } = makeMockDb()
    const result = await new D1SearchRepository(db).count(
      { queryText: 'a', schemaSlug: null, statusFilter: null },
      seeds,
    )
    expect(result).toEqual({ total: 0 })
  })

  it('count returns total from countSql', async () => {
    const { db, prepareMock } = makeMockDb([], { total: 17 })
    const result = await new D1SearchRepository(db).count(
      { queryText: 'hello', schemaSlug: null, statusFilter: null },
      seeds,
    )
    expect(result).toEqual({ total: 17 })
    const sql = prepareMock.mock.calls[0]![0] as string
    expect(sql).toMatch(/SUM\(c\)/)
  })
})
