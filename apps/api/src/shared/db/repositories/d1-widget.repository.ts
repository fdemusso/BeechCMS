// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import {
  isDateRange,
  type Seed,
  type IWidgetRepository,
  type AggregateFormula,
  type WidgetWindow,
  type LeaderboardEntry,
  type LeaderboardOptions,
  type TimeseriesPoint,
  type WidgetListOptions,
  type WidgetListResult,
  type GrowthResult,
  type DistributionSlice,
} from '@beechcms/core'

const SYSTEM_COLUMNS: ReadonlySet<string> = new Set([
  'id',
  'slug',
  'status',
  'created_at',
  'updated_at',
])

const ALLOWED_FILTER_OPERATORS: ReadonlySet<string> = new Set([
  'eq',
  '=',
  'neq',
  '!=',
  'like',
  'gt',
  '>',
  'lt',
  '<',
])

const UNSAFE_COLUMN_ERROR = 'UNSAFE_COLUMN'

/**
 * D1-backed implementation of {@link IWidgetRepository}.
 *
 * All user-supplied values are bound via parameterised statements. Column
 * aliases originating from query strings are validated against the seed
 * before being composed into the SQL string, preventing column-name
 * injection. SQL keywords (aggregate function names, ORDER direction) are
 * selected via hardcoded branches.
 */
export class D1WidgetRepository implements IWidgetRepository {
  constructor(private readonly database: D1Database) {}

  async aggregate(seed: Seed, formula: AggregateFormula, window: WidgetWindow): Promise<number> {
    const aggregateExpression = this.buildAggregateExpression(seed, formula)
    const { sql: timeWindowFilter, bindings: timeBindings } = this.buildTimeWindowFilter(window)
    const tableName = `content_${seed.slug}`

    const sql =
      `SELECT ${aggregateExpression.sql} as computed_value
         FROM ${tableName}
        WHERE ${timeWindowFilter}`

    const row = await this.database
      .prepare(sql)
      .bind(...aggregateExpression.bindings, ...timeBindings)
      .first<{ computed_value: number | null }>()
    return row?.computed_value ?? 0
  }

  async growth(
    seed: Seed,
    formula: AggregateFormula,
    window: WidgetWindow,
  ): Promise<GrowthResult> {
    const aggregateExpression = this.buildAggregateExpression(seed, formula)
    const { currentFilter, previousFilter } = this.buildPreviousWindowFilter(window)
    const tableName = `content_${seed.slug}`

    const [currentRow, previousRow] = await Promise.all([
      this.database
        .prepare(`SELECT ${aggregateExpression.sql} as computed_value FROM ${tableName} WHERE ${currentFilter.sql}`)
        .bind(...aggregateExpression.bindings, ...currentFilter.bindings)
        .first<{ computed_value: number | null }>(),
      this.database
        .prepare(`SELECT ${aggregateExpression.sql} as computed_value FROM ${tableName} WHERE ${previousFilter.sql}`)
        .bind(...aggregateExpression.bindings, ...previousFilter.bindings)
        .first<{ computed_value: number | null }>(),
    ])

    return {
      currentValue: currentRow?.computed_value ?? 0,
      previousValue: previousRow?.computed_value ?? 0,
    }
  }

  async leaderboard(seed: Seed, options: LeaderboardOptions): Promise<LeaderboardEntry[]> {
    const scoreColumn = this.resolveColumnExpression(seed, options.scoreColumn)
    const labelColumn = this.resolveColumnExpression(seed, seed.displayNameAlias)
    const tableName = `content_${seed.slug}`
    const orderClause = options.orderDirection === 'ASC'
      ? `ORDER BY CAST(${scoreColumn} AS REAL) ASC`
      : `ORDER BY CAST(${scoreColumn} AS REAL) DESC`

    const sql =
      `SELECT id, ${labelColumn} as label, ${scoreColumn} as score
         FROM ${tableName}
        WHERE ${scoreColumn} IS NOT NULL
        ${orderClause}
        LIMIT ?`

    const rows = await this.database
      .prepare(sql)
      .bind(options.limit)
      .all<{ id: string; label: string | null; score: number | string | null }>()

    return (rows.results ?? []).map(row => ({
      id: row.id,
      label: row.label ?? row.id,
      score: row.score ?? 0,
    }))
  }

  async list(seed: Seed, options: WidgetListOptions): Promise<WidgetListResult> {
    const tableName = `content_${seed.slug}`
    const conditions: string[] = []
    const bindings: unknown[] = []

    const trimmedSearch = options.search?.trim() ?? ''
    if (trimmedSearch.length > 0) {
      const escapedSearch = trimmedSearch
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_')
      const displayColumn = this.resolveColumnExpression(seed, seed.displayNameAlias)
      conditions.push(`${displayColumn} LIKE ? ESCAPE '\\'`)
      bindings.push(`%${escapedSearch}%`)
    }

    for (const filter of options.filters ?? []) {
      this.appendFilterCondition(seed, filter, conditions, bindings)
    }

    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const orderClause = this.buildListOrderClause(seed, options)
    const branchColumns = seed.branches.map(branch => branch.alias).join(', ')
    const selectColumns = branchColumns.length > 0
      ? `id, slug, status, created_at, updated_at, ${branchColumns}`
      : `id, slug, status, created_at, updated_at`

    const dataSql =
      `SELECT ${selectColumns}
         FROM ${tableName}
         ${whereSql}
         ${orderClause}
         LIMIT ? OFFSET ?`

    const countSql = `SELECT COUNT(*) as total FROM ${tableName} ${whereSql}`

    const [countRow, listRows] = await Promise.all([
      this.database.prepare(countSql).bind(...bindings).first<{ total: number }>(),
      this.database
        .prepare(dataSql)
        .bind(...bindings, options.limit, options.offset)
        .all<Record<string, unknown>>(),
    ])

    return {
      entries: listRows.results ?? [],
      totalCount: countRow?.total ?? 0,
    }
  }

  async timeseries(
    seed: Seed,
    formula: AggregateFormula,
    window: WidgetWindow,
    groupColumn: string,
  ): Promise<TimeseriesPoint[]> {
    const groupColumnExpression = this.resolveColumnExpression(seed, groupColumn)
    const aggregateExpression = this.buildAggregateExpression(seed, formula)
    const { sql: timeWindowFilter, bindings: timeBindings } = this.buildTimeWindowFilter(window)
    const tableName = `content_${seed.slug}`

    const dateBucketExpression = groupColumnExpression === 'created_at'
      ? `strftime('%Y-%m-%d', created_at, 'unixepoch')`
      : `strftime('%Y-%m-%d', CAST(${groupColumnExpression} AS INTEGER), 'unixepoch')`

    const sql =
      `SELECT ${dateBucketExpression} as bucket_label,
              ${aggregateExpression.sql} as bucket_value
         FROM ${tableName}
        WHERE ${timeWindowFilter}
        GROUP BY bucket_label
        ORDER BY bucket_label ASC`

    const rows = await this.database
      .prepare(sql)
      .bind(...aggregateExpression.bindings, ...timeBindings)
      .all<{ bucket_label: string | null; bucket_value: number | null }>()

    return (rows.results ?? []).map(row => ({
      label: row.bucket_label ?? '',
      value: row.bucket_value ?? 0,
    }))
  }

  async distribution(
    seed: Seed,
    column: string,
    window: WidgetWindow,
    limit: number,
  ): Promise<DistributionSlice[]> {
    const columnExpression = this.resolveColumnExpression(seed, column)
    const { sql: timeWindowFilter, bindings } = this.buildTimeWindowFilter(window)
    const tableName = `content_${seed.slug}`

    const sql =
      `SELECT ${columnExpression} as label, COUNT(*) as value
         FROM ${tableName}
        WHERE ${timeWindowFilter}
        GROUP BY ${columnExpression}
        ORDER BY value DESC
        LIMIT ?`

    const rows = await this.database
      .prepare(sql)
      .bind(...bindings, limit)
      .all<{ label: string | number | null; value: number | null }>()

    return (rows.results ?? []).map(row => ({
      label: row.label === null ? '∅' : String(row.label),
      value: row.value ?? 0,
    }))
  }

  /**
   * Throws UNSAFE_COLUMN if the alias is neither a system column nor a
   * declared seed branch, preventing SQL injection via column names.
   */
  private resolveColumnExpression(seed: Seed, alias: string): string {
    if (SYSTEM_COLUMNS.has(alias)) return alias
    const branch = seed.branches.find(candidate => candidate.alias === alias)
    if (!branch) throw new Error(UNSAFE_COLUMN_ERROR)
    return branch.alias
  }

  private buildAggregateExpression(seed: Seed, formula: AggregateFormula): { sql: string; bindings: unknown[] } {
    switch (formula.op) {
      case 'count':
        return { sql: 'COUNT(*)', bindings: [] }
      case 'sum': {
        const column = this.resolveColumnExpression(seed, formula.column)
        return { sql: `SUM(CAST(${column} AS REAL))`, bindings: [] }
      }
      case 'avg': {
        const column = this.resolveColumnExpression(seed, formula.column)
        return { sql: `AVG(CAST(${column} AS REAL))`, bindings: [] }
      }
      case 'min': {
        const column = this.resolveColumnExpression(seed, formula.column)
        return { sql: `MIN(CAST(${column} AS REAL))`, bindings: [] }
      }
      case 'max': {
        const column = this.resolveColumnExpression(seed, formula.column)
        return { sql: `MAX(CAST(${column} AS REAL))`, bindings: [] }
      }
      case 'countWhere':
        return this.buildCountWhereExpression(seed, formula.column, formula.value)
      case 'percentageOf': {
        const numerator = this.resolveColumnExpression(seed, formula.numeratorColumn)
        const denominator = this.resolveColumnExpression(seed, formula.denominatorColumn)
        return {
          sql: `CASE WHEN SUM(CAST(${denominator} AS REAL)) = 0 THEN 0 ELSE (SUM(CAST(${numerator} AS REAL)) * 100.0 / SUM(CAST(${denominator} AS REAL))) END`,
          bindings: [],
        }
      }
    }
  }

  private buildCountWhereExpression(seed: Seed, alias: string, value: unknown): { sql: string; bindings: unknown[] } {
    const column = this.resolveColumnExpression(seed, alias)
    if (value === null) return { sql: `COUNT(CASE WHEN ${column} IS NULL THEN 1 END)`, bindings: [] }
    if (typeof value === 'boolean') {
      const numericValue = value ? 1 : 0
      return { sql: `COUNT(CASE WHEN ${column} = ? THEN 1 END)`, bindings: [numericValue] }
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return { sql: `COUNT(CASE WHEN CAST(${column} AS REAL) = ? THEN 1 END)`, bindings: [value] }
    }
    return { sql: `COUNT(CASE WHEN ${column} = ? THEN 1 END)`, bindings: [value] }
  }

  private buildTimeWindowFilter(window: WidgetWindow): { sql: string; bindings: number[] } {
    if (isDateRange(window)) {
      return { sql: 'created_at BETWEEN ? AND ?', bindings: [window.from, window.to] }
    }
    switch (window) {
      case 'week':  return { sql: "created_at > unixepoch('now', '-7 days')", bindings: [] }
      case 'month': return { sql: "created_at > unixepoch('now', '-1 month')", bindings: [] }
      case 'year':  return { sql: "created_at > unixepoch('now', '-1 year')", bindings: [] }
      case 'all':   return { sql: '1=1', bindings: [] }
    }
  }

  private buildPreviousWindowFilter(
    window: WidgetWindow,
  ): { currentFilter: { sql: string; bindings: number[] }; previousFilter: { sql: string; bindings: number[] } } {
    if (isDateRange(window)) {
      const span = window.to - window.from
      return {
        currentFilter: { sql: 'created_at BETWEEN ? AND ?', bindings: [window.from, window.to] },
        previousFilter: { sql: 'created_at BETWEEN ? AND ?', bindings: [window.from - span - 1, window.from - 1] },
      }
    }
    switch (window) {
      case 'week':
        return {
          currentFilter:  { sql: "created_at > unixepoch('now', '-7 days')", bindings: [] },
          previousFilter: { sql: "created_at > unixepoch('now', '-14 days') AND created_at <= unixepoch('now', '-7 days')", bindings: [] },
        }
      case 'month':
        return {
          currentFilter:  { sql: "created_at > unixepoch('now', '-1 month')", bindings: [] },
          previousFilter: { sql: "created_at > unixepoch('now', '-2 months') AND created_at <= unixepoch('now', '-1 month')", bindings: [] },
        }
      case 'year':
        return {
          currentFilter:  { sql: "created_at > unixepoch('now', '-1 year')", bindings: [] },
          previousFilter: { sql: "created_at > unixepoch('now', '-2 years') AND created_at <= unixepoch('now', '-1 year')", bindings: [] },
        }
      case 'all':
        return { currentFilter: { sql: '1=1', bindings: [] }, previousFilter: { sql: '1=0', bindings: [] } }
    }
  }

  private appendFilterCondition(
    seed: Seed,
    filter: { column: string; op: string; value: unknown },
    conditions: string[],
    bindings: unknown[],
  ): void {
    if (!ALLOWED_FILTER_OPERATORS.has(filter.op)) return

    let column: string
    try {
      column = this.resolveColumnExpression(seed, filter.column)
    } catch {
      return
    }

    switch (filter.op) {
      case 'eq':
      case '=':
        conditions.push(`${column} = ?`)
        bindings.push(filter.value)
        return
      case 'neq':
      case '!=':
        conditions.push(`${column} != ?`)
        bindings.push(filter.value)
        return
      case 'like':
        conditions.push(`${column} LIKE ?`)
        bindings.push(filter.value)
        return
      case 'gt':
      case '>':
        conditions.push(`CAST(${column} AS REAL) > ?`)
        bindings.push(filter.value)
        return
      case 'lt':
      case '<':
        conditions.push(`CAST(${column} AS REAL) < ?`)
        bindings.push(filter.value)
        return
    }
  }

  private buildListOrderClause(seed: Seed, options: WidgetListOptions): string {
    let orderColumn = 'created_at'
    if (options.orderByColumn) {
      try {
        orderColumn = this.resolveColumnExpression(seed, options.orderByColumn)
      } catch {
        orderColumn = 'created_at'
      }
    }
    return options.orderDirection === 'DESC'
      ? `ORDER BY ${orderColumn} DESC`
      : `ORDER BY ${orderColumn} ASC`
  }
}
