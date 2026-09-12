// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { ISeedRegistry, Seed } from '@beechcms/core'
import { schemaRevisionMiddleware, fingerprintCache } from './schema-revision'
import type { AppEnv } from '../types.js'

function createMockRegistry(seeds: Seed[]): ISeedRegistry {
  return {
    all: () => seeds,
    get: (slug: string) => seeds.find((s) => s.slug === slug) ?? null,
    visibleInDashboard: () => seeds,
    publicReadable: () => seeds.filter((s) => s.allowPublicRead),
    draftEnabled: () => seeds.filter((s) => s.allowDrafts),
  }
}

describe('schemaRevisionMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets X-Schema-Revision header on downstream responses matching canonical revision format', async () => {
    const app = new Hono<AppEnv>()
    const seed = {
      slug: 'posts',
      label: 'Post',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'title', label: 'Title', type: 'text', policies: { public: true } },
      ],
    } as unknown as Seed
    const mockRegistry = createMockRegistry([seed])
    app.use('*', async (c, next) => {
      c.set('seedRegistry', mockRegistry)
      await next()
    })
    app.use('*', schemaRevisionMiddleware())
    app.get('/test', (c) => c.json({ ok: true }, 200))

    const response = await app.request('/test')

    expect(response.status).toBe(200)
    const revision = response.headers.get('x-schema-revision')
    expect(revision).toMatch(/^v\d+:[0-9a-f]{32}$/)
  })

  it('memoizes the computed fingerprint in WeakMap cache across repeated requests with identical registry instance', async () => {
    const app = new Hono<AppEnv>()
    const seed = {
      slug: 'articles',
      label: 'Article',
      displayNameAlias: 'title',
      branches: [],
    } as unknown as Seed
    const mockRegistry = createMockRegistry([seed])
    app.use('*', async (c, next) => {
      c.set('seedRegistry', mockRegistry)
      await next()
    })
    app.use('*', schemaRevisionMiddleware())
    app.get('/test', (c) => c.json({ ok: true }, 200))

    const firstResponse = await app.request('/test')
    const firstRevision = firstResponse.headers.get('x-schema-revision')
    const secondResponse = await app.request('/test')
    const secondRevision = secondResponse.headers.get('x-schema-revision')

    expect(firstResponse.status).toBe(200)
    expect(secondResponse.status).toBe(200)
    expect(secondRevision).toBe(firstRevision)
    expect(fingerprintCache.get(mockRegistry)).toBe(firstRevision)
  })

  it('re-computes fingerprint when a new registry instance is provided', async () => {
    const app = new Hono<AppEnv>()
    let currentRegistry: ISeedRegistry
    const registry1 = createMockRegistry([
      { slug: 'alpha', label: 'Alpha', displayNameAlias: 'title', branches: [] } as unknown as Seed,
    ])
    const registry2 = createMockRegistry([
      { slug: 'beta', label: 'Beta', displayNameAlias: 'title', branches: [] } as unknown as Seed,
    ])
    currentRegistry = registry1
    app.use('*', async (c, next) => {
      c.set('seedRegistry', currentRegistry)
      await next()
    })
    app.use('*', schemaRevisionMiddleware())
    app.get('/test', (c) => c.json({ ok: true }, 200))

    const res1 = await app.request('/test')
    const rev1 = res1.headers.get('x-schema-revision')
    currentRegistry = registry2
    const res2 = await app.request('/test')
    const rev2 = res2.headers.get('x-schema-revision')

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    expect(rev1).toMatch(/^v\d+:[0-9a-f]{32}$/)
    expect(rev2).toMatch(/^v\d+:[0-9a-f]{32}$/)
    expect(rev1).not.toBe(rev2)
  })

  it('passes through and leaves header unset when seedRegistry is not present in context', async () => {
    const app = new Hono<AppEnv>()
    app.use('*', schemaRevisionMiddleware())
    app.get('/no-reg', (c) => c.json({ ok: true }, 200))

    const response = await app.request('/no-reg')

    expect(response.status).toBe(200)
    expect(response.headers.get('x-schema-revision')).toBeNull()
  })
})
