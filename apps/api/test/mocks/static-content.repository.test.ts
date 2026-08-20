// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { Seed } from '@beechcms/core'
import { StaticContentRepository } from './static-content.repository'

const testSeed: Seed = {
  slug: 'posts',
  label: 'Post',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
    { id: 'br_02', alias: 'category', label: 'Category', type: 'text' },
    { id: 'br_03', alias: 'views', label: 'Views', type: 'number' },
  ],
}

describe('StaticContentRepository filterLogic and security', () => {
  const repo = new StaticContentRepository([testSeed])
  repo.load('posts', [
    { id: '1', slug: 'post-1', status: 'published', title: 'First Post', category: 'tech', views: 100 },
    { id: '2', slug: 'post-2', status: 'published', title: 'Second Post', category: 'news', views: 50 },
    { id: '3', slug: 'post-3', status: 'draft', title: 'Third Post', category: 'tech', views: 10 },
  ])

  it('joins top-level filter groups with AND by default', async () => {
    const res = await repo.findMany(testSeed, {
      filters: [
        { column: 'category', type: 'text', conditions: [{ op: 'eq', value: 'tech' }] },
        { column: 'status', type: 'text', conditions: [{ op: 'eq', value: 'published' }] },
      ],
    })
    expect(res.items).toHaveLength(1)
    expect(res.items[0].id).toBe('1')
  })

  it('joins top-level filter groups with OR when filterLogic is OR', async () => {
    const res = await repo.findMany(testSeed, {
      filterLogic: 'OR',
      filters: [
        { column: 'category', type: 'text', conditions: [{ op: 'eq', value: 'news' }] },
        { column: 'status', type: 'text', conditions: [{ op: 'eq', value: 'draft' }] },
      ],
    })
    expect(res.items).toHaveLength(2)
    const ids = res.items.map((i) => i.id).sort()
    expect(ids).toEqual(['2', '3'])
  })

  it('always ANDs conditions within the same filter group even when filterLogic is OR', async () => {
    const res = await repo.findMany(testSeed, {
      filterLogic: 'OR',
      filters: [
        {
          column: 'category',
          type: 'text',
          conditions: [
            { op: 'eq', value: 'tech' },
            { op: 'eq', value: 'news' }, // Impossible for single category to be both
          ],
        },
      ],
    })
    expect(res.items).toHaveLength(0)
  })

  it('safely handles reserved prototype properties in filter columns', async () => {
    const res = await repo.findMany(testSeed, {
      filters: [
        { column: 'constructor', type: 'text', conditions: [{ op: 'eq', value: 'Function' }] },
        { column: 'toString', type: 'text', conditions: [{ op: 'contains', value: 'toString' }] },
        { column: '__proto__', type: 'text', conditions: [{ op: 'is_not_empty', value: null }] },
      ],
    })
    expect(res.items).toHaveLength(0)
  })
})
