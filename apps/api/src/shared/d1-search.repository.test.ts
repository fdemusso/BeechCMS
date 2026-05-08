import { describe, it, expect, vi } from 'vitest'
import type { Seed } from '@beechcms/core'
import { D1SearchRepository } from './d1-search.repository'

function makeMockDb(allResults: unknown[] = [], firstResult: unknown = null) {
  const allMock = vi.fn().mockResolvedValue({ results: allResults })
  const firstMock = vi.fn().mockResolvedValue(firstResult)
  const bindMock = vi.fn(() => ({ all: allMock, first: firstMock }))
  const prepareMock = vi.fn(() => ({ bind: bindMock }))
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
        title: 'Hello',
        excerpt: '<mark>Hi</mark>',
        rank: -3.2,
      },
    ])
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
