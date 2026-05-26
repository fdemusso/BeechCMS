// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * Metric tracked by the analytics table. Today only request counts and
 * unique-visitor counts are recorded; new metric names should be appended
 * to this union and to the implementation's switch statement.
 */
export type AnalyticsMetric = 'requests' | 'visitors'

/**
 * Read/write contract for the analytics counters that power the dashboard
 * widgets (per-day request totals, sparklines, system health proxy).
 *
 * Implementations must use idempotent upserts so the recording middleware
 * can be invoked once per request without producing duplicates when the
 * same day/seed/metric tuple is touched repeatedly.
 */
export interface IAnalyticsRepository {
  /**
   * Upserts a request counter for the given seed at the current day bucket.
   * The day bucket (Unix timestamp truncated to midnight UTC) is computed
   * internally from the implementation's clock so callers never need to
   * pass a timestamp. Implementations must use INSERT ... ON CONFLICT DO
   * UPDATE to remain idempotent under concurrent calls within the same day.
   */
  recordRequest(seedSlug: string): Promise<void>

  /**
   * Returns the total count for the given metric since sinceTimestamp.
   * Used by the stats handler for total request counts and visitor counts.
   * The aggregation sums the stored counter values, not row counts.
   */
  sumByMetric(
    metric: AnalyticsMetric,
    seedSlug: string,
    sinceTimestamp: number,
  ): Promise<number>

  /**
   * Returns a map of date strings (YYYY-MM-DD) to request counts since
   * sinceTimestamp, suitable for chart rendering without further
   * transformation by the caller.
   */
  groupByMetric(
    seedSlug: string,
    sinceTimestamp: number,
  ): Promise<Record<string, number>>
}
