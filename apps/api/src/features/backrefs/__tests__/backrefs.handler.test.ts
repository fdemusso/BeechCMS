// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { BackrefMap } from '@beechcms/core'
import { backrefsApp } from '../backrefs.handler'

// ---------------------------------------------------------------------------
// Seed fixtures
// ---------------------------------------------------------------------------

const teamSeed = {
  slug: 'team',
  label: 'Team Member',
  labelPlural: 'Team Members',
  displayNameAlias: 'name',
  branches: [
    { id: 'br_01', alias: 'name', label: 'Name', type: 'text' as const },
  ],
  allowPublicRead: false,
}

const articlesSeed = {
  slug: 'articles',
  label: 'Article',
  labelPlural: 'Articles',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text' as const },
    { id: 'br_02', alias: 'author_id', label: 'Author', type: 'relation' as const, targetSeed: 'team' },
  ],
  allowPublicRead: false,
}

const tagsSeed = {
  slug: 'tags',
  label: 'Tag',
  labelPlural: 'Tags',
  displayNameAlias: 'name',
  branches: [
    { id: 'br_01', alias: 'name', label: 'Name', type: 'text' as const },
  ],
  allowPublicRead: false,
}

const articleTagsSeed = {
  slug: 'articles',
  label: 'Article',
  labelPlural: 'Articles',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text' as const },
    { id: 'br_02', alias: 'tags', label: 'Tags', type: 'relation' as const, targetSeed: 'tags', multiple: true },
  ],
  allowPublicRead: false,
}

// ---------------------------------------------------------------------------
// D1 mock helpers
// ---------------------------------------------------------------------------

function makeD1First<T>(result: T | null) {
  return vi.fn().mockResolvedValue(result)
}

function makeD1All<T>(results: T[]) {
  return vi.fn().mockResolvedValue({ results })
}

interface D1PrepareStub {
  firstResult?: unknown
  allResults?: unknown[]
}

function makeD1(stubs: D1PrepareStub[] = []) {
  let callCount = 0
  return {
    prepare: vi.fn().mockImplementation(() => {
      const stub = stubs[callCount++] ?? { firstResult: null, allResults: [] }
      return {
        bind: vi.fn().mockReturnThis(),
        first: makeD1First(stub.firstResult ?? null),
        all: makeD1All((stub.allResults ?? []) as unknown[]),
      }
    }),
  }
}

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildApp({
  db,
  backrefMap,
  getSeed,
}: {
  db: ReturnType<typeof makeD1>
  backrefMap: BackrefMap
  getSeed: (slug: string) => unknown
}) {
  const app = new Hono()
  app.use('*', async (c, next) => {
    ;(c as any).env = { DB: db }
    ;(c as any).set('backrefMap', backrefMap)
    ;(c as any).set('getSeed', getSeed)
    await next()
  })
  app.route('/', backrefsApp)
  return app
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /:targetSlug/:targetId/backrefs', () => {
  describe('404 cases', () => {
    it('returns 404 when target slug is unknown', async () => {
      const db = makeD1()
      const app = buildApp({
        db,
        backrefMap: new Map(),
        getSeed: () => null,
      })

      const res = await app.request('/unknown-slug/id-1/backrefs')
      expect(res.status).toBe(404)
      const body = await res.json() as { type: string }
      expect(body.type).toContain('not-found')
    })

    it('returns 404 when target id does not exist in DB', async () => {
      const db = makeD1([{ firstResult: null }])
      const app = buildApp({
        db,
        backrefMap: new Map(),
        getSeed: (s) => s === 'team' ? teamSeed : null,
      })

      const res = await app.request('/team/nonexistent-id/backrefs')
      expect(res.status).toBe(404)
    })
  })

  describe('no inbound relations', () => {
    it('returns empty groups when backrefMap has no entry for target', async () => {
      const db = makeD1([{ firstResult: { id: 'ada-1' } }])
      const app = buildApp({
        db,
        backrefMap: new Map(),
        getSeed: (s) => s === 'team' ? teamSeed : null,
      })

      const res = await app.request('/team/ada-1/backrefs')
      expect(res.status).toBe(200)
      const body = await res.json() as { groups: unknown[] }
      expect(body.groups).toHaveLength(0)
    })
  })

  describe('single-value source with 5 referencing rows', () => {
    it('preview: returns 3 items, total=5, restricts=false', async () => {
      const backrefMap: BackrefMap = new Map([
        ['team', [{
          sourceSlug: 'articles',
          branchAlias: 'author_id',
          branchLabel: 'Author',
          relationship: 'single',
          restricts: false,
        }]],
      ])

      const previewItems = Array.from({ length: 3 }, (_, i) => ({
        id: `art-${i + 1}`,
        displayName: `Article ${i + 1}`,
        status: 'published',
        updated_at: 1000 + i,
      }))

      // prepare calls: 1) exists check, 2) rows query, 3) count query
      const db = makeD1([
        { firstResult: { id: 'ada-1' } },            // exists
        { allResults: previewItems },                  // rows
        { firstResult: { total: 5 } },                // count
      ])

      const app = buildApp({
        db,
        backrefMap,
        getSeed: (s) => {
          if (s === 'team') return teamSeed
          if (s === 'articles') return articlesSeed
          return null
        },
      })

      const res = await app.request('/team/ada-1/backrefs')
      expect(res.status).toBe(200)
      const body = await res.json() as { groups: any[] }
      expect(body.groups).toHaveLength(1)
      const g = body.groups[0]
      expect(g.total).toBe(5)
      expect(g.items).toHaveLength(3)
      expect(g.restricts).toBe(false)
      expect(g.relationship).toBe('single')
    })
  })

  describe('multi-relation source with 12 referencing rows', () => {
    it('preview: returns 3 items, total=12', async () => {
      const backrefMap: BackrefMap = new Map([
        ['tags', [{
          sourceSlug: 'articles',
          branchAlias: 'tags',
          branchLabel: 'Tags',
          relationship: 'multi',
          restricts: false,
        }]],
      ])

      const previewItems = Array.from({ length: 3 }, (_, i) => ({
        id: `art-${i}`,
        displayName: `Article ${i}`,
        status: 'published',
        updated_at: 1000,
      }))

      const db = makeD1([
        { firstResult: { id: 'tag-1' } },   // exists
        { allResults: previewItems },          // rows
        { firstResult: { total: 12 } },       // count
      ])

      const app = buildApp({
        db,
        backrefMap,
        getSeed: (s) => {
          if (s === 'tags') return tagsSeed
          if (s === 'articles') return articleTagsSeed
          return null
        },
      })

      const res = await app.request('/tags/tag-1/backrefs')
      expect(res.status).toBe(200)
      const body = await res.json() as { groups: any[] }
      const g = body.groups[0]
      expect(g.total).toBe(12)
      expect(g.items).toHaveLength(3)
      expect(g.relationship).toBe('multi')
    })
  })

  describe('paginated ?group= request', () => {
    it('page=2&limit=4 returns correct offset (rows 5–8)', async () => {
      const backrefMap: BackrefMap = new Map([
        ['team', [{
          sourceSlug: 'articles',
          branchAlias: 'author_id',
          branchLabel: 'Author',
          relationship: 'single',
          restricts: false,
        }]],
      ])

      const page2Items = Array.from({ length: 4 }, (_, i) => ({
        id: `art-${i + 5}`,
        displayName: `Article ${i + 5}`,
        status: 'published',
        updated_at: 1000,
      }))

      const db = makeD1([
        { firstResult: { id: 'ada-1' } },  // exists
        { allResults: page2Items },          // rows (page 2, limit 4 → offset 4)
        { firstResult: { total: 12 } },      // count
      ])

      const app = buildApp({
        db,
        backrefMap,
        getSeed: (s) => {
          if (s === 'team') return teamSeed
          if (s === 'articles') return articlesSeed
          return null
        },
      })

      const res = await app.request('/team/ada-1/backrefs?group=articles:author_id&page=2&limit=4')
      expect(res.status).toBe(200)
      const body = await res.json() as { groups: any[] }
      expect(body.groups).toHaveLength(1)
      const g = body.groups[0]
      expect(g.items).toHaveLength(4)
      expect(g.items[0].id).toBe('art-5')
    })

    it('returns 404 for unknown group key', async () => {
      const backrefMap: BackrefMap = new Map([
        ['team', [{
          sourceSlug: 'articles',
          branchAlias: 'author_id',
          branchLabel: 'Author',
          relationship: 'single',
          restricts: false,
        }]],
      ])

      const db = makeD1([{ firstResult: { id: 'ada-1' } }])

      const app = buildApp({
        db,
        backrefMap,
        getSeed: (s) => s === 'team' ? teamSeed : null,
      })

      const res = await app.request('/team/ada-1/backrefs?group=articles:unknown_field')
      expect(res.status).toBe(404)
    })
  })

  describe('restricts flag', () => {
    it('exposes restricts=true when branch has onDelete RESTRICT', async () => {
      const backrefMap: BackrefMap = new Map([
        ['team', [{
          sourceSlug: 'articles',
          branchAlias: 'author_id',
          branchLabel: 'Author',
          relationship: 'single',
          restricts: true,
        }]],
      ])

      const db = makeD1([
        { firstResult: { id: 'ada-1' } },
        { allResults: [{ id: 'art-1', displayName: 'Art', status: 'published', updated_at: 1000 }] },
        { firstResult: { total: 1 } },
      ])

      const app = buildApp({
        db,
        backrefMap,
        getSeed: (s) => {
          if (s === 'team') return teamSeed
          if (s === 'articles') return articlesSeed
          return null
        },
      })

      const res = await app.request('/team/ada-1/backrefs')
      expect(res.status).toBe(200)
      const body = await res.json() as { groups: any[] }
      expect(body.groups[0].restricts).toBe(true)
    })
  })
})
