// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ResolvedContext } from '../evaluator/context-resolver'
import { parseTemplateKey } from '../evaluator/template-grammar'

/** `html` for mail markup; `json` for webhook string values; `none` for plain-text and data sinks. */
type InterpolateEscape = 'html' | 'json' | 'none'

export interface InterpolateOptions {
  /** Required so every sink states its escaping explicitly; no single default is safe for all sinks. */
  escape: InterpolateEscape
  defaultValue?: string
  onMissing?: (field: string) => void
}

export function interpolate(
  template: string,
  context: ResolvedContext,
  { escape, defaultValue = '', onMissing }: InterpolateOptions,
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
    const value = String(val)
    if (escape === 'html') return escapeHtml(value)
    if (escape === 'json') return JSON.stringify(value).slice(1, -1)
    return value
  }

  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, replacer)
}

/** Escapes only substituted field values; the admin-authored template markup around them stays intact. */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Reads an own property only, so inherited members such as `constructor` or `toString` never resolve. */
export function getOwn(source: unknown, key: string): unknown {
  if (typeof source !== 'object' || source === null || !Object.hasOwn(source, key)) return undefined
  return (source as Record<string, unknown>)[key]
}

export function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  const direct = getOwn(obj, path)
  if (direct !== undefined) return direct

  let current: unknown = obj
  for (const part of path.split('.')) {
    current = getOwn(current, part)
    if (current === undefined) return undefined
  }
  return current
}
