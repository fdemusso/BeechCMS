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
    hardDelete: vi.fn().mockResolvedValue(undefined),
    getRegistryVersion: vi.fn().mockResolvedValue(1),
    bumpRegistryVersion: vi.fn().mockResolvedValue(2),
    ...overrides,
  }
}

function makeMutator(overrides: Partial<ISchemaMutator> = {}): ISchemaMutator {
  return {
    getColumns: vi.fn().mockResolvedValue(null),
    execDdl: vi.fn().mockResolvedValue(undefined),
    dropTable: vi.fn().mockResolvedValue(undefined),
    dropColumn: vi.fn().mockResolvedValue(undefined),
    renameColumn: vi.fn().mockResolvedValue(undefined),
    execDestructive: vi.fn().mockResolvedValue(undefined),
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
  automationRepository?: any
  db?: any
} = {}) {
  const app = new Hono()
  const repo = opts.repo ?? makeRepo()
  const mutator = opts.mutator ?? makeMutator()
  const backrefMap = opts.backrefMap ?? new Map()
  const activityLogger = makeActivityLogger()
  // Default stub DB (used by hard-delete R2 cascade) — no results
  const db = opts.db ?? { prepare: () => ({ all: async () => ({ results: [] }) }) }
  const automationRepository = opts.automationRepository ?? { list: async () => [] }

  app.use('*', async (c, next) => {
    c.set('jwtPayload' as never, opts.role ? { sub: 'u1', email: 'a@b.com', role: opts.role } : null)
    c.set('seedRepository' as never, repo)
    c.set('schemaMutator' as never, mutator)
    c.set('backrefMap' as never, backrefMap)
    c.set('activityLogger' as never, activityLogger)
    c.set('automationRepository' as never, automationRepository)
    c.set('env' as never, { ENV: 'test', DB: db })
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

// ─── Sprint 06 Danger Zone routes ────────────────────────────────────────────

describe('GET /:slug/orphans', () => {
  it('returns orphan columns not in the definition', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(baseRecord) })
    // DB has 'id', 'slug', 'status', 'created_at', 'updated_at', 'title', 'body', 'legacy'
    const dbCols = new Set(['id', 'slug', 'status', 'created_at', 'updated_at', 'title', 'body', 'legacy'])
    const mutator = makeMutator({ getColumns: vi.fn().mockResolvedValue(dbCols) })
    const { app } = buildApp({ role: 'admin', repo, mutator })

    const res = await app.request('/articles/orphans', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.orphans).toContain('legacy')
    expect(body.orphans).not.toContain('title')
  })

  it('returns empty when DB has no orphans', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(baseRecord) })
    const dbCols = new Set(['id', 'slug', 'status', 'created_at', 'updated_at', 'title', 'body'])
    const mutator = makeMutator({ getColumns: vi.fn().mockResolvedValue(dbCols) })
    const { app } = buildApp({ role: 'admin', repo, mutator })

    const res = await app.request('/articles/orphans', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.orphans).toHaveLength(0)
  })
})

describe('DELETE /:slug/hard', () => {
  it('400 on confirm mismatch', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(baseRecord) })
    const { app } = buildApp({ role: 'admin', repo })

    const res = await app.request('/articles/hard', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'wrong' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as any
    expect(body.type).toContain('confirmation-required')
  })

  it('409 when seed is referenced', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(baseRecord) })
    const backrefMap = new Map([['articles', [{ sourceSlug: 'comments' }]]])
    const { app } = buildApp({ role: 'admin', repo, backrefMap })

    const res = await app.request('/articles/hard', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'articles' }),
    })
    expect(res.status).toBe(409)
  })

  it('hard delete: execDestructive called, hardDelete called, version bumped, audit logged', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(baseRecord) })
    const mutator = makeMutator()
    const { app, activityLogger } = buildApp({ role: 'admin', repo, mutator })

    const res = await app.request('/articles/hard', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'articles' }),
    })
    expect(res.status).toBe(200)

    expect((mutator.execDestructive as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0)
    // execDdl must NOT have been called for DROP
    const ddlCalls: string[][] = (mutator.execDdl as ReturnType<typeof vi.fn>).mock.calls.flatMap((c: any) => c[0])
    expect(ddlCalls.every((s: string) => !s.toUpperCase().includes('DROP'))).toBe(true)

    expect((repo.hardDelete as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
    expect((repo.bumpRegistryVersion as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
    expect(activityLogger.log.mock.calls[0][0].action).toBe('delete')
    expect(activityLogger.log.mock.calls[0][0].details.op).toBe('hard-delete')
  })
})

describe('DELETE /:slug/branches/:branchId', () => {
  it('400 on confirm mismatch', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(baseRecord) })
    const { app } = buildApp({ role: 'admin', repo })

    const res = await app.request('/articles/branches/br_01', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'wrong' }),
    })
    expect(res.status).toBe(400)
  })

  it('drops branch: execDestructive called, definition updated, version bumped', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(baseRecord) })
    const mutator = makeMutator()
    const { app } = buildApp({ role: 'admin', repo, mutator })

    const res = await app.request('/articles/branches/br_02', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'articles.body' }),
    })
    expect(res.status).toBe(200)

    expect((mutator.execDestructive as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
    const upsertArg = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][1] as any
    expect(upsertArg.branches.find((b: any) => b.id === 'br_02')).toBeUndefined()
    expect((repo.bumpRegistryVersion as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })

  it('404 for unknown branchId', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(baseRecord) })
    const { app } = buildApp({ role: 'admin', repo })

    const res = await app.request('/articles/branches/br_99', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'articles.unknown' }),
    })
    expect(res.status).toBe(404)
  })
})

describe('PATCH /:slug/branches/:branchId/rename', () => {
  it('400 on confirm mismatch', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(baseRecord) })
    const { app } = buildApp({ role: 'admin', repo })

    const res = await app.request('/articles/branches/br_01/rename', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newAlias: 'headline', confirm: 'wrong' }),
    })
    expect(res.status).toBe(400)
  })

  it('renames alias: execDestructive called with RENAME, definition updated, automation warnings returned', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(baseRecord) })
    const mutator = makeMutator()
    const automationRepository = { list: vi.fn().mockResolvedValue([{ id: 'auto_1', conditions: 'title' }]) }
    const { app } = buildApp({ role: 'admin', repo, mutator, automationRepository })

    const res = await app.request('/articles/branches/br_01/rename', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newAlias: 'headline', confirm: 'articles.title' }),
    })
    expect(res.status).toBe(200)

    const destructiveCalls: string[][] = (mutator.execDestructive as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(destructiveCalls.some((s: string) => s.toUpperCase().includes('RENAME COLUMN') || s.toUpperCase().includes('RENAME TO'))).toBe(true)

    const upsertArg = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][1] as any
    const renamed = upsertArg.branches.find((b: any) => b.id === 'br_01')
    expect(renamed?.alias).toBe('headline')

    const body = await res.json() as any
    expect(body.affectedAutomations).toContain('auto_1')
  })
})

describe('PATCH /:slug/branches/:branchId/retype', () => {
  it('400 on confirm mismatch', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(baseRecord) })
    const { app } = buildApp({ role: 'admin', repo })

    const res = await app.request('/articles/branches/br_01/retype', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newType: 'number', confirm: 'wrong' }),
    })
    expect(res.status).toBe(400)
  })

  it('retypes branch: execDestructive called, definition updated, version bumped', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(baseRecord) })
    const mutator = makeMutator()
    const { app } = buildApp({ role: 'admin', repo, mutator })

    const res = await app.request('/articles/branches/br_01/retype', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newType: 'number', confirm: 'articles.title' }),
    })
    expect(res.status).toBe(200)

    expect((mutator.execDestructive as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
    const upsertArg = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][1] as any
    expect(upsertArg.branches.find((b: any) => b.id === 'br_01')?.type).toBe('number')
    expect((repo.bumpRegistryVersion as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })
})

describe('POST /:slug/fts/rebuild', () => {
  it('calls execDestructive with FTS statements and logs audit', async () => {
    const repo = makeRepo({ get: vi.fn().mockResolvedValue(baseRecord) })
    const mutator = makeMutator()
    const { app, activityLogger } = buildApp({ role: 'admin', repo, mutator })

    const res = await app.request('/articles/fts/rebuild', { method: 'POST' })
    expect(res.status).toBe(200)

    expect((mutator.execDestructive as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
    const stmts: string[] = (mutator.execDestructive as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(stmts.some((s: string) => s.includes('fts_articles'))).toBe(true)
    expect(activityLogger.log.mock.calls[0][0].details.op).toBe('fts-rebuild')
  })
})
