// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { ISeedRepository, ISchemaMutator, Seed, SeedRecord } from '@beechcms/core'
import { seedsApp } from './seeds.handler'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const baseSeed: Seed = {
  slug: 'articles',
  label: 'Articles',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
    { id: 'br_02', alias: 'body', label: 'Body', type: 'richtext' },
  ],
}

const baseRecord: SeedRecord = {
  slug: 'articles',
  definition: baseSeed,
  status: 'active',
  source: 'runtime',
  createdAt: 0,
  updatedAt: 0,
}

// ─── Fake repositories ────────────────────────────────────────────────────────

function makeRepo(overrides: Partial<ISeedRepository> = {}): ISeedRepository {
  return {
    listActive: vi.fn().mockResolvedValue([baseSeed]),
    listAll: vi.fn().mockResolvedValue([baseRecord]),
    get: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue(undefined),
    softDelete: vi.fn().mockResolvedValue(undefined),
    getRegistryVersion: vi.fn().mockResolvedValue(1),
    bumpRegistryVersion: vi.fn().mockResolvedValue(2),
    ...overrides,
  }
}

function makeMutator(overrides: Partial<ISchemaMutator> = {}): ISchemaMutator {
  return {
    getColumns: vi.fn().mockResolvedValue(null),
    execDdl: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function makeActivityLogger() {
  return { log: vi.fn() }
}

// ─── App builder ─────────────────────────────────────────────────────────────

function buildApp(opts: {
  role?: string
  repo?: ISeedRepository
  mutator?: ISchemaMutator
  backrefMap?: Map<string, any[]>
} = {}) {
  const app = new Hono()
  const repo = opts.repo ?? makeRepo()
  const mutator = opts.mutator ?? makeMutator()
  const backrefMap = opts.backrefMap ?? new Map()
  const activityLogger = makeActivityLogger()

  app.use('*', async (c, next) => {
    c.set('jwtPayload' as never, opts.role ? { sub: 'u1', email: 'a@b.com', role: opts.role } : null)
    c.set('seedRepository' as never, repo)
    c.set('schemaMutator' as never, mutator)
    c.set('backrefMap' as never, backrefMap)
    c.set('activityLogger' as never, activityLogger)
    c.set('env' as never, { ENV: 'test' })
    await next()
  })
  app.route('/', seedsApp)
  return { app, repo, mutator, activityLogger }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /', () => {
  it('403 for non-admin', async () => {
    const { app } = buildApp({ role: 'user' })
    const res = await app.request('/', { method: 'GET' })
    expect(res.status).toBe(403)
  })

  it('200 returns all records', async () => {
    const { app } = buildApp({ role: 'admin' })
    const res = await app.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as any[]
    expect(body).toHaveLength(1)
    expect(body[0].slug).toBe('articles')
  })
})

describe('GET /:slug', () => {
  it('404 for missing seed', async () => {
    const { app } = buildApp({ role: 'admin' })
    const res = await app.request('/nope', { method: 'GET' })
    expect(res.status).toBe(404)
  })

  it('200 returns the record', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(baseRecord) })
    const { app } = buildApp({ role: 'admin', repo })
    const res = await app.request('/articles', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.slug).toBe('articles')
  })
})

describe('POST / (create)', () => {
  it('403 for non-admin', async () => {
    const { app } = buildApp({ role: 'user' })
    const res = await app.request('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(baseSeed) })
    expect(res.status).toBe(403)
  })

  it('409 when slug already active', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(baseRecord) })
    const { app } = buildApp({ role: 'admin', repo })
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseSeed),
    })
    expect(res.status).toBe(409)
  })

  it('creates new seed: planCreateSeed DDL emitted, upsert called, 201', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(null), listActive: vi.fn().mockResolvedValue([]) })
    const mutator = makeMutator({ getColumns: vi.fn().mockResolvedValue(null) })
    const { app, activityLogger } = buildApp({ role: 'admin', repo, mutator })

    const newSeed: Seed = {
      slug: 'notes',
      label: 'Notes',
      displayNameAlias: 'title',
      branches: [{ id: 'br_01', alias: 'title', label: 'Title', type: 'text' }],
    }
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSeed),
    })
    expect(res.status).toBe(201)

    const ddlCalls = (mutator.execDdl as ReturnType<typeof vi.fn>).mock.calls
    expect(ddlCalls.length).toBe(1)
    const stmts: string[] = ddlCalls[0][0]
    expect(stmts.some((s: string) => s.includes('CREATE TABLE') && s.includes('content_notes'))).toBe(true)
    expect(stmts.some((s: string) => s.includes('DROP'))).toBe(false)

    expect((repo.upsert as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
    expect((repo.bumpRegistryVersion as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
    expect(activityLogger.log.mock.calls.length).toBe(1)
    expect(activityLogger.log.mock.calls[0][0].action).toBe('create')

    const body = await res.json() as any
    expect(body.slug).toBe('notes')
  })

  it('assigns br_NN ids to branches without ids', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(null), listActive: vi.fn().mockResolvedValue([]) })
    const mutator = makeMutator()
    const { app } = buildApp({ role: 'admin', repo, mutator })

    const noIdSeed = {
      slug: 'tags',
      label: 'Tags',
      displayNameAlias: 'name',
      branches: [{ alias: 'name', label: 'Name', type: 'text' }],
    }
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(noIdSeed),
    })
    expect(res.status).toBe(201)
    const upsertArg = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][1] as Seed
    expect(upsertArg.branches[0].id).toMatch(/^br_\d+$/)
  })

  it('revives a soft-deleted seed without failing on IF NOT EXISTS', async () => {
    const deletedRecord: SeedRecord = { ...baseRecord, status: 'deleted' }
    const repo = makeRepo({
      get: vi.fn().mockResolvedValue(deletedRecord),
      listActive: vi.fn().mockResolvedValue([]),
    })
    const existingCols = new Set(['id', 'title'])
    const mutator = makeMutator({ getColumns: vi.fn().mockResolvedValue(existingCols) })
    const { app } = buildApp({ role: 'admin', repo, mutator })

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseSeed),
    })
    expect(res.status).toBe(201)
    // No CREATE TABLE was emitted (table already exists), planExtendSeed path taken
    const stmts: string[] = (mutator.execDdl as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] ?? []
    expect(stmts.every((s: string) => !s.includes('CREATE TABLE IF NOT EXISTS content_articles') || s.includes('IF NOT EXISTS'))).toBe(true)
  })

  it('422 for unknown relation target', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(null), listActive: vi.fn().mockResolvedValue([]) })
    const { app } = buildApp({ role: 'admin', repo })

    const relSeed: Seed = {
      slug: 'posts',
      label: 'Posts',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
        { id: 'br_02', alias: 'author', label: 'Author', type: 'relation', targetSeed: 'nonexistent' },
      ],
    }
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(relSeed),
    })
    expect(res.status).toBe(422)
  })
})

describe('PUT /:slug (edit)', () => {
  it('403 for non-admin', async () => {
    const { app } = buildApp({ role: 'user' })
    const res = await app.request('/articles', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(baseSeed) })
    expect(res.status).toBe(403)
  })

  it('422 on alias rename (same id, different alias)', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(baseRecord) })
    const { app } = buildApp({ role: 'admin', repo })

    const renamed: Seed = {
      ...baseSeed,
      branches: [
        { id: 'br_01', alias: 'headline', label: 'Headline', type: 'text' }, // alias changed
        { id: 'br_02', alias: 'body', label: 'Body', type: 'richtext' },
      ],
    }
    const res = await app.request('/articles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(renamed),
    })
    expect(res.status).toBe(422)
    const body = await res.json() as any
    expect(body.type).toContain('alias-rename-not-supported')
  })

  it('422 on branch type change', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(baseRecord) })
    const { app } = buildApp({ role: 'admin', repo })

    const typeChanged: Seed = {
      ...baseSeed,
      branches: [
        { id: 'br_01', alias: 'title', label: 'Title', type: 'number' }, // type changed
        { id: 'br_02', alias: 'body', label: 'Body', type: 'richtext' },
      ],
    }
    const res = await app.request('/articles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(typeChanged),
    })
    expect(res.status).toBe(422)
    const body = await res.json() as any
    expect(body.type).toContain('branch-type-change-not-supported')
  })

  it('add branch emits ADD COLUMN, no DROP', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(baseRecord) })
    const existingCols = new Set(['id', 'title', 'body'])
    const mutator = makeMutator({ getColumns: vi.fn().mockResolvedValue(existingCols) })
    const { app } = buildApp({ role: 'admin', repo, mutator })

    const withNew: Seed = {
      ...baseSeed,
      branches: [
        ...baseSeed.branches,
        { id: 'br_03', alias: 'summary', label: 'Summary', type: 'text' },
      ],
    }
    const res = await app.request('/articles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withNew),
    })
    expect(res.status).toBe(200)

    const stmts: string[] = (mutator.execDdl as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(stmts.some((s: string) => s.includes('ADD COLUMN') && s.includes('summary'))).toBe(true)
    expect(stmts.every((s: string) => !s.includes('DROP'))).toBe(true)
  })

  it('removing a branch: no DROP emitted, column retained', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(baseRecord) })
    const existingCols = new Set(['id', 'title', 'body'])
    const mutator = makeMutator({ getColumns: vi.fn().mockResolvedValue(existingCols) })
    const { app } = buildApp({ role: 'admin', repo, mutator })

    const withRemoved: Seed = {
      ...baseSeed,
      branches: [baseSeed.branches[0]], // body removed
    }
    const res = await app.request('/articles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withRemoved),
    })
    expect(res.status).toBe(200)

    const allStmts: string[] = (mutator.execDdl as ReturnType<typeof vi.fn>).mock.calls.flatMap((c: any) => c[0])
    expect(allStmts.every((s: string) => !s.includes('DROP'))).toBe(true)
  })
})

describe('POST /:slug/branches (add branch)', () => {
  it('assigns id and emits ADD COLUMN', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(baseRecord) })
    const existingCols = new Set(['id', 'title', 'body'])
    const mutator = makeMutator({ getColumns: vi.fn().mockResolvedValue(existingCols) })
    const { app } = buildApp({ role: 'admin', repo, mutator })

    const res = await app.request('/articles/branches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias: 'excerpt', label: 'Excerpt', type: 'text' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.id).toMatch(/^br_\d+$/)

    const stmts: string[] = (mutator.execDdl as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(stmts.some((s: string) => s.includes('ADD COLUMN') && s.includes('excerpt'))).toBe(true)
  })

  it('column already present: no ADD COLUMN emitted', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(baseRecord) })
    const existingCols = new Set(['id', 'title', 'body', 'excerpt'])
    const mutator = makeMutator({ getColumns: vi.fn().mockResolvedValue(existingCols) })
    const { app } = buildApp({ role: 'admin', repo, mutator })

    const res = await app.request('/articles/branches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias: 'excerpt', label: 'Excerpt', type: 'text' }),
    })
    expect(res.status).toBe(200)

    const stmts: string[] = (mutator.execDdl as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] ?? []
    expect(stmts.every((s: string) => !s.includes('ADD COLUMN'))).toBe(true)
  })
})

describe('DELETE /:slug', () => {
  it('403 for non-admin', async () => {
    const { app } = buildApp({ role: 'user' })
    const res = await app.request('/articles', { method: 'DELETE' })
    expect(res.status).toBe(403)
  })

  it('soft-deletes: status flips, table not dropped, version bumped', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(baseRecord) })
    const mutator = makeMutator()
    const { app } = buildApp({ role: 'admin', repo, mutator })

    const res = await app.request('/articles', { method: 'DELETE' })
    expect(res.status).toBe(200)

    expect((repo.softDelete as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
    expect((repo.bumpRegistryVersion as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)

    // No DDL involving DROP was emitted
    const allStmts: string[] = (mutator.execDdl as ReturnType<typeof vi.fn>).mock.calls.flatMap((c: any) => c[0])
    expect(allStmts.every((s: string) => !s.includes('DROP'))).toBe(true)
  })

  it('409 when seed is referenced by another seed relation', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(baseRecord) })
    const backrefMap = new Map([['articles', [{ seedSlug: 'comments', branchAlias: 'article' }]]])
    const { app } = buildApp({ role: 'admin', repo, backrefMap })

    const res = await app.request('/articles', { method: 'DELETE' })
    expect(res.status).toBe(409)
    const body = await res.json() as any
    expect(body.type).toContain('seed-referenced')
  })

  it('404 for non-existent seed', async () => {
    const { app } = buildApp({ role: 'admin' })
    const res = await app.request('/nope', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})
