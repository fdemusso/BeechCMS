// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ResolvedContext } from '../evaluator/context-resolver'
import { parseTemplateKey } from '../evaluator/template-grammar'

/** `html` for markup sinks (mail body); `none` for plain-text and data sinks (DB values, recipients, ids, filters). */
export type InterpolateEscape = 'html' | 'none'

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
    return escape === 'html' ? escapeHtml(String(val)) : String(val)
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
