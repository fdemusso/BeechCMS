import type { TriggerCondition } from '@beechcms/core'

export function evaluateConditions(
  conditions: TriggerCondition[] | null,
  entry: Record<string, unknown>,
): boolean {
  if (!conditions || conditions.length === 0) return true
  return conditions.every((condition) => evaluateSingle(condition, entry[condition.field]))
}

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
 * Replaces `{{fieldAlias}}` or `{fieldAlias}` with the concrete entry value.
 * Supports dot notation for nested objects to ensure concrete data fetching.
 */
export function interpolate(
  template: string,
  entry: Record<string, unknown>,
  defaultValue = '',
  onMissing?: (field: string) => void,
): string {
  if (!template) return ''

  const replacer = (_: string, key: string) => {
    const trimmedKey = key.trim()
    const val = resolvePath(entry, trimmedKey)
    if (val == null || val === '') {
      if (onMissing) onMissing(trimmedKey)
      return defaultValue
    }
    return String(val)
  }

  // First replace double curly braces {{ field }}
  let res = template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, replacer)
  // Then replace single curly braces { field }, avoiding excess parentheses
  res = res.replace(/\{\s*([a-zA-Z0-9_.-]+)\s*\}/g, replacer)

  return res
}

function resolvePath(obj: Record<string, unknown>, path: string): unknown {
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
