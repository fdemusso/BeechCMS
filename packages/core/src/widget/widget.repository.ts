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

/**
 * Explicit time range applied as a WHERE filter, anchored on `created_at`.
 *
 * Both bounds are unix seconds (inclusive). Used when the dashboard sets a
 * custom date reference instead of one of the relative {@link TimeWindow} presets.
 */
export interface DateRange {
  from: number
  to: number
}

/**
 * Time filter accepted by widget queries: either a relative preset
 * ({@link TimeWindow}) or an explicit {@link DateRange}.
 */
export type WidgetWindow = TimeWindow | DateRange

/** Narrows a {@link WidgetWindow} to a {@link DateRange}. */
export function isDateRange(window: WidgetWindow): window is DateRange {
  return typeof window === 'object' && window !== null
}

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

export interface DistributionSlice {
  label: string
  value: number
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
  aggregate(seed: Seed, formula: AggregateFormula, window: WidgetWindow): Promise<number>

  /**
   * Evaluates the formula twice — once for the current window period and once
   * for the equivalent previous period — to support trend calculations.
   * Implementations must return { currentValue: 0, previousValue: 0 } on
   * empty results.
   */
  growth(seed: Seed, formula: AggregateFormula, window: WidgetWindow): Promise<GrowthResult>

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
    window: WidgetWindow,
    groupColumn: string
  ): Promise<TimeseriesPoint[]>

  /**
   * Counts entries grouped by the values of `column` within the window,
   * descending by count, capped at `limit` slices. Implementations must
   * validate `column` against the seed (UNSAFE_COLUMN on failure) and must
   * return [] on empty results. Values beyond `limit` are NOT merged into
   * an 'other' bucket — the client decides how to present truncation.
   */
  distribution(seed: Seed, column: string, window: WidgetWindow, limit: number): Promise<DistributionSlice[]>
}
