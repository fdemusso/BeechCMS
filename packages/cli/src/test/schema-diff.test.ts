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

describe('schemaDiff command', () => {
  beforeEach(() => { vi.resetModules() })

  it('exits early when registry is empty', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { schemaDiff } = await import('../commands/schema-diff.js')
    await schemaDiff({ local: true, write: false, registry: {} })
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No seeds found'))
    consoleSpy.mockRestore()
  })

  it('prints preview SQL without writing files when no --write', async () => {
    vi.doMock('../lib/wrangler.js', () => ({
      findWranglerConfig: () => null,
      resolveDbName: () => 'beech-db',
      queryD1: () => [],
    }))
    vi.doMock('../lib/schema-diff.js', async () => {
      const actual = await vi.importActual('../lib/schema-diff.js') as object
      return {
        ...actual,
        diffSeed: vi.fn().mockResolvedValue({
          slug: 'articles', tableExists: false, columns: [],
        }),
      }
    })

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { schemaDiff } = await import('../commands/schema-diff.js')
    await schemaDiff({ local: true, write: false, registry: REGISTRY })
    const output = consoleSpy.mock.calls.flat().join('\n')
    expect(output).toContain('Re-run with --write')
    consoleSpy.mockRestore()
    vi.doUnmock('../lib/wrangler.js')
    vi.doUnmock('../lib/schema-diff.js')
  })

  it('writes migration file when --write and additive drift exists', async () => {
    const dir = join(tmpdir(), `beech-schema-diff-test-${Date.now()}`)
    mkdirSync(dir, { recursive: true })

    vi.doMock('../lib/wrangler.js', () => ({
      findWranglerConfig: () => null,
      resolveDbName: () => 'beech-db',
      queryD1: () => [],
    }))
    vi.doMock('../lib/schema-diff.js', async () => {
      const actual = await vi.importActual('../lib/schema-diff.js') as object
      return {
        ...actual,
        diffSeed: vi.fn().mockResolvedValue({
          slug: 'articles', tableExists: false, columns: [],
        }),
      }
    })

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { schemaDiff } = await import('../commands/schema-diff.js')
    await schemaDiff({ local: true, write: true, name: 'test_migration', migrationsDir: dir, registry: REGISTRY })

    const files = readdirSync(dir)
    expect(files.some(f => f.endsWith('.sql'))).toBe(true)
    const output = consoleSpy.mock.calls.flat().join('\n')
    expect(output).toContain('Wrote')

    consoleSpy.mockRestore()
    rmSync(dir, { recursive: true, force: true })
    vi.doUnmock('../lib/wrangler.js')
    vi.doUnmock('../lib/schema-diff.js')
  })

  it('does not write file when only destructive drift', async () => {
    vi.doMock('../lib/wrangler.js', () => ({
      findWranglerConfig: () => null,
      resolveDbName: () => 'beech-db',
      queryD1: () => [],
    }))
    vi.doMock('../lib/schema-diff.js', async () => {
      const actual = await vi.importActual('../lib/schema-diff.js') as object
      return {
        ...actual,
        diffSeed: vi.fn().mockResolvedValue({
          slug: 'articles',
          tableExists: true,
          columns: [{ name: 'title', status: 'type_mismatch', expectedType: 'TEXT', actualType: 'INTEGER' }],
        }),
      }
    })

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { schemaDiff } = await import('../commands/schema-diff.js')
    await schemaDiff({ local: true, write: true, registry: REGISTRY })
    const output = consoleSpy.mock.calls.flat().join('\n')
    expect(output).toContain('Only destructive drift')

    consoleSpy.mockRestore()
    vi.doUnmock('../lib/wrangler.js')
    vi.doUnmock('../lib/schema-diff.js')
  })
})
