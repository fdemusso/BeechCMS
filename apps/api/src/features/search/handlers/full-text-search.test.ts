// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import type { AppEnv } from '../../../types'
import { fullTextSearchHandler } from './full-text-search'
import { searchRouter } from '../search'
import { SEARCH_ERRORS } from '../constants'
import { decodeCursor } from '../utils/search-utils'
import type { Seed, ISearchRepository, SearchResultRow } from '@beechcms/core'

const MOCK_SEED: Seed = {
  id: 'seed_articles',
  slug: 'articles',
  label: 'Articles',
  labelPlural: 'Articles',
  displayNameAlias: 'title',
  allowDrafts: false,
  branches: [
    { id: 'br_01', alias: 'title', type: 'text', policies: { public: true, search: true } },
    { id: 'br_02', alias: 'body', type: 'richtext', policies: { public: true, search: true } },
  ],
}

function createTestApp(options?: {
  searchRows?: SearchResultRow[]
  total?: number
  searchFn?: (...args: any[]) => Promise<SearchResultRow[]>
  countFn?: (...args: any[]) => Promise<{ total: number }>
}) {
  const app = new Hono<AppEnv>()

  const searchMock = options?.searchFn ?? vi.fn().mockResolvedValue(options?.searchRows ?? [])
  const countMock = options?.countFn ?? vi.fn().mockResolvedValue({ total: options?.total ?? 0 })

  const mockSearchRepo: ISearchRepository = {
    search: searchMock,
    count: countMock,
  }

  const mockSeedRegistry = {
    all: vi.fn().mockReturnValue([MOCK_SEED]),
    get: vi.fn().mockReturnValue(MOCK_SEED),
  }

  app.use('*', async (c, next) => {
    c.set('searchRepository', mockSearchRepo as any)
    c.set('seedRegistry', mockSeedRegistry as any)
    await next()
  })

  app.get('/search', fullTextSearchHandler)

  return { app, searchMock, countMock, mockSeedRegistry }
}

describe('fullTextSearchHandler', () => {
  it('returns 400 QUERY_TOO_SHORT when q param is missing', async () => {
    const { app } = createTestApp()
    const res = await app.request('/search')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe(SEARCH_ERRORS.QUERY_TOO_SHORT)
  })

  it('returns 400 QUERY_TOO_SHORT when q param is shorter than 2 chars', async () => {
    const { app } = createTestApp()
    const res = await app.request('/search?q=a')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe(SEARCH_ERRORS.QUERY_TOO_SHORT)
  })

  it('returns 200 with empty items and null nextCursor when no results found', async () => {
    const { app, searchMock, countMock } = createTestApp({ searchRows: [], total: 0 })
    const res = await app.request('/search?q=hello')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      items: [],
      nextCursor: null,
      total: 0,
    })
    expect(searchMock).toHaveBeenCalledWith(
      {
        queryText: 'hello',
        schemaSlug: null,
        statusFilter: null,
        pageSize: 20,
        cursor: null,
      },
      [MOCK_SEED],
    )
    expect(countMock).toHaveBeenCalledWith(
      {
        queryText: 'hello',
        schemaSlug: null,
        statusFilter: null,
        pageSize: 0,
        cursor: null,
      },
      [MOCK_SEED],
    )
  })

  it('parses schema_slug and status filter parameters', async () => {
    const { app, searchMock, countMock } = createTestApp({ searchRows: [], total: 0 })
    const res = await app.request('/search?q=hello&schema_slug=articles&status=published')
    expect(res.status).toBe(200)

    expect(searchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryText: 'hello',
        schemaSlug: 'articles',
        statusFilter: 'published',
      }),
      [MOCK_SEED],
    )
    expect(countMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryText: 'hello',
        schemaSlug: 'articles',
        statusFilter: 'published',
      }),
      [MOCK_SEED],
    )
  })

  it('clamps pageSize to minimum (1) and maximum (50)', async () => {
    const { app, searchMock } = createTestApp({ searchRows: [], total: 0 })

    // Below min
    await app.request('/search?q=hello&limit=0')
    expect(searchMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageSize: 1 }),
      expect.any(Array),
    )

    // Above max
    await app.request('/search?q=hello&limit=100')
    expect(searchMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageSize: 50 }),
      expect.any(Array),
    )
  })

  it('propagates cursor query parameter', async () => {
    const { app, searchMock } = createTestApp({ searchRows: [], total: 0 })
    await app.request('/search?q=hello&cursor=some-cursor-token')
    expect(searchMock).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: 'some-cursor-token' }),
      expect.any(Array),
    )
  })

  it('maps result rows to wire format SearchResultItem', async () => {
    const row: SearchResultRow = {
      entryId: 'e-1',
      schemaSlug: 'articles',
      slug: 'first-post',
      status: 'published',
      title: 'First Post',
      excerpt: 'A snippet with <mark>highlighted</mark> text and <p>tags</p>',
      rank: -2.5,
    }
    const { app } = createTestApp({ searchRows: [row], total: 1 })
    const res = await app.request('/search?q=first')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toEqual({
      id: 'e-1',
      schema_slug: 'articles',
      slug: 'first-post',
      status: 'published',
      title: 'First Post',
      excerpt: 'A snippet with <mark>highlighted</mark> text and tags',
      data: {},
    })
    expect(body.nextCursor).toBeNull()
    expect(body.total).toBe(1)
  })

  it('generates nextCursor when results exceed requested pageSize', async () => {
    const row1: SearchResultRow = {
      entryId: 'e-1',
      schemaSlug: 'articles',
      slug: 'post-1',
      status: 'published',
      title: 'Post 1',
      excerpt: 'Snippet 1',
      rank: -5.0,
    }
    const row2: SearchResultRow = {
      entryId: 'e-2',
      schemaSlug: 'articles',
      slug: 'post-2',
      status: 'published',
      title: 'Post 2',
      excerpt: 'Snippet 2',
      rank: -4.0,
    }
    const row3: SearchResultRow = {
      entryId: 'e-3',
      schemaSlug: 'articles',
      slug: 'post-3',
      status: 'published',
      title: 'Post 3',
      excerpt: 'Snippet 3',
      rank: -3.0,
    }

    // Limit 2, returned 3 rows -> has next page
    const { app } = createTestApp({ searchRows: [row1, row2, row3], total: 10 })
    const res = await app.request('/search?q=post&limit=2')
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.items).toHaveLength(2)
    expect(body.items[0].id).toBe('e-1')
    expect(body.items[1].id).toBe('e-2')
    expect(body.nextCursor).toBeTruthy()

    const decoded = decodeCursor(body.nextCursor!)
    expect(decoded?.rank).toBe(-4.0)
    expect(decoded?.entryId).toBe('e-2')
    expect(body.total).toBe(10)
  })
})

describe('searchRouter (auth middleware protection)', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const app = new Hono<AppEnv>()
    app.route('/api/search', searchRouter)

    const res = await app.request('/api/search?q=test')
    expect(res.status).toBe(401)
  })
})
