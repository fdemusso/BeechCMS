import { describe, it, expect, vi } from 'vitest'
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
        { alias: 'title', type: 'text', label: 'Title' },
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
        { alias: 'title', type: 'text', label: 'Title' },
        { alias: 'cover', type: 'file', label: 'Cover' },
        { alias: 'gallery', type: 'file', label: 'Gallery' },
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
        { alias: 'cover', type: 'file', label: 'Cover' },
      ],
    }

    const result = await repo.getReferencedMediaKeys([seedWithFiles])
    expect(result.size).toBe(0)
  })
})
