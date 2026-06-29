// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Seed } from '@beechcms/core'
import type { ParsedKey, InlineCondition } from './template-grammar'
import { materializeCollection } from '../executors/set-variable.executor'

type VarAccessParsed = Extract<ParsedKey, { kind: 'var_access' }>

function toNumeric(v: unknown): number {
  const n = Number(v)
  if (Number.isFinite(n)) return n
  if (typeof v === 'string') {
    const d = Date.parse(v)
    if (!Number.isNaN(d)) return d / 1000
  }
  return NaN
}

function numericCoerce(a: unknown, b: unknown): { left: unknown; right: unknown } {
  const na = toNumeric(a)
  const nb = toNumeric(b)
  const numeric = Number.isFinite(na) || Number.isFinite(nb)
  return { left: numeric ? na : a, right: numeric ? nb : b }
}

function applyCondition(record: Record<string, unknown>, cond: InlineCondition): boolean {
  const raw = record[cond.column]
  const { left, right } = numericCoerce(raw, cond.value)
  switch (cond.op) {
    case '=':  return left === right
    case '!=': return left !== right
    case '<':  return (left as number) < (right as number)
    case '>':  return (left as number) > (right as number)
    case '<=': return (left as number) <= (right as number)
    case '>=': return (left as number) >= (right as number)
  }
}

function applyConditions(
  record: Record<string, unknown>,
  conditions: InlineCondition[],
): boolean {
  return conditions.every((c) => applyCondition(record, c))
}

function filterItems(
  items: Array<Record<string, unknown>>,
  conditions: InlineCondition[],
): Array<Record<string, unknown>> {
  if (conditions.length === 0) return items
  return items.filter((r) => applyConditions(r, conditions))
}

function getItems(value: unknown): Array<Record<string, unknown>> | null {
  if (!value || typeof value !== 'object') return null
  const items = (value as any)['_items']
  return Array.isArray(items) ? items : null
}

const EMPTY_SEED = { branches: [] } as unknown as Seed

export function resolveVarAccess(
  parsed: VarAccessParsed,
  variables: Record<string, unknown>,
  onMissing?: (field: string) => void,
): unknown {
  if (!(parsed.name in variables)) {
    onMissing?.(parsed.name)
    return undefined
  }

  let current: unknown = variables[parsed.name]
  const { steps, conditions } = parsed

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]

    // ── array selector ─────────────────────────────────────────────────────
    if (step.type === 'array') {
      const items = getItems(current) ?? (Array.isArray(current) ? current as Array<Record<string, unknown>> : null)
      if (!items) return undefined
      const idSet = new Set(step.ids)
      const subset = items.filter((r) => idSet.has(String(r['id'] ?? '')))
      // Apply conditions to the subset before building the collection
      const filtered = filterItems(subset, conditions)
      current = materializeCollection(EMPTY_SEED, filtered, null)
      // Conditions consumed — no post-filter needed
      continue
    }

    // ── nav: firstone / lastone ────────────────────────────────────────────
    if (step.type === 'nav') {
      // Nav moves us from a collection to a single record.
      // Conditions are a guard on that record, NOT a pre-filter on _items.
      const record = (current as any)?.[step.nav] as Record<string, unknown> | null | undefined
      if (!record) { current = null; continue }
      // Apply conditions to the single record (post-filter)
      if (conditions.length > 0 && !applyConditions(record, conditions)) return undefined
      current = record
      continue
    }

    // ── aggregate ──────────────────────────────────────────────────────────
    if (step.type === 'agg') {
      // Apply conditions to _items before aggregating
      const items = getItems(current)
      if (items !== null) {
        const filtered = filterItems(items, conditions)
        current = materializeCollection(EMPTY_SEED, filtered, null)
      }
      if (step.op === 'count') {
        current = (current as any)?.['count']
      } else if (step.field) {
        const sub = (current as any)?.[step.op]
        current = typeof sub === 'object' && sub !== null ? sub[step.field] : sub
      } else {
        current = (current as any)?.[step.op]
      }
      // Conditions consumed by filtering _items
      return current
    }

    // ── field access ───────────────────────────────────────────────────────
    if (step.type === 'field') {
      current = (current as any)?.[step.name]
    }
  }

  // Post-filter on single record (conditions not consumed by agg or array)
  if (conditions.length > 0 && current !== null && current !== undefined) {
    if (typeof current === 'object' && !Array.isArray(current)) {
      if (!applyConditions(current as Record<string, unknown>, conditions)) return undefined
    }
    // For scalar values: conditions cannot be checked — pass through
  }

  return current
}
