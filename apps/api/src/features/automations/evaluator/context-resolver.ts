// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Automation } from '@beechcms/core'
import type { AutomationContextSelector, ParsedKey } from './template-grammar'
import { resolvePath } from '../engine/automation-runner.utils'
import { resolveVarAccess } from './var-access-resolver'
import { prefetchSeedRows, seedLookupCacheKey } from './seed-lookup'
import type { SeedLookupDeps } from './seed-lookup'

export interface ResolvedContext {
  lookup(key: ParsedKey, onMissing?: (field: string) => void): unknown
  triggerEntry: Record<string, unknown> | null
}

const MAX_PLUCK = 100
const AGGREGATE_OPS = new Set(['count', 'sum', 'avg', 'min', 'max', 'pluck'])

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
      return rows.reduce((acc, r) => {
        const v = Number(r[field])
        if (Number.isNaN(v)) { if (onMissing) onMissing(`sum:${field}:NaN`); return acc }
        return acc + v
      }, 0)
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

export async function resolveAutomationContext(
  automation: Automation,
  triggerEntry: Record<string, unknown> | null,
  batchEntries: Array<Record<string, unknown>>,
  seedLookup?: SeedLookupDeps,
): Promise<ResolvedContext> {
  // lookup() is sync, so every seed-scoped selector the automation uses is loaded here, once per run.
  const seedRows = seedLookup ? await prefetchSeedRows(automation, seedLookup) : new Map()

  function lookup(parsed: ParsedKey, onMissing?: (field: string) => void): unknown {
    if (parsed.kind === 'simple') {
      if (parsed.path.startsWith('this.')) {
        const field = parsed.path.slice(5)
        const val = resolvePath(triggerEntry ?? {}, field)
        if (val === undefined && onMissing) onMissing(parsed.path)
        return val
      }
      const val = resolvePath(triggerEntry ?? {}, parsed.path)
      if (val === undefined && onMissing) onMissing(parsed.path)
      return val
    }

    if (parsed.kind !== 'scoped') {
      if (onMissing) onMissing(parsed.kind === 'var_access' ? parsed.name : 'unknown')
      return undefined
    }

    const { scope, selector, op, field } = parsed

    if (scope === 'this') {
      if (op !== 'field' || !field) { if (onMissing) onMissing(`this.${field}`); return undefined }
      const val = resolvePath(triggerEntry ?? {}, field)
      if (val === undefined && onMissing) onMissing(`this.${field}`)
      return val
    }

    if (scope === 'batch') {
      if (op === 'field') {
        if (!field) { if (onMissing) onMissing('batch.field'); return undefined }
        const val = resolvePath(batchEntries[0] ?? {}, field)
        if (val === undefined && onMissing) onMissing(`batch.${field}`)
        return val
      }
      return applyAggregate(op, field, batchEntries, onMissing)
    }

    const rows = seedRows.get(seedLookupCacheKey(scope, selector))
    if (!rows) { if (onMissing) onMissing(scope); return undefined }

    if (op === 'field') {
      if (!field) { if (onMissing) onMissing(`${scope}.field`); return undefined }
      const val = resolvePath(rows[0] ?? {}, field)
      if (val === undefined && onMissing) onMissing(`${scope}.${field}`)
      return val
    }
    return applyAggregate(op, field, rows, onMissing)
  }

  return { lookup, triggerEntry }
}

export function deriveEntryContext(
  base: ResolvedContext,
  entry: Record<string, unknown>,
): ResolvedContext {
  return {
    lookup(parsed: ParsedKey, onMissing?: (field: string) => void): unknown {
      if (parsed.kind === 'simple') {
        if (parsed.path.startsWith('this.')) {
          const field = parsed.path.slice(5)
          const val = resolvePath(entry, field)
          if (val === undefined && onMissing) onMissing(parsed.path)
          return val
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

// Layers set_variable results over a context. Apply it last: deriveEntryContext answers
// simple keys itself, so a variables layer underneath it would never be reached.
export function withVariables(base: ResolvedContext, variables: Record<string, unknown>): ResolvedContext {
  return {
    triggerEntry: base.triggerEntry,
    lookup(parsed: ParsedKey, onMissing?: (field: string) => void): unknown {
      if (parsed.kind === 'simple') {
        const varVal = resolvePath(variables, parsed.path)
        if (varVal !== undefined) return varVal
      } else if (parsed.kind === 'var_access') {
        return resolveVarAccess(parsed, variables, onMissing)
      }
      return base.lookup(parsed, onMissing)
    },
  }
}
