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

/** Replaces `{{fieldAlias}}` with the entry value (or empty string). */
export function interpolate(template: string, entry: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(entry[key] ?? ''))
}
