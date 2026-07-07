// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { IAnalyticsRepository, AnalyticsMetric, IClock } from '@beechcms/core'

const SECONDS_PER_DAY = 86400

/**
 * D1-backed implementation of {@link IAnalyticsRepository}.
 *
 * The underlying schema is long-format:
 * `analytics(day_ts, metric, seed, value)` with UNIQUE(day_ts, metric, seed).
 * Each row stores the counter for one (day, metric, seed) tuple. The
 * IAnalyticsRepository contract is metric-aware (the metric is selected via
 * a switch on the validated enum), and never interpolates user values into
 * SQL — the actual metric name is bound through a parameter.
 */
export class D1AnalyticsRepository implements IAnalyticsRepository {
  constructor(
    private readonly database: D1Database,
    private readonly clock: IClock,
  ) {}

  async recordRequest(seedSlug: string): Promise<void> {
    const dayTimestamp = Math.floor(this.clock.nowSeconds() / SECONDS_PER_DAY) * SECONDS_PER_DAY
    await this.database
      .prepare(
        `INSERT INTO analytics (day_ts, metric, seed, value)
              VALUES (?, 'requests', ?, 1)
         ON CONFLICT(day_ts, metric, seed) DO UPDATE SET value = value + 1`,
      )
      .bind(dayTimestamp, seedSlug)
      .run()
  }

  async sumByMetric(
    metric: AnalyticsMetric,
    seedSlug: string,
    sinceTimestamp: number,
  ): Promise<number> {
    const metricName = this.resolveMetricName(metric)
    const row = await this.database
      .prepare(
        `SELECT SUM(value) as total
           FROM analytics
          WHERE metric = ? AND seed = ? AND day_ts >= ?`,
      )
      .bind(metricName, seedSlug, sinceTimestamp)
      .first<{ total: number | null }>()
    return row?.total ?? 0
  }

  async groupByMetric(
    seedSlug: string,
    sinceTimestamp: number,
  ): Promise<Record<string, number>> {
    const result = await this.database
      .prepare(
        `SELECT strftime('%Y-%m-%d', day_ts, 'unixepoch') as date_label,
                SUM(value) as daily_count
           FROM analytics
          WHERE metric = 'requests' AND seed = ? AND day_ts >= ?
          GROUP BY date_label
          ORDER BY date_label ASC`,
      )
      .bind(seedSlug, sinceTimestamp)
      .all<{ date_label: string | null; daily_count: number | null }>()

    const grouped: Record<string, number> = {}
    for (const row of result.results ?? []) {
      if (row.date_label === null) continue
      grouped[row.date_label] = row.daily_count ?? 0
    }
    return grouped
  }

  private resolveMetricName(metric: AnalyticsMetric): string {
    switch (metric) {
      case 'requests': return 'requests'
      case 'visitors': return 'visitors'
    }
  }
}
