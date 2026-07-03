// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module BotanicalEngine
 * Botanical Engine: Schema Compiler + Query Builder.
 *
 * In v0.4.0 each Seed has a dedicated SQL table (`content_{slug}`) with
 * real typed columns. This module generates the DDL and builds parameterized queries.
 * It does not know about HTTP, auth, or UI — it's a pure TypeScript library.
 */
import type {
  Seed,
  Branch,
  BranchType,
  FilterGroup,
  FilterType,
  FilterCondition,
  SelectOptions,
  ParameterizedQuery,
} from './types.js'

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
const SYSTEM_COLUMNS = new Set(['id', 'slug', 'status', 'created_at', 'updated_at'])

/**
 * Returns the SQL table name for a given Seed.
 * 
 * @param seed The seed definition.
 * @returns The table name.
 */
function tableName(seed: Seed): string {
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
function ftsTableName(seed: Seed): string {
  return `fts_${seed.slug}`
}

/**
 * Determines whether a column is valid for a given Seed (either system column or branch alias).
 * 
 * @param seed The seed definition.
 * @param col The column name to check.
 * @returns True if the column is valid, false otherwise.
 */
function isValidColumn(seed: Seed, col: string): boolean {
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
  return seed.branches.filter(b =>
    (b.type === 'text' || b.type === 'richtext') && b.policies?.search !== false
  )
}

/**
 * Checks if a branch represents a multiple asset list field.
 * 
 * @param branch The branch definition.
 * @returns True if it's an asset list, false otherwise.
 */
function isAssetListBranch(branch: Branch): boolean {
  return branch.type === 'file' && (branch.multiple === true || branch.format === 'asset-list')
}

/**
 * Normalizes an unknown value to a valid HTTP URL string, or null.
 * 
 * @param value The value to normalize.
 * @returns The normalized URL string, or null if invalid.
 */
function normalizeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  if (!cleaned) return null
  try {
    const parsed = new URL(cleaned)
    return parsed.protocol.startsWith('http') ? cleaned : null
  } catch {
    return null
  }
}

/**
 * Safely parses a JSON string, falling back to the raw string on error.
 * 
 * @param value The string to parse.
 * @returns The parsed object, or the original string.
 */
function parseJsonSafe(value: string): unknown {
  try { return JSON.parse(value) } catch { return value }
}

/**
 * Normalizes raw asset list values to a flat list of valid URL strings.
 * 
 * @param rawValue The raw value (string, array, or object) to normalize.
 * @returns An array of unique normalized URL strings.
 */
function normalizeAssetListValue(rawValue: unknown): string[] {
  const input = typeof rawValue === 'string' ? parseJsonSafe(rawValue) : rawValue
  const values = Array.isArray(input) ? input : [input]
  const normalized: string[] = []
  for (const item of values) {
    if (item == null) continue
    const direct = normalizeHttpUrl(item)
    if (direct) { normalized.push(direct); continue }
    if (typeof item === 'object' && !Array.isArray(item)) {
      const fromObj = normalizeHttpUrl((item as Record<string, unknown>).url)
      if (fromObj) normalized.push(fromObj)
    }
  }
  return [...new Set(normalized)]
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
  }

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
 * Builds a parameterized SQL SELECT query and bindings for a given Seed based on search, filtering, status, and ordering options.
 * 
 * If `options.isCount` is set to `true`, it generates a counting query (`COUNT(*) as total`) rather than returning database rows.
 * In count mode, column projections (`fields`), ordering (`orderBy` / `kanbanOrder`), and pagination (`LIMIT` / `OFFSET`) clauses and
 * bindings are omitted, while join and filtering clauses are preserved.
 *
 * @param seed The seed definition.
 * @param options Query configuration options.
 * @returns The SQL query string and bindings.
 * @example
 * ```ts
 * const { sql, bindings } = buildSelectQuery(postSeed, {
 *   status: 'published',
 *   filters: [{ column: 'title', type: 'text', conditions: [{ op: 'contains', value: 'cms' }] }],
 *   orderBy: { column: 'created_at', dir: 'DESC' },
 *   pagination: { limit: 20, offset: 0 },
 * })
 * ```
 */
export function buildSelectQuery(seed: Seed, options: SelectOptions = {}): ParameterizedQuery {
  const table = tableName(seed)
  const { filters = [], orderBy, pagination, status, search, fields } = options
  const bindings: (string | number | boolean | null)[] = []
  const whereClauses: string[] = []
  let joinClause = ''

  let kanbanOrderClause = ''
  if (options.kanbanOrder) {
    joinClause = `LEFT JOIN kanban_positions kp` +
      ` ON kp.seed_slug = ? AND kp.entry_id = ${table}.id AND kp.axis_branch_id = ?`
    bindings.push(options.kanbanOrder.seedSlug, options.kanbanOrder.axisBranchId)
    kanbanOrderClause = ` ORDER BY (kp.position IS NULL) ASC, kp.position ASC`
  }

  const rtBranches = indexableSearchBranches(seed)
  if (search && rtBranches.length > 0) {
    const ftsTable = ftsTableName(seed)
    joinClause += (joinClause ? ' ' : '') + `INNER JOIN ${ftsTable} ON ${ftsTable}.entry_id = ${table}.id`
    whereClauses.push(`${ftsTable} MATCH ?`)
    bindings.push(`"${search.replace(/"/g, '""')}"*`)
  }

  if (status !== undefined && status !== null) {
    whereClauses.push(`${table}.status = ?`)
    bindings.push(status)
  }

  for (const group of filters) {
    if (!isValidColumn(seed, group.column)) continue
    const col = SYSTEM_COLUMNS.has(group.column)
      ? `${table}.${group.column}`
      : group.column

    for (const cond of group.conditions) {
      const clause = buildFilterCondition(col, group.type, cond, bindings)
      if (clause) whereClauses.push(clause)
    }
  }

  let selectCols = options.isCount ? 'COUNT(*) as total' : `${table}.*`
  if (!options.isCount && fields && fields.length > 0) {
    const valid = fields.filter(f => isValidColumn(seed, f))
    if (valid.length > 0) {
      selectCols = valid
        .map(f => (SYSTEM_COLUMNS.has(f) ? `${table}.${f}` : f))
        .join(', ')
    }
  }
  if (!options.isCount && options.kanbanOrder) selectCols += ', kp.position'

  let sql = `SELECT ${selectCols} FROM ${table}`
  if (joinClause) sql += ` ${joinClause}`
  if (whereClauses.length > 0) sql += ` WHERE ${whereClauses.join(' AND ')}`

  if (!options.isCount) {
    if (kanbanOrderClause) {
      sql += kanbanOrderClause
    } else if (orderBy && isValidColumn(seed, orderBy.column)) {
      const dir = orderBy.dir === 'DESC' ? 'DESC' : 'ASC'
      const col = SYSTEM_COLUMNS.has(orderBy.column)
        ? `${table}.${orderBy.column}`
        : orderBy.column
      sql += ` ORDER BY ${col} ${dir}`
    } else {
      sql += ` ORDER BY ${table}.created_at DESC`
    }

    if (pagination) {
      sql += ` LIMIT ? OFFSET ?`
      bindings.push(pagination.limit, pagination.offset)
    }
  }

  return { sql, bindings }
}

/**
 * Normalizes user-provided filter values to a format appropriate for SQL execution.
 * 
 * @param type The type of the filter.
 * @param value The value to normalize.
 * @returns The normalized value, or null.
 */
function normalizeFilterValue(
  type: FilterType,
  value: unknown
): string | number | boolean | null {
  if (value === null || value === undefined) return null

  if (type === 'date') {
    if (typeof value === 'number') return value
    if (typeof value === 'string' && value.trim() !== '') {
      const d = new Date(value)
      return Number.isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 1000)
    }
    return null
  }

  if (type === 'boolean') {
    return value ? 1 : 0
  }

  if (type === 'number') {
    if (typeof value === 'number') return value
    if (typeof value === 'string' && value.trim() !== '') {
      const n = Number(value)
      return Number.isNaN(n) ? null : n
    }
    return null
  }

  return value as string | number | boolean | null
}

/**
 * Translates a filter condition into its SQL clause and adds parameters to the bindings list.
 * 
 * @param col The column name in the table.
 * @param type The type of the filter.
 * @param cond The condition containing the operator and value.
 * @param bindings The array of bindings where parameterized values are appended.
 * @returns The SQL condition fragment, or null if invalid.
 */
function buildFilterCondition(
  col: string,
  type: FilterType,
  cond: FilterCondition,
  bindings: (string | number | boolean | null)[]
): string | null {
  const { op, value } = cond

  if (op === 'is_empty' || op === 'is_not_empty') {
    const isEmpty = op === 'is_empty'
    if (type === 'text') {
      return isEmpty ? `(${col} IS NULL OR ${col} = '')` : `(${col} IS NOT NULL AND ${col} != '')`
    }
    if (type === 'tags' || type === 'json') {
      return isEmpty
        ? `(${col} IS NULL OR ${col} = '[]' OR ${col} = '{}')`
        : `(${col} IS NOT NULL AND ${col} != '[]' AND ${col} != '{}')`
    }
    return isEmpty ? `${col} IS NULL` : `${col} IS NOT NULL`
  }
  
  if (op === 'in' || op === 'not_in') {
    if (!Array.isArray(value) || value.length === 0) return null
    const normalizedValues = value
      .map((v) => normalizeFilterValue(type, v))
      .filter((v) => v !== null)
    
    if (normalizedValues.length === 0) return null
    
    const placeholders = normalizedValues.map(() => '?').join(', ')
    bindings.push(...(normalizedValues as (string | number | boolean | null)[]))
    return `${col} ${op === 'in' ? 'IN' : 'NOT IN'} (${placeholders})`
  }

  if (op === 'has_tag' || op === 'has_any_tag' || op === 'has_all_tags') {
    if (type !== 'tags' && type !== 'json') return null
    const tags = (op === 'has_tag' ? [value] : Array.isArray(value) ? value : [value])
      .map(t => String(t))
    
    if (tags.length === 0) return null

    // json_each on array → value is the element; on object → key is the property name.
    // Tags stored as ["photo"] (array) or {"photo":"#3b82f6"} (object) must both match.
    const tagRef = `CASE json_type(${col}) WHEN 'array' THEN value ELSE key END`

    if (op === 'has_tag' || op === 'has_any_tag') {
      const placeholders = tags.map(() => '?').join(', ')
      bindings.push(...tags)
      return `EXISTS (SELECT 1 FROM json_each(${col}) WHERE ${tagRef} IN (${placeholders}))`
    }

    const clauses = tags.map(() => `EXISTS (SELECT 1 FROM json_each(${col}) WHERE ${tagRef} = ?)`)
    bindings.push(...tags)
    return `(${clauses.join(' AND ')})`
  }

  const normalized = normalizeFilterValue(type, value)
  if (normalized === null) return null

  if (op === 'eq' || op === 'neq') {
    const sqlOp = op === 'eq' ? '=' : '!='
    bindings.push(normalized as string | number)
    return `${col} ${sqlOp} ?`
  }

  if (op === 'contains' || op === 'not_contains' || op === 'starts_with' || op === 'ends_with') {
    const sqlOp = op === 'not_contains' ? 'NOT LIKE' : 'LIKE'
    let pattern = String(value)
    if (op === 'contains' || op === 'not_contains') pattern = `%${pattern}%`
    else if (op === 'starts_with') pattern = `${pattern}%`
    else if (op === 'ends_with') pattern = `%${pattern}`
    
    bindings.push(pattern)
    return `${col} ${sqlOp} ?`
  }

  const mathOps: Record<string, string> = { gt: '>', gte: '>=', lt: '<', lte: '<=' }
  if (mathOps[op]) {
    bindings.push(normalized as number)
    return `${col} ${mathOps[op]} ?`
  }

  return null
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
  return [
    { name: 'id',         sqlType: 'TEXT',    notNull: true,  isPk: true  },
    { name: 'slug',       sqlType: 'TEXT',    notNull: true,  isPk: false },
    { name: 'status',     sqlType: 'TEXT',    notNull: true,  isPk: false },
    ...seed.branches
      .filter(b => !(b.type === 'relation' && b.multiple === true))
      .map(b => ({
        name:    b.alias,
        sqlType: BRANCH_TYPE_SQL[b.type].sqlType,
        notNull: b.requiredOnCreate ?? false,
        isPk:    false,
      })),
    { name: 'created_at', sqlType: 'INTEGER', notNull: true,  isPk: false },
    { name: 'updated_at', sqlType: 'INTEGER', notNull: true,  isPk: false },
  ]
}

/**
 * Serializes a value for writing to the DB.
 * boolean → 0/1 | date → Unix timestamp | json/tags/richtext/repeater → JSON string
 * 
 * @param branch The branch definition.
 * @param value The value to serialize.
 * @returns The serialized DB value (string, number, or null).
 */
export function serializeForDb(branch: Branch, value: unknown): string | number | null {
  if (value === null || value === undefined) return null

  switch (branch.type) {
    case 'boolean':
      return value ? 1 : 0

    case 'json':
    case 'tags':
    case 'richtext':
      return typeof value === 'string' ? value : JSON.stringify(value)

    case 'date': {
      if (typeof value === 'number') return value
      if (typeof value === 'string') {
        const d = new Date(value)
        if (Number.isNaN(d.getTime())) return null
        if (branch.format === 'date') {
          const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
          return Math.floor(midnight / 1000)
        }
        return Math.floor(d.getTime() / 1000)
      }
      return null
    }

    case 'file':
      if (isAssetListBranch(branch)) {
        return Array.isArray(value) ? JSON.stringify(value) : typeof value === 'string' ? value : null
      }
      return typeof value === 'string' ? value : null

    case 'repeater':
      return JSON.stringify(Array.isArray(value) ? value : [])

    default:
      return typeof value === 'string' ? value : typeof value === 'number' ? value : null
  }
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

/**
 * Deserializes a value read from the DB to its API/JS representation.
 * 0/1 → boolean | Unix timestamp → ISO 8601 | JSON string → object/array
 * 
 * @param branch The branch definition.
 * @param value The raw database value.
 * @returns The deserialized value.
 */
export function deserializeFromDb(branch: Branch, value: unknown): unknown {
  if (branch.type === 'repeater') {
    if (typeof value !== 'string' || value.length === 0) return []
    const parsed = parseJsonSafe(value)
    return Array.isArray(parsed) ? parsed : []
  }

  if (value === null || value === undefined) return null

  switch (branch.type) {
    case 'boolean':
      return value === 1 || value === true

    case 'json':
    case 'tags':
    case 'richtext': {
      if (typeof value === 'string') {
        try { return JSON.parse(value) } catch { return value }
      }
      return value
    }

    case 'date': {
      if (typeof value !== 'number') return null
      const d = new Date(value * 1000)
      return branch.format === 'date' ? d.toISOString().slice(0, 10) : d.toISOString()
    }

    case 'file':
      if (isAssetListBranch(branch)) return normalizeAssetListValue(value)
      return typeof value === 'string' ? value : null

    default:
      return value
  }
}
