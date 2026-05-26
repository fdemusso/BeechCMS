// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { AutomationAction, ContentRepository, Seed } from '@beechcms/core'
import type { ResolvedContext } from '../context-resolver'
import { conditionToFilterGroup } from '../filter-translation'
import { interpolate } from '../automation-runner.utils'

type SetVariableAction = Extract<AutomationAction, { type: 'set_variable' }>

export async function executeSetVariable(
  action: SetVariableAction,
  ctx: {
    entry: Record<string, unknown>
    variables: Record<string, unknown>
    repository: ContentRepository
    getSeed: (slug: string) => Seed | null
    seed: Seed
    context: ResolvedContext
  },
): Promise<void> {
  const seedSlug = action.seed_slug ?? ctx.seed.slug
  const targetSeed = ctx.getSeed(seedSlug)
  if (!targetSeed) {
    console.warn(`[set_variable] seed "${seedSlug}" not found; "${action.name}" → null`)
    ctx.variables[action.name] = null
    return
  }

  if (action.fixed_id !== undefined) {
    const resolvedId = interpolate(action.fixed_id, ctx.context)
    const { items } = await ctx.repository.findMany(targetSeed, {
      filters: [{ column: 'id', type: 'system', conditions: [{ op: 'eq', value: resolvedId }] }],
      status: null,
      pagination: { limit: 1, offset: 0 },
    })
    const item = items[0] ?? null
    if (!item) console.warn(`[set_variable] "${action.name}": id "${resolvedId}" not found`)
    if (action.column) {
      ctx.variables[action.name] = item ? { _value: item[action.column] } : null
    } else {
      ctx.variables[action.name] = item
    }
    return
  }

  const resolvedFilters = (action.filters ?? []).map((f) => {
    const value = typeof f.value === 'string' ? interpolate(f.value, ctx.context) : f.value
    return conditionToFilterGroup({ ...f, value }, targetSeed)
  })

  const orderDir: 'ASC' | 'DESC' = action.order === 'asc' ? 'ASC' : 'DESC'
  const { items } = await ctx.repository.findMany(targetSeed, {
    filters: resolvedFilters,
    status: null,
    pagination: { limit: 1000, offset: 0 },
    orderBy: action.order_by ? { column: action.order_by, dir: orderDir } : undefined,
  })

  ctx.variables[action.name] = materializeCollection(targetSeed, items, action.column ?? null)
}

export function materializeCollection(
  seed: Seed,
  items: Array<Record<string, unknown>>,
  pinned: string | null,
): Record<string, unknown> {
  const firstone = items.length > 0
    ? items.reduce((best, r) => (Number(r['created_at']) < Number(best['created_at']) ? r : best), items[0])
    : null
  const lastone = items.length > 0
    ? items.reduce((best, r) => (Number(r['created_at']) > Number(best['created_at']) ? r : best), items[0])
    : null

  let out: Record<string, unknown>

  if (pinned === null) {
    out = calculateGeneralStats(seed, items)
    out.firstone = firstone
    out.lastone = lastone
  } else {
    out = calculatePinnedStats(items, pinned)
    out.firstone = firstone
    out.lastone = lastone
  }

  Object.defineProperty(out, '_items', { value: items, enumerable: false })
  return out
}

function formatPluckValues(items: Array<Record<string, unknown>>, key: string): string {
  const vals = items.slice(0, 100).map((r) => String(r[key] ?? ''))
  return vals.join(', ') + (items.length > 100 ? ' …' : '')
}

function calculatePinnedStats(items: Array<Record<string, unknown>>, pinned: string): Record<string, unknown> {
  const nonNull = items.filter((r) => r[pinned] != null)
  const nums = nonNull.map((r) => Number(r[pinned]))
  const validNums = nums.filter((n) => !Number.isNaN(n))
  const total = validNums.reduce((a, n) => a + n, 0)
  const pluck = formatPluckValues(items, pinned)

  return {
    count: nonNull.length,
    sum: validNums.length > 0 ? total : 0,
    avg: validNums.length > 0 ? total / validNums.length : 0,
    min: validNums.length > 0 ? Math.min(...validNums) : 0,
    max: validNums.length > 0 ? Math.max(...validNums) : 0,
    pluck,
  }
}

function extractValidNumbers(items: Array<Record<string, unknown>>, key: string): number[] {
  return items
    .map((r) => {
      const v = r[key]
      const n = Number(v)
      if (!Number.isNaN(n)) return n
      if (typeof v === 'string') {
        const d = Date.parse(v)
        return Number.isNaN(d) ? Number.NaN : d / 1000
      }
      return Number.NaN
    })
    .filter((n) => !Number.isNaN(n))
}

function calculateGeneralStats(seed: Seed, items: Array<Record<string, unknown>>): Record<string, unknown> {
  const sum: Record<string, number> = {}
  const avg: Record<string, number> = {}
  const min: Record<string, number> = {}
  const max: Record<string, number> = {}
  const pluck: Record<string, string> = {}

  for (const branch of seed.branches) {
    if (branch.type === 'number' || branch.type === 'date') {
      const nums = extractValidNumbers(items, branch.alias)
      const total = nums.reduce((a, n) => a + n, 0)
      sum[branch.alias] = total
      avg[branch.alias] = items.length > 0 ? total / items.length : 0
      min[branch.alias] = nums.length > 0 ? Math.min(...nums) : 0
      max[branch.alias] = nums.length > 0 ? Math.max(...nums) : 0
    } else {
      pluck[branch.alias] = formatPluckValues(items, branch.alias)
    }
  }

  return { count: items.length, sum, avg, min, max, pluck }
}
