// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { listHandler } from './list'

vi.mock('../../../public/problem-details', () => ({
  publicProblem: vi.fn((_ctx, details) => ({ mockProblem: true, ...details })),
}))

vi.mock('../../../shared/policies/apply-policies', () => ({
  applyVisibility: vi.fn((item: Record<string, unknown>) => item),
}))

const SEED = {
  slug: 'articles',
  label: 'Articles',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
    { id: 'br_02', alias: 'author', label: 'Author', type: 'relation', targetSeed: 'authors' },
  ],
}

const AUTHOR_SEED_DEF = {
  slug: 'authors',
  label: 'Authors',
  displayNameAlias: 'name',
  branches: [{ id: 'br_a1', alias: 'name', label: 'Name', type: 'text' }],
}

function makeContext() {
  const listItems = [{ id: 'entry-1', title: 'Post', author: 'author-1' }]
  const targetItems = [{ id: 'author-1', name: 'Jane Doe' }]

  const findMany = vi.fn()
    .mockResolvedValueOnce({ items: listItems, total: 1 })
    .mockResolvedValueOnce({ items: targetItems, total: 1 })

  const jsonMock = vi.fn((data: unknown) => ({ json: data }))
  const ctx = {
    req: {
      param: vi.fn(() => 'articles'),
      query: vi.fn(() => ({ page: '1' })),
    },
    get: vi.fn((key: string) => {
      if (key === 'getSeed') return () => SEED
      if (key === 'repository') return { findMany, hasDraft: vi.fn().mockResolvedValue(false) }
      if (key === 'seedRegistry') return { get: (s: string) => (s === 'authors' ? AUTHOR_SEED_DEF : undefined) }
      return undefined
    }),
    json: jsonMock,
  }
  return { ctx, jsonMock }
}

describe('listHandler relations map', () => {
  it('resolves relation labels from flat rows instead of item.data', async () => {
    const { ctx, jsonMock } = makeContext()

    await listHandler(ctx as never)

    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: { author: { 'author-1': 'Jane Doe' } },
      }),
    )
  })
})
