import { getSeed, resolvePolicies } from '@beech/core'

/** Riga grezza dal DB (data e stringa JSON). */
export interface ContentEntryRow {
  id: string
  schema_slug: string
  slug: string | null
  status: string
  data: string
  created_at: number | null
  updated_at: number | null
}

/** Entry parsata per il frontend (data e oggetto). */
export interface ContentEntry {
  id: string
  schema_slug: string
  slug: string | null
  status: string
  data: Record<string, unknown>
  created_at: number | null
  updated_at: number | null
}

export type QueryFilterType = 'text' | 'number' | 'date' | 'boolean' | 'tags' | 'select' | 'system'
export type QueryFilterOperator =
  | 'eq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'is_empty'
  | 'is_not_empty'

export interface QueryFilterCondition {
  id?: string
  op: QueryFilterOperator
  value: string | number | boolean | null
}

export interface QueryFilterGroup {
  columnId: string
  label?: string
  type: QueryFilterType
  conditions: QueryFilterCondition[]
}

const MATH_OPS: Record<string, string> = { gt: '>', gte: '>=', lt: '<', lte: '<=' }
const QUERY_FILTER_OPERATORS: QueryFilterOperator[] = [
  'eq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'is_empty',
  'is_not_empty',
]
const QUERY_FILTER_OPERATOR_SET = new Set<QueryFilterOperator>(QUERY_FILTER_OPERATORS)

function isQueryFilterOperator(value: unknown): value is QueryFilterOperator {
  return (
    typeof value === 'string' &&
    QUERY_FILTER_OPERATOR_SET.has(value as QueryFilterOperator)
  )
}

/**
 * Restituisce stringa trimmata o null per input non valido/vuoto.
 */
export function cleanStr(val: unknown): string | null {
  return (typeof val === 'string' && val.trim()) || null
}

/**
 * Esegue parse JSON sicuro restituendo sempre un oggetto.
 */
export function safeParseJson(data: unknown): Record<string, unknown> {
  const cleaned = cleanStr(data)
  if (!cleaned) return {}

  try {
    const parsed = JSON.parse(cleaned)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/**
 * Parse intero positivo con fallback.
 */
export function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback

  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed < 1) return fallback
  return parsed
}

/**
 * Escapa caratteri speciali per uso in JSON path SQLite.
 */
function escapeJsonPathKey(key: string): string {
  const backslash = String.fromCodePoint(92) // U+005C
  return key.replaceAll(backslash, backslash + backslash).replaceAll('"', backslash + '"')
}

/**
 * Mappa alias campo in espressione SQL leggibile da D1.
 */
export function getColumnSqlExpression(
  seed: ReturnType<typeof getSeed>,
  columnId: string
): { expr: string; branchType: string | null } | null {
  if (columnId === 'slug') {
    return { expr: 'slug', branchType: 'system' }
  }
  if (columnId === 'status') {
    return { expr: 'status', branchType: 'select' }
  }
  const branch = seed?.branches.find((b) => b.alias === columnId)
  if (!branch) return null
  const path = `$."${escapeJsonPathKey(branch.id)}"`
  return {
    expr: `json_extract(data, '${path}')`,
    branchType: branch.type,
  }
}

function parseCondition(cond: unknown): QueryFilterCondition | null {
  if (!cond || typeof cond !== 'object') return null
  const candidate = cond as Record<string, unknown>
  if (!isQueryFilterOperator(candidate.op)) return null

  const rawValue = candidate.value
  let parsedValue: QueryFilterCondition['value'] = null
  if (typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean') {
    parsedValue = rawValue
  }

  return {
    id: typeof candidate.id === 'string' ? candidate.id : undefined,
    op: candidate.op,
    value: parsedValue,
  }
}

function parseFilterGroup(group: unknown): QueryFilterGroup | null {
  if (!group || typeof group !== 'object') return null

  const { columnId, type, label, conditions: rawConds } = group as Partial<QueryFilterGroup>
  if (typeof columnId !== 'string' || typeof type !== 'string' || !Array.isArray(rawConds)) {
    return null
  }

  const validConditions: QueryFilterCondition[] = []
  for (const cond of rawConds) {
    const parsedCond = parseCondition(cond)
    if (parsedCond) {
      validConditions.push(parsedCond)
    }
  }

  if (validConditions.length === 0) return null

  return {
    columnId,
    label: typeof label === 'string' ? label : undefined,
    type,
    conditions: validConditions,
  }
}

/**
 * Parse sicuro dei filtri da query-string.
 */
export function parseQueryFilters(raw: string | undefined): QueryFilterGroup[] {
  if (!raw) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }

  if (!parsed || typeof parsed !== 'object') return []

  const result: QueryFilterGroup[] = []
  for (const group of Object.values(parsed as Record<string, unknown>)) {
    const parsedGroup = parseFilterGroup(group)
    if (parsedGroup) {
      result.push(parsedGroup)
    }
  }

  return result
}

function buildEmptySqlCondition(op: string, expr: string): { clause: string; bindings: Array<string | number> } {
  if (op === 'is_empty') {
    return { clause: `(${expr} IS NULL OR TRIM(CAST(${expr} AS TEXT)) = '')`, bindings: [] }
  }
  return { clause: `(${expr} IS NOT NULL AND TRIM(CAST(${expr} AS TEXT)) <> '')`, bindings: [] }
}

function buildTagsSqlCondition(
  op: string,
  valueStr: string | null,
  expr: string
): { clause?: string; bindings: Array<string | number> } {
  if ((op === 'contains' || op === 'eq') && valueStr) {
    const tagKey = escapeJsonPathKey(valueStr)
    return {
      clause: `(json_type(${expr}) = 'array' AND EXISTS (SELECT 1 FROM json_each(${expr}) je WHERE CAST(je.value AS TEXT) = ?)) OR (json_type(${expr}) = 'object' AND json_type(json_extract(${expr}, '$."${tagKey}"')) IS NOT NULL) OR (LOWER(CAST(${expr} AS TEXT)) LIKE LOWER(?))`,
      bindings: [valueStr, `%${valueStr}%`],
    }
  }

  return { bindings: [] }
}

function buildContainsSqlCondition(
  op: string,
  valueStr: string | null,
  expr: string
): { clause?: string; bindings: Array<string | number> } {
  if (op === 'contains' && valueStr) {
    return { clause: `LOWER(CAST(${expr} AS TEXT)) LIKE LOWER(?)`, bindings: [`%${valueStr}%`] }
  }
  return { bindings: [] }
}

function buildEqSqlCondition(
  group: QueryFilterGroup,
  rawValue: QueryFilterCondition['value'],
  valueStr: string | null,
  expr: string
): { clause?: string; bindings: Array<string | number> } {
  if (group.type === 'boolean' && typeof rawValue === 'boolean') {
    return { clause: `CAST(${expr} AS INTEGER) = ?`, bindings: [rawValue ? 1 : 0] }
  }
  if (group.type === 'number' && typeof rawValue === 'number' && !Number.isNaN(rawValue)) {
    return { clause: `CAST(${expr} AS REAL) = ?`, bindings: [rawValue] }
  }
  if (valueStr) {
    return { clause: `LOWER(TRIM(CAST(${expr} AS TEXT))) = LOWER(TRIM(?))`, bindings: [valueStr] }
  }

  return { bindings: [] }
}

function buildMathSqlCondition(
  op: string,
  group: QueryFilterGroup,
  rawValue: QueryFilterCondition['value'],
  valueStr: string | null,
  expr: string
): { clause?: string; bindings: Array<string | number> } {
  const sqlOp = MATH_OPS[op]
  if (!sqlOp) return { bindings: [] }

  if (group.type === 'number' && typeof rawValue === 'number' && !Number.isNaN(rawValue)) {
    return { clause: `CAST(${expr} AS REAL) ${sqlOp} ?`, bindings: [rawValue] }
  }
  if (group.type === 'date' && valueStr) {
    return { clause: `CAST(${expr} AS TEXT) ${sqlOp} ?`, bindings: [valueStr] }
  }

  return { bindings: [] }
}

/**
 * Costruisce una singola condizione SQL parametrica.
 */
export function buildSqlCondition(
  group: QueryFilterGroup,
  cond: QueryFilterCondition,
  expr: string
): { clause?: string; bindings: Array<string | number> } {
  const op = cond.op
  const rawValue = cond.value
  const valueStr = cleanStr(rawValue)

  if (op === 'is_empty' || op === 'is_not_empty') {
    return buildEmptySqlCondition(op, expr)
  }
  if (group.type === 'tags') {
    return buildTagsSqlCondition(op, valueStr, expr)
  }
  if (op === 'contains') {
    return buildContainsSqlCondition(op, valueStr, expr)
  }
  if (op === 'eq') {
    return buildEqSqlCondition(group, rawValue, valueStr, expr)
  }

  return buildMathSqlCondition(op, group, rawValue, valueStr, expr)
}

/**
 * Costruisce WHERE SQL e bindings in modo sicuro.
 */
export function buildWhereClause(
  slug: string,
  search: string,
  filters: QueryFilterGroup[],
  seed: ReturnType<typeof getSeed>
): { whereSql: string; whereBindings: Array<string | number> } {
  const parts: string[] = ['schema_slug = ?']
  const bindings: Array<string | number> = [slug]

  if (search) {
    const term = `%${search}%`
    const searchableBranches = (seed?.branches ?? []).filter((b) => resolvePolicies(b).search)
    if (searchableBranches.length === 0) {
      parts.push('(slug LIKE ? OR status LIKE ?)')
      bindings.push(term, term)
    } else {
      const fieldExprs = searchableBranches.map((b) => {
        const path = `$."${escapeJsonPathKey(b.id)}"`
        return `CAST(json_extract(data, '${path}') AS TEXT) LIKE ?`
      })
      parts.push(`(slug LIKE ? OR status LIKE ? OR ${fieldExprs.join(' OR ')})`)
      bindings.push(term, term, ...searchableBranches.map(() => term))
    }
    console.log(`[QueryUtils] Search term active: "${search}" -> per-column search on ${searchableBranches.length} branches`);
  }

  for (const group of filters || []) {
    const column = getColumnSqlExpression(seed, group.columnId)
    if (!column) continue

    const groupParts: string[] = []
    for (const cond of group.conditions) {
      const { clause, bindings: condBindings } = buildSqlCondition(group, cond, column.expr)
      if (clause) {
        groupParts.push(clause)
        bindings.push(...condBindings)
      }
    }

    if (groupParts.length > 0) {
      parts.push(`(${groupParts.join(' AND ')})`)
    }
  }

  return { whereSql: `WHERE ${parts.join(' AND ')}`, whereBindings: bindings }
}

/**
 * Costruisce ORDER BY SQL in base al seed.
 */
export function buildOrderClause(
  sortBy: string,
  sortDirRaw: string,
  seed: ReturnType<typeof getSeed>
): string {
  const sortDir = sortDirRaw === 'asc' ? 'ASC' : 'DESC'
  if (!sortBy) return 'ORDER BY created_at DESC'

  const sortable = getColumnSqlExpression(seed, sortBy)
  if (!sortable) return 'ORDER BY created_at DESC'

  const castType = sortable.branchType === 'number' || sortable.branchType === 'boolean' ? 'REAL' : 'TEXT'
  return `ORDER BY CAST(${sortable.expr} AS ${castType}) ${sortDir} NULLS LAST`
}

/**
 * Converte row DB in entry robusta verso JSON corrotto.
 */
export function rowToEntry(row: ContentEntryRow): ContentEntry {
  let data: Record<string, unknown> = {}
  const raw = row.data
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      data = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
    } catch (err) {
      console.warn('Content parse error: corrupted JSON in row', row.id, err)
      data = {}
    }
  }
  return {
    id: row.id,
    schema_slug: row.schema_slug,
    slug: row.slug ?? null,
    status: row.status ?? 'draft',
    data,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

