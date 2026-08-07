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
    hardDelete: vi.fn().mockResolvedValue(undefined),
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

  it('deduplicates concurrent requests while rebuilding', async () => {
    let resolveList: (seeds: Seed[]) => void = () => {}
    const listPromise = new Promise<Seed[]>((resolve) => {
      resolveList = resolve
    })
    
    const repo = makeRepo(1)
    repo.listActive = vi.fn().mockReturnValue(listPromise)

    const req1 = getHydratedRegistry(repo)
    const req2 = getHydratedRegistry(repo)
    const req3 = getHydratedRegistry(repo)
    
    resolveList([mockSeed])
    
    const [res1, res2, res3] = await Promise.all([req1, req2, req3])
    
    expect(repo.listActive).toHaveBeenCalledTimes(1)
    expect(res1.registry).toBe(res2.registry)
    expect(res2.registry).toBe(res3.registry)
  })

  it('reuses valid cache when getRegistryVersion throws', async () => {
    const repo = makeRepo(1)
    await getHydratedRegistry(repo)
    expect(repo.listActive).toHaveBeenCalledTimes(1)

    repo.getRegistryVersion = vi.fn().mockRejectedValue(new Error('Network error'))
    await getHydratedRegistry(repo)
    expect(repo.listActive).toHaveBeenCalledTimes(1)
  })

  it('throws when getRegistryVersion throws and cache is expired (or missing)', async () => {
    const repo = makeRepo(1)
    repo.getRegistryVersion = vi.fn().mockRejectedValue(new Error('Network error'))
    await expect(getHydratedRegistry(repo)).rejects.toThrow('Network error')
  })

  it('rejects prototype keys as valid properties (security check)', async () => {
    const repo = makeRepo(1)
    const { registry, backrefMap } = await getHydratedRegistry(repo)
    
    // Ensure prototype keys do not cause false successes
    expect(Object.hasOwn(backrefMap, 'constructor')).toBe(false)
    expect(Object.hasOwn(backrefMap, 'toString')).toBe(false)
    expect(registry.get('constructor')).toBeNull()
    expect(registry.get('toString')).toBeNull()
    expect(registry.get('__proto__')).toBeNull()
  })
})
