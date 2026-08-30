// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { D1VectorRepository } from './d1-vector.repository'
import type { Seed } from '@beechcms/core'

const TEST_SEED: Seed = {
  id: 'seed_articles',
  slug: 'articles',
  label: 'Articles',
  labelPlural: 'Articles',
  allowDrafts: false,
  branches: [
    { id: 'br_01', alias: 'title', type: 'text', policies: { public: true, search: true } },
    { id: 'br_02', alias: 'content', type: 'richtext', policies: { public: true, search: true } },
  ],
}

describe('D1VectorRepository', () => {
  it('correctly serializes Float32Array into SQLite BLOB on saveVector', async () => {
    const bindMock = vi.fn().mockReturnValue({
      run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
    })
    const prepareMock = vi.fn().mockReturnValue({ bind: bindMock })
    const mockDb = { prepare: prepareMock } as unknown as D1Database

    const repo = new D1VectorRepository(mockDb)
    const vector = new Float32Array([0.1, -0.25, 0.75, 1.5])

    await repo.saveVector(TEST_SEED, 'entry-123', vector)

    expect(prepareMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO vector_articles (entry_id, vector) VALUES (?, ?) ON CONFLICT(entry_id) DO UPDATE SET vector = ?'),
    )

    expect(bindMock).toHaveBeenCalled()
    const [entryId, blob1, blob2] = bindMock.mock.calls[0]
    expect(entryId).toBe('entry-123')
    expect(blob1).toBeInstanceOf(Uint8Array)
    expect(blob2).toBeInstanceOf(Uint8Array)
    expect(blob1.byteLength).toBe(vector.byteLength)
  })

  it('correctly deletes vector from table on deleteVector', async () => {
    const runMock = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } })
    const bindMock = vi.fn().mockReturnValue({ run: runMock })
    const prepareMock = vi.fn().mockReturnValue({ bind: bindMock })
    const mockDb = { prepare: prepareMock } as unknown as D1Database

    const repo = new D1VectorRepository(mockDb)
    await repo.deleteVector(TEST_SEED, 'entry-123')

    expect(prepareMock).toHaveBeenCalledWith('DELETE FROM vector_articles WHERE entry_id = ?')
    expect(bindMock).toHaveBeenCalledWith('entry-123')
    expect(runMock).toHaveBeenCalled()
  })

  it('correctly deserializes SQLite BLOBs back into Float32Array on getAllVectors', async () => {
    const vec1 = new Float32Array([0.1, 0.2, 0.3])
    const vec2 = new Float32Array([-0.5, 0.8, -0.1])

    const allMock = vi.fn().mockResolvedValue({
      results: [
        { entry_id: 'e1', vector: vec1.buffer },
        { entry_id: 'e2', vector: new Uint8Array(vec2.buffer) },
      ],
    })
    const prepareMock = vi.fn().mockReturnValue({ all: allMock })
    const mockDb = { prepare: prepareMock } as unknown as D1Database

    const repo = new D1VectorRepository(mockDb)
    const results = await repo.getAllVectors(TEST_SEED)

    expect(prepareMock).toHaveBeenCalledWith('SELECT entry_id, vector FROM vector_articles')
    expect(results).toHaveLength(2)
    expect(results[0].entryId).toBe('e1')
    expect(Array.from(results[0].vector)).toEqual(Array.from(vec1))
    expect(results[1].entryId).toBe('e2')
    expect(Array.from(results[1].vector)).toEqual(Array.from(vec2))
  })
})
