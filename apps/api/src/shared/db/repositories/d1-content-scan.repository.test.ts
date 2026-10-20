// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import type { D1Database } from '@cloudflare/workers-types'
import type { Seed } from '@beechcms/core'
import { D1ContentScanRepository } from './d1-content-scan.repository'

function makeMockDb(allResults: unknown[] = []) {
  const allMock = vi.fn().mockResolvedValue({ results: allResults })
  const prepareMock = vi.fn(() => ({ all: allMock }))
  return { db: { prepare: prepareMock } as any, prepareMock, allMock }
}

function makeMockDbPerQuery(resultsBySql: Record<string, unknown[]>) {
  const prepareMock = vi.fn((sql: string) => ({
    all: vi.fn().mockResolvedValue({ results: resultsBySql[sql] ?? [] }),
  }))
  return { db: { prepare: prepareMock } as any, prepareMock }
}

describe('D1ContentScanRepository', () => {
  it('returns no seed-table keys for an empty seed list, but still scans users for avatars', async () => {
    const { db, prepareMock } = makeMockDb()
    const repo = new D1ContentScanRepository(db)
    const result = await repo.getReferencedMediaKeys([])
    expect(result.size).toBe(0)
    // `users` has no seed representation, so it is scanned unconditionally (#736).
    expect(prepareMock).toHaveBeenCalledWith('SELECT avatar_url FROM users')
    expect(prepareMock).toHaveBeenCalledTimes(1)
  })

  it('skips seeds with no media-bearing branches, but still scans users for avatars', async () => {
    const { db, prepareMock } = makeMockDb()
    const repo = new D1ContentScanRepository(db)
    const seedWithoutMedia: Seed = {
      slug: 'posts',
      label: 'Post',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'title', type: 'text', label: 'Title' },
      ],
    }
    const result = await repo.getReferencedMediaKeys([seedWithoutMedia])
    expect(result.size).toBe(0)
    expect(prepareMock).toHaveBeenCalledWith('SELECT avatar_url FROM users')
    expect(prepareMock).toHaveBeenCalledTimes(1)
  })

  it('extracts referenced media keys from file columns', async () => {
    const mockResults = [
      { cover: '/api/media/image1.jpg', gallery: '/api/media/img2.png /api/media/img3%20spaced.jpg' },
      { cover: null, gallery: 'no-media-here' },
    ]
    const { db, prepareMock } = makeMockDb(mockResults)
    const repo = new D1ContentScanRepository(db)
    const seedWithFiles: Seed = {
      slug: 'articles',
      label: 'Article',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'title', type: 'text', label: 'Title' },
        { id: 'br_02', alias: 'cover', type: 'file', label: 'Cover' },
        { id: 'br_03', alias: 'gallery', type: 'file', label: 'Gallery' },
      ],
    }

    const result = await repo.getReferencedMediaKeys([seedWithFiles])
    expect(prepareMock).toHaveBeenCalledWith('SELECT cover, gallery FROM content_articles')
    expect(result).toEqual(new Set(['image1.jpg', 'img2.png', 'img3 spaced.jpg']))
  })

  it('handles null or missing results gracefully', async () => {
    const allMock = vi.fn().mockResolvedValue({ results: null })
    const prepareMock = vi.fn(() => ({ all: allMock }))
    const db = { prepare: prepareMock } as any
    const repo = new D1ContentScanRepository(db)
    const seedWithFiles: Seed = {
      slug: 'articles',
      label: 'Article',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'cover', type: 'file', label: 'Cover' },
      ],
    }

    const result = await repo.getReferencedMediaKeys([seedWithFiles])
    expect(result.size).toBe(0)
  })

  it('scans the drafts table of a seed that allows drafts', async () => {
    const { db, prepareMock } = makeMockDb([{ cover: '/api/media/draft.jpg' }])
    const repo = new D1ContentScanRepository(db)
    const seedWithDrafts: Seed = {
      slug: 'articles',
      label: 'Article',
      displayNameAlias: 'title',
      allowDrafts: true,
      branches: [{ id: 'br_01', alias: 'cover', type: 'file', label: 'Cover' }],
    }

    const result = await repo.getReferencedMediaKeys([seedWithDrafts])

    expect(prepareMock).toHaveBeenCalledWith('SELECT cover FROM content_articles_drafts')
    expect(result).toEqual(new Set(['draft.jpg']))
  })

  it('skips a content table that does not exist yet', async () => {
    const allMock = vi.fn().mockRejectedValue(new Error('D1_ERROR: no such table: content_articles: SQLITE_ERROR'))
    const db = { prepare: vi.fn(() => ({ all: allMock })) } as unknown as D1Database
    const repo = new D1ContentScanRepository(db)
    const seedWithFiles: Seed = {
      slug: 'articles',
      label: 'Article',
      displayNameAlias: 'title',
      branches: [{ id: 'br_01', alias: 'cover', type: 'file', label: 'Cover' }],
    }

    const result = await repo.getReferencedMediaKeys([seedWithFiles])

    expect(result.size).toBe(0)
  })

  it('propagates any other read failure instead of reporting the files as unreferenced', async () => {
    const allMock = vi.fn().mockRejectedValue(new Error('D1_ERROR: no such column: cover: SQLITE_ERROR'))
    const db = { prepare: vi.fn(() => ({ all: allMock })) } as unknown as D1Database
    const repo = new D1ContentScanRepository(db)
    const seedWithFiles: Seed = {
      slug: 'articles',
      label: 'Article',
      displayNameAlias: 'title',
      branches: [{ id: 'br_01', alias: 'cover', type: 'file', label: 'Cover' }],
    }

    const scan = repo.getReferencedMediaKeys([seedWithFiles])

    await expect(scan).rejects.toThrow('no such column')
  })

  it('handles malformed percent-encoded media URLs without throwing URIError', async () => {
    const mockResults = [
      { cover: '/api/media/valid.jpg', gallery: '/api/media/malformed%99%ZZ% /api/media/another-valid.png' },
    ]
    const { db } = makeMockDb(mockResults)
    const repo = new D1ContentScanRepository(db)
    const seedWithFiles: Seed = {
      slug: 'articles',
      label: 'Article',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'cover', type: 'file', label: 'Cover' },
        { id: 'br_02', alias: 'gallery', type: 'file', label: 'Gallery' },
      ],
    }

    const result = await repo.getReferencedMediaKeys([seedWithFiles])
    expect(result).toEqual(new Set(['valid.jpg', 'another-valid.png']))
  })

  it('extracts referenced media keys embedded in richtext and json columns, not just file columns', async () => {
    const { db, prepareMock } = makeMockDbPerQuery({
      'SELECT cover, body, meta FROM content_articles': [
        {
          cover: '/api/media/cover.jpg',
          body: '<p><img src="/api/media/embedded-richtext.png"></p>',
          meta: '{"gallery":["/api/media/embedded-json.png"]}',
        },
      ],
      'SELECT avatar_url FROM users': [],
    })
    const repo = new D1ContentScanRepository(db)
    const seedWithMixedBranches: Seed = {
      slug: 'articles',
      label: 'Article',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'cover', type: 'file', label: 'Cover' },
        { id: 'br_02', alias: 'body', type: 'richtext', label: 'Body' },
        { id: 'br_03', alias: 'meta', type: 'json', label: 'Meta' },
      ],
    }

    const result = await repo.getReferencedMediaKeys([seedWithMixedBranches])

    expect(prepareMock).toHaveBeenCalledWith('SELECT cover, body, meta FROM content_articles')
    expect(result).toEqual(new Set(['cover.jpg', 'embedded-richtext.png', 'embedded-json.png']))
  })

  it('protects an active user avatar from being reported as an orphan (#736)', async () => {
    const { db, prepareMock } = makeMockDbPerQuery({
      'SELECT avatar_url FROM users': [{ avatar_url: '/api/media/avatar-user.png' }, { avatar_url: null }],
    })
    const repo = new D1ContentScanRepository(db)

    const result = await repo.getReferencedMediaKeys([])

    expect(prepareMock).toHaveBeenCalledWith('SELECT avatar_url FROM users')
    expect(result).toEqual(new Set(['avatar-user.png']))
  })
})
