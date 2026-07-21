// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { deserializeFromDb } from '@beechcms/core'
import type { AggregateFormula, TimeWindow, WidgetWindow } from '@beechcms/core'
import type { Env, Variables } from '../../types'

const widgetApp = new Hono<{ Bindings: Env; Variables: Variables }>()

const DEFAULT_LEADERBOARD_LIMIT = 10
const MAXIMUM_LEADERBOARD_LIMIT = 100
const DEFAULT_LIST_LIMIT = 25
const MAXIMUM_LIST_LIMIT = 100
const DEFAULT_DISTRIBUTION_LIMIT = 8
const MAXIMUM_DISTRIBUTION_LIMIT = 24

function parseFormula(raw: string | undefined): AggregateFormula | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null || !Object.hasOwn(parsed, 'op')) return null
    return parsed as AggregateFormula
  } catch {
    return null
  }
}

function parseWindow(raw: string | undefined): TimeWindow {
  if (raw === 'week' || raw === 'month' || raw === 'year' || raw === 'all') return raw
  return 'all'
}

/**
 * Resolves the effective query window: an explicit `from`/`to` unix-second
 * range takes priority over the `window` preset, allowing the dashboard to
 * pin widgets to a custom date reference.
 */
function parseWidgetWindow(query: { window?: string; from?: string; to?: string }): WidgetWindow {
  const from = Number.parseInt(query.from ?? '', 10)
  const to = Number.parseInt(query.to ?? '', 10)
  if (Number.isFinite(from) && Number.isFinite(to) && from <= to) {
    return { from, to }
  }
  return parseWindow(query.window)
}

function parseBoundedInt(raw: string | undefined, fallback: number, maximum: number, minimum = 1): number {
  const parsed = Number.parseInt(raw ?? String(fallback), 10)
  if (!Number.isFinite(parsed) || parsed < minimum) return fallback
  return Math.min(parsed, maximum)
}

function problem(status: number, title: string, detail: string) {
  return { type: 'about:blank', title, status, detail }
}

function isUnsafeColumnError(error: unknown): boolean {
  return error instanceof Error && error.message === 'UNSAFE_COLUMN'
}

widgetApp.get('/aggregate/:seed', async (context) => {
  const seedSlug = context.req.param('seed')
  const seed = context.get('getSeed')(seedSlug)
  if (!seed) return context.json(problem(404, 'Not Found', `Seed '${seedSlug}' not found`), 404)

  const formula = parseFormula(context.req.query('formula'))
  if (!formula) return context.json(problem(400, 'Bad Request', 'Invalid or missing formula parameter (must be JSON)'), 400)

  const window = parseWidgetWindow(context.req.query())

  try {
    const value = await context.get('widgetRepository').aggregate(seed, formula, window)
    return context.json({ value, window })
  } catch (error) {
    if (isUnsafeColumnError(error)) return context.json(problem(400, 'Bad Request', 'Invalid column reference'), 400)
    console.error('[widget/aggregate] DB error:', error)
    return context.json(problem(500, 'Internal Server Error', 'Database error'), 500)
  }
})

widgetApp.get('/growth/:seed', async (context) => {
  const seedSlug = context.req.param('seed')
  const seed = context.get('getSeed')(seedSlug)
  if (!seed) return context.json(problem(404, 'Not Found', `Seed '${seedSlug}' not found`), 404)

  const formula = parseFormula(context.req.query('formula'))
  if (!formula) return context.json(problem(400, 'Bad Request', 'Invalid or missing formula parameter (must be JSON)'), 400)

  const window = parseWidgetWindow(context.req.query())

  try {
    const { currentValue, previousValue } = await context
      .get('widgetRepository')
      .growth(seed, formula, window)

    let percentageChange = 0
    if (previousValue !== 0) {
      percentageChange = Math.round(((currentValue - previousValue) / Math.abs(previousValue)) * 1000) / 10
    } else if (currentValue > 0) {
      percentageChange = 100
    } else if (currentValue < 0) {
      percentageChange = -100
    }

    let trend: 'up' | 'down' | 'flat' = 'flat'
    if (percentageChange > 0) trend = 'up'
    else if (percentageChange < 0) trend = 'down'

    return context.json({ current: currentValue, previous: previousValue, percentageChange, trend })
  } catch (error) {
    if (isUnsafeColumnError(error)) return context.json(problem(400, 'Bad Request', 'Invalid column reference'), 400)
    console.error('[widget/growth] DB error:', error)
    return context.json(problem(500, 'Internal Server Error', 'Database error'), 500)
  }
})

widgetApp.get('/leaderboard/:seed', async (context) => {
  const seedSlug = context.req.param('seed')
  const seed = context.get('getSeed')(seedSlug)
  if (!seed) return context.json(problem(404, 'Not Found', `Seed '${seedSlug}' not found`), 404)

  const scoreColumn = context.req.query('scoreColumn')
  if (!scoreColumn) return context.json(problem(400, 'Bad Request', 'Missing scoreColumn parameter'), 400)

  const limit = parseBoundedInt(context.req.query('limit'), DEFAULT_LEADERBOARD_LIMIT, MAXIMUM_LEADERBOARD_LIMIT)
  const orderDirection: 'ASC' | 'DESC' = context.req.query('orderDir') === 'asc' ? 'ASC' : 'DESC'

  try {
    const entries = await context
      .get('widgetRepository')
      .leaderboard(seed, { scoreColumn, limit, orderDirection })
    return context.json(entries)
  } catch (error) {
    if (isUnsafeColumnError(error)) return context.json(problem(400, 'Bad Request', 'Invalid column reference'), 400)
    console.error('[widget/leaderboard] DB error:', error)
    return context.json(problem(500, 'Internal Server Error', 'Database error'), 500)
  }
})

widgetApp.get('/list/:seed', async (context) => {
  const seedSlug = context.req.param('seed')
  const seed = context.get('getSeed')(seedSlug)
  if (!seed) return context.json(problem(404, 'Not Found', `Seed '${seedSlug}' not found`), 404)

  const query = context.req.query()
  const limit = parseBoundedInt(query.limit, DEFAULT_LIST_LIMIT, MAXIMUM_LIST_LIMIT)
  const offsetRaw = Number.parseInt(query.offset ?? '0', 10)
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0
  const search = query.search?.trim() || undefined
  const orderByColumn = query.orderBy || undefined
  const orderDirection: 'ASC' | 'DESC' = query.orderDir === 'desc' ? 'DESC' : 'ASC'

  let filters: Array<{ column: string; op: string; value: unknown }> | undefined
  if (query.filters) {
    try {
      filters = JSON.parse(query.filters) as Array<{ column: string; op: string; value: unknown }>
    } catch {
      return context.json(problem(400, 'Bad Request', 'Invalid filters JSON'), 400)
    }
  }

  try {
    const { entries, totalCount } = await context.get('widgetRepository').list(seed, {
      limit,
      offset,
      search,
      filters,
      orderByColumn,
      orderDirection,
    })

    const deserializedEntries = entries.map(row => {
      const data: Record<string, unknown> = Object.create(null)
      for (const branch of seed.branches) {
        data[branch.alias] = deserializeFromDb(branch, row[branch.alias] ?? null)
      }
      return {
        id: row.id as string,
        slug: (row.slug as string | null) ?? '',
        status: row.status as string,
        createdAt: (row.created_at as number) ?? 0,
        updatedAt: (row.updated_at as number) ?? 0,
        ...data,
      }
    })

    return context.json({ entries: deserializedEntries, total: totalCount })
  } catch (error) {
    if (isUnsafeColumnError(error)) return context.json(problem(400, 'Bad Request', 'Invalid column reference'), 400)
    console.error('[widget/list] DB error:', error)
    return context.json(problem(500, 'Internal Server Error', 'Database error'), 500)
  }
})

widgetApp.get('/timeseries/:seed', async (context) => {
  const seedSlug = context.req.param('seed')
  const seed = context.get('getSeed')(seedSlug)
  if (!seed) return context.json(problem(404, 'Not Found', `Seed '${seedSlug}' not found`), 404)

  const valueColumn = context.req.query('valueColumn')
  const groupColumn = context.req.query('groupColumn') ?? 'created_at'
  const formulaOp = context.req.query('formula') ?? 'count'
  const window = parseWidgetWindow(context.req.query())

  if (!valueColumn && formulaOp !== 'count') {
    return context.json(problem(400, 'Bad Request', 'valueColumn is required when formula is not count'), 400)
  }

  let formula: AggregateFormula
  if (formulaOp === 'count') formula = { op: 'count' }
  else if (formulaOp === 'sum' && valueColumn) formula = { op: 'sum', column: valueColumn }
  else if (formulaOp === 'avg' && valueColumn) formula = { op: 'avg', column: valueColumn }
  else return context.json(problem(400, 'Bad Request', 'formula must be sum, avg, or count'), 400)

  try {
    const points = await context
      .get('widgetRepository')
      .timeseries(seed, formula, window, groupColumn)
    return context.json({ points })
  } catch (error) {
    if (isUnsafeColumnError(error)) return context.json(problem(400, 'Bad Request', 'Invalid column reference'), 400)
    console.error('[widget/timeseries] DB error:', error)
    return context.json(problem(500, 'Internal Server Error', 'Database error'), 500)
  }
})

widgetApp.get('/distribution/:seed', async (context) => {
  const seedSlug = context.req.param('seed')
  const seed = context.get('getSeed')(seedSlug)
  if (!seed) return context.json(problem(404, 'Not Found', `Seed '${seedSlug}' not found`), 404)

  const column = context.req.query('column')
  if (!column) return context.json(problem(400, 'Bad Request', 'Missing column parameter'), 400)

  const window = parseWidgetWindow(context.req.query())
  const limit = parseBoundedInt(context.req.query('limit'), DEFAULT_DISTRIBUTION_LIMIT, MAXIMUM_DISTRIBUTION_LIMIT)

  try {
    const slices = await context
      .get('widgetRepository')
      .distribution(seed, column, window, limit)
    return context.json({ slices })
  } catch (error) {
    if (isUnsafeColumnError(error)) return context.json(problem(400, 'Bad Request', 'Invalid column reference'), 400)
    console.error('[widget/distribution] DB error:', error)
    return context.json(problem(500, 'Internal Server Error', 'Database error'), 500)
  }
})

export { widgetApp }
