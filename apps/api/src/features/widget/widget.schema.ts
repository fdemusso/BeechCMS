// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { z } from 'zod'

/**
 * Queries of the widget routes. They type the request for `hc` and refuse nothing: every value is
 * read (and, when unusable, defaulted or answered with the route's own 400 problem) by the handler.
 * `window` is a preset (`week | month | year | all`); `from`/`to` are unix seconds and win over it.
 */
const windowQuery = {
  window: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
}

/** `formula` is the JSON of an `AggregateFormula`. */
export const widgetAggregateQuerySchema = z.object({ formula: z.string().optional(), ...windowQuery })

export const widgetTimeseriesQuerySchema = z.object({
  /** `count`, `sum` or `avg`; the column comes in `valueColumn`. */
  formula: z.string().optional(),
  valueColumn: z.string().optional(),
  groupColumn: z.string().optional(),
  ...windowQuery,
})

export const widgetDistributionQuerySchema = z.object({
  column: z.string().optional(),
  limit: z.string().optional(),
  ...windowQuery,
})

export const widgetLeaderboardQuerySchema = z.object({
  scoreColumn: z.string().optional(),
  limit: z.string().optional(),
  orderDir: z.string().optional(),
})

/** `filters` is a JSON array of `{ column, op, value }`. */
export const widgetListQuerySchema = z.object({
  limit: z.string().optional(),
  offset: z.string().optional(),
  search: z.string().optional(),
  orderBy: z.string().optional(),
  orderDir: z.string().optional(),
  filters: z.string().optional(),
})
