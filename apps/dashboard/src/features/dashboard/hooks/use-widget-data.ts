// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// Moved to @beechcms/widget-sdk (Sprint 07) — single implementation shared
// with custom widgets, same `['widget', ...]` query-key scheme.
export {
  useWidgetAggregate,
  useWidgetGrowth,
  useWidgetTimeseries,
  useWidgetDistribution,
  useWidgetList,
} from "@beechcms/widget-sdk"
export type {
  WidgetAggregateResponse,
  WidgetGrowthResponse,
  WidgetTimeseriesResponse,
  WidgetDistributionResponse,
  WidgetListEntry,
  WidgetListResponse,
  WidgetListParams,
} from "@beechcms/widget-sdk"
