// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  generateAddColumn,
  generateIndexes,
  planCreateSeed,
  type Seed,
} from '@beechcms/core'
import type { SeedDiff } from './schema-diff.js'

/** Statuses we will NOT auto-migrate — they need human review in a hand-written file. */
const DESTRUCTIVE: ReadonlySet<SeedDiff['columns'][number]['status']> = new Set([
  'extra', 'type_mismatch', 'fk_mismatch',
])

export interface MigrationPlan {
  /** Full SQL file body (may be empty if no additive changes). */
  sql: string
  /** Number of executable (additive) statements emitted. */
  additiveCount: number
  /** Slugs whose drift includes destructive changes that were NOT emitted. */
  destructiveSlugs: string[]
}

/** Scans a migrations dir and returns the next zero-padded 4-digit prefix (e.g. "0034"). */
export function nextMigrationIndex(migrationsDir: string): string {
  if (!existsSync(migrationsDir)) return '0000'
  let max = -1
  for (const f of readdirSync(migrationsDir)) {
    const m = /^(\d{4})_/.exec(f)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return String(max + 1).padStart(4, '0')
}

/**
 * Build an ADDITIVE migration from already-computed diffs.
 * - tableExists === false        → full planCreateSeed(seed)
 * - status 'missing'             → generateAddColumn(seed, branch)
 * - status 'index_missing'       → matching CREATE INDEX IF NOT EXISTS line
 * - destructive statuses         → emitted as a commented -- ⚠ block, never executable
 * `seeds` MUST be dependency-sorted by the caller (sortSeedsByDependencies).
 */
export function buildMigrationSql(
  diffs: SeedDiff[],
  registry: Record<string, Seed>,
): MigrationPlan {
  const lines: string[] = []
  let additiveCount = 0
  const destructiveSlugs: string[] = []

  for (const diff of diffs) {
    const seed = registry[diff.slug]
    if (!seed) continue

    if (!diff.tableExists) {
      lines.push(`-- ${diff.slug}: create table from scratch`)
      for (const stmt of planCreateSeed(seed)) { lines.push(stmt); additiveCount++ }
      lines.push('')
      continue
    }

    const missing = diff.columns.filter(c => c.status === 'missing')
    const idxMissing = diff.columns.filter(c => c.status === 'index_missing')
    const destructive = diff.columns.filter(c => DESTRUCTIVE.has(c.status))

    if (missing.length || idxMissing.length) {
      lines.push(`-- ${diff.slug}: additive changes`)
      for (const col of missing) {
        const branch = seed.branches.find(b => b.alias === col.name)
        if (branch) { lines.push(generateAddColumn(seed, branch)); additiveCount++ }
      }
      // generateIndexes is idempotent (CREATE INDEX IF NOT EXISTS) — re-emitting is safe.
      if (idxMissing.length) {
        for (const stmt of generateIndexes(seed)) { lines.push(stmt); additiveCount++ }
      }
      lines.push('')
    }

    if (destructive.length) {
      destructiveSlugs.push(diff.slug)
      lines.push(`-- ⚠ ${diff.slug}: DESTRUCTIVE drift NOT auto-migrated — review manually:`)
      for (const col of destructive) {
        lines.push(`--   ${col.status}: ${col.name}` +
          (col.actualType ? ` (db: ${col.actualType})` : ''))
      }
      lines.push('')
    }
  }

  return { sql: lines.join('\n').trimEnd() + '\n', additiveCount, destructiveSlugs }
}

/** Writes the migration file and returns its absolute path. */
export function writeMigrationFile(
  migrationsDir: string, index: string, name: string, sql: string,
): string {
  if (!existsSync(migrationsDir)) mkdirSync(migrationsDir, { recursive: true })
  const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'schema_sync'
  const file = join(migrationsDir, `${index}_${safe}.sql`)
  writeFileSync(file, sql, 'utf-8')
  return file
}
