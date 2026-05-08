/// <reference types="@cloudflare/workers-types" />
import type {
  Seed,
  IWidgetRepository,
  AggregateFormula,
  TimeWindow,
  LeaderboardEntry,
  LeaderboardOptions,
  TimeseriesPoint,
  WidgetListOptions,
  WidgetListResult,
  GrowthResult,
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

  async aggregate(seed: Seed, formula: AggregateFormula, window: TimeWindow): Promise<number> {
    const aggregateExpression = this.buildAggregateExpression(seed, formula)
    const timeWindowFilter = this.buildTimeWindowFilter(window)
    const tableName = `content_${seed.slug}`

    const sql =
      `SELECT ${aggregateExpression} as computed_value
         FROM ${tableName}
        WHERE ${timeWindowFilter}`

    const row = await this.database.prepare(sql).first<{ computed_value: number | null }>()
    return row?.computed_value ?? 0
  }

  async growth(
    seed: Seed,
    formula: AggregateFormula,
    window: TimeWindow,
  ): Promise<GrowthResult> {
    const aggregateExpression = this.buildAggregateExpression(seed, formula)
    const { currentFilter, previousFilter } = this.buildPreviousWindowFilter(window)
    const tableName = `content_${seed.slug}`

    const [currentRow, previousRow] = await Promise.all([
      this.database
        .prepare(`SELECT ${aggregateExpression} as computed_value FROM ${tableName} WHERE ${currentFilter}`)
        .first<{ computed_value: number | null }>(),
      this.database
        .prepare(`SELECT ${aggregateExpression} as computed_value FROM ${tableName} WHERE ${previousFilter}`)
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
      const displayColumn = this.resolveColumnExpression(seed, seed.displayNameAlias)
      conditions.push(`${displayColumn} LIKE ?`)
      bindings.push(`%${trimmedSearch}%`)
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
    window: TimeWindow,
    groupColumn: string,
  ): Promise<TimeseriesPoint[]> {
    const groupColumnExpression = this.resolveColumnExpression(seed, groupColumn)
    const aggregateExpression = this.buildAggregateExpression(seed, formula)
    const timeWindowFilter = this.buildTimeWindowFilter(window)
    const tableName = `content_${seed.slug}`

    const dateBucketExpression = groupColumnExpression === 'created_at'
      ? `strftime('%Y-%m-%d', created_at, 'unixepoch')`
      : `strftime('%Y-%m-%d', CAST(${groupColumnExpression} AS INTEGER), 'unixepoch')`

    const sql =
      `SELECT ${dateBucketExpression} as bucket_label,
              ${aggregateExpression} as bucket_value
         FROM ${tableName}
        WHERE ${timeWindowFilter}
        GROUP BY bucket_label
        ORDER BY bucket_label ASC`

    const rows = await this.database
      .prepare(sql)
      .all<{ bucket_label: string | null; bucket_value: number | null }>()

    return (rows.results ?? []).map(row => ({
      label: row.bucket_label ?? '',
      value: row.bucket_value ?? 0,
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

  private buildAggregateExpression(seed: Seed, formula: AggregateFormula): string {
    switch (formula.op) {
      case 'count':
        return 'COUNT(*)'
      case 'sum': {
        const column = this.resolveColumnExpression(seed, formula.column)
        return `SUM(CAST(${column} AS REAL))`
      }
      case 'avg': {
        const column = this.resolveColumnExpression(seed, formula.column)
        return `AVG(CAST(${column} AS REAL))`
      }
      case 'min': {
        const column = this.resolveColumnExpression(seed, formula.column)
        return `MIN(CAST(${column} AS REAL))`
      }
      case 'max': {
        const column = this.resolveColumnExpression(seed, formula.column)
        return `MAX(CAST(${column} AS REAL))`
      }
      case 'countWhere':
        return this.buildCountWhereExpression(seed, formula.column, formula.value)
      case 'percentageOf': {
        const numerator = this.resolveColumnExpression(seed, formula.numeratorColumn)
        const denominator = this.resolveColumnExpression(seed, formula.denominatorColumn)
        return `CASE WHEN SUM(CAST(${denominator} AS REAL)) = 0 THEN 0 ELSE (SUM(CAST(${numerator} AS REAL)) * 100.0 / SUM(CAST(${denominator} AS REAL))) END`
      }
    }
  }

  private buildCountWhereExpression(seed: Seed, alias: string, value: unknown): string {
    const column = this.resolveColumnExpression(seed, alias)
    if (value === null) return `COUNT(CASE WHEN ${column} IS NULL THEN 1 END)`
    if (typeof value === 'boolean') {
      const numericValue = value ? 1 : 0
      return `COUNT(CASE WHEN ${column} = ${numericValue} THEN 1 END)`
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return `COUNT(CASE WHEN CAST(${column} AS REAL) = ${value} THEN 1 END)`
    }
    const escaped = String(value).replace(/'/g, "''")
    return `COUNT(CASE WHEN ${column} = '${escaped}' THEN 1 END)`
  }

  private buildTimeWindowFilter(window: TimeWindow): string {
    switch (window) {
      case 'week':  return "created_at > unixepoch('now', '-7 days')"
      case 'month': return "created_at > unixepoch('now', '-1 month')"
      case 'year':  return "created_at > unixepoch('now', '-1 year')"
      case 'all':   return '1=1'
    }
  }

  private buildPreviousWindowFilter(
    window: TimeWindow,
  ): { currentFilter: string; previousFilter: string } {
    switch (window) {
      case 'week':
        return {
          currentFilter:  "created_at > unixepoch('now', '-7 days')",
          previousFilter: "created_at > unixepoch('now', '-14 days') AND created_at <= unixepoch('now', '-7 days')",
        }
      case 'month':
        return {
          currentFilter:  "created_at > unixepoch('now', '-1 month')",
          previousFilter: "created_at > unixepoch('now', '-2 months') AND created_at <= unixepoch('now', '-1 month')",
        }
      case 'year':
        return {
          currentFilter:  "created_at > unixepoch('now', '-1 year')",
          previousFilter: "created_at > unixepoch('now', '-2 years') AND created_at <= unixepoch('now', '-1 year')",
        }
      case 'all':
        return { currentFilter: '1=1', previousFilter: '1=0' }
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
