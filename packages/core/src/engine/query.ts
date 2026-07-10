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
import { tableName, ftsTableName, isValidColumn, indexableSearchBranches, SYSTEM_COLUMNS } from './ddl.js';


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

  const groupClauses: string[] = []
  for (const group of filters) {
    if (!isValidColumn(seed, group.column)) continue
    const col = SYSTEM_COLUMNS.has(group.column)
      ? `${table}.${group.column}`
      : group.column

    const condClauses: string[] = []
    for (const cond of group.conditions) {
      const clause = buildFilterCondition(col, group.type, cond, bindings)
      if (clause) condClauses.push(clause)
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
