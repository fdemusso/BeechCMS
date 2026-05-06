/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { deserializeFromDb } from '@beechcms/core'
import type { Seed } from '@beechcms/core'
import type { Env, Variables } from './types'

const widgetApp = new Hono<{ Bindings: Env; Variables: Variables }>()

// ─── Helpers ────────────────────────────────────────────────────────────────

type AggregateFormula =
  | { op: 'count' }
  | { op: 'sum'; column: string }
  | { op: 'avg'; column: string }
  | { op: 'min'; column: string }
  | { op: 'max'; column: string }
  | { op: 'countWhere'; column: string; value: unknown }
  | { op: 'percentageOf'; numeratorColumn: string; denominatorColumn: string }

type TimeWindow = 'week' | 'month' | 'year' | 'all'

function timeWindowSql(window: TimeWindow): string {
  switch (window) {
    case 'week':  return "created_at >= unixepoch('now', '-7 days')"
    case 'month': return "created_at >= unixepoch('now', '-1 month')"
    case 'year':  return "created_at >= unixepoch('now', '-1 year')"
    case 'all':   return '1=1'
  }
}

function previousWindowSql(window: TimeWindow): { current: string; previous: string } {
  switch (window) {
    case 'week':
      return {
        current:  "created_at >= unixepoch('now', '-7 days')",
        previous: "created_at >= unixepoch('now', '-14 days') AND created_at < unixepoch('now', '-7 days')",
      }
    case 'month':
      return {
        current:  "created_at >= unixepoch('now', '-1 month')",
        previous: "created_at >= unixepoch('now', '-2 months') AND created_at < unixepoch('now', '-1 month')",
      }
    case 'year':
      return {
        current:  "created_at >= unixepoch('now', '-1 year')",
        previous: "created_at >= unixepoch('now', '-2 years') AND created_at < unixepoch('now', '-1 year')",
      }
    case 'all':
      return { current: '1=1', previous: '1=0' }
  }
}

const SYSTEM_COLUMNS = new Set(['created_at', 'updated_at', 'status', 'id', 'slug'])

// In v0.4.0 alias = column name. Validate against seed to prevent injection.
function resolveColumnExpr(seed: Seed, alias: string): string {
  if (SYSTEM_COLUMNS.has(alias)) return alias
  const branch = seed.branches.find(b => b.alias === alias)
  return branch ? branch.alias : 'id'
}

function buildAggregateExpr(seed: Seed, formula: AggregateFormula): string {
  switch (formula.op) {
    case 'count':
      return 'COUNT(*)'
    case 'sum':
      return `SUM(CAST(${resolveColumnExpr(seed, formula.column)} AS REAL))`
    case 'avg':
      return `AVG(CAST(${resolveColumnExpr(seed, formula.column)} AS REAL))`
    case 'min':
      return `MIN(CAST(${resolveColumnExpr(seed, formula.column)} AS REAL))`
    case 'max':
      return `MAX(CAST(${resolveColumnExpr(seed, formula.column)} AS REAL))`
    case 'countWhere': {
      const expr = resolveColumnExpr(seed, formula.column)
      const val = formula.value
      if (val === null) return `COUNT(CASE WHEN ${expr} IS NULL THEN 1 END)`
      if (typeof val === 'boolean') return `COUNT(CASE WHEN ${expr} = ${val ? 1 : 0} THEN 1 END)`
      if (typeof val === 'number') return `COUNT(CASE WHEN CAST(${expr} AS REAL) = ${val} THEN 1 END)`
      return `COUNT(CASE WHEN ${expr} = '${String(val).replace(/'/g, "''")}' THEN 1 END)`
    }
    case 'percentageOf': {
      const num = resolveColumnExpr(seed, formula.numeratorColumn)
      const den = resolveColumnExpr(seed, formula.denominatorColumn)
      return `CASE WHEN SUM(CAST(${den} AS REAL)) = 0 THEN 0 ELSE (SUM(CAST(${num} AS REAL)) * 100.0 / SUM(CAST(${den} AS REAL))) END`
    }
  }
}

function parseFormula(raw: string | undefined): AggregateFormula | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null || !('op' in parsed)) return null
    return parsed as AggregateFormula
  } catch {
    return null
  }
}

function parseWindow(raw: string | undefined): TimeWindow {
  if (raw === 'week' || raw === 'month' || raw === 'year' || raw === 'all') return raw
  return 'all'
}

function error(status: number, title: string, detail: string) {
  return { type: 'about:blank', title, status, detail }
}

// ─── Routes ─────────────────────────────────────────────────────────────────

widgetApp.get('/aggregate/:seed', async (c) => {
  const seedSlug = c.req.param('seed')
  const seed = c.get('getSeed')(seedSlug)
  if (!seed) return c.json(error(404, 'Not Found', `Seed '${seedSlug}' not found`), 404)

  const formula = parseFormula(c.req.query('formula'))
  if (!formula) return c.json(error(400, 'Bad Request', 'Invalid or missing formula parameter (must be JSON)'), 400)

  const window = parseWindow(c.req.query('window'))
  const aggExpr = buildAggregateExpr(seed, formula)

  try {
    const row = await c.env.DB.prepare(
      `SELECT ${aggExpr} as value FROM content_${seed.slug} WHERE (${timeWindowSql(window)})`
    ).first<{ value: number | null }>()
    return c.json({ value: row?.value ?? 0, window })
  } catch (err) {
    console.error('[widget/aggregate] DB error:', err)
    return c.json(error(500, 'Internal Server Error', 'Database error'), 500)
  }
})

widgetApp.get('/growth/:seed', async (c) => {
  const seedSlug = c.req.param('seed')
  const seed = c.get('getSeed')(seedSlug)
  if (!seed) return c.json(error(404, 'Not Found', `Seed '${seedSlug}' not found`), 404)

  const formula = parseFormula(c.req.query('formula'))
  if (!formula) return c.json(error(400, 'Bad Request', 'Invalid or missing formula parameter (must be JSON)'), 400)

  const window = parseWindow(c.req.query('window'))
  const { current: currentSql, previous: previousSql } = previousWindowSql(window)
  const aggExpr = buildAggregateExpr(seed, formula)
  const table = `content_${seed.slug}`

  try {
    const [currentRow, previousRow] = await Promise.all([
      c.env.DB.prepare(`SELECT ${aggExpr} as value FROM ${table} WHERE (${currentSql})`).first<{ value: number | null }>(),
      c.env.DB.prepare(`SELECT ${aggExpr} as value FROM ${table} WHERE (${previousSql})`).first<{ value: number | null }>(),
    ])

    const current = currentRow?.value ?? 0
    const previous = previousRow?.value ?? 0

    let percentageChange = 0
    let trend: 'up' | 'down' | 'flat' = 'flat'

    if (previous !== 0) {
      percentageChange = Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10
    } else if (current > 0) {
      percentageChange = 100
    }

    if (percentageChange > 0) trend = 'up'
    else if (percentageChange < 0) trend = 'down'

    return c.json({ current, previous, percentageChange, trend })
  } catch (err) {
    console.error('[widget/growth] DB error:', err)
    return c.json(error(500, 'Internal Server Error', 'Database error'), 500)
  }
})

widgetApp.get('/leaderboard/:seed', async (c) => {
  const seedSlug = c.req.param('seed')
  const seed = c.get('getSeed')(seedSlug)
  if (!seed) return c.json(error(404, 'Not Found', `Seed '${seedSlug}' not found`), 404)

  const scoreColumn = c.req.query('scoreColumn')
  if (!scoreColumn) return c.json(error(400, 'Bad Request', 'Missing scoreColumn parameter'), 400)

  const limitRaw = parseInt(c.req.query('limit') ?? '10', 10)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 10
  const orderDir = c.req.query('orderDir') === 'asc' ? 'ASC' : 'DESC'
  const scoreExpr = resolveColumnExpr(seed, scoreColumn)
  const labelCol = resolveColumnExpr(seed, seed.displayNameAlias)
  const table = `content_${seed.slug}`

  try {
    const rows = await c.env.DB.prepare(
      `SELECT id, ${labelCol} as label, ${scoreExpr} as score
       FROM ${table}
       WHERE ${scoreExpr} IS NOT NULL
       ORDER BY CAST(${scoreExpr} AS REAL) ${orderDir}
       LIMIT ?`
    ).bind(limit).all<{ id: string; label: string | null; score: number | string | null }>()

    const entries = (rows.results ?? []).map(row => ({
      id: row.id,
      label: row.label ?? row.id,
      score: row.score ?? 0,
    }))

    return c.json(entries)
  } catch (err) {
    console.error('[widget/leaderboard] DB error:', err)
    return c.json(error(500, 'Internal Server Error', 'Database error'), 500)
  }
})

widgetApp.get('/list/:seed', async (c) => {
  const seedSlug = c.req.param('seed')
  const seed = c.get('getSeed')(seedSlug)
  if (!seed) return c.json(error(404, 'Not Found', `Seed '${seedSlug}' not found`), 404)

  const { DB } = c.env
  const query = c.req.query()
  const table = `content_${seed.slug}`

  const limitRaw = parseInt(query.limit ?? '25', 10)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 25
  const offsetRaw = parseInt(query.offset ?? '0', 10)
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0

  const search = query.search?.trim() ?? ''
  const displayCol = resolveColumnExpr(seed, seed.displayNameAlias)

  const conditions: string[] = []
  const bindings: unknown[] = []

  if (search) {
    conditions.push(`${displayCol} LIKE ?`)
    bindings.push(`%${search}%`)
  }

  if (query.filters) {
    try {
      const rawFilters = JSON.parse(query.filters) as Array<{ column: string; op: string; value: unknown }>
      for (const f of rawFilters) {
        const expr = resolveColumnExpr(seed, f.column)
        switch (f.op) {
          case '=':
          case 'eq':   conditions.push(`${expr} = ?`);                      bindings.push(f.value); break
          case '!=':
          case 'neq':  conditions.push(`${expr} != ?`);                     bindings.push(f.value); break
          case 'like': conditions.push(`${expr} LIKE ?`);                   bindings.push(f.value); break
          case '>':
          case 'gt':   conditions.push(`CAST(${expr} AS REAL) > ?`);        bindings.push(f.value); break
          case '<':
          case 'lt':   conditions.push(`CAST(${expr} AS REAL) < ?`);        bindings.push(f.value); break
        }
      }
    } catch {
      return c.json(error(400, 'Bad Request', 'Invalid filters JSON'), 400)
    }
  }

  const orderByAlias = query.orderBy ?? ''
  const orderDir = query.orderDir === 'desc' ? 'DESC' : 'ASC'
  const orderExpr = orderByAlias ? resolveColumnExpr(seed, orderByAlias) : 'created_at'
  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    const [countRow, listRows] = await Promise.all([
      DB.prepare(`SELECT COUNT(*) as total FROM ${table} ${whereSql}`)
        .bind(...bindings)
        .first<{ total: number }>(),
      DB.prepare(
        `SELECT id, slug, status, created_at, updated_at, ${seed.branches.map(b => b.alias).join(', ')}
         FROM ${table} ${whereSql} ORDER BY ${orderExpr} ${orderDir} LIMIT ? OFFSET ?`
      )
        .bind(...bindings, limit, offset)
        .all<Record<string, unknown>>(),
    ])

    const entries = (listRows.results ?? []).map(row => {
      const data: Record<string, unknown> = {}
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

    return c.json({ entries, total: countRow?.total ?? 0 })
  } catch (err) {
    console.error('[widget/list] DB error:', err)
    return c.json(error(500, 'Internal Server Error', 'Database error'), 500)
  }
})

widgetApp.get('/timeseries/:seed', async (c) => {
  const seedSlug = c.req.param('seed')
  const seed = c.get('getSeed')(seedSlug)
  if (!seed) return c.json(error(404, 'Not Found', `Seed '${seedSlug}' not found`), 404)

  const valueColumn = c.req.query('valueColumn')
  const groupColumn = c.req.query('groupColumn') ?? 'created_at'
  const formulaOp = c.req.query('formula') ?? 'count'
  const window = parseWindow(c.req.query('window'))
  const table = `content_${seed.slug}`

  if (!valueColumn && formulaOp !== 'count') {
    return c.json(error(400, 'Bad Request', 'valueColumn is required when formula is not count'), 400)
  }

  const groupExpr = resolveColumnExpr(seed, groupColumn)
  const dateBucketExpr = `strftime('%Y-%m-%d', ${groupExpr === 'created_at' ? groupExpr : `CAST(${groupExpr} AS INTEGER)`}, 'unixepoch')`

  let aggExpr: string
  if (formulaOp === 'count') {
    aggExpr = 'COUNT(*)'
  } else if (formulaOp === 'sum' && valueColumn) {
    aggExpr = `SUM(CAST(${resolveColumnExpr(seed, valueColumn)} AS REAL))`
  } else if (formulaOp === 'avg' && valueColumn) {
    aggExpr = `AVG(CAST(${resolveColumnExpr(seed, valueColumn)} AS REAL))`
  } else {
    return c.json(error(400, 'Bad Request', 'formula must be sum, avg, or count'), 400)
  }

  try {
    const rows = await c.env.DB.prepare(
      `SELECT ${dateBucketExpr} as label, ${aggExpr} as value
       FROM ${table}
       WHERE (${timeWindowSql(window)})
       GROUP BY ${dateBucketExpr}
       ORDER BY ${dateBucketExpr} ASC`
    ).bind().all<{ label: string | null; value: number | null }>()

    const points = (rows.results ?? []).map(row => ({
      label: row.label ?? '',
      value: row.value ?? 0,
    }))

    return c.json({ points })
  } catch (err) {
    console.error('[widget/timeseries] DB error:', err)
    return c.json(error(500, 'Internal Server Error', 'Database error'), 500)
  }
})

export { widgetApp }
