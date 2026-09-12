// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import type { Seed } from '@beechcms/core'

// ── fixtures ─────────────────────────────────────────────────────────────────

const ARTICLE_SEED: Seed = {
  slug: 'articles',
  label: 'Articles',
  displayNameAlias: 'title',
  branches: [
    { alias: 'title', label: 'Title', type: 'text' },
    { alias: 'views', label: 'Views', type: 'number' },
  ],
} as Seed

const REGISTRY: Record<string, Seed> = { articles: ARTICLE_SEED }

// ── nextMigrationIndex ────────────────────────────────────────────────────────

describe('nextMigrationIndex', () => {
  let dir: string

  beforeEach(() => {
    dir = join(tmpdir(), `beech-test-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
  })

  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('returns 0000 when directory is empty', async () => {
    const { nextMigrationIndex } = await import('../lib/migration-writer.js')
    expect(nextMigrationIndex(dir)).toBe('0000')
  })

  it('returns 0034 when highest prefix is 0033', async () => {
    const { nextMigrationIndex } = await import('../lib/migration-writer.js')
    for (const name of ['0031_foo.sql', '0033_bar.sql', '0029_baz.sql']) {
      const { writeFileSync } = await import('node:fs')
      writeFileSync(join(dir, name), '')
    }
    expect(nextMigrationIndex(dir)).toBe('0034')
  })

  it('returns 0000 when directory does not exist', async () => {
    const { nextMigrationIndex } = await import('../lib/migration-writer.js')
    expect(nextMigrationIndex(join(tmpdir(), 'no-such-dir-beech'))).toBe('0000')
  })
})

// ── buildMigrationSql ─────────────────────────────────────────────────────────

describe('buildMigrationSql — additive emission', () => {
  it('emits planCreateSeed statements when table is missing', async () => {
    const { buildMigrationSql } = await import('../lib/migration-writer.js')
    const diffs = [{ slug: 'articles', tableExists: false, columns: [] }]
    const plan = buildMigrationSql(diffs, REGISTRY)
    expect(plan.additiveCount).toBeGreaterThan(0)
    expect(plan.sql).toContain('articles')
    expect(plan.destructiveSlugs).toHaveLength(0)
  })

  it('emits generateAddColumn for missing columns', async () => {
    const { buildMigrationSql } = await import('../lib/migration-writer.js')
    const diffs = [{
      slug: 'articles',
      tableExists: true,
      columns: [
        { name: 'title', status: 'ok' as const },
        { name: 'views', status: 'missing' as const, expectedType: 'REAL' },
      ],
    }]
    const plan = buildMigrationSql(diffs, REGISTRY)
    expect(plan.additiveCount).toBeGreaterThan(0)
    expect(plan.sql).toContain('views')
    expect(plan.destructiveSlugs).toHaveLength(0)
  })

  it('emits commented block for destructive drift, not executable SQL', async () => {
    const { buildMigrationSql } = await import('../lib/migration-writer.js')
    const diffs = [{
      slug: 'articles',
      tableExists: true,
      columns: [
        { name: 'title', status: 'type_mismatch' as const, expectedType: 'TEXT', actualType: 'INTEGER' },
      ],
    }]
    const plan = buildMigrationSql(diffs, REGISTRY)
    expect(plan.additiveCount).toBe(0)
    expect(plan.destructiveSlugs).toContain('articles')
    expect(plan.sql).toContain('-- ⚠')
    expect(plan.sql).not.toMatch(/^ALTER TABLE/m)
    expect(plan.sql).not.toMatch(/^DROP/m)
  })

  it('additiveCount is 0 when only destructive drift exists', async () => {
    const { buildMigrationSql } = await import('../lib/migration-writer.js')
    const diffs = [{
      slug: 'articles',
      tableExists: true,
      columns: [
        { name: 'title', status: 'extra' as const, actualType: 'TEXT' },
      ],
    }]
    const plan = buildMigrationSql(diffs, REGISTRY)
    expect(plan.additiveCount).toBe(0)
    expect(plan.destructiveSlugs).toContain('articles')
  })

  it('processes seeds with no drift as no-op', async () => {
    const { buildMigrationSql } = await import('../lib/migration-writer.js')
    const diffs = [{
      slug: 'articles',
      tableExists: true,
      columns: [
        { name: 'title', status: 'ok' as const },
        { name: 'views', status: 'ok' as const },
      ],
    }]
    const plan = buildMigrationSql(diffs, REGISTRY)
    expect(plan.additiveCount).toBe(0)
    expect(plan.destructiveSlugs).toHaveLength(0)
  })
})

// ── schemaDiff command ────────────────────────────────────────────────────────

// Partial mock: `nextMigrationIndex` / `buildMigrationSql` above need the real filesystem, so only
// `existsSync` — the one call `schemaDiff` makes to decide whether a manifest exists — is faked.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, existsSync: vi.fn(actual.existsSync) }
})
vi.mock('../lib/wrangler.js', () => ({
  queryD1: vi.fn(),
  findWranglerConfig: vi.fn(() => '/fake/wrangler.jsonc'),
  resolveDbName: vi.fn(() => 'beech-db'),
  getLocalD1SqlitePath: vi.fn(() => '/fake/state.sqlite'),
}))
vi.mock('../lib/manifest-loader.js', () => ({
  DEFAULT_MANIFEST_PATH: 'beech.schema.ts',
  loadManifest: vi.fn(),
}))

const POSTS_SEED: Seed = {
  slug: 'posts',
  label: 'Posts',
  displayNameAlias: 'title',
  branches: [{ id: 'br_01', alias: 'title', label: 'Title', type: 'text' }],
} as Seed

const POSTS_ROW = { slug: 'posts', definition: JSON.stringify(POSTS_SEED), status: 'active' }

const FULL_COLUMNS = [
  { cid: 0, name: 'id', type: 'TEXT', notnull: 1, dflt_value: null, pk: 1 },
  { cid: 1, name: 'slug', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 2, name: 'status', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 3, name: 'title', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
  { cid: 4, name: 'created_at', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 5, name: 'updated_at', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 0 },
]

const MISSING_TITLE_COLUMNS = FULL_COLUMNS.filter(c => c.name !== 'title')

function mockQueryD1(tableInfoRows: typeof FULL_COLUMNS) {
  return (sql: string) => {
    if (sql.includes('FROM seeds')) return [POSTS_ROW]
    if (sql.startsWith('PRAGMA table_info')) return tableInfoRows
    return []
  }
}

describe('schemaDiff command', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { existsSync } = await import('node:fs')
    vi.mocked(existsSync).mockReturnValue(false)
  })

  it('reports physical drift and exits non-zero', async () => {
    const { queryD1 } = await import('../lib/wrangler.js')
    vi.mocked(queryD1).mockImplementation(mockQueryD1(MISSING_TITLE_COLUMNS))
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit:1') })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { schemaDiff } = await import('../commands/schema-diff.js')

    await expect(schemaDiff({})).rejects.toThrow('exit:1')

    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('exits zero when definitions, tables and manifest all agree', async () => {
    const { queryD1 } = await import('../lib/wrangler.js')
    const { existsSync } = await import('node:fs')
    const { loadManifest } = await import('../lib/manifest-loader.js')
    vi.mocked(queryD1).mockImplementation(mockQueryD1(FULL_COLUMNS))
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(loadManifest).mockResolvedValue({
      version: 1,
      seeds: [{ slug: 'posts', label: 'Posts', displayNameAlias: 'title', branches: [{ alias: 'title', label: 'Title', type: 'text' }] }],
    } as never)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit:1') })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { schemaDiff } = await import('../commands/schema-diff.js')

    await schemaDiff({})

    expect(exitSpy).not.toHaveBeenCalled()
    expect(logSpy.mock.calls.flat().join('\n')).toContain('No drift.')
  })

  it('skips the manifest section when no beech.schema.ts exists', async () => {
    const { queryD1 } = await import('../lib/wrangler.js')
    const { existsSync } = await import('node:fs')
    vi.mocked(queryD1).mockImplementation(mockQueryD1(FULL_COLUMNS))
    vi.mocked(existsSync).mockReturnValue(false)
    vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit:1') })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { schemaDiff } = await import('../commands/schema-diff.js')

    await schemaDiff({})

    const output = logSpy.mock.calls.flat().join('\n')
    expect(output).toContain('no beech.schema.ts')
    expect(output).toContain('content_posts')
  })
})
