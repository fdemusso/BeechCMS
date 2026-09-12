// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ContentRepository, Seed } from '@beechcms/core'
import { resolveRelationSubqueries } from './relation-subquery'
import type { ParsedPublicFilter } from './query-builder'

describe('resolveRelationSubqueries', () => {
  let mockRepo: ContentRepository
  let categoriesSeed: Seed
  let postsSeed: Seed
  let getSeed: (slug: string) => Seed | null

  beforeEach(() => {
    vi.clearAllMocks()

    categoriesSeed = {
      slug: 'categories',
      allowPublicRead: true,
      branches: [
        { id: 'br_01', alias: 'name', label: 'Name', type: 'text', policies: { public: true } },
      ],
    } as unknown as Seed

    postsSeed = {
      slug: 'posts',
      allowPublicRead: true,
      branches: [
        { id: 'br_01', alias: 'title', label: 'Title', type: 'text', policies: { public: true } },
        { id: 'br_02', alias: 'category_id', label: 'Category', type: 'relation', targetSeed: 'categories', multiple: false, policies: { public: true } },
        { id: 'br_03', alias: 'related_posts', label: 'Related Posts', type: 'relation', targetSeed: 'posts', multiple: true, policies: { public: true } },
      ],
    } as unknown as Seed

    getSeed = (slug: string) => {
      if (slug === 'categories') return categoriesSeed
      if (slug === 'posts') return postsSeed
      return null
    }

    mockRepo = {
      findMany: vi.fn(),
      findById: vi.fn(),
      findBySlug: vi.fn(),
      findParentIdsByRelation: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as ContentRepository
  })

  it('rewrites a single-relation subquery into a concrete id condition on the alias itself', async () => {
    vi.mocked(mockRepo.findMany).mockResolvedValueOnce({
      items: [{ id: 'cat-1' }],
      total: 1,
    })
    const parsed: ParsedPublicFilter = {
      logic: 'AND',
      where: [{ field: 'category_id', op: 'in', subquery: { where: [{ field: 'name', op: 'eq', value: 'Tech' }], logic: 'AND' } }],
    }

    const result = await resolveRelationSubqueries(parsed, postsSeed, mockRepo, getSeed, true)

    expect(result.empty).toBe(false)
    expect(result.filter).toEqual({ where: [{ field: 'category_id', op: 'in', value: ['cat-1'] }], logic: 'AND' })
  })

  it('rewrites a multi-relation subquery via findParentIdsByRelation into an id condition on id', async () => {
    vi.mocked(mockRepo.findMany).mockResolvedValueOnce({
      items: [{ id: 'target-1' }],
      total: 1,
    })
    vi.mocked(mockRepo.findParentIdsByRelation).mockResolvedValueOnce(['parent-1'])
    const parsed: ParsedPublicFilter = {
      logic: 'AND',
      where: [{ field: 'related_posts', op: 'in', subquery: { where: [{ field: 'title', op: 'eq', value: 'X' }], logic: 'AND' } }],
    }

    const result = await resolveRelationSubqueries(parsed, postsSeed, mockRepo, getSeed, true)

    expect(mockRepo.findParentIdsByRelation).toHaveBeenCalledWith(postsSeed, 'related_posts', ['target-1'], 501)
    expect(result.filter).toEqual({ where: [{ field: 'id', op: 'in', value: ['parent-1'] }], logic: 'AND' })
  })

  it('under AND, an inner query matching nothing returns an empty result without an engine round-trip', async () => {
    vi.mocked(mockRepo.findMany).mockResolvedValueOnce({ items: [], total: 0 })
    const parsed: ParsedPublicFilter = {
      logic: 'AND',
      where: [{ field: 'category_id', op: 'in', subquery: { where: [{ field: 'name', op: 'eq', value: 'Nope' }], logic: 'AND' } }],
    }

    const result = await resolveRelationSubqueries(parsed, postsSeed, mockRepo, getSeed, true)

    expect(result).toEqual({ filter: null, empty: true })
  })

  it('under OR, an empty subquery drops only its own disjunct and leaves the sibling condition intact', async () => {
    vi.mocked(mockRepo.findMany).mockResolvedValueOnce({ items: [], total: 0 })
    const parsed: ParsedPublicFilter = {
      logic: 'OR',
      where: [
        { field: 'category_id', op: 'in', subquery: { where: [{ field: 'name', op: 'eq', value: 'Nope' }], logic: 'AND' } },
        { field: 'title', op: 'eq', value: 'Hello' },
      ],
    }

    const result = await resolveRelationSubqueries(parsed, postsSeed, mockRepo, getSeed, true)

    expect(result).toEqual({ filter: { where: [{ field: 'title', op: 'eq', value: 'Hello' }], logic: 'OR' }, empty: false })
  })

  it('under OR, every disjunct dropped returns empty: true', async () => {
    vi.mocked(mockRepo.findMany).mockResolvedValue({ items: [], total: 0 })
    const parsed: ParsedPublicFilter = {
      logic: 'OR',
      where: [
        { field: 'category_id', op: 'in', subquery: { where: [{ field: 'name', op: 'eq', value: 'Nope' }], logic: 'AND' } },
      ],
    }

    const result = await resolveRelationSubqueries(parsed, postsSeed, mockRepo, getSeed, true)

    expect(result).toEqual({ filter: null, empty: true })
  })

  it('a target count above the target cap throws Invalid subquery', async () => {
    vi.mocked(mockRepo.findMany).mockResolvedValueOnce({ items: [], total: 201 })
    const parsed: ParsedPublicFilter = {
      logic: 'AND',
      where: [{ field: 'category_id', op: 'in', subquery: { where: [{ field: 'name', op: 'eq', value: 'Wide' }], logic: 'AND' } }],
    }

    await expect(resolveRelationSubqueries(parsed, postsSeed, mockRepo, getSeed, true))
      .rejects.toThrow('Invalid subquery:')
  })

  it('a resolved parent-id set above the parent cap throws Invalid subquery', async () => {
    vi.mocked(mockRepo.findMany).mockResolvedValueOnce({ items: [{ id: 'target-1' }], total: 1 })
    vi.mocked(mockRepo.findParentIdsByRelation).mockResolvedValueOnce(Array.from({ length: 501 }, (_, i) => `p-${i}`))
    const parsed: ParsedPublicFilter = {
      logic: 'AND',
      where: [{ field: 'related_posts', op: 'in', subquery: { where: [{ field: 'title', op: 'eq', value: 'X' }], logic: 'AND' } }],
    }

    await expect(resolveRelationSubqueries(parsed, postsSeed, mockRepo, getSeed, true))
      .rejects.toThrow('Invalid subquery:')
  })

  it('a multi-relation condition using not_in throws Invalid subquery', async () => {
    const parsed: ParsedPublicFilter = {
      logic: 'AND',
      where: [{ field: 'related_posts', op: 'not_in', value: ['post-1'] }],
    }

    await expect(resolveRelationSubqueries(parsed, postsSeed, mockRepo, getSeed, true))
      .rejects.toThrow("Invalid subquery: field 'related_posts' is a relation and only supports the 'in' operator (got 'not_in').")
  })
})
