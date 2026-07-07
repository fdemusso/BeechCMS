// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getHydratedRegistry, __resetSeedRegistryCache } from './seed-registry-cache'
import type { ISeedRepository, SeedRecord, Seed } from '@beechcms/core'

const mockSeed: Seed = {
  slug: 'posts',
  label: 'Posts',
  displayNameAlias: 'title',
  branches: [{ id: 'br_01', alias: 'title', label: 'Title', type: 'text' }],
}

function makeRepo(version: number, seeds: Seed[] = [mockSeed]): ISeedRepository & { listActive: ReturnType<typeof vi.fn> } {
  return {
    listActive: vi.fn().mockResolvedValue(seeds),
    listAll: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue(undefined),
    softDelete: vi.fn().mockResolvedValue(undefined),
    getRegistryVersion: vi.fn().mockResolvedValue(version),
    bumpRegistryVersion: vi.fn().mockResolvedValue(version + 1),
  }
}

describe('getHydratedRegistry', () => {
  beforeEach(() => __resetSeedRegistryCache())

  it('builds registry on first call and calls listActive once', async () => {
    const repo = makeRepo(1)
    const { registry } = await getHydratedRegistry(repo)
    expect(repo.listActive).toHaveBeenCalledTimes(1)
    expect(registry.get('posts')).not.toBeNull()
  })

  it('reuses cached registry when version and TTL match', async () => {
    const repo = makeRepo(1)
    await getHydratedRegistry(repo)
    await getHydratedRegistry(repo)
    expect(repo.listActive).toHaveBeenCalledTimes(1)
  })

  it('rebuilds when version token changes', async () => {
    const repo1 = makeRepo(1)
    await getHydratedRegistry(repo1)
    expect(repo1.listActive).toHaveBeenCalledTimes(1)

    const repo2 = makeRepo(2)
    await getHydratedRegistry(repo2)
    expect(repo2.listActive).toHaveBeenCalledTimes(1)
  })

  it('empty listActive produces empty registry without throwing', async () => {
    const repo = makeRepo(1, [])
    const { registry } = await getHydratedRegistry(repo)
    expect(registry.all()).toHaveLength(0)
    expect(registry.get('posts')).toBeNull()
  })

  it('backrefMap is returned alongside registry', async () => {
    const repo = makeRepo(1)
    const { backrefMap } = await getHydratedRegistry(repo)
    expect(backrefMap).toBeDefined()
    expect(typeof backrefMap).toBe('object')
  })
})
