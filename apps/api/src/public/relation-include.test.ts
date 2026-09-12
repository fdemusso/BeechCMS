// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ContentRepository, Seed } from '@beechcms/core'
import { expandRelations } from './relation-include'

describe('expandRelations', () => {
  let mockRepo: ContentRepository
  let categoriesSeed: Seed
  let tagsSeed: Seed
  let postsSeed: Seed
  let getSeed: (slug: string) => Seed | null

  beforeEach(() => {
    vi.clearAllMocks()

    categoriesSeed = {
      slug: 'categories',
      label: 'Categories',
      allowPublicRead: true,
      branches: [
        { id: 'br_c1', alias: 'name', label: 'Name', type: 'text', policies: { public: true } },
      ],
    } as unknown as Seed

    tagsSeed = {
      slug: 'tags',
      label: 'Tags',
      allowPublicRead: true,
      branches: [
        { id: 'br_t1', alias: 'tag_name', label: 'Tag Name', type: 'text', policies: { public: true } },
      ],
    } as unknown as Seed

    postsSeed = {
      slug: 'posts',
      label: 'Posts',
      allowPublicRead: true,
      branches: [
        { id: 'br_p1', alias: 'title', label: 'Title', type: 'text', policies: { public: true } },
        { id: 'br_p2', alias: 'category_id', label: 'Category', type: 'relation', targetSeed: 'categories', multiple: false, policies: { public: true } },
        { id: 'br_p3', alias: 'tag_ids', label: 'Tags', type: 'relation', targetSeed: 'tags', multiple: true, policies: { public: true } },
        { id: 'br_p4', alias: 'default_policy_rel', label: 'Default Policy Rel', type: 'relation', targetSeed: 'categories', multiple: false, policies: {} },
        { id: 'br_p5', alias: 'secret_rel', label: 'Secret Rel', type: 'relation', targetSeed: 'categories', multiple: false, policies: { public: false } },
        { id: 'br_p6', alias: 'internal_rel', label: 'Internal Rel', type: 'relation', targetSeed: 'categories', multiple: false, policies: { classification: 'internal' } },
        { id: 'br_p7', alias: 'rel_no_target', label: 'No Target Rel', type: 'relation', policies: { public: true } },
        { id: 'br_p8', alias: 'private_target_rel', label: 'Private Target Rel', type: 'relation', targetSeed: 'private_seed', multiple: false, policies: { public: true } },
      ],
    } as unknown as Seed

    getSeed = (slug: string) => {
      if (slug === 'categories') return categoriesSeed
      if (slug === 'tags') return tagsSeed
      if (slug === 'posts') return postsSeed
      if (slug === 'private_seed') return { slug: 'private_seed', allowPublicRead: false, branches: [] } as unknown as Seed
      return null
    }

    mockRepo = {
      findMany: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      findById: vi.fn(),
      findBySlug: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as ContentRepository
  })

  it('rejects nested include paths with depth greater than 1', async () => {
    const items: Record<string, unknown>[] = [{ id: 'post-1', title: 'Test Post', category_id: 'cat-1' }]

    const action = expandRelations(items, 'category_id.author', postsSeed, mockRepo, getSeed)

    await expect(action).rejects.toThrow("Invalid include: nested includes are not supported (got 'category_id.author'). Max depth is 1.")
  })

  it('rejects include pointing to a non-existent branch', async () => {
    const items: Record<string, unknown>[] = [{ id: 'post-1', title: 'Test Post' }]

    const action = expandRelations(items, 'non_existent_branch', postsSeed, mockRepo, getSeed)

    await expect(action).rejects.toThrow("Invalid include: branch 'non_existent_branch' does not exist.")
  })

  it('rejects include pointing to a non-relation branch', async () => {
    const items: Record<string, unknown>[] = [{ id: 'post-1', title: 'Test Post' }]

    const action = expandRelations(items, 'title', postsSeed, mockRepo, getSeed)

    await expect(action).rejects.toThrow("Invalid include: branch 'title' is not a relation.")
  })

  it('rejects include when branch is flagged public false or internal classification', async () => {
    const items: Record<string, unknown>[] = [{ id: 'post-1', secret_rel: 'cat-1' }]

    const action = expandRelations(items, 'secret_rel', postsSeed, mockRepo, getSeed)

    await expect(action).rejects.toThrow("Invalid include: branch 'secret_rel' is not publicly readable.")
  })

  it('admits include when branch visibility defaults to public via resolvePolicies without explicit public flag', async () => {
    const items: Record<string, unknown>[] = [{ id: 'post-1', default_policy_rel: 'cat-1' }]
    vi.mocked(mockRepo.findMany).mockResolvedValueOnce({
      items: [{ id: 'cat-1', name: 'Technology', status: 'published' }],
      total: 1,
    })

    await expandRelations(items, 'default_policy_rel', postsSeed, mockRepo, getSeed)

    expect(items[0]._includes).toEqual({
      default_policy_rel: { id: 'cat-1', name: 'Technology', status: 'published' },
    })
  })

  it('rejects include when branch is missing target seed or points to private target seed', async () => {
    const items: Record<string, unknown>[] = [{ id: 'post-1', rel_no_target: 'id-1', private_target_rel: 'id-2' }]

    const missingTargetAction = expandRelations(items, 'rel_no_target', postsSeed, mockRepo, getSeed)
    await expect(missingTargetAction).rejects.toThrow("Invalid include: branch 'rel_no_target' is missing a target seed.")

    const privateTargetAction = expandRelations(items, 'private_target_rel', postsSeed, mockRepo, getSeed)
    await expect(privateTargetAction).rejects.toThrow("Invalid include: target seed 'private_seed' is not publicly readable.")
  })

  it('rejects requests exceeding the maximum boundary of 3 includes', async () => {
    const items: Record<string, unknown>[] = [{ id: 'post-1' }]

    const action = expandRelations(items, 'category_id,tag_ids,default_policy_rel,secret_rel', postsSeed, mockRepo, getSeed)

    await expect(action).rejects.toThrow('Invalid include: maximum of 3 includes allowed per request (got 4).')
  })

  it('deduplicates requested includes without exceeding the 3-include limit', async () => {
    const items: Record<string, unknown>[] = [{ id: 'post-1', category_id: 'cat-1' }]
    vi.mocked(mockRepo.findMany).mockResolvedValueOnce({
      items: [{ id: 'cat-1', name: 'Tech', status: 'published' }],
      total: 1,
    })

    await expandRelations(items, 'category_id, category_id, category_id, category_id', postsSeed, mockRepo, getSeed)

    expect(mockRepo.findMany).toHaveBeenCalledTimes(1)
    expect(items[0]._includes).toEqual({
      category_id: { id: 'cat-1', name: 'Tech', status: 'published' },
    })
  })

  it('clamps target IDs to 200 per included branch', async () => {
    const items: Record<string, unknown>[] = Array.from({ length: 250 }, (_, i) => ({
      id: `post-${i}`,
      category_id: `cat-${i}`,
    }))
    vi.mocked(mockRepo.findMany).mockResolvedValueOnce({
      items: [{ id: 'cat-0', name: 'Cat 0', status: 'published' }],
      total: 1,
    })

    await expandRelations(items, 'category_id', postsSeed, mockRepo, getSeed)

    const callFilters = (vi.mocked(mockRepo.findMany).mock.calls[0][1]?.filters as any)
    expect(callFilters[0].conditions[0].value.length).toBe(200)
    expect(mockRepo.findMany).toHaveBeenCalledWith(
      categoriesSeed,
      expect.objectContaining({
        pagination: { limit: 200, offset: 0 },
      })
    )
  })

  it('expands both single and multi-relations on multiple items', async () => {
    const items: Record<string, unknown>[] = [
      { id: 'p-1', category_id: 'cat-1', tag_ids: ['tag-1', 'tag-2'] },
      { id: 'p-2', category_id: 'cat-2', tag_ids: ['tag-1'] },
    ]
    vi.mocked(mockRepo.findMany)
      .mockResolvedValueOnce({
        items: [
          { id: 'cat-1', name: 'Tech', status: 'published' },
          { id: 'cat-2', name: 'Science', status: 'published' },
        ],
        total: 2,
      })
      .mockResolvedValueOnce({
        items: [
          { id: 'tag-1', tag_name: 'AI', status: 'published' },
          { id: 'tag-2', tag_name: 'ML', status: 'published' },
        ],
        total: 2,
      })

    await expandRelations(items, 'category_id,tag_ids', postsSeed, mockRepo, getSeed)

    expect(items[0]._includes).toEqual({
      category_id: { id: 'cat-1', name: 'Tech', status: 'published' },
      tag_ids: [
        { id: 'tag-1', tag_name: 'AI', status: 'published' },
        { id: 'tag-2', tag_name: 'ML', status: 'published' },
      ],
    })
    expect(items[1]._includes).toEqual({
      category_id: { id: 'cat-2', name: 'Science', status: 'published' },
      tag_ids: [
        { id: 'tag-1', tag_name: 'AI', status: 'published' },
      ],
    })
  })

  it('extracts relation keys from rawItems when fields projection stripped them from items', async () => {
    const rawItems: Record<string, unknown>[] = [{ id: 'post-1', title: 'Post Title', category_id: 'cat-99' }]
    const projectedItems: Record<string, unknown>[] = [{ id: 'post-1', title: 'Post Title' }]
    vi.mocked(mockRepo.findMany).mockResolvedValueOnce({
      items: [{ id: 'cat-99', name: 'Gadgets', status: 'published' }],
      total: 1,
    })

    await expandRelations(projectedItems, 'category_id', postsSeed, mockRepo, getSeed, rawItems)

    expect(projectedItems[0]._includes).toEqual({
      category_id: { id: 'cat-99', name: 'Gadgets', status: 'published' },
    })
  })

  it('no-ops when items list or include param is empty', async () => {
    await expandRelations([], 'category_id', postsSeed, mockRepo, getSeed)
    await expandRelations([{ id: '1' }], undefined, postsSeed, mockRepo, getSeed)
    await expandRelations([{ id: '1' }], '', postsSeed, mockRepo, getSeed)

    expect(mockRepo.findMany).not.toHaveBeenCalled()
  })
})
