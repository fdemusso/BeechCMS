// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { compileR2Manifest, computeVectorJob, deleteVectorJob, updateR2ManifestJob } from './semantic-search.worker'
import { NoOpQueueService } from '@beechcms/core'
import type { Seed, JobContext } from '@beechcms/core'
import type { IndexManifest } from '@beechcms/search-client'

const SEARCH_SEED: Seed = {
  slug: 'articles',
  label: 'Articles',
  displayNameAlias: 'title',
  labelPlural: 'Articles',
  allowDrafts: false,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', policies: { public: true, search: true } },
    { id: 'br_02', alias: 'body', label: 'Body', type: 'richtext', policies: { public: true, search: true } },
  ],
}

describe('semantic-search worker and manifest compilation', () => {
  it('compileR2Manifest writes a compliant IndexManifest and vectors.bin to R2', async () => {
    const vec1 = new Float32Array([0.1, 0.2, 0.3])
    const vec2 = new Float32Array([0.4, 0.5, 0.6])

    const allMock = vi.fn().mockResolvedValue({
      results: [
        { entry_id: 'art-1', vector: vec1.buffer, title: 'First Post' },
        { entry_id: 'art-2', vector: vec2.buffer, title: 'Second Post' },
      ],
    })
    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        all: allMock,
        first: vi.fn().mockResolvedValue({ n: 2 }),
        bind: vi.fn().mockReturnValue({ all: allMock }),
      }),
    } as unknown as D1Database

    const putMock = vi.fn().mockResolvedValue({})
    const mockSearchR2 = {
      head: vi.fn().mockResolvedValue(null),
      put: putMock,
    } as unknown as R2Bucket

    await compileR2Manifest(SEARCH_SEED, mockDb, mockSearchR2)

    expect(putMock).toHaveBeenCalledTimes(2)

    // Check vectors.bin put
    const binCall = putMock.mock.calls.find((call: any[]) => call[0] === 'articles/vectors.bin')
    expect(binCall).toBeDefined()
    const binBuffer = binCall![1] as Uint8Array
    expect(binBuffer).toBeInstanceOf(Uint8Array)
    expect(binBuffer.byteLength).toBe(6 * Float32Array.BYTES_PER_ELEMENT)
    const floatView = new Float32Array(binBuffer.buffer, binBuffer.byteOffset, 6)
    expect(Array.from(floatView)).toEqual(Array.from(new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6])))

    // Check manifest.json put — must satisfy the search-client IndexManifest contract
    const jsonCall = putMock.mock.calls.find((call: any[]) => call[0] === 'articles/manifest.json')
    expect(jsonCall).toBeDefined()
    const manifest = JSON.parse(jsonCall![1]) as IndexManifest
    expect(manifest.model).toBe('@cf/baai/bge-small-en-v1.5')
    expect(manifest.dimensions).toBe(384)
    expect(typeof manifest.fingerprint).toBe('string')
    expect(manifest.fingerprint.length).toBeGreaterThan(0)
    expect(manifest.records).toEqual([
      { id: 'art-1', title: 'First Post' },
      { id: 'art-2', title: 'Second Post' },
    ])
  })

  it('compileR2Manifest changes the fingerprint when vector content changes but id/title do not (#610)', async () => {
    const mockSearchR2 = () => {
      const putMock = vi.fn().mockResolvedValue({})
      return { head: vi.fn().mockResolvedValue(null), put: putMock } as unknown as R2Bucket
    }

    const buildVectorStatement = (rows: { results: unknown[] }) => {
      const all = vi.fn().mockResolvedValue(rows)
      return { all, first: vi.fn().mockResolvedValue({ n: 1 }), bind: vi.fn().mockReturnValue({ all }) }
    }

    const buildDb = (vector: Float32Array) => ({
      prepare: vi.fn().mockReturnValue(buildVectorStatement({
        results: [{ entry_id: 'art-1', vector: vector.buffer, title: 'Same Title' }],
      })),
    }) as unknown as D1Database

    const r2First  = mockSearchR2()
    await compileR2Manifest(SEARCH_SEED, buildDb(new Float32Array([0.1, 0.2, 0.3])), r2First)
    const manifestFirst = JSON.parse(
      (r2First.put as any).mock.calls.find((call: any[]) => call[0] === 'articles/manifest.json')[1],
    ) as IndexManifest

    const r2Second = mockSearchR2()
    await compileR2Manifest(SEARCH_SEED, buildDb(new Float32Array([0.9, 0.8, 0.7])), r2Second)
    const manifestSecond = JSON.parse(
      (r2Second.put as any).mock.calls.find((call: any[]) => call[0] === 'articles/manifest.json')[1],
    ) as IndexManifest

    expect(manifestFirst.records).toEqual(manifestSecond.records)
    expect(manifestFirst.fingerprint).not.toBe(manifestSecond.fingerprint)
  })

  it('computeVectorJob generates embedding using Workers AI, saves to D1, and compiles R2', async () => {
    const embedding = new Array(384).fill(0).map((_, i) => (i === 0 ? 0.5 : i === 1 ? 0.25 : i === 2 ? -0.75 : 0))
    const aiRunMock = vi.fn().mockResolvedValue({
      shape: [1, 384],
      data: [embedding],
    })

    const runMock = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } })
    const allMock = vi.fn().mockResolvedValue({
      results: [{ entry_id: 'art-1', vector: new Float32Array([0.5, 0.25, -0.75]).buffer, title: 'Machine Learning Guide' }],
    })
    const firstMock = vi.fn().mockResolvedValue({
      slug: 'articles',
      definition: JSON.stringify(SEARCH_SEED),
    })

    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({ run: runMock, first: firstMock, all: allMock }),
        first: firstMock,
        all: allMock,
      }),
    } as unknown as D1Database

    const putMock = vi.fn().mockResolvedValue({})
    const mockSearchR2 = { head: vi.fn().mockResolvedValue(null), put: putMock } as unknown as R2Bucket

    const mockRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'art-1',
        slug: 'article-one',
        status: 'published',
        title: 'Machine Learning Guide',
        // Real richtext values are deserialized TipTap doc objects, never plain strings (#451).
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Intro to Deep Neural Networks' }] }],
        },
      }),
    }

    const context: JobContext = {
      repository: mockRepo as any,
      bucket: {} as any,
      clock: {} as any,
      idGenerator: {} as any,
      queue: new NoOpQueueService(),
      env: {
        DB: mockDb as any,
        AI: { run: aiRunMock } as any,
        SEARCH_R2: mockSearchR2 as any,
      },
    }

    await computeVectorJob({ seedSlug: 'articles', entryId: 'art-1' }, context)

    expect(aiRunMock).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', {
      text: 'Machine Learning Guide Intro to Deep Neural Networks',
    })
    expect(putMock).toHaveBeenCalledWith('articles/vectors.bin', expect.any(Uint8Array), expect.any(Object))
    expect(putMock).toHaveBeenCalledWith(
      'articles/manifest.json',
      expect.stringContaining('"id":"art-1","title":"Machine Learning Guide"'),
      expect.any(Object),
    )
  })

  it('updateR2ManifestJob updates manifest in R2', async () => {
    const firstMock = vi.fn().mockResolvedValue({
      slug: 'articles',
      definition: JSON.stringify(SEARCH_SEED),
    })
    const allMock = vi.fn().mockResolvedValue({ results: [] })

    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({ first: firstMock, all: allMock }),
        first: firstMock,
        all: allMock,
      }),
    } as unknown as D1Database

    const putMock = vi.fn().mockResolvedValue({})
    const mockSearchR2 = { head: vi.fn().mockResolvedValue(null), put: putMock } as unknown as R2Bucket

    const context: JobContext = {
      repository: {} as any,
      bucket: {} as any,
      clock: {} as any,
      idGenerator: {} as any,
      queue: new NoOpQueueService(),
      env: {
        DB: mockDb as any,
        SEARCH_R2: mockSearchR2 as any,
      },
    }

    await updateR2ManifestJob({ seedSlug: 'articles' }, context)

    expect(putMock).toHaveBeenCalledWith('articles/vectors.bin', expect.any(Uint8Array), expect.any(Object))
    expect(putMock).toHaveBeenCalledWith(
      'articles/manifest.json',
      expect.stringContaining('"records":[]'),
      expect.any(Object),
    )
  })

  it('deleteVectorJob deletes vector from D1 and recompiles R2 manifest', async () => {
    const runMock = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } })
    const firstMock = vi.fn().mockResolvedValue({
      slug: 'articles',
      definition: JSON.stringify(SEARCH_SEED),
    })
    const allMock = vi.fn().mockResolvedValue({ results: [] })

    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({ run: runMock, first: firstMock, all: allMock }),
        first: firstMock,
        all: allMock,
      }),
    } as unknown as D1Database

    const putMock = vi.fn().mockResolvedValue({})
    const mockSearchR2 = { head: vi.fn().mockResolvedValue(null), put: putMock } as unknown as R2Bucket

    const context: JobContext = {
      repository: {} as any,
      bucket: {} as any,
      clock: {} as any,
      idGenerator: {} as any,
      queue: new NoOpQueueService(),
      env: {
        DB: mockDb as any,
        SEARCH_R2: mockSearchR2 as any,
      },
    }

    await deleteVectorJob({ seedSlug: 'articles', entryId: 'art-1' }, context)

    expect(mockDb.prepare).toHaveBeenCalledWith('DELETE FROM vector_articles WHERE entry_id = ?')
    expect(putMock).toHaveBeenCalledWith('articles/vectors.bin', expect.any(Uint8Array), expect.any(Object))
    expect(putMock).toHaveBeenCalledWith(
      'articles/manifest.json',
      expect.stringContaining('"records":[]'),
      expect.any(Object),
    )
  })

  describe('guard clauses', () => {
    const NO_SEARCH_SEED: Seed = {
      slug: 'prodotti',
      label: 'Prodotti',
      displayNameAlias: 'nome',
      labelPlural: 'Prodotti',
      allowDrafts: false,
      branches: [{ id: 'br_01', alias: 'price', label: 'Price', type: 'number', policies: { public: true } }],
    }

    function seedDb(seed: Seed | null): D1Database {
      const firstMock = vi.fn().mockResolvedValue(
        seed ? { slug: seed.slug, definition: JSON.stringify(seed) } : null,
      )
      const allMock = vi.fn().mockResolvedValue({ results: [] })
      const runMock = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } })
      return {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({ run: runMock, first: firstMock, all: allMock }),
          first: firstMock,
          all: allMock,
        }),
      } as unknown as D1Database
    }

    it('compileR2Manifest is a no-op when searchR2 is undefined', async () => {
      await expect(compileR2Manifest(SEARCH_SEED, {} as D1Database, undefined)).resolves.toBeUndefined()
    })

    it('computeVectorJob skips when the DB binding is missing', async () => {
      const context: JobContext = {
        repository: {} as any, bucket: {} as any, clock: {} as any, idGenerator: {} as any,
        queue: new NoOpQueueService(), env: {},
      }
      await expect(computeVectorJob({ seedSlug: 'articles', entryId: 'art-1' }, context)).resolves.toBeUndefined()
    })

    it('computeVectorJob skips when the seed is not found', async () => {
      const mockDb = seedDb(null)
      const context: JobContext = {
        repository: {} as any, bucket: {} as any, clock: {} as any, idGenerator: {} as any,
        queue: new NoOpQueueService(), env: { DB: mockDb as any },
      }
      await expect(computeVectorJob({ seedSlug: 'articles', entryId: 'art-1' }, context)).resolves.toBeUndefined()
    })

    it('computeVectorJob skips when the seed has no indexable branches', async () => {
      const mockDb = seedDb(NO_SEARCH_SEED)
      const context: JobContext = {
        repository: { findById: vi.fn() } as any, bucket: {} as any, clock: {} as any, idGenerator: {} as any,
        queue: new NoOpQueueService(), env: { DB: mockDb as any },
      }
      await computeVectorJob({ seedSlug: 'prodotti', entryId: 'p-1' }, context)
      expect((context.repository as any).findById).not.toHaveBeenCalled()
    })

    it('computeVectorJob deletes the vector and recompiles when the entry cannot be found', async () => {
      const mockDb = seedDb(SEARCH_SEED)
      const putMock = vi.fn().mockResolvedValue({})
      const context: JobContext = {
        repository: { findById: vi.fn().mockRejectedValue(new Error('not found')) } as any,
        bucket: {} as any, clock: {} as any, idGenerator: {} as any,
        queue: new NoOpQueueService(), env: { DB: mockDb as any, SEARCH_R2: { head: vi.fn().mockResolvedValue(null), put: putMock } as any },
      }
      await computeVectorJob({ seedSlug: 'articles', entryId: 'art-missing' }, context)
      expect(mockDb.prepare).toHaveBeenCalledWith('DELETE FROM vector_articles WHERE entry_id = ?')
      expect(putMock).toHaveBeenCalled()
    })

    it('computeVectorJob deletes the vector and recompiles when the entry is not published', async () => {
      const mockDb = seedDb(SEARCH_SEED)
      const putMock = vi.fn().mockResolvedValue({})
      const context: JobContext = {
        repository: { findById: vi.fn().mockResolvedValue({ status: 'draft' }) } as any,
        bucket: {} as any, clock: {} as any, idGenerator: {} as any,
        queue: new NoOpQueueService(), env: { DB: mockDb as any, SEARCH_R2: { head: vi.fn().mockResolvedValue(null), put: putMock } as any },
      }
      await computeVectorJob({ seedSlug: 'articles', entryId: 'art-draft' }, context)
      expect(mockDb.prepare).toHaveBeenCalledWith('DELETE FROM vector_articles WHERE entry_id = ?')
      expect(putMock).toHaveBeenCalled()
    })

    it('computeVectorJob deletes the vector and recompiles when the entry has no indexable text', async () => {
      const mockDb = seedDb(SEARCH_SEED)
      const putMock = vi.fn().mockResolvedValue({})
      const context: JobContext = {
        repository: { findById: vi.fn().mockResolvedValue({ status: 'published', title: '', body: '' }) } as any,
        bucket: {} as any, clock: {} as any, idGenerator: {} as any,
        queue: new NoOpQueueService(), env: { DB: mockDb as any, SEARCH_R2: { head: vi.fn().mockResolvedValue(null), put: putMock } as any },
      }
      await computeVectorJob({ seedSlug: 'articles', entryId: 'art-empty' }, context)
      expect(mockDb.prepare).toHaveBeenCalledWith('DELETE FROM vector_articles WHERE entry_id = ?')
      expect(putMock).toHaveBeenCalled()
    })

    it('computeVectorJob skips embedding when the AI binding is missing', async () => {
      const mockDb = seedDb(SEARCH_SEED)
      const putMock = vi.fn().mockResolvedValue({})
      const context: JobContext = {
        repository: { findById: vi.fn().mockResolvedValue({ status: 'published', title: 'Hello', body: 'World' }) } as any,
        bucket: {} as any, clock: {} as any, idGenerator: {} as any,
        queue: new NoOpQueueService(), env: { DB: mockDb as any, SEARCH_R2: { head: vi.fn().mockResolvedValue(null), put: putMock } as any },
      }
      await computeVectorJob({ seedSlug: 'articles', entryId: 'art-1' }, context)
      expect(putMock).not.toHaveBeenCalled()
    })

    it('deleteVectorJob skips when the DB binding is missing', async () => {
      const context: JobContext = {
        repository: {} as any, bucket: {} as any, clock: {} as any, idGenerator: {} as any,
        queue: new NoOpQueueService(), env: {},
      }
      await expect(deleteVectorJob({ seedSlug: 'articles', entryId: 'art-1' }, context)).resolves.toBeUndefined()
    })

    it('deleteVectorJob skips when the seed is not found', async () => {
      const mockDb = seedDb(null)
      const context: JobContext = {
        repository: {} as any, bucket: {} as any, clock: {} as any, idGenerator: {} as any,
        queue: new NoOpQueueService(), env: { DB: mockDb as any },
      }
      await expect(deleteVectorJob({ seedSlug: 'articles', entryId: 'art-1' }, context)).resolves.toBeUndefined()
    })

    it('updateR2ManifestJob skips when the DB binding is missing', async () => {
      const context: JobContext = {
        repository: {} as any, bucket: {} as any, clock: {} as any, idGenerator: {} as any,
        queue: new NoOpQueueService(), env: {},
      }
      await expect(updateR2ManifestJob({ seedSlug: 'articles' }, context)).resolves.toBeUndefined()
    })

    it('updateR2ManifestJob skips when the seed is not found', async () => {
      const mockDb = seedDb(null)
      const context: JobContext = {
        repository: {} as any, bucket: {} as any, clock: {} as any, idGenerator: {} as any,
        queue: new NoOpQueueService(), env: { DB: mockDb as any },
      }
      await expect(updateR2ManifestJob({ seedSlug: 'articles' }, context)).resolves.toBeUndefined()
    })
  })
})
