// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed, Branch, BranchType } from './types.js'
import { junctionTableName, generateFtsTable, generateFtsTriggers } from './engine.js'

const BRANCH_SQL_TYPE: Record<BranchType, 'TEXT' | 'REAL' | 'INTEGER'> = {
  text:     'TEXT',
  number:   'REAL',
  boolean:  'INTEGER',
  date:     'INTEGER',
  json:     'TEXT',
  richtext: 'TEXT',
  file:     'TEXT',
  tags:     'TEXT',
  relation: 'TEXT',
  repeater: 'TEXT',
}

/** Branch types that receive a B-tree index in generateIndexes (used by retype to drop/recreate). */
const INDEXABLE_TYPES = new Set<BranchType>(['text', 'number', 'date', 'boolean', 'relation'])

function searchBranches(seed: Seed): Branch[] {
  return seed.branches.filter(
    b => (b.type === 'text' || b.type === 'richtext') && b.policies?.search !== false,
  )
}

function ftsTriggerDrops(slug: string): string[] {
  return [
    `DROP TRIGGER IF EXISTS fts_${slug}_insert;`,
    `DROP TRIGGER IF EXISTS fts_${slug}_update;`,
    `DROP TRIGGER IF EXISTS fts_${slug}_delete;`,
    `DROP TABLE IF EXISTS fts_${slug};`,
  ]
}

/**
 * Ordered DROP TABLE statements for a full hard-delete of a seed's tables.
 * Order: junction drafts → junctions → FTS triggers → FTS table → drafts → main table.
 * All statements use IF EXISTS (idempotent).
 */
export function generateDropTable(seed: Seed): string[] {
  const stmts: string[] = []
  const { slug } = seed

  for (const branch of seed.branches) {
    if (branch.type !== 'relation' || branch.multiple !== true) continue
    const jt = junctionTableName(slug, branch.alias)
    stmts.push(`DROP TABLE IF EXISTS ${jt}_drafts;`)
    stmts.push(`DROP TABLE IF EXISTS ${jt};`)
  }

  stmts.push(...ftsTriggerDrops(slug))
  stmts.push(`DROP TABLE IF EXISTS content_${slug}_drafts;`)
  stmts.push(`DROP TABLE IF EXISTS content_${slug};`)

  return stmts
}

/**
 * DROP COLUMN statements for a single branch (by alias).
 * For multi-relation branches: drops the junction tables (no column on parent).
 * For regular branches: drops from main table + drafts table (if allowDrafts).
 * Does NOT include FTS handling — callers must prepend ftsTriggerDrops() and
 * append planFtsRebuild() when the branch is searchable.
 */
export function generateDropColumn(seed: Seed, alias: string): string[] {
  const stmts: string[] = []
  const { slug } = seed
  const branch = seed.branches.find(b => b.alias === alias)
  if (!branch) throw new Error(`Branch '${alias}' not found in seed '${slug}'`)

  if (branch.type === 'relation' && branch.multiple === true) {
    const jt = junctionTableName(slug, alias)
    if (seed.allowDrafts) stmts.push(`DROP TABLE IF EXISTS ${jt}_drafts;`)
    stmts.push(`DROP TABLE IF EXISTS ${jt};`)
  } else {
    stmts.push(`ALTER TABLE content_${slug} DROP COLUMN ${alias};`)
    if (seed.allowDrafts) stmts.push(`ALTER TABLE content_${slug}_drafts DROP COLUMN ${alias};`)
  }

  return stmts
}

/**
 * RENAME COLUMN statements for a branch alias change.
 * Updates main table + drafts (if allowDrafts).
 * Does NOT handle FTS — callers must rebuild FTS separately (SQLite auto-updates
 * trigger bodies on RENAME but the FTS virtual-table columns keep the old name).
 */
export function generateRenameColumn(seed: Seed, fromAlias: string, toAlias: string): string[] {
  const stmts: string[] = []
  const { slug } = seed
  stmts.push(`ALTER TABLE content_${slug} RENAME COLUMN ${fromAlias} TO ${toAlias};`)
  if (seed.allowDrafts) {
    stmts.push(`ALTER TABLE content_${slug}_drafts RENAME COLUMN ${fromAlias} TO ${toAlias};`)
  }
  return stmts
}

/**
 * Full FTS rebuild: drop triggers + FTS table, then recreate them, then backfill.
 * Returns an empty array if the seed has no searchable branches.
 * The drop steps use IF EXISTS so this is safe to call even if FTS was already dropped.
 */
export function planFtsRebuild(seed: Seed): string[] {
  const rtBranches = searchBranches(seed)
  if (rtBranches.length === 0) return []

  const { slug } = seed
  const stmts: string[] = [...ftsTriggerDrops(slug)]

  const ftsTable = generateFtsTable(seed)
  if (ftsTable) stmts.push(ftsTable)
  stmts.push(...generateFtsTriggers(seed))

  const cols = rtBranches.map(b => b.alias)
  stmts.push(
    `INSERT INTO fts_${slug}(entry_id, ${cols.join(', ')}) SELECT id, ${cols.join(', ')} FROM content_${slug};`,
  )

  return stmts
}

export interface RetypeColumnPlan {
  statements: string[]
  ftsRebuildNeeded: boolean
}

/**
 * Generates statements to change a branch's SQL storage type using the
 * add-new-column / copy / drop-old / rename approach.
 * Includes FTS rebuild statements when the branch is (or becomes) searchable.
 * `updatedSeed` must already reflect the new type on the renamed branch.
 */
export function planRetypeColumn(
  seed: Seed,
  alias: string,
  newType: BranchType,
  updatedSeed: Seed,
): RetypeColumnPlan {
  const branch = seed.branches.find(b => b.alias === alias)
  if (!branch) throw new Error(`Branch '${alias}' not found in seed '${seed.slug}'`)

  const { slug } = seed
  const newSqlType = BRANCH_SQL_TYPE[newType]
  const tmpAlias = `${alias}_migrate`
  const stmts: string[] = []

  // Always drop FTS first to avoid "column referenced in trigger" errors on DROP COLUMN.
  stmts.push(...ftsTriggerDrops(slug))

  // Drop the branch index if it exists on the old column (required before DROP COLUMN).
  if (INDEXABLE_TYPES.has(branch.type) && branch.policies?.filter !== false) {
    stmts.push(`DROP INDEX IF EXISTS idx_${slug}_${alias};`)
  }

  // Main table: add migration column, copy data, drop old, rename.
  stmts.push(`ALTER TABLE content_${slug} ADD COLUMN ${tmpAlias} ${newSqlType};`)
  stmts.push(`UPDATE content_${slug} SET ${tmpAlias} = CAST(${alias} AS ${newSqlType});`)
  stmts.push(`ALTER TABLE content_${slug} DROP COLUMN ${alias};`)
  stmts.push(`ALTER TABLE content_${slug} RENAME COLUMN ${tmpAlias} TO ${alias};`)

  // Recreate index for the renamed column if the new type warrants it.
  if (INDEXABLE_TYPES.has(newType) && branch.policies?.filter !== false) {
    stmts.push(`CREATE INDEX IF NOT EXISTS idx_${slug}_${alias} ON content_${slug}(${alias});`)
  }

  // Drafts table (no indexes to worry about).
  if (seed.allowDrafts) {
    stmts.push(`ALTER TABLE content_${slug}_drafts ADD COLUMN ${tmpAlias} ${newSqlType};`)
    stmts.push(`UPDATE content_${slug}_drafts SET ${tmpAlias} = CAST(${alias} AS ${newSqlType});`)
    stmts.push(`ALTER TABLE content_${slug}_drafts DROP COLUMN ${alias};`)
    stmts.push(`ALTER TABLE content_${slug}_drafts RENAME COLUMN ${tmpAlias} TO ${alias};`)
  }

  // Rebuild FTS if the seed has searchable branches in the updated definition.
  const rebuild = planFtsRebuild(updatedSeed)
  stmts.push(...rebuild)

  return { statements: stmts, ftsRebuildNeeded: rebuild.length > 0 }
}
