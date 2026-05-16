import type { ResolvedContext } from './context-resolver'
import { parseTemplateKey } from './template-grammar'

export function interpolate(
  template: string,
  context: ResolvedContext,
  defaultValue = '',
  onMissing?: (field: string) => void,
): string {
  if (!template) return ''

  const replacer = (_: string, key: string) => {
    const trimmedKey = key.trim()
    const parsed = parseTemplateKey(trimmedKey)
    if (!parsed) {
      if (onMissing) onMissing(trimmedKey)
      return defaultValue
    }
    const val = context.lookup(parsed, onMissing)
    if (val == null || val === '') {
      return defaultValue
    }
    return String(val)
  }

  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, replacer)
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
