// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import type { AppEnv } from '../../../types'
import { fullTextSearchHandler } from './full-text-search'
import { searchRouter } from '../search'
import { SEARCH_ERRORS } from '../constants'
import { decodeCursor } from '../utils/search-utils'
import type { Seed, ISearchRepository, IActivityLogRepository, ContentLastWriter, SearchResultRow } from '@beechcms/core'

const MOCK_SEED: Seed = {
  slug: 'articles',
  label: 'Articles',
  labelPlural: 'Articles',
  displayNameAlias: 'title',
  allowDrafts: false,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', policies: { public: true, search: true } },
    { id: 'br_02', alias: 'body', label: 'Body', type: 'richtext', policies: { public: true, search: true } },
  ],
}

const MOCK_SEED_PAGES: Seed = {
  slug: 'pages',
  label: 'Pages',
  labelPlural: 'Pages',
  displayNameAlias: 'title',
  allowDrafts: false,
  branches: [
    { id: 'br_03', alias: 'title', label: 'Title', type: 'text', policies: { public: true, search: true } },
  ],
}

const GLOBAL_READ_PERMISSIONS = { global: new Set(['content:read']), byScope: new Map() }

function createTestApp(options?: {
  searchRows?: SearchResultRow[]
  total?: number
  searchFn?: (...args: any[]) => Promise<SearchResultRow[]>
  countFn?: (...args: any[]) => Promise<{ total: number }>
  writersFn?: IActivityLogRepository['lastContentWriters']
  seeds?: Seed[]
  effectivePermissions?: { global: Set<string>; byScope: Map<string, Set<string>> }
}) {
  const app = new Hono<AppEnv>()

  const searchMock = options?.searchFn ?? vi.fn().mockResolvedValue(options?.searchRows ?? [])
  const countMock = options?.countFn ?? vi.fn().mockResolvedValue({ total: options?.total ?? 0 })

  const writersMock = options?.writersFn ?? vi.fn().mockResolvedValue([])
  const mockActivityLogRepo: Pick<IActivityLogRepository, 'lastContentWriters'> = {
    lastContentWriters: writersMock,
  }

  const mockSearchRepo: ISearchRepository = {
    search: searchMock,
    count: countMock,
  }

  const seeds = options?.seeds ?? [MOCK_SEED]
  const mockSeedRegistry = {
    all: vi.fn().mockReturnValue(seeds),
    get: vi.fn().mockReturnValue(seeds[0]),
  }

  app.use('*', async (c, next) => {
    c.set('searchRepository', mockSearchRepo as any)
    c.set('activityLogRepository', mockActivityLogRepo as unknown as IActivityLogRepository)
    c.set('seedRegistry', mockSeedRegistry as any)
    c.set('effectivePermissions', (options?.effectivePermissions ?? GLOBAL_READ_PERMISSIONS) as any)
    await next()
  })

  app.get('/search', fullTextSearchHandler)

  return { app, searchMock, countMock, writersMock, mockSeedRegistry }
}

describe('fullTextSearchHandler', () => {
  it('returns 400 QUERY_TOO_SHORT when q param is missing', async () => {
    const { app } = createTestApp()
    const res = await app.request('/search')
    expect(res.status).toBe(400)
    const body = await res.json() as any
    expect(body.error).toBe(SEARCH_ERRORS.QUERY_TOO_SHORT)
  })

  it('returns 400 QUERY_TOO_SHORT when q param is shorter than 2 chars', async () => {
    const { app } = createTestApp()
    const res = await app.request('/search?q=a')
    expect(res.status).toBe(400)
    const body = await res.json() as any
    expect(body.error).toBe(SEARCH_ERRORS.QUERY_TOO_SHORT)
  })

  it('returns 200 with empty items and null nextCursor when no results found', async () => {
    const { app, searchMock, countMock } = createTestApp({ searchRows: [], total: 0 })
    const res = await app.request('/search?q=hello')
    expect(res.status).toBe(200)
    const body = await res.json() as any
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
        limit: 20,
        cursor: null,
      },
      [MOCK_SEED],
    )
    expect(countMock).toHaveBeenCalledWith(
      {
        queryText: 'hello',
        schemaSlug: null,
        statusFilter: null,
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
      expect.objectContaining({ limit: 1 }),
      expect.any(Array),
    )

    // Above max
    await app.request('/search?q=hello&limit=100')
    expect(searchMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 50 }),
      expect.any(Array),
    )
  })

  it('falls back to the default pageSize (20) when limit is not a number', async () => {
    const { app, searchMock } = createTestApp({ searchRows: [], total: 0 })

    // parseInt yields NaN for these; NaN survives Math.min/Math.max and would be bound into SQL LIMIT.
    for (const limit of ['abc', '', 'NaN']) {
      const response = await app.request(`/search?q=hello&limit=${limit}`)

      expect(response.status).toBe(200)
      expect(searchMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ limit: 20 }),
        expect.any(Array),
      )
    }
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
      updatedAt: 1_700_000_000,
      title: 'First Post',
      excerpt: 'A snippet with <mark>highlighted</mark> text and <p>tags</p>',
      rank: -2.5,
    }
    const { app } = createTestApp({ searchRows: [row], total: 1 })
    const res = await app.request('/search?q=first')
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toEqual({
      id: 'e-1',
      schema_slug: 'articles',
      slug: 'first-post',
      status: 'published',
      updated_at: 1_700_000_000,
      author_name: null,
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
      updatedAt: 1_700_000_000,
      title: 'Post 1',
      excerpt: 'Snippet 1',
      rank: -5.0,
    }
    const row2: SearchResultRow = {
      entryId: 'e-2',
      schemaSlug: 'articles',
      slug: 'post-2',
      status: 'published',
      updatedAt: 1_700_000_000,
      title: 'Post 2',
      excerpt: 'Snippet 2',
      rank: -4.0,
    }
    const row3: SearchResultRow = {
      entryId: 'e-3',
      schemaSlug: 'articles',
      slug: 'post-3',
      status: 'published',
      updatedAt: 1_700_000_000,
      title: 'Post 3',
      excerpt: 'Snippet 3',
      rank: -3.0,
    }

    // Limit 2, returned 3 rows -> has next page
    const { app } = createTestApp({ searchRows: [row1, row2, row3], total: 10 })
    const res = await app.request('/search?q=post&limit=2')
    expect(res.status).toBe(200)
    const body = await res.json() as any

    expect(body.items).toHaveLength(2)
    expect(body.items[0].id).toBe('e-1')
    expect(body.items[1].id).toBe('e-2')
    expect(body.nextCursor).toBeTruthy()

    const decoded = decodeCursor(body.nextCursor!)
    expect(decoded?.rank).toBe(-4.0)
    expect(decoded?.entryId).toBe('e-2')
    expect(body.total).toBe(10)
  })

  it('a scoped caller: searchRepository.search receives only the readable seeds', async () => {
    const { app, searchMock, countMock } = createTestApp({
      searchRows: [],
      total: 0,
      seeds: [MOCK_SEED, MOCK_SEED_PAGES],
      effectivePermissions: { global: new Set(), byScope: new Map([['articles', new Set(['content:read'])]]) },
    })
    await app.request('/search?q=hello')
    expect(searchMock).toHaveBeenCalledWith(expect.anything(), [MOCK_SEED])
    expect(countMock).toHaveBeenCalledWith(expect.anything(), [MOCK_SEED])
  })

  it('schema_slug naming an unreadable seed returns 200 { items: [], total: 0 } without calling the repository', async () => {
    const { app, searchMock, countMock } = createTestApp({
      seeds: [MOCK_SEED, MOCK_SEED_PAGES],
      effectivePermissions: { global: new Set(), byScope: new Map([['articles', new Set(['content:read'])]]) },
    })
    const res = await app.request('/search?q=hello&schema_slug=pages')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ items: [], nextCursor: null, total: 0 })
    expect(searchMock).not.toHaveBeenCalled()
    expect(countMock).not.toHaveBeenCalled()
  })

  describe('author metadata', () => {
    const WRITTEN_ID = '3f2b8c1e-5a7d-4e9b-8c6a-1d2e3f4a5b6c'
    const UNWRITTEN_ID = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d'
    const EXTRA_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'

    function articleRow(entryId: string, overrides: Partial<SearchResultRow> = {}): SearchResultRow {
      return {
        entryId,
        schemaSlug: 'articles',
        slug: 'post',
        status: 'published',
        updatedAt: 1_700_000_000,
        title: 'Post',
        excerpt: 'Snippet',
        rank: -1,
        ...overrides,
      }
    }

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('each item carries the display name of its writer and a row without a writer carries author_name null', async () => {
      const writers: ContentLastWriter[] = [{ entryId: WRITTEN_ID, userName: 'Jane Doe', userEmail: 'jane@example.com' }]
      const { app } = createTestApp({
        searchRows: [articleRow(WRITTEN_ID), articleRow(UNWRITTEN_ID, { rank: -0.5 })],
        total: 2,
        writersFn: vi.fn().mockResolvedValue(writers),
      })

      const response = await app.request('/search?q=post')

      expect(response.status).toBe(200)
      const body = (await response.json()) as { items: { id: string; author_name: string | null }[] }
      expect(body.items.find((item) => item.id === WRITTEN_ID)?.author_name).toBe('Jane Doe')
      expect(body.items.find((item) => item.id === UNWRITTEN_ID)?.author_name).toBeNull()
    })

    it('lastContentWriters receives exactly the ids of the returned page and never the has-more sentinel row', async () => {
      const { app, writersMock } = createTestApp({
        searchRows: [articleRow(WRITTEN_ID), articleRow(EXTRA_ID, { rank: -0.5 })],
        total: 2,
      })

      const response = await app.request('/search?q=post&limit=1')

      expect(response.status).toBe(200)
      const body = (await response.json()) as { items: { id: string }[]; nextCursor: string | null }
      expect(body.items.map((item) => item.id)).toEqual([WRITTEN_ID])
      expect(body.nextCursor).not.toBeNull()
      expect(writersMock).toHaveBeenCalledTimes(1)
      expect(writersMock).toHaveBeenCalledWith([WRITTEN_ID])
    })

    it('an empty page answers 200 without calling lastContentWriters', async () => {
      const { app, writersMock } = createTestApp({ searchRows: [], total: 0 })

      const response = await app.request('/search?q=post')

      expect(response.status).toBe(200)
      const body = (await response.json()) as { items: unknown[] }
      expect(body.items).toEqual([])
      expect(writersMock).not.toHaveBeenCalled()
    })

    it('a rejecting lastContentWriters still answers 200 with author_name null and the other fields intact', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const { app } = createTestApp({
        searchRows: [articleRow(WRITTEN_ID), articleRow(UNWRITTEN_ID, { rank: -0.5 })],
        total: 2,
        writersFn: vi.fn().mockRejectedValue(new Error('d1 unavailable')),
      })

      const response = await app.request('/search?q=post')

      expect(response.status).toBe(200)
      const body = (await response.json()) as {
        items: { id: string; author_name: string | null; updated_at: number; status: string }[]
        total: number
      }
      expect(body.items.map((item) => item.author_name)).toEqual([null, null])
      expect(body.items.map((item) => item.updated_at)).toEqual([1_700_000_000, 1_700_000_000])
      expect(body.items.map((item) => item.status)).toEqual(['published', 'published'])
      expect(body.total).toBe(2)
    })
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
