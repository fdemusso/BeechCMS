// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * @module search/index-contract.test
 * Integration/contract test verifying that the R2 manifest produced by
 * {@link compileR2Manifest} (apps/api) is directly consumable by
 * `SearchClient.loadIndex()` (@beechcms/search-client), closing the schema
 * gap described in issue #407.
 */

import { describe, it, expect, vi } from 'vitest'
import { compileR2Manifest } from './jobs/semantic-search.worker'
import { createBeechSearchClient } from '@beechcms/search-client'
import type { Seed } from '@beechcms/core'

const SEED: Seed = {
  slug: 'articles',
  label: 'Articles',
  displayNameAlias: 'title',
  labelPlural: 'Articles',
  allowDrafts: false,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', policies: { public: true, search: true } },
  ],
}

describe('compileR2Manifest / SearchClient contract', () => {
  it('produces a manifest + vectors pair that SearchClient.loadIndex() accepts', async () => {
    const vec1 = new Float32Array(384).fill(0.01)
    const vec2 = new Float32Array(384).fill(0.02)

    const allMock = vi.fn().mockResolvedValue({
      results: [
        { entry_id: 'art-1', vector: vec1.buffer, title: 'First Post' },
        { entry_id: 'art-2', vector: vec2.buffer, title: 'Second Post' },
      ],
    })
    const mockDb = { prepare: vi.fn().mockReturnValue({ all: allMock }) } as unknown as D1Database

    let manifestBody = ''
    let vectorsBody: Uint8Array | undefined
    const mockSearchR2 = {
      put: vi.fn((key: string, body: any) => {
        if (key === 'articles/manifest.json') manifestBody = body
        if (key === 'articles/vectors.bin') vectorsBody = body
        return Promise.resolve({})
      }),
    } as unknown as R2Bucket

    await compileR2Manifest(SEED, mockDb, mockSearchR2)

    // Simulate the two GET requests SearchClient.loadIndex() issues.
    const originalFetch = global.fetch
    global.fetch = vi.fn(async (url: string | URL) => {
      const href = url.toString()
      if (href === 'https://cdn.test/manifest.json') {
        return new Response(manifestBody, { status: 200 })
      }
      if (href === 'https://cdn.test/vectors.bin') {
        return new Response(vectorsBody!.slice(), { status: 200 })
      }
      throw new Error(`Unexpected fetch: ${href}`)
    }) as any

    try {
      const client = createBeechSearchClient('https://api.test')
      await expect(
        client.loadIndex('https://cdn.test/manifest.json', 'https://cdn.test/vectors.bin'),
      ).resolves.not.toThrow()
    } finally {
      global.fetch = originalFetch
    }
  })
})
