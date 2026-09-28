// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import type { Seed } from '@beechcms/core'
import { resolvePublicRelationTarget } from './relation-access'

describe('resolvePublicRelationTarget', () => {
  const categoriesSeed = {
    slug: 'categories',
    allowPublicRead: true,
    branches: [
      { id: 'br_01', alias: 'name', label: 'Name', type: 'text', policies: { public: true } },
    ],
  } as unknown as Seed

  const authorsSeed = {
    slug: 'authors',
    allowPublicRead: false,
    branches: [
      { id: 'br_01', alias: 'name', label: 'Name', type: 'text' },
    ],
  } as unknown as Seed

  const postsSeed = {
    slug: 'posts',
    allowPublicRead: true,
    branches: [
      { id: 'br_01', alias: 'title', label: 'Title', type: 'text', policies: { public: true } },
      { id: 'br_02', alias: 'category_id', label: 'Category', type: 'relation', targetSeed: 'categories', multiple: false, policies: { public: true } },
      { id: 'br_03', alias: 'author_id', label: 'Author', type: 'relation', targetSeed: 'authors', multiple: false, policies: { public: true } },
      { id: 'br_04', alias: 'secret_rel', label: 'Secret', type: 'relation', targetSeed: 'categories', multiple: false, policies: { public: false } },
      { id: 'br_05', alias: 'rel_no_target', label: 'No Target', type: 'relation', policies: { public: true } },
    ],
  } as unknown as Seed

  const getSeed = (slug: string): Seed | null => {
    if (slug === 'categories') return categoriesSeed
    if (slug === 'authors') return authorsSeed
    if (slug === 'posts') return postsSeed
    return null
  }

  it('resolves category_id to the categories seed for both kinds', () => {
    const forInclude = resolvePublicRelationTarget('category_id', postsSeed, getSeed, 'include')
    const forSubquery = resolvePublicRelationTarget('category_id', postsSeed, getSeed, 'subquery')

    expect(forInclude.targetSeed.slug).toBe('categories')
    expect(forSubquery.targetSeed.slug).toBe('categories')
  })

  it('rejects a branch that does not exist, prefixed per kind', () => {
    expect(() => resolvePublicRelationTarget('ghost', postsSeed, getSeed, 'include'))
      .toThrow("Invalid include: branch 'ghost' does not exist.")
    expect(() => resolvePublicRelationTarget('ghost', postsSeed, getSeed, 'subquery'))
      .toThrow("Invalid subquery: branch 'ghost' does not exist.")
  })

  it('rejects a branch that is not a relation', () => {
    expect(() => resolvePublicRelationTarget('title', postsSeed, getSeed, 'subquery'))
      .toThrow("Invalid subquery: branch 'title' is not a relation.")
  })

  it('rejects a relation branch flagged not publicly readable', () => {
    expect(() => resolvePublicRelationTarget('secret_rel', postsSeed, getSeed, 'subquery'))
      .toThrow("Invalid subquery: branch 'secret_rel' is not publicly readable.")
  })

  it('rejects a relation branch missing a target seed', () => {
    expect(() => resolvePublicRelationTarget('rel_no_target', postsSeed, getSeed, 'subquery'))
      .toThrow("Invalid subquery: branch 'rel_no_target' is missing a target seed.")
  })

  it('rejects a relation whose target seed is not publicly readable — the author_id negative case', () => {
    expect(() => resolvePublicRelationTarget('author_id', postsSeed, getSeed, 'subquery'))
      .toThrow("Invalid subquery: target seed 'authors' is not publicly readable.")
  })
})
