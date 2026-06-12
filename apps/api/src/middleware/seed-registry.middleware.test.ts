// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'
import { seedRegistryMiddleware } from './seed-registry.middleware'
import { __resetSeedRegistryCache } from '../shared/seed-registry-cache'
import type { ISeedRepository, Seed } from '@beechcms/core'

const mockSeed: Seed = {
  slug: 'posts',
  label: 'Posts',
  displayNameAlias: 'title',
  branches: [{ id: 'br_01', alias: 'title', label: 'Title', type: 'text' }],
}

function makeRepo(seeds: Seed[] = [mockSeed]): ISeedRepository {
  return {
    listActive: vi.fn().mockResolvedValue(seeds),
    listAll: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue(undefined),
    softDelete: vi.fn().mockResolvedValue(undefined),
    getRegistryVersion: vi.fn().mockResolvedValue(1),
    bumpRegistryVersion: vi.fn().mockResolvedValue(2),
  }
}

describe('seedRegistryMiddleware', () => {
  beforeEach(() => __resetSeedRegistryCache())

  it('injects seedRegistry, getSeed, and backrefMap into context', async () => {
    const app = new Hono()
    const repo = makeRepo()

    app.use('*', async (c, next) => {
      c.set('seedRepository' as never, repo)
      await next()
    })
    app.use('*', seedRegistryMiddleware())
    app.get('/test', (c) => {
      const registry = c.get('seedRegistry' as never) as any
      const getSeed = c.get('getSeed' as never) as any
      const backrefMap = c.get('backrefMap' as never) as any
      return c.json({
        hasRegistry: !!registry,
        hasSeed: !!getSeed('posts'),
        hasBackrefMap: !!backrefMap,
      })
    })

    const res = await app.request('/test')
    const body = await res.json() as any
    expect(body.hasRegistry).toBe(true)
    expect(body.hasSeed).toBe(true)
    expect(body.hasBackrefMap).toBe(true)
  })

  it('getSeed returns null for unknown slug', async () => {
    const app = new Hono()
    const repo = makeRepo()

    app.use('*', async (c, next) => {
      c.set('seedRepository' as never, repo)
      await next()
    })
    app.use('*', seedRegistryMiddleware())
    app.get('/test', (c) => {
      const getSeed = c.get('getSeed' as never) as any
      return c.json({ result: getSeed('no-such-slug') })
    })

    const res = await app.request('/test')
    const body = await res.json() as any
    expect(body.result).toBeNull()
  })

  it('empty seed list yields empty registry without crashing', async () => {
    const app = new Hono()
    const repo = makeRepo([])

    app.use('*', async (c, next) => {
      c.set('seedRepository' as never, repo)
      await next()
    })
    app.use('*', seedRegistryMiddleware())
    app.get('/test', (c) => {
      const registry = c.get('seedRegistry' as never) as any
      return c.json({ count: registry.all().length })
    })

    const res = await app.request('/test')
    const body = await res.json() as any
    expect(body.count).toBe(0)
  })
})
