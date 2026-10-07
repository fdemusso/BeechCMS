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

describe('D1ContentScanRepository', () => {
  it('returns empty set if seeds list is empty', async () => {
    const { db, prepareMock } = makeMockDb()
    const repo = new D1ContentScanRepository(db)
    const result = await repo.getReferencedMediaKeys([])
    expect(result.size).toBe(0)
    expect(prepareMock).not.toHaveBeenCalled()
  })

  it('skips seeds with no file branches', async () => {
    const { db, prepareMock } = makeMockDb()
    const repo = new D1ContentScanRepository(db)
    const seedWithoutFile: Seed = {
      slug: 'posts',
      label: 'Post',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'title', type: 'text', label: 'Title' },
      ],
    }
    const result = await repo.getReferencedMediaKeys([seedWithoutFile])
    expect(result.size).toBe(0)
    expect(prepareMock).not.toHaveBeenCalled()
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
})
