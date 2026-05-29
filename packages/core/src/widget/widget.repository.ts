// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed } from '../types.js'

/**
 * Discriminated union describing the aggregate to compute over a content table.
 *
 * The widget routes accept this shape from the dashboard. Implementations are
 * responsible for translating each variant into a safe SQL expression and must
 * never interpolate the column or value fields without prior validation.
 */
export type AggregateFormula =
  | { op: 'count' }
  | { op: 'sum'; column: string }
  | { op: 'avg'; column: string }
  | { op: 'min'; column: string }
  | { op: 'max'; column: string }
  | { op: 'countWhere'; column: string; value: unknown }
  | { op: 'percentageOf'; numeratorColumn: string; denominatorColumn: string }

/**
 * Time range applied as a WHERE filter for widget queries.
 *
 * "all" means no temporal restriction. The other values bracket the most recent
 * 7 days, 1 month, and 1 year respectively, anchored on `created_at`.
 */
export type TimeWindow = 'week' | 'month' | 'year' | 'all'

export interface LeaderboardEntry {
  id: string
  label: string
  score: number | string
}

export interface LeaderboardOptions {
  scoreColumn: string
  limit: number
  orderDirection: 'ASC' | 'DESC'
}

export interface TimeseriesPoint {
  label: string
  value: number
}

export interface WidgetListFilter {
  column: string
  op: string
  value: unknown
}

export interface WidgetListOptions {
  limit: number
  offset: number
  search?: string
  filters?: WidgetListFilter[]
  orderByColumn?: string
  orderDirection?: 'ASC' | 'DESC'
}

export interface WidgetListResult {
  entries: Array<Record<string, unknown>>
  totalCount: number
}

export interface GrowthResult {
  currentValue: number
  previousValue: number
}

/**
 * Read-only data access contract for widget routes.
 *
 * Implementations must validate every column alias derived from user input
 * against the seed before composing SQL, and must bind every user-supplied
 * value via parameterised statements. SQL keywords (ORDER direction, aggregate
 * function names) must be selected via hardcoded branches, never interpolated.
 */
export interface IWidgetRepository {
  /**
   * Returns the formula result for the given time window. Always returns a
   * number; implementations must return 0 when the query produces no rows.
   */
  aggregate(seed: Seed, formula: AggregateFormula, window: TimeWindow): Promise<number>

  /**
   * Evaluates the formula twice — once for the current window period and once
   * for the equivalent previous period — to support trend calculations.
   * Implementations must return { currentValue: 0, previousValue: 0 } on
   * empty results.
   */
  growth(seed: Seed, formula: AggregateFormula, window: TimeWindow): Promise<GrowthResult>

  /**
   * Returns entries sorted by scoreColumn, excluding nulls. label resolves
   * from seed.displayNameAlias; falls back to id when not set.
   */
  leaderboard(seed: Seed, options: LeaderboardOptions): Promise<LeaderboardEntry[]>

  /**
   * Paginated read of content entries. Filters and search are applied
   * server-side. The caller is responsible for deserialising branch values
   * from the raw Record.
   */
  list(seed: Seed, options: WidgetListOptions): Promise<WidgetListResult>

  /**
   * Groups entries by a date bucket derived from groupColumn and aggregates
   * the formula. Days with no entries are omitted (no zero-fill). Points are
   * ordered ascending by label.
   */
  timeseries(
    seed: Seed,
    formula: AggregateFormula,
    window: TimeWindow,
    groupColumn: string
  ): Promise<TimeseriesPoint[]>
}
