// SPDX-License-Identifier: MIT
import type {
  Seed,
  Branch,
  BranchType,
  FilterGroup,
  FilterType,
  FilterCondition,
  SelectOptions,
  SelectLocale,
  ParameterizedQuery,
} from '../types.js';
import { tableName, ftsTableName, isValidColumn, indexableSearchBranches, SYSTEM_COLUMNS } from '../ddl/ddl.js';
import { resolveClassification } from '../privacy/policies.js';
import { isLocaleCode, isLocalizedBranch } from '../localization/localization.js';
import { activeCondition } from './active-clause.js';

/** SQLite GLOB twins of `LOCALE_CODE_RE` (`it`, `ast`, `pt-BR`, `es-419`, …). Keep both in sync. */
const LOCALE_KEY_GLOBS = [
  '[a-z][a-z]',
  '[a-z][a-z][a-z]',
  '[a-z][a-z]-[A-Z][A-Z]',
  '[a-z][a-z][a-z]-[A-Z][A-Z]',
  '[a-z][a-z]-[0-9][0-9][0-9]',
  '[a-z][a-z][a-z]-[0-9][0-9][0-9]',
]

/** A locale code checked for inlining into SQL. The grammar check IS the injection guard — never skip it. */
function inlineLocale(code: string): string {
  if (!isLocaleCode(code)) throw new TypeError(`Invalid locale code '${code}'`)
  return code
}

/**
 * SQL twin of `resolveLocalizedValue`: the value of a localized column in `locale.code`. Self-contained
 * (no bindings), because `buildFilterCondition` may interpolate a column more than once per clause.
 * The nested CASE is deliberate: SQLite does not guarantee AND short-circuits, and `json_type` /
 * `json_each` raise on malformed JSON (a legacy plain-text value).
 * Dictionary detection mirrors `isStoredLocaleDictionary`: a non-empty object whose keys all match the
 * locale grammar, and — for `json` only — at least one registered locale key.
 */
function localizedColumnSql(column: string, branch: Branch, locale: SelectLocale): string {
  const keyIsLocale = LOCALE_KEY_GLOBS.map((glob) => `key GLOB '${glob}'`).join(' OR ')
  const conditions = [
    `json_type(${column}) = 'object'`,
    `EXISTS (SELECT 1 FROM json_each(${column}))`,
    `NOT EXISTS (SELECT 1 FROM json_each(${column}) WHERE NOT (${keyIsLocale}))`,
  ]
  if (branch.type === 'json') {
    const registered = locale.config.locales.map((code) => `'${inlineLocale(code)}'`).join(', ')
    conditions.push(`EXISTS (SELECT 1 FROM json_each(${column}) WHERE key IN (${registered}))`)
  }
  const path = (code: string) => `'$."${inlineLocale(code)}"'`
  const resolved = `COALESCE(` +
    `NULLIF(json_extract(${column}, ${path(locale.code)}), ''), ` +
    `NULLIF(json_extract(${column}, ${path(locale.config.defaultLocale)}), ''), ` +
    `(SELECT value FROM json_each(${column}) WHERE value IS NOT NULL AND value != '' LIMIT 1))`
  return `(CASE WHEN json_valid(${column}) THEN ` +
    `(CASE WHEN ${conditions.join(' AND ')} THEN ${resolved} ELSE ${column} END) ` +
    `ELSE ${column} END)`
}

/**
 * The SQL reference for `alias` in WHERE / ORDER BY: table-qualified system column, localized expression
 * when `locale` is set, bare alias otherwise (unchanged pre-localization behaviour).
 */
function columnSql(seed: Seed, table: string, alias: string, locale: SelectLocale | undefined): string {
  if (SYSTEM_COLUMNS.has(alias)) return `${table}.${alias}`
  const branch = seed.branches.find((b) => b.alias === alias)
  if (locale && branch && isLocalizedBranch(branch)) {
    return localizedColumnSql(`${table}.${alias}`, branch, locale)
  }
  return alias
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

  // Soft delete: 'active' is the default, so a caller that forgets the option can never
  // observe a trashed row — including the Public API, relation expansion and subqueries,
  // which all reach SQL only through repository.findMany.
  if (seed.softDelete) {
    const trashed = options.trashed ?? 'active'
    const cond = activeCondition(seed, trashed, table)
    if (cond) {
      whereClauses.push(cond)
    }
  }

  const groupClauses: string[] = []
  for (const group of filters) {
    if (!isValidColumn(seed, group.column)) continue

    const branch = seed.branches.find(b => b.alias === group.column)
    const isEncrypted = branch ? resolveClassification(branch).storage === 'encrypt' : false

    const col = columnSql(seed, table, group.column, options.locale)

    const condClauses: string[] = []
    for (const cond of group.conditions) {
      if (isEncrypted) {
        const { op } = cond
        if (op === 'eq' || op === 'neq' || op === 'in' || op === 'not_in') {
          const targetCol = `${table}.${group.column}_bidx`
          const clause = buildFilterCondition(targetCol, group.type, cond, bindings)
          if (clause) condClauses.push(clause)
        } else if (op === 'is_empty' || op === 'is_not_empty') {
          const clause = buildFilterCondition(col, group.type, cond, bindings)
          if (clause) condClauses.push(clause)
        } else {
          throw new TypeError(`Invalid filter: operator '${op}' is not supported for encrypted field '${group.column}'`)
        }
      } else {
        const clause = buildFilterCondition(col, group.type, cond, bindings)
        if (clause) condClauses.push(clause)
      }
    }
    if (condClauses.length > 0) {
      groupClauses.push(condClauses.length > 1 ? `(${condClauses.join(' AND ')})` : condClauses[0])
    }
  }
  if (groupClauses.length > 0) {
    const joiner = options.filterLogic === 'OR' ? ' OR ' : ' AND '
    whereClauses.push(groupClauses.length > 1 ? `(${groupClauses.join(joiner)})` : groupClauses[0])
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
      const col = columnSql(seed, table, orderBy.column, options.locale)
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
    if (!Array.isArray(value)) return null
    const normalizedValues = value
      .map((v) => normalizeFilterValue(type, v))
      .filter((v) => v !== null)

    // Membership in an empty set is false, not "no constraint"; dropping it would widen the result set.
    // `not_in` over an empty set is vacuously true, so it adds no clause.
    if (normalizedValues.length === 0) return op === 'in' ? '0' : null
    
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
