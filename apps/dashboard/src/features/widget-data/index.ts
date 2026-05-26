// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// Types
export type {
  AggregateFormula,
  TimeWindow,
  SortDirection,
  ResolvedEntry,
  GrowthResult,
  LeaderboardEntry,
  ProgressResult,
  AggregateResult,
  TimeseriesPoint,
  TimeseriesResult,
  ListParams,
  ListResult,
} from './types'

// Hooks
export { useWidgetAggregate } from './hooks/use-widget-aggregate'
export { useWidgetGrowth } from './hooks/use-widget-growth'
export { useWidgetLeaderboard } from './hooks/use-widget-leaderboard'
export { useWidgetList } from './hooks/use-widget-list'
export { useWidgetTimeseries } from './hooks/use-widget-timeseries'

// Formula utility
export { evaluateFormula } from './formula'
