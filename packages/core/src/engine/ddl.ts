// SPDX-License-Identifier: MIT
import type {
  Seed,
  Branch,
  BranchType,
  FilterGroup,
  FilterType,
  FilterCondition,
  SelectOptions,
  ParameterizedQuery,
} from './types.js';
import { resolvePolicies, resolveClassification } from './policies.js'


/**
 * Helper function to determine if a branch requires a blind index column.
 * Returns true if storage classification is 'encrypt' and filtering is not explicitly disabled.
 */
export function hasBlindIndex(branch: Branch): boolean {
  const resolved = resolveClassification(branch)
  return resolved.storage === 'encrypt' && branch.policies?.filter !== false
}


/**
 * SQL type mapping definition for branch types.
 */
interface BranchSqlDef {
  /** SQLite column type used to store this branch type. */
  sqlType: 'TEXT' | 'REAL' | 'INTEGER'
}


/**
 * Mapping of core branch types to SQLite column types.
 */
const BRANCH_TYPE_SQL: Record<BranchType, BranchSqlDef> = {
  text:     { sqlType: 'TEXT'    },
  number:   { sqlType: 'REAL'    },
  boolean:  { sqlType: 'INTEGER' },
  date:     { sqlType: 'INTEGER' },  // Unix timestamp (seconds)
  json:     { sqlType: 'TEXT'    },  // Serialized JSON string
  richtext: { sqlType: 'TEXT'    },
  file:     { sqlType: 'TEXT'    },  // Single URL or serialized JSON array of URLs
  tags:     { sqlType: 'TEXT'    },  // Serialized JSON array or object
  relation: { sqlType: 'TEXT'    },  // Foreign Key reference stored as TEXT (id of the target row)
  repeater: { sqlType: 'TEXT'    },  // Serialized JSON array of records
}


/**
 * System-defined columns that exist on all content tables.
 */
export const SYSTEM_COLUMNS = new Set(['id', 'slug', 'status', 'created_at', 'updated_at'])


/**
 * Returns the SQL table name for a given Seed.
 * 
 * @param seed The seed definition.
 * @returns The table name.
 */
export function tableName(seed: Seed): string {
  return `content_${seed.slug}`
}


/**
 * Returns the draft SQL table name for a given Seed.
 * 
 * @param seed The seed definition.
 * @returns The draft table name.
 */
function draftTableName(seed: Seed): string {
  return `content_${seed.slug}_drafts`
}


/**
 * Returns the FTS (Full-Text Search) virtual table name for a given Seed.
 * 
 * @param seed The seed definition.
 * @returns The FTS table name.
 */
export function ftsTableName(seed: Seed): string {
  return `fts_${seed.slug}`
}


/**
 * Determines whether a column is valid for a given Seed (either system column or branch alias).
 * 
 * @param seed The seed definition.
 * @param col The column name to check.
 * @returns True if the column is valid, false otherwise.
 */
export function isValidColumn(seed: Seed, col: string): boolean {
  if (SYSTEM_COLUMNS.has(col)) return true
  return seed.branches.some(b => b.alias === col)
}


/**
 * Filters the branches of a Seed to return only the ones that are indexable for full-text search.
 * 
 * @param seed The seed definition.
 * @returns An array of indexable branches.
 */
export function indexableSearchBranches(seed: Seed): Branch[] {
  return seed.branches.filter(b => {
    if (b.type !== 'text' && b.type !== 'richtext') return false
    const { search, public: isPublic } = resolvePolicies(b)
    return search && isPublic
  })
}


/**
 * The default ON DELETE referential integrity rule for single-value relations.
 */
const DEFAULT_ON_DELETE_RULE: NonNullable<Branch['onDelete']> = 'SET NULL'


/**
 * Builds the SQL foreign key clause for a single-value relation branch.
 * 
 * Multi-relation branches (multiple: true) produce NO column on the parent table;
 * they live in a dedicated junction table. Returns an empty string for them.
 *
 * @param branch The branch definition.
 * @throws {Error} If the relation branch is missing the `targetSeed` parameter.
 * @returns The foreign key SQL clause, or an empty string.
 */
function buildForeignKeyClause(branch: Branch): string {
  if (branch.type !== 'relation') return ''
  if (branch.multiple === true) return ''
  if (!branch.targetSeed) {
    throw new Error(
      `Branch "${branch.alias}" is of type 'relation' but has no targetSeed`,
    )
  }
  const onDeleteRule = branch.onDelete ?? DEFAULT_ON_DELETE_RULE
  return ` REFERENCES content_${branch.targetSeed}(id) ON DELETE ${onDeleteRule}`
}


/**
 * Generates the SQL `CREATE TABLE IF NOT EXISTS content_{slug}` statement
 * with system columns and one column per branch.
 * 
 * @param seed The seed definition.
 * @returns The CREATE TABLE SQL statement.
 */
export function generateCreateTable(seed: Seed): string {
  const table = tableName(seed)
  const lines: string[] = [
    `CREATE TABLE IF NOT EXISTS ${table} (`,
    `  id         TEXT    NOT NULL PRIMARY KEY,`,
    `  slug       TEXT    NOT NULL UNIQUE,`,
    `  status     TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),`,
  ]

  for (const branch of seed.branches) {
    if (branch.type === 'relation' && branch.multiple === true) continue
    const { sqlType } = BRANCH_TYPE_SQL[branch.type]
    let col = `  ${branch.alias}  ${sqlType}`
    if (branch.requiredOnCreate) col += ' NOT NULL'
    if (branch.type === 'boolean') col += ` CHECK (${branch.alias} IN (0, 1))`
    col += buildForeignKeyClause(branch)
    lines.push(col + ',')
    if (hasBlindIndex(branch)) {
      lines.push(`  ${branch.alias}_bidx  TEXT,`)
    }
  }

  lines.push(`  created_at INTEGER NOT NULL DEFAULT (unixepoch()),`)
  lines.push(`  updated_at INTEGER NOT NULL DEFAULT (unixepoch())`)
  lines.push(`);`)

  return lines.join('\n')
}


/**
 * Generates the SQL `CREATE TABLE IF NOT EXISTS content_{slug}_drafts` statement
 * for seeds that allow drafts.
 * 
 * @param seed The seed definition.
 * @returns The draft table CREATE TABLE SQL statement, or null if drafts are disabled.
 */
export function generateDraftTable(seed: Seed): string | null {
  if (!seed.allowDrafts) return null

  const table = `content_${seed.slug}_drafts`
  const mainTable = `content_${seed.slug}`
  const lines: string[] = [
    `CREATE TABLE IF NOT EXISTS ${table} (`,
    `  entry_id  TEXT NOT NULL PRIMARY KEY`,
    `            REFERENCES ${mainTable}(id) ON DELETE CASCADE,`,
  ]

  for (const branch of seed.branches) {
    if (branch.type === 'relation' && branch.multiple === true) continue
    const { sqlType } = BRANCH_TYPE_SQL[branch.type]
    let col = `  ${branch.alias}  ${sqlType}`
    if (branch.type === 'boolean') col += ` CHECK (${branch.alias} IN (0, 1))`
    lines.push(col + ',')
    if (hasBlindIndex(branch)) {
      lines.push(`  ${branch.alias}_bidx  TEXT,`)
    }
  }

  lines.push(`  _touched_fields  TEXT,`)
  lines.push(`  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())`)
  lines.push(`);`)

  return lines.join('\n')
}


/**
 * Generates the SQL `ALTER TABLE content_{slug} ADD COLUMN {alias} {type}` statement.
 * 
 * @param seed The seed definition.
 * @param branch The branch definition for the new column.
 * @returns The ALTER TABLE SQL statement.
 */
export function generateAddColumn(seed: Seed, branch: Branch): string {
  const { sqlType } = BRANCH_TYPE_SQL[branch.type]
  return `ALTER TABLE ${tableName(seed)} ADD COLUMN ${branch.alias} ${sqlType}${buildForeignKeyClause(branch)};`
}


/**
 * Generates SQL index statements for system fields (status, created_at)
 * and indexable branch columns.
 * 
 * @param seed The seed definition.
 * @returns An array of CREATE INDEX SQL statements.
 */
export function generateIndexes(seed: Seed): string[] {
  const table = tableName(seed)
  const slug = seed.slug
  const indexes: string[] = [
    `CREATE INDEX IF NOT EXISTS idx_${slug}_status ON ${table}(status);`,
    `CREATE INDEX IF NOT EXISTS idx_${slug}_created_at ON ${table}(created_at);`,
  ]

  for (const branch of seed.branches) {
    if (branch.type === 'relation' && branch.multiple === true) continue
    const isRelation = branch.type === 'relation'
    if (!isRelation && branch.policies?.filter === false) continue
    if (['text', 'number', 'date', 'boolean', 'relation'].includes(branch.type)) {
      indexes.push(
        `CREATE INDEX IF NOT EXISTS idx_${slug}_${branch.alias} ON ${table}(${branch.alias});`
      )
    }
    if (hasBlindIndex(branch)) {
      indexes.push(
        `CREATE INDEX IF NOT EXISTS idx_${slug}_${branch.alias}_bidx ON ${table}(${branch.alias}_bidx);`
      )
    }
  }

  return indexes
}


/**
 * Generates the FTS5 virtual table definition for indexable text/richtext branches.
 * 
 * @param seed The seed definition.
 * @returns The CREATE VIRTUAL TABLE SQL statement, or null if no branches are indexable.
 */
export function generateFtsTable(seed: Seed): string | null {
  const rtBranches = indexableSearchBranches(seed)
  if (rtBranches.length === 0) return null

  const ftsTable = ftsTableName(seed)
  const cols = rtBranches.map(b => `  ${b.alias}`).join(',\n')

  return [
    `CREATE VIRTUAL TABLE IF NOT EXISTS ${ftsTable} USING fts5(`,
    `  entry_id UNINDEXED,`,
    `${cols},`,
    `  tokenize = 'unicode61'`,
    `);`,
  ].join('\n')
}


/**
 * Generates FTS5 triggers (insert, update, delete) to keep the FTS virtual table synchronized.
 * 
 * @param seed The seed definition.
 * @returns An array of CREATE TRIGGER SQL statements.
 */
export function generateFtsTriggers(seed: Seed): string[] {
  const rtBranches = indexableSearchBranches(seed)
  if (rtBranches.length === 0) return []

  const table = tableName(seed)
  const ftsTable = ftsTableName(seed)
  const slug = seed.slug
  const cols = rtBranches.map(b => b.alias)
  const ftsColList = ['entry_id', ...cols].join(', ')
  const newValList = ['new.id', ...cols.map(c => `new.${c}`)].join(', ')

  return [
    [
      `CREATE TRIGGER IF NOT EXISTS fts_${slug}_insert`,
      `AFTER INSERT ON ${table} BEGIN`,
      `  INSERT INTO ${ftsTable}(${ftsColList}) VALUES (${newValList});`,
      `END;`,
    ].join('\n'),
    [
      `CREATE TRIGGER IF NOT EXISTS fts_${slug}_update`,
      `AFTER UPDATE OF ${cols.join(', ')} ON ${table} BEGIN`,
      `  DELETE FROM ${ftsTable} WHERE entry_id = old.id;`,
      `  INSERT INTO ${ftsTable}(${ftsColList}) VALUES (${newValList});`,
      `END;`,
    ].join('\n'),
    [
      `CREATE TRIGGER IF NOT EXISTS fts_${slug}_delete`,
      `AFTER DELETE ON ${table} BEGIN`,
      `  DELETE FROM ${ftsTable} WHERE entry_id = old.id;`,
      `END;`,
    ].join('\n'),
  ]
}


/**
 * Expected database schema column interface.
 */
export interface SchemaColumn {
  /** Column name. */
  name: string
  /** SQLite storage type. */
  sqlType: 'TEXT' | 'REAL' | 'INTEGER'
  /** Whether the column is NOT NULL. */
  notNull: boolean
  /** Whether the column is the PRIMARY KEY. */
  isPk: boolean
}


/**
 * Returns the list of expected columns for a Seed's table.
 * Used to compare current vs expected schema (diffing).
 * 
 * @param seed The seed definition.
 * @returns The array of expected schema columns.
 */
export function getExpectedColumns(seed: Seed): SchemaColumn[] {
  const branchCols: SchemaColumn[] = []
  for (const b of seed.branches) {
    if (b.type === 'relation' && b.multiple === true) continue
    branchCols.push({
      name:    b.alias,
      sqlType: BRANCH_TYPE_SQL[b.type].sqlType,
      notNull: b.requiredOnCreate ?? false,
      isPk:    false,
    })
    if (hasBlindIndex(b)) {
      branchCols.push({
        name:    `${b.alias}_bidx`,
        sqlType: 'TEXT',
        notNull: false,
        isPk:    false,
      })
    }
  }

  return [
    { name: 'id',         sqlType: 'TEXT',    notNull: true,  isPk: true  },
    { name: 'slug',       sqlType: 'TEXT',    notNull: true,  isPk: false },
    { name: 'status',     sqlType: 'TEXT',    notNull: true,  isPk: false },
    ...branchCols,
    { name: 'created_at', sqlType: 'INTEGER', notNull: true,  isPk: false },
    { name: 'updated_at', sqlType: 'INTEGER', notNull: true,  isPk: false },
  ]
}


/**
 * Returns the junction table name for a many-to-many relation branch.
 * Format: `rel_<seedSlug>_<branchAlias>`.
 * 
 * @param seedSlug The slug of the parent Seed.
 * @param branchAlias The alias of the relation branch.
 * @returns The junction table name.
 */
export function junctionTableName(seedSlug: string, branchAlias: string): string {
  return `rel_${seedSlug}_${branchAlias}`
}


/**
 * Generates `CREATE TABLE IF NOT EXISTS rel_<seed>_<alias>` statement for a multi-relation branch.
 * 
 * @param seed The parent seed definition.
 * @param branch The multi-relation branch definition.
 * @throws {Error} If called on a non-multi-relation branch or if `targetSeed` is missing.
 * @returns The CREATE TABLE SQL statement.
 */
export function generateJunctionTable(seed: Seed, branch: Branch): string {
  if (branch.type !== 'relation' || branch.multiple !== true) {
    throw new Error(`Branch "${branch.alias}" is not a multi-relation`)
  }
  if (!branch.targetSeed) {
    throw new Error(`Branch "${branch.alias}" has no targetSeed`)
  }
  const onDeleteRule = branch.onDelete ?? 'CASCADE'
  const table = junctionTableName(seed.slug, branch.alias)
  return [
    `CREATE TABLE IF NOT EXISTS ${table} (`,
    `  parent_id  TEXT NOT NULL REFERENCES content_${seed.slug}(id)    ON DELETE CASCADE,`,
    `  target_id  TEXT NOT NULL REFERENCES content_${branch.targetSeed}(id) ON DELETE ${onDeleteRule},`,
    `  position   INTEGER NOT NULL DEFAULT 0,`,
    `  created_at INTEGER NOT NULL DEFAULT (unixepoch()),`,
    `  PRIMARY KEY (parent_id, target_id)`,
    `);`,
  ].join('\n')
}


/**
 * Generates the two B-tree indexes for a junction table:
 * one on `parent_id` (listing entries by parent) and one on `target_id` (handling cascade checks from target side).
 * 
 * @param seed The parent seed definition.
 * @param branch The multi-relation branch definition.
 * @returns An array of CREATE INDEX SQL statements.
 */
export function generateJunctionIndexes(seed: Seed, branch: Branch): string[] {
  const table = junctionTableName(seed.slug, branch.alias)
  return [
    `CREATE INDEX IF NOT EXISTS idx_${table}_parent ON ${table}(parent_id);`,
    `CREATE INDEX IF NOT EXISTS idx_${table}_target ON ${table}(target_id);`,
  ]
}


/**
 * Generates the drafts junction table `rel_<seed>_<alias>_drafts` for a many-to-many relation branch.
 * 
 * @param seed The parent seed definition.
 * @param branch The multi-relation branch definition.
 * @returns The CREATE TABLE SQL statement, or null if drafts are disabled.
 */
export function generateJunctionDraftTable(seed: Seed, branch: Branch): string | null {
  if (!seed.allowDrafts) return null
  if (branch.type !== 'relation' || branch.multiple !== true) return null
  const table = `${junctionTableName(seed.slug, branch.alias)}_drafts`
  const mainDraftTable = `content_${seed.slug}_drafts`
  return [
    `CREATE TABLE IF NOT EXISTS ${table} (`,
    `  entry_id   TEXT NOT NULL REFERENCES ${mainDraftTable}(entry_id) ON DELETE CASCADE,`,
    `  target_id  TEXT NOT NULL,`,
    `  position   INTEGER NOT NULL DEFAULT 0,`,
    `  PRIMARY KEY (entry_id, target_id)`,
    `);`,
  ].join('\n')
}


/**
 * Returns every `DROP TABLE IF EXISTS` needed to fully remove a content type:
 * the main table, the drafts table (if drafts enabled), full-text search table/triggers, and junction tables.
 * 
 * @param seed The seed definition.
 * @returns An array of DROP TABLE / DROP TRIGGER SQL statements.
 */
export function generateDropTable(seed: Seed): string[] {
  const stmts: string[] = []

  for (const branch of seed.branches) {
    if (branch.type !== 'relation' || branch.multiple !== true) continue
    const jt = junctionTableName(seed.slug, branch.alias)
    stmts.push(`DROP TABLE IF EXISTS ${jt}_drafts;`)
    stmts.push(`DROP TABLE IF EXISTS ${jt};`)
  }

  if (seed.allowDrafts) {
    stmts.push(`DROP TABLE IF EXISTS ${draftTableName(seed)};`)
  }

  if (indexableSearchBranches(seed).length > 0) {
    const slug = seed.slug
    stmts.push(`DROP TRIGGER IF EXISTS fts_${slug}_insert;`)
    stmts.push(`DROP TRIGGER IF EXISTS fts_${slug}_update;`)
    stmts.push(`DROP TRIGGER IF EXISTS fts_${slug}_delete;`)
    stmts.push(`DROP TABLE IF EXISTS ${ftsTableName(seed)};`)
  }

  stmts.push(`DROP TABLE IF EXISTS ${tableName(seed)};`)
  return stmts
}


/**
 * Returns the `DROP COLUMN` SQL statements for removing a single field.
 * Drops the junction table for multi-relations, or alters the tables to drop the column.
 * 
 * @param seed The seed definition.
 * @param alias The alias of the branch to drop.
 * @returns An array of SQL statements.
 */
export function generateDropColumn(seed: Seed, alias: string): string[] {
  const branch = seed.branches.find(b => b.alias === alias)

  if (branch && branch.type === 'relation' && branch.multiple === true) {
    const jt = junctionTableName(seed.slug, alias)
    return [
      `DROP TABLE IF EXISTS ${jt}_drafts;`,
      `DROP TABLE IF EXISTS ${jt};`,
    ]
  }

  const stmts: string[] = [`ALTER TABLE ${tableName(seed)} DROP COLUMN ${alias};`]
  if (branch && seed.allowDrafts) {
    stmts.push(`ALTER TABLE ${draftTableName(seed)} DROP COLUMN ${alias};`)
  }
  return stmts
}


/**
 * Returns the `RENAME COLUMN` SQL statements for renaming a field's alias.
 * For a multi-relation branch, renames the junction table (+ drafts junction table) instead.
 * 
 * @param seed The seed definition.
 * @param from The old alias.
 * @param to The new alias.
 * @returns An array of SQL statements.
 */
export function generateRenameColumn(seed: Seed, from: string, to: string): string[] {
  const branch = seed.branches.find(b => b.alias === from)

  if (branch && branch.type === 'relation' && branch.multiple === true) {
    const oldJt = junctionTableName(seed.slug, from)
    const newJt = junctionTableName(seed.slug, to)
    const stmts = [`ALTER TABLE ${oldJt} RENAME TO ${newJt};`]
    if (seed.allowDrafts) {
      stmts.push(`ALTER TABLE ${oldJt}_drafts RENAME TO ${newJt}_drafts;`)
    }
    return stmts
  }

  const stmts: string[] = [`ALTER TABLE ${tableName(seed)} RENAME COLUMN ${from} TO ${to};`]
  if (branch && seed.allowDrafts) {
    stmts.push(`ALTER TABLE ${draftTableName(seed)} RENAME COLUMN ${from} TO ${to};`)
  }
  return stmts
}


/**
 * Returns the statements that change a column's SQL type in place using CAST, bypassing SQLite rebuild limitations.
 * 
 * @param seed The seed definition.
 * @param branch The target branch definition (carrying the new type).
 * @throws {Error} If called on a multi-relation branch.
 * @returns An array of SQL statements.
 */
export function generateRetypeColumn(seed: Seed, branch: Branch): string[] {
  if (branch.type === 'relation' && branch.multiple === true) {
    throw new Error(`Branch "${branch.alias}" is a multi-relation and has no column to retype`)
  }
  const { sqlType } = BRANCH_TYPE_SQL[branch.type]
  const alias = branch.alias
  const tmp = `__retype_${alias}`

  const rebuild = (table: string): string[] => [
    `ALTER TABLE ${table} ADD COLUMN ${tmp} ${sqlType};`,
    `UPDATE ${table} SET ${tmp} = CAST(${alias} AS ${sqlType});`,
    `ALTER TABLE ${table} DROP COLUMN ${alias};`,
    `ALTER TABLE ${table} RENAME COLUMN ${tmp} TO ${alias};`,
  ]

  const stmts = rebuild(tableName(seed))
  if (seed.allowDrafts) stmts.push(...rebuild(draftTableName(seed)))
  return stmts
}
