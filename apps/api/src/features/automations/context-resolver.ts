/**
 * Sprint 6 — Automation context resolver.
 *
 * Builds a ResolvedContext before action execution. Handles:
 *   - Named pre-loaded queries (automation.context declarations)
 *   - Inline seed lookups ({{seed:selector:field}})
 *   - batch scope (cron: full entry list; CRUD: single-element)
 *   - this scope (triggering entry)
 *   - Aggregates: count, sum, avg, min, max, pluck
 *   - Memoisation by canonical query key
 *
 * TODO Sprint 8 (Tasks 10-16): ResolvedContext.lookup will also be called by
 * evaluateWhen() for operand resolution in recursive WhenNode predicates.
 */
import type { AutomationContextLoad, AutomationContextSelector, ContentRepository, FilterGroup, Seed, TriggerCondition } from '@beechcms/core'
import type { Automation } from '@beechcms/core'
import type { ParsedKey } from './template-grammar'
import { conditionToFilterGroup } from './filter-translation'

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
// One-pass interpolation of a template string using only simple keys
// (used to expand {{this.field}} inside context-load where.values)
// ---------------------------------------------------------------------------
function interpolateSimple(
  template: string,
  thisEntry: Record<string, unknown> | null,
): string {
  if (!template) return template
  return template.replace(/\{\{\s*([a-zA-Z0-9_.:-]+)\s*\}\}/g, (_, key: string) => {
    const trimmed = key.trim()
    // Only expand simple dot-path keys (no colon) to avoid forward-ref issues
    if (trimmed.includes(':')) return `{{${trimmed}}}`
    const val = resolvePath(thisEntry ?? {}, trimmed)
    return val != null ? String(val) : ''
  })
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export async function resolveAutomationContext(
  deps: ResolverDeps,
  automation: Automation,
  triggerEntry: Record<string, unknown> | null,
  batchEntries: Array<Record<string, unknown>>,
): Promise<ResolvedContext> {
  // Cache: canonical query key → resolved row list (Promise)
  const cache = new Map<string, Promise<Array<Record<string, unknown>>>>()
  // Named loads resolved in declaration order
  const named = new Map<string, Array<Record<string, unknown>> | Record<string, unknown> | null>()

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

  // Resolve named context declarations in order (one-pass: no forward refs)
  for (const decl of automation.context ?? []) {
    const seed = deps.getSeed(decl.seed_slug)
    if (!seed) {
      named.set(decl.as, null)
      continue
    }

    const selector: AutomationContextSelector = decl.selector ?? { kind: 'lastone' }
    const limit = Math.min(decl.limit ?? 100, MAX_ROWS)
    const orderBy = decl.order_by ?? (selector.kind === 'lastone' ? 'created_at' : selector.kind === 'firstone' ? 'created_at' : '')
    const order: 'asc' | 'desc' = decl.order ?? (selector.kind === 'firstone' ? 'asc' : 'desc')

    // Interpolate where.value against this + previously resolved named loads (one pass)
    const resolvedFilters: FilterGroup[] = (decl.where ?? []).map((c) => {
      const interpolatedValue = typeof c.value === 'string'
        ? interpolateSimple(c.value, triggerEntry)
        : c.value
      return conditionToFilterGroup({ ...c, value: interpolatedValue } as typeof c, seed)
    })

    const rows = await memoFetch(seed, selector, resolvedFilters, orderBy, order, limit)

    if (selector.kind === 'all') {
      named.set(decl.as, rows)
    } else {
      named.set(decl.as, rows[0] ?? null)
    }
  }

  // ---------------------------------------------------------------------------
  // lookup implementation
  // ---------------------------------------------------------------------------

  function lookup(parsed: ParsedKey, onMissing?: (field: string) => void): unknown {
    if (parsed.kind === 'simple') {
      const val = resolvePath(triggerEntry ?? {}, parsed.path)
      // Legacy: _count sugar
      if (parsed.path === '_count') {
        console.warn('[automations] {{_count}} is deprecated — use {{batch:all:count}} instead')
        return batchEntries.length
      }
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

    // Named context key
    if (named.has(scope)) {
      const stored = named.get(scope)
      if (stored === null) { if (onMissing) onMissing(scope); return undefined }

      if (Array.isArray(stored)) {
        // Named load was declared with selector:all — aggregate ops
        if (op !== 'field') return applyAggregate(op, field, stored, onMissing)
        // Pluck first entry field if no aggregate
        const val = resolvePath(stored[0] ?? {}, field ?? '')
        if (val === undefined && onMissing) onMissing(`${scope}.${field}`)
        return val
      }

      // Single-entry named load
      if (op !== 'field') { if (onMissing) onMissing(`${scope}:${op}`); return undefined }
      const val = resolvePath(stored as Record<string, unknown>, field ?? '')
      if (val === undefined && onMissing) onMissing(`${scope}.${field}`)
      return val
    }

    // Inline seed lookup — resolve on-demand, memoised
    const seed = deps.getSeed(scope)
    if (!seed) {
      if (onMissing) onMissing(scope)
      return undefined
    }

    const limit = selector.kind === 'all' ? MAX_ROWS : 1
    const orderBy = selector.kind === 'lastone' || selector.kind === 'firstone' ? 'created_at' : ''
    const order: 'asc' | 'desc' = selector.kind === 'firstone' ? 'asc' : 'desc'

    // Synchronous memoisation isn't possible here — inline lookups must be pre-resolved.
    // Return a sentinel that forces callers to pre-resolve via resolveInlineLookups.
    // For now we return undefined and fire onMissing; in a future sprint this becomes
    // async-friendly by converting interpolate to async.
    if (onMissing) onMissing(`${scope}:${selectorKey(selector)}`)

    void memoFetch(seed, selector, [], orderBy, order, limit)
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
