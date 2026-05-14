import type { TriggerCondition } from '@beechcms/core'
import type { ResolvedContext } from './context-resolver'
import { parseTemplateKey } from './template-grammar'

export function evaluateConditions(
  conditions: TriggerCondition[] | null,
  entry: Record<string, unknown>,
): boolean {
  if (!conditions || conditions.length === 0) return true
  return conditions.every((condition) => evaluateSingle(condition, entry[condition.field]))
}

// TODO Sprint 8 (Task 13): replace evaluateConditions call sites with evaluateWhen()
// once the recursive WhenNode evaluator is implemented in when-evaluator.ts.

function evaluateSingle(c: TriggerCondition, actual: unknown): boolean {
  switch (c.op) {
    case 'eq':         return actual === c.value
    case 'neq':        return actual !== c.value
    case 'contains':   return typeof actual === 'string' && actual.includes(String(c.value))
    case 'gt':         return Number(actual) > Number(c.value)
    case 'lt':         return Number(actual) < Number(c.value)
    case 'isempty':    return actual == null || actual === ''
    case 'isnotempty': return actual != null && actual !== ''
    default: {
      const _exhaustive: never = c.op
      return false
    }
  }
}

/**
 * Interpolate v2.
 *
 * Accepts either a ResolvedContext (Sprint 6 grammar-aware) or a plain
 * Record<string, unknown> (legacy — wraps it in a thin ad-hoc context so
 * all existing tests stay green without modification).
 *
 * Supports:
 *   {{field}}                    simple dot-path (legacy)
 *   {field}                      single-brace legacy form
 *   {{scope:selector:field}}     scoped grammar (Sprint 6)
 *   {{batch:count}}              sugar for batch:all:count
 *   {{_count}}                   deprecated alias for batch:all:count
 */
export function interpolate(
  template: string,
  context: ResolvedContext | Record<string, unknown>,
  defaultValue = '',
  onMissing?: (field: string) => void,
): string {
  if (!template) return ''

  const resolved = isResolvedContext(context)
    ? context
    : makeLegacyContext(context)

  const replacer = (_: string, key: string) => {
    const trimmedKey = key.trim()
    const parsed = parseTemplateKey(trimmedKey)
    if (!parsed) {
      if (onMissing) onMissing(trimmedKey)
      return defaultValue
    }
    const val = resolved.lookup(parsed, onMissing)
    if (val == null || val === '') {
      return defaultValue
    }
    return String(val)
  }

  // Expand scoped keys (may contain colons, parens): match any non-whitespace content
  let res = template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, replacer)
  // Single-brace legacy form (simple names only, no colons)
  res = res.replace(/\{\s*([a-zA-Z0-9_.]+)\s*\}/g, replacer)

  return res
}

function isResolvedContext(ctx: ResolvedContext | Record<string, unknown>): ctx is ResolvedContext {
  return typeof (ctx as ResolvedContext).lookup === 'function'
}

function makeLegacyContext(entry: Record<string, unknown>): ResolvedContext {
  return {
    triggerEntry: entry,
    lookup(parsed, onMissing) {
      if (parsed.kind === 'simple') {
        const val = resolvePath(entry, parsed.path)
        if (val === undefined || val === null || val === '') {
          if (onMissing) onMissing(parsed.path)
          return undefined
        }
        return val
      }
      // Scoped keys cannot be resolved with a plain record
      if (onMissing) onMissing(parsed.scope)
      return undefined
    },
  }
}

export function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  if (path in obj && obj[path] !== undefined) {
    return obj[path]
  }
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
