// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { InMemorySeedRepository } from './in-memory-seed.repository'
import type { Seed } from '@beechcms/core'

const mockSeed: Seed = {
  slug: 'posts',
  label: 'Posts',
  displayNameAlias: 'title',
  branches: [{ id: 'br_01', alias: 'title', label: 'Title', type: 'text' }],
}

describe('InMemorySeedRepository', () => {
  it('listActive returns the seeds passed to the constructor', async () => {
    const repo = new InMemorySeedRepository([mockSeed])
    expect(await repo.listActive()).toEqual([mockSeed])
  })

  it('filters out malformed entries at construction time', () => {
    const repo = new InMemorySeedRepository([mockSeed, null as unknown as Seed, {} as Seed])
    expect(repo['seeds']).toEqual([mockSeed])
  })

  it('listAll wraps each seed as an active/code SeedRecord', async () => {
    const repo = new InMemorySeedRepository([mockSeed])
    const records = await repo.listAll()
    expect(records).toEqual([{ slug: 'posts', definition: mockSeed, status: 'active', source: 'code', createdAt: 0, updatedAt: 0 }])
  })

  it('get returns the matching record or null', async () => {
    const repo = new InMemorySeedRepository([mockSeed])
    expect(await repo.get('posts')).toEqual({ slug: 'posts', definition: mockSeed, status: 'active', source: 'code', createdAt: 0, updatedAt: 0 })
    expect(await repo.get('ghost')).toBeNull()
  })

  it('upsert, softDelete and hardDelete are no-ops (read-only repository)', async () => {
    const repo = new InMemorySeedRepository([mockSeed])
    await expect(repo.upsert('posts', mockSeed)).resolves.toBeUndefined()
    await expect(repo.softDelete('posts')).resolves.toBeUndefined()
    await expect(repo.hardDelete('posts')).resolves.toBeUndefined()
    expect(await repo.listActive()).toEqual([mockSeed])
  })

  it('getRegistryVersion / bumpRegistryVersion track a static in-process counter', async () => {
    const repo = new InMemorySeedRepository([mockSeed])
    expect(await repo.getRegistryVersion()).toBe(1)
    expect(await repo.bumpRegistryVersion()).toBe(2)
    expect(await repo.getRegistryVersion()).toBe(2)
  })

  describe('applyAtomic', () => {
    it('returns applied:false and the unchanged version on a stale expectedVersion', async () => {
      const repo = new InMemorySeedRepository([mockSeed])
      const result = await repo.applyAtomic({ slug: 'posts', definition: mockSeed, ddl: [], expectedVersion: 99 })
      expect(result).toEqual({ applied: false, version: 1 })
    })

    it('returns applied:true and bumps the version on a matching expectedVersion', async () => {
      const repo = new InMemorySeedRepository([mockSeed])
      const result = await repo.applyAtomic({ slug: 'posts', definition: mockSeed, ddl: [], expectedVersion: 1 })
      expect(result).toEqual({ applied: true, version: 2 })
      expect(await repo.getRegistryVersion()).toBe(2)
    })
  })
})
