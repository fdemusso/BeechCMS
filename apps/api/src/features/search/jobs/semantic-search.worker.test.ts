// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { compileR2Manifest, computeVectorJob, deleteVectorJob, updateR2ManifestJob } from './semantic-search.worker'
import type { Seed, JobContext } from '@beechcms/core'

const SEARCH_SEED: Seed = {
  id: 'seed_articles',
  slug: 'articles',
  label: 'Articles',
  labelPlural: 'Articles',
  allowDrafts: false,
  branches: [
    { id: 'br_01', alias: 'title', type: 'text', policies: { public: true, search: true } },
    { id: 'br_02', alias: 'body', type: 'text', policies: { public: true, search: true } },
  ],
}

describe('semantic-search worker and manifest compilation', () => {
  it('compileManifest writes valid .bin and .json files to R2', async () => {
    const vec1 = new Float32Array([0.1, 0.2, 0.3])
    const vec2 = new Float32Array([0.4, 0.5, 0.6])

    const allMock = vi.fn().mockResolvedValue({
      results: [
        { entry_id: 'art-1', vector: vec1.buffer },
        { entry_id: 'art-2', vector: vec2.buffer },
      ],
    })
    const mockDb = {
      prepare: vi.fn().mockReturnValue({ all: allMock }),
    } as unknown as D1Database

    const putMock = vi.fn().mockResolvedValue({})
    const mockSearchR2 = {
      put: putMock,
    } as unknown as R2Bucket

    await compileR2Manifest(SEARCH_SEED, mockDb, mockSearchR2)

    expect(putMock).toHaveBeenCalledTimes(2)

    // Check .bin put
    const binCall = putMock.mock.calls.find((call: any[]) => call[0] === 'articles.bin')
    expect(binCall).toBeDefined()
    const binBuffer = binCall[1] as Uint8Array
    expect(binBuffer).toBeInstanceOf(Uint8Array)
    expect(binBuffer.byteLength).toBe(6 * Float32Array.BYTES_PER_ELEMENT)
    const floatView = new Float32Array(binBuffer.buffer, binBuffer.byteOffset, 6)
    expect(Array.from(floatView)).toEqual(Array.from(new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6])))

    // Check .json put
    const jsonCall = putMock.mock.calls.find((call: any[]) => call[0] === 'articles.json')
    expect(jsonCall).toBeDefined()
    expect(JSON.parse(jsonCall[1])).toEqual(['art-1', 'art-2'])
  })

  it('computeVectorJob generates embedding using Workers AI, saves to D1, and compiles R2', async () => {
    const aiRunMock = vi.fn().mockResolvedValue({
      shape: [1, 3],
      data: [[0.5, 0.25, -0.75]],
    })

    const runMock = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } })
    const allMock = vi.fn().mockResolvedValue({
      results: [{ entry_id: 'art-1', vector: new Float32Array([0.5, 0.25, -0.75]).buffer }],
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
    const mockSearchR2 = { put: putMock } as unknown as R2Bucket

    const mockRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'art-1',
        slug: 'article-one',
        status: 'published',
        title: 'Machine Learning Guide',
        body: 'Intro to Deep Neural Networks',
      }),
    }

    const context: JobContext = {
      repository: mockRepo as any,
      bucket: {} as any,
      clock: {} as any,
      idGenerator: {} as any,
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
    expect(putMock).toHaveBeenCalledWith('articles.bin', expect.any(Uint8Array), expect.any(Object))
    expect(putMock).toHaveBeenCalledWith('articles.json', JSON.stringify(['art-1']), expect.any(Object))
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
    const mockSearchR2 = { put: putMock } as unknown as R2Bucket

    const context: JobContext = {
      repository: {} as any,
      bucket: {} as any,
      clock: {} as any,
      idGenerator: {} as any,
      env: {
        DB: mockDb as any,
        SEARCH_R2: mockSearchR2 as any,
      },
    }

    await updateR2ManifestJob({ seedSlug: 'articles' }, context)

    expect(putMock).toHaveBeenCalledWith('articles.bin', expect.any(Uint8Array), expect.any(Object))
    expect(putMock).toHaveBeenCalledWith('articles.json', JSON.stringify([]), expect.any(Object))
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
    const mockSearchR2 = { put: putMock } as unknown as R2Bucket

    const context: JobContext = {
      repository: {} as any,
      bucket: {} as any,
      clock: {} as any,
      idGenerator: {} as any,
      env: {
        DB: mockDb as any,
        SEARCH_R2: mockSearchR2 as any,
      },
    }

    await deleteVectorJob({ seedSlug: 'articles', entryId: 'art-1' }, context)

    expect(mockDb.prepare).toHaveBeenCalledWith('DELETE FROM vector_articles WHERE entry_id = ?')
    expect(putMock).toHaveBeenCalledWith('articles.bin', expect.any(Uint8Array), expect.any(Object))
    expect(putMock).toHaveBeenCalledWith('articles.json', JSON.stringify([]), expect.any(Object))
  })
})
