import type { FilterGroup, FilterType } from '@beech/core'

/** Entry parsata per le risposte API — contratto immutabile (C7). */
export interface ContentEntry {
  id: string
  schema_slug: string
  slug: string | null
  status: string
  data: Record<string, unknown>
  hasPendingDraft: boolean
  created_at: number | null
  updated_at: number | null
}

export type QueryFilterType = FilterType

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

/** Formato inviato dalla dashboard (usa columnId). */
export interface QueryFilterGroup {
  columnId: string
  label?: string
  type: QueryFilterType
  conditions: QueryFilterCondition[]
}

const QUERY_FILTER_OPERATOR_SET = new Set<QueryFilterOperator>([
  'eq', 'gt', 'gte', 'lt', 'lte', 'contains', 'is_empty', 'is_not_empty',
])

function isQueryFilterOperator(value: unknown): value is QueryFilterOperator {
  return typeof value === 'string' && QUERY_FILTER_OPERATOR_SET.has(value as QueryFilterOperator)
}

export function cleanStr(val: unknown): string | null {
  return (typeof val === 'string' && val.trim()) || null
}

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

export function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed < 1) return fallback
  return parsed
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
    if (parsedCond) validConditions.push(parsedCond)
  }
  if (validConditions.length === 0) return null
  return {
    columnId,
    label: typeof label === 'string' ? label : undefined,
    type,
    conditions: validConditions,
  }
}

/** Parse sicuro dei filtri da query-string (formato dashboard con columnId). */
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
    if (parsedGroup) result.push(parsedGroup)
  }
  return result
}

/**
 * Converte QueryFilterGroup[] (formato dashboard, columnId) in FilterGroup[]
 * compatibile con buildSelectQuery del Botanical Engine.
 */
export function toEngineFilters(groups: QueryFilterGroup[]): FilterGroup[] {
  return groups.map((g) => ({
    column: g.columnId,
    type: g.type,
    conditions: g.conditions,
  }))
}
