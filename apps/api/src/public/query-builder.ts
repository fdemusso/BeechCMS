import type { Seed } from '@beechcms/core'
import { parsePositiveInt } from '../shared/query-utils'

export type PublicQueryInput = {
  page?: string
  limit?: string
  latest?: string
}

type PublicFilterLogic = 'AND' | 'OR'
type PublicFilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty'
  | 'in'
  | 'not_in'
  | 'has_tag'
  | 'has_any_tag'
  | 'has_all_tags'

type PublicFilterCondition = {
  field: string
  op: PublicFilterOperator
  value?: unknown
}

type ParsedPublicFilter = {
  where: PublicFilterCondition[]
  logic: PublicFilterLogic
}

const PUBLIC_FILTER_OPERATORS = new Set<PublicFilterOperator>([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'contains', 'not_contains', 'starts_with', 'ends_with',
  'is_empty', 'is_not_empty', 'in', 'not_in',
  'has_tag', 'has_any_tag', 'has_all_tags',
])

const SYSTEM_COLUMNS = new Set(['id', 'slug', 'status', 'created_at', 'updated_at'])

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * Risolve il nome colonna SQL per un campo.
 * In v0.4.0 il nome colonna = branch.alias (nessun json_extract).
 */
function resolveFieldExpression(
  seed: Seed | null,
  field: string
): { expr: string; fieldType: string } | null {
  if (SYSTEM_COLUMNS.has(field)) {
    const type = field === 'created_at' || field === 'updated_at' ? 'number' : 'text'
    return { expr: field, fieldType: type }
  }
  const branch = seed?.branches.find((b) => b.alias === field)
  if (!branch) return null
  return { expr: branch.alias, fieldType: branch.type }
}

function validateLogic(logicRaw: unknown): PublicFilterLogic {
  if (logicRaw === undefined) return 'AND'
  if (typeof logicRaw !== 'string') throw new TypeError("Invalid filter: 'logic' must be 'AND' or 'OR'")
  const normalized = logicRaw.toUpperCase()
  if (normalized !== 'AND' && normalized !== 'OR') throw new TypeError("Invalid filter: 'logic' must be 'AND' or 'OR'")
  return normalized
}

function parseWhereCondition(raw: unknown): PublicFilterCondition | null {
  if (!raw || typeof raw !== 'object') return null
  const maybe = raw as Record<string, unknown>
  const field = asString(maybe.field)
  const opRaw = asString(maybe.op)
  if (!field || !opRaw || !PUBLIC_FILTER_OPERATORS.has(opRaw as PublicFilterOperator)) {
    throw new TypeError(`Invalid filter: unknown operator '${opRaw ?? 'undefined'}'`)
  }
  return { field, op: opRaw as PublicFilterOperator, value: maybe.value }
}

export function parsePublicFilter(raw: string | undefined): ParsedPublicFilter | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new TypeError('Invalid filter: malformed JSON')
  }
  if (!parsed || typeof parsed !== 'object') throw new TypeError('Invalid filter: object expected')
  const filterObj = parsed as Record<string, unknown>
  const logic = validateLogic(filterObj.logic)
  if (!Array.isArray(filterObj.where)) throw new TypeError("Invalid filter: 'where' must be an array")
  const where = filterObj.where
    .map(parseWhereCondition)
    .filter((item): item is PublicFilterCondition => item !== null)
  return { where, logic }
}

function ensureValueArray(value: unknown, op: PublicFilterOperator, field: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`Invalid filter: operator '${op}' for field '${field}' requires a non-empty array`)
  }
  return value
}

function buildTextOperation(
  op: PublicFilterOperator,
  expr: string,
  field: string,
  value: unknown
): { clause: string; bindings: Array<string | number> } {
  const str = asString(value)
  if (!str) throw new TypeError(`Invalid filter: operator '${op}' for field '${field}' requires a string value`)
  if (op === 'contains')     return { clause: `LOWER(CAST(${expr} AS TEXT)) LIKE LOWER(?)`, bindings: [`%${str}%`] }
  if (op === 'not_contains') return { clause: `LOWER(CAST(${expr} AS TEXT)) NOT LIKE LOWER(?)`, bindings: [`%${str}%`] }
  if (op === 'starts_with')  return { clause: `LOWER(CAST(${expr} AS TEXT)) LIKE LOWER(?)`, bindings: [`${str}%`] }
  return { clause: `LOWER(CAST(${expr} AS TEXT)) LIKE LOWER(?)`, bindings: [`%${str}`] }
}

function buildSetOperation(
  op: PublicFilterOperator,
  expr: string,
  field: string,
  value: unknown
): { clause: string; bindings: Array<string | number> } {
  const values = ensureValueArray(value, op, field)
  const placeholders = values.map(() => '?').join(',')
  return {
    clause: `${expr} ${op === 'in' ? 'IN' : 'NOT IN'} (${placeholders})`,
    bindings: values as Array<string | number>,
  }
}

function buildTagOperation(
  op: PublicFilterOperator,
  expr: string,
  field: string,
  value: unknown
): { clause: string; bindings: Array<string | number> } {
  const tags = op === 'has_tag' ? [value] : ensureValueArray(value, op, field)
  const cleaned = tags.map((item) => asString(item)).filter((item): item is string => item !== null)
  if (cleaned.length === 0) {
    throw new TypeError(`Invalid filter: operator '${op}' for field '${field}' requires tag string values`)
  }
  if (op === 'has_tag' || op === 'has_any_tag') {
    const placeholders = cleaned.map(() => '?').join(',')
    return {
      clause: `EXISTS (SELECT 1 FROM json_each(${expr}) je WHERE CAST(je.value AS TEXT) IN (${placeholders}))`,
      bindings: cleaned,
    }
  }
  const allParts = cleaned.map(() => `EXISTS (SELECT 1 FROM json_each(${expr}) je WHERE CAST(je.value AS TEXT) = ?)`)
  return { clause: allParts.join(' AND '), bindings: cleaned }
}

function buildConditionClause(
  condition: PublicFilterCondition,
  seed: Seed | null
): { clause: string; bindings: Array<string | number> } | null {
  const fieldMeta = resolveFieldExpression(seed, condition.field)
  if (!fieldMeta) return null
  const { expr, fieldType } = fieldMeta
  const { op, value, field } = condition

  if (op === 'is_empty')     return { clause: `(${expr} IS NULL OR TRIM(CAST(${expr} AS TEXT)) = '')`, bindings: [] }
  if (op === 'is_not_empty') return { clause: `(${expr} IS NOT NULL AND TRIM(CAST(${expr} AS TEXT)) <> '')`, bindings: [] }
  if (op === 'contains' || op === 'not_contains' || op === 'starts_with' || op === 'ends_with') {
    return buildTextOperation(op, expr, field, value)
  }
  if (op === 'in' || op === 'not_in') return buildSetOperation(op, expr, field, value)
  if (op === 'has_tag' || op === 'has_any_tag' || op === 'has_all_tags') {
    if (fieldType !== 'json') throw new TypeError(`Invalid filter: operator '${op}' requires a json field`)
    return buildTagOperation(op, expr, field, value)
  }

  if (op === 'eq' || op === 'neq') {
    if (typeof value === 'boolean') {
      return { clause: `${expr} ${op === 'eq' ? '=' : '!='} ?`, bindings: [value ? 1 : 0] }
    }
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return { clause: `${expr} ${op === 'eq' ? '=' : '!='} ?`, bindings: [value] }
    }
    const textValue = asString(value)
    if (!textValue) throw new TypeError(`Invalid filter: operator '${op}' for field '${field}' requires a scalar value`)
    return {
      clause: `LOWER(TRIM(CAST(${expr} AS TEXT))) ${op === 'eq' ? '=' : '!='} LOWER(TRIM(?))`,
      bindings: [textValue],
    }
  }

  const numberValue = typeof value === 'number' && !Number.isNaN(value) ? value : null
  const textValue = asString(value)
  const mathOp = op === 'gt' ? '>' : op === 'gte' ? '>=' : op === 'lt' ? '<' : op === 'lte' ? '<=' : null
  if (!mathOp) throw new TypeError(`Invalid filter: operator '${op}' is not supported`)
  if ((fieldType === 'number' || field === 'created_at' || field === 'updated_at') && numberValue !== null) {
    return { clause: `${expr} ${mathOp} ?`, bindings: [numberValue] }
  }
  if (textValue) return { clause: `CAST(${expr} AS TEXT) ${mathOp} ?`, bindings: [textValue] }
  throw new TypeError(`Invalid filter: operator '${op}' for field '${field}' requires a compatible value`)
}

export function buildPublicFilterWhereClause(
  seed: Seed | null,
  parsedFilter: ParsedPublicFilter | null
): { clause: string; bindings: Array<string | number> } {
  if (!parsedFilter || parsedFilter.where.length === 0) return { clause: '', bindings: [] }
  const clauses: string[] = []
  const bindings: Array<string | number> = []
  for (const condition of parsedFilter.where) {
    const built = buildConditionClause(condition, seed)
    if (!built) continue
    clauses.push(`(${built.clause})`)
    bindings.push(...built.bindings)
  }
  if (clauses.length === 0) return { clause: '', bindings: [] }
  return { clause: clauses.join(` ${parsedFilter.logic} `), bindings }
}

export function parsePublicPagination(input: PublicQueryInput): { page: number; limit: number } {
  const page = parsePositiveInt(input.page, 1)
  const limit = Math.min(parsePositiveInt(input.limit, 25), 100)
  return { page, limit }
}

export function parseLatestCount(latest: string | undefined): number {
  if (!latest) return 10
  const raw = Number.parseInt(latest, 10)
  const parsed = Number.isNaN(raw) ? 10 : raw
  if (parsed < 1) return 1
  if (parsed > 100) return 100
  return parsed
}
