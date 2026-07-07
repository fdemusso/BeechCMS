// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed } from './types.js'
import {
  generateCreateTable,
  generateDraftTable,
  generateIndexes,
  generateFtsTable,
  generateFtsTriggers,
  generateAddColumn,
  generateJunctionTable,
  generateJunctionIndexes,
  generateJunctionDraftTable,
  indexableSearchBranches,
} from './engine.js'

/**
 * Full create-from-scratch statement set for a seed. Mirrors the CLI's buildStatements.
 * Order: parent table → indexes → draft table → FTS table → FTS triggers →
 * per multi-relation: junction table → junction indexes → junction draft table.
 * Callers that create several seeds must order seeds with sortSeedsByDependencies
 * first so relation FK targets exist.
 */
export function planCreateSeed(seed: Seed): string[] {
  const stmts: string[] = [generateCreateTable(seed), ...generateIndexes(seed)]
  const draft = generateDraftTable(seed)
  if (draft) stmts.push(draft)
  const fts = generateFtsTable(seed)
  if (fts) stmts.push(fts, ...generateFtsTriggers(seed))
  for (const branch of seed.branches) {
    if (branch.type !== 'relation' || branch.multiple !== true) continue
    stmts.push(generateJunctionTable(seed, branch), ...generateJunctionIndexes(seed, branch))
    const dj = generateJunctionDraftTable(seed, branch)
    if (dj) stmts.push(dj)
  }
  return stmts
}

export interface ExtendPlan {
  statements: string[]
  ftsRebuildNeeded: boolean
}

/**
 * Additive extension: given the columns that already exist on content_{slug}
 * (from PRAGMA table_info, passed in by the caller), return ONLY the statements
 * needed to add new branches — ADD COLUMN + indexes, plus junction tables for
 * new multi-relation branches. Never drops or renames.
 *
 * FTS: SQLite cannot ALTER an fts5 table's columns. If a new text/richtext
 * searchable branch was added, ftsRebuildNeeded=true signals the caller
 * (sprint 03) to handle it — no DROP is emitted.
 */
export function planExtendSeed(seed: Seed, existingColumns: Set<string>): ExtendPlan {
  const statements: string[] = []
  let ftsRebuildNeeded = false

  for (const branch of seed.branches) {
    if (branch.type === 'relation' && branch.multiple === true) {
      // junction table is CREATE IF NOT EXISTS — safe to re-emit
      statements.push(generateJunctionTable(seed, branch), ...generateJunctionIndexes(seed, branch))
      const dj = generateJunctionDraftTable(seed, branch)
      if (dj) statements.push(dj)
      continue
    }
    if (existingColumns.has(branch.alias)) continue
    statements.push(generateAddColumn(seed, branch))
    if ((branch.type === 'text' || branch.type === 'richtext') && branch.policies?.search !== false) {
      ftsRebuildNeeded = true
    }
  }
  // CREATE INDEX IF NOT EXISTS — idempotent, safe to re-run
  statements.push(...generateIndexes(seed))
  return { statements, ftsRebuildNeeded }
}

/**
 * Destructive FTS rebuild (sprint 06). SQLite cannot ALTER an fts5 table's
 * columns, so when a searchable branch is added, renamed, retyped, or dropped
 * the only correct fix is to drop and recreate the `fts_{slug}` virtual table
 * (and its insert/update/delete triggers), then backfill from `content_{slug}`.
 *
 * Returns an empty array when the seed has no searchable branches — in that
 * case the caller should instead drop any leftover FTS table via
 * generateDropTable's FTS statements. The returned statements are destructive
 * and must run through ISchemaMutator.execDestructive, never execDdl.
 *
 * Order: drop triggers → drop fts table → recreate table → recreate triggers →
 * backfill existing rows.
 */
export function planFtsRebuild(seed: Seed): string[] {
  const branches = indexableSearchBranches(seed)
  if (branches.length === 0) return []

  const slug = seed.slug
  const ftsTable = `fts_${slug}`
  const contentTable = `content_${slug}`
  const cols = branches.map(b => b.alias)

  const ftsTableDdl = generateFtsTable(seed)
  const triggers = generateFtsTriggers(seed)
  // generateFtsTable/Triggers return non-null here (branches.length > 0 checked).
  if (!ftsTableDdl) return []

  const ftsColList = ['entry_id', ...cols].join(', ')
  const selectList = ['id', ...cols].join(', ')

  return [
    `DROP TRIGGER IF EXISTS fts_${slug}_insert;`,
    `DROP TRIGGER IF EXISTS fts_${slug}_update;`,
    `DROP TRIGGER IF EXISTS fts_${slug}_delete;`,
    `DROP TABLE IF EXISTS ${ftsTable};`,
    ftsTableDdl,
    ...triggers,
    `INSERT INTO ${ftsTable}(${ftsColList}) SELECT ${selectList} FROM ${contentTable};`,
  ]
}
