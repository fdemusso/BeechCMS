/**
 * Sprint 6 — Automation context resolver.
 *
 * Builds a ResolvedContext before action execution. Handles:
 *   - Inline seed lookups ({{seed:selector:field}}) — registered async, resolved on demand
 *   - batch scope (cron: full entry list; CRUD: single-element)
 *   - this scope (triggering entry)
 *   - Aggregates: count, sum, avg, min, max, pluck
 *   - Memoisation by canonical query key
 *
 * Named context variables are populated by set_variable actions via withVariables()
 * in automation-runner.ts (Sprint 06-fix).
 *
 * NOTE: Inline seed lookups register an async fetch but lookup() is synchronous,
 * so they currently return undefined. Use set_variable actions for actual data access.
 * Making lookup() async is deferred to a future sprint.
 */
import type { ContentRepository, FilterGroup, Seed } from '@beechcms/core'
import type { Automation } from '@beechcms/core'
import type { AutomationContextSelector, ParsedKey } from './template-grammar'

export interface ResolverDeps {
  contentRepository: ContentRepository
  getSeed: (slug: string) => Seed | null
}

export interface ResolvedContext {
  /** Resolve a parsed template key to its concrete value (or undefined). */
  lookup(key: ParsedKey, onMissing?: (field: string) => void): unknown
  /** The triggering entry (this scope). */
  triggerEntry: Record<string, unknown> | null
}

const MAX_ROWS = 1000
const MAX_PLUCK = 100
const SYSTEM_COLUMNS = new Set(['id', 'slug', 'status', 'created_at', 'updated_at'])

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolvePath(obj: Record<string, unknown> | null | undefined, path: string): unknown {
  if (!obj) return undefined
  if (path in obj && obj[path] !== undefined) return obj[path]
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return current
}

function selectorKey(selector: AutomationContextSelector): string {
  switch (selector.kind) {
    case 'lastone': return 'lastone'
    case 'firstone': return 'firstone'
    case 'all': return 'all'
    case 'byid': return `byid(${selector.id})`
    case 'where': return `where(${selector.alias}=${selector.value})`
  }
}

function queryKey(seedSlug: string, selector: AutomationContextSelector, limit: number): string {
  return `${seedSlug}|${selectorKey(selector)}|${limit}`
}

async function fetchEntries(
  deps: ResolverDeps,
  seed: Seed,
  selector: AutomationContextSelector,
  extraFilters: FilterGroup[],
  orderBy: string,
  order: 'asc' | 'desc',
  limit: number,
): Promise<Array<Record<string, unknown>>> {
  const filters: FilterGroup[] = [...extraFilters]

  if (selector.kind === 'byid') {
    filters.push({ column: 'id', type: 'system', conditions: [{ op: 'eq', value: selector.id }] })
  } else if (selector.kind === 'where') {
    const branch = seed.branches.find((b) => b.alias === selector.alias)
    const type = branch ? (branch.type === 'number' ? 'number' : 'text') : SYSTEM_COLUMNS.has(selector.alias) ? 'system' : 'text'
    filters.push({ column: selector.alias, type, conditions: [{ op: 'eq', value: selector.value }] })
  }

  const result = await deps.contentRepository.findMany(seed, {
    filters,
    status: null,
    pagination: { limit, offset: 0 },
    orderBy: orderBy ? { column: orderBy, dir: order === 'asc' ? 'ASC' : 'DESC' } : undefined,
  })
  return result.items
}

function applyAggregate(
  op: string,
  field: string | null,
  rows: Array<Record<string, unknown>>,
  onMissing?: (f: string) => void,
): unknown {
  switch (op) {
    case 'count':
      return rows.length

    case 'sum': {
      if (!field) { if (onMissing) onMissing('sum:field'); return 0 }
      const sum = rows.reduce((acc, r) => {
        const v = Number(r[field])
        if (Number.isNaN(v)) { if (onMissing) onMissing(`sum:${field}:NaN`); return acc }
        return acc + v
      }, 0)
      return sum
    }

    case 'avg': {
      if (!field || rows.length === 0) { if (onMissing && !field) onMissing('avg:field'); return 0 }
      const total = rows.reduce((acc, r) => {
        const v = Number(r[field])
        if (Number.isNaN(v)) { if (onMissing) onMissing(`avg:${field}:NaN`); return acc }
        return acc + v
      }, 0)
      return rows.length > 0 ? total / rows.length : 0
    }

    case 'min': {
      if (!field || rows.length === 0) { if (onMissing && !field) onMissing('min:field'); return null }
      return rows.reduce<number | null>((acc, r) => {
        const v = Number(r[field])
        if (Number.isNaN(v)) return acc
        return acc === null || v < acc ? v : acc
      }, null)
    }

    case 'max': {
      if (!field || rows.length === 0) { if (onMissing && !field) onMissing('max:field'); return null }
      return rows.reduce<number | null>((acc, r) => {
        const v = Number(r[field])
        if (Number.isNaN(v)) return acc
        return acc === null || v > acc ? v : acc
      }, null)
    }

    case 'pluck': {
      if (!field) { if (onMissing) onMissing('pluck:field'); return '' }
      const values = rows.slice(0, MAX_PLUCK).map((r) => String(r[field] ?? ''))
      const truncated = rows.length > MAX_PLUCK
      return values.join(', ') + (truncated ? ' …' : '')
    }

    default:
      return undefined
  }
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export async function resolveAutomationContext(
  deps: ResolverDeps,
  _automation: Automation,
  triggerEntry: Record<string, unknown> | null,
  batchEntries: Array<Record<string, unknown>>,
): Promise<ResolvedContext> {
  // Cache: canonical query key → resolved row list (Promise)
  const cache = new Map<string, Promise<Array<Record<string, unknown>>>>()

  function memoFetch(
    seed: Seed,
    selector: AutomationContextSelector,
    extraFilters: FilterGroup[],
    orderBy: string,
    order: 'asc' | 'desc',
    limit: number,
  ): Promise<Array<Record<string, unknown>>> {
    const key = queryKey(seed.slug, selector, limit)
    if (!cache.has(key)) {
      cache.set(key, fetchEntries(deps, seed, selector, extraFilters, orderBy, order, limit))
    }
    return cache.get(key)!
  }

  // ---------------------------------------------------------------------------
  // lookup implementation
  // ---------------------------------------------------------------------------

  function lookup(parsed: ParsedKey, onMissing?: (field: string) => void): unknown {
    if (parsed.kind === 'simple') {
      // Legacy: _count sugar
      if (parsed.path === '_count') {
        console.warn('[automations] {{_count}} is deprecated — use {{batch:all:count}} instead')
        return batchEntries.length
      }
      const val = resolvePath(triggerEntry ?? {}, parsed.path)
      if (val === undefined && onMissing) onMissing(parsed.path)
      return val
    }

    const { scope, selector, op, field } = parsed

    // this scope
    if (scope === 'this') {
      if (op !== 'field' || !field) { if (onMissing) onMissing(`this.${field}`); return undefined }
      const val = resolvePath(triggerEntry ?? {}, field)
      if (val === undefined && onMissing) onMissing(`this.${field}`)
      return val
    }

    // batch scope
    if (scope === 'batch') {
      if (op === 'field') {
        if (!field) { if (onMissing) onMissing('batch.field'); return undefined }
        const val = resolvePath(batchEntries[0] ?? {}, field)
        if (val === undefined && onMissing) onMissing(`batch.${field}`)
        return val
      }
      return applyAggregate(op, field, batchEntries, onMissing)
    }

    // Inline seed lookup — registers an async fetch (memoised), returns undefined until async.
    // Use set_variable actions for synchronous data access.
    const seed = deps.getSeed(scope)
    if (!seed) {
      if (onMissing) onMissing(scope)
      return undefined
    }

    const limit = selector.kind === 'all' ? MAX_ROWS : 1
    const orderBy = selector.kind === 'lastone' || selector.kind === 'firstone' ? 'created_at' : ''
    const order: 'asc' | 'desc' = selector.kind === 'firstone' ? 'asc' : 'desc'

    // Fire the memoised fetch as a side-effect (deduplicates identical requests).
    // lookup() is synchronous so it cannot await; convert interpolate to async in a future sprint.
    void memoFetch(seed, selector, [], orderBy, order, limit)
    if (onMissing) onMissing(`${scope}:${selectorKey(selector)}`)
    return undefined
  }

  return { lookup, triggerEntry }
}

// ---------------------------------------------------------------------------
// Variant: derive a per-entry ResolvedContext from an existing one (cron use-case).
// The seed-query cache is shared; only triggerEntry differs.
// ---------------------------------------------------------------------------
export function deriveEntryContext(
  base: ResolvedContext,
  entry: Record<string, unknown>,
): ResolvedContext {
  return {
    lookup(parsed: ParsedKey, onMissing?: (field: string) => void): unknown {
      if (parsed.kind === 'simple') {
        if (parsed.path === '_count') {
          console.warn('[automations] {{_count}} is deprecated — use {{batch:all:count}} instead')
          // batch count is baked into base; delegate
          return base.lookup({ kind: 'scoped', scope: 'batch', selector: { kind: 'all' }, op: 'count', field: null })
        }
        const val = resolvePath(entry, parsed.path)
        if (val === undefined && onMissing) onMissing(parsed.path)
        return val
      }
      if (parsed.kind === 'scoped' && parsed.scope === 'this') {
        if (parsed.op !== 'field' || !parsed.field) { if (onMissing) onMissing('this.field'); return undefined }
        const val = resolvePath(entry, parsed.field)
        if (val === undefined && onMissing) onMissing(`this.${parsed.field}`)
        return val
      }
      return base.lookup(parsed, onMissing)
    },
    triggerEntry: entry,
  }
}
