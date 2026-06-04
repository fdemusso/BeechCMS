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
