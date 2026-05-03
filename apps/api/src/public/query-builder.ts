import type { Seed, FilterGroup, FilterOperator, FilterType, BranchType } from '@beechcms/core'
import { parsePositiveInt } from '../shared/query-utils'

export type PublicQueryInput = {
  page?: string
  limit?: string
  latest?: string
}

export type PublicFilterLogic = 'AND' | 'OR'
export type PublicFilterOperator =
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

export type PublicFilterCondition = {
  field: string
  op: PublicFilterOperator
  value?: unknown
}

export type ParsedPublicFilter = {
  where: PublicFilterCondition[]
  logic: PublicFilterLogic
}

const PUBLIC_FILTER_OPERATORS = new Set<PublicFilterOperator>([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'contains', 'not_contains', 'starts_with', 'ends_with',
  'is_empty', 'is_not_empty', 'in', 'not_in',
  'has_tag', 'has_any_tag', 'has_all_tags',
])

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
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

const SYSTEM_COLUMNS = new Set(['id', 'slug', 'status', 'created_at', 'updated_at'])

function mapBranchToFilterType(type: BranchType): FilterType {
  switch (type) {
    case 'richtext':
    case 'file':
      return 'text'
    case 'json':
      return 'json'
    case 'tags':
      return 'tags'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'date':
      return 'date'
    case 'text':
    default:
      return 'text'
  }
}

/**
 * Trasforma il filtro pubblico in FilterGroup[] per il Repository.
 * Zero SQL: la logica di generazione query risiede esclusivamente nel Repository/Engine core.
 */
export function toEngineFilters(seed: Seed, parsedFilter: ParsedPublicFilter | null): FilterGroup[] {
  if (!parsedFilter || parsedFilter.where.length === 0) return []
  
  // Note: Repository currently joins groups with AND. 
  // Public API supports logic: OR but the core engine currently defaults to AND for top-level groups.
  // We map each condition to a group for maximum compatibility with the engine's buildFilterCondition.
  return parsedFilter.where.map((cond) => {
    const branch = seed.branches.find(b => b.alias === cond.field)
    const type: FilterType = branch 
      ? mapBranchToFilterType(branch.type) 
      : (SYSTEM_COLUMNS.has(cond.field) ? 'system' : 'text')
    
    return {
      column: cond.field,
      type,
      conditions: [{
        op: cond.op as FilterOperator,
        value: cond.value as any
      }]
    }
  })
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
