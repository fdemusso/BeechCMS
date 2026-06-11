// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useQuery } from "@tanstack/react-query"
import type { AggregateFormula, TimeWindow } from "@beechcms/core"
import {
  fetchWidgetAggregate,
  fetchWidgetGrowth,
  fetchWidgetTimeseries,
  fetchWidgetDistribution,
  fetchWidgetList,
  type WidgetListParams,
} from "../api/widget-data.api"

const STALE_TIME = 60 * 1000

export function useWidgetAggregate(seedSlug: string, formula: AggregateFormula, window: TimeWindow) {
  return useQuery({
    queryKey: ["widget", "aggregate", seedSlug, formula, window],
    queryFn: () => fetchWidgetAggregate(seedSlug, formula, window),
    enabled: !!seedSlug,
    staleTime: STALE_TIME,
  })
}

export function useWidgetGrowth(seedSlug: string, formula: AggregateFormula, window: TimeWindow) {
  return useQuery({
    queryKey: ["widget", "growth", seedSlug, formula, window],
    queryFn: () => fetchWidgetGrowth(seedSlug, formula, window),
    enabled: !!seedSlug,
    staleTime: STALE_TIME,
  })
}

export function useWidgetTimeseries(
  seedSlug: string,
  formula: AggregateFormula,
  window: TimeWindow,
  groupColumn: string,
) {
  return useQuery({
    queryKey: ["widget", "timeseries", seedSlug, formula, window, groupColumn],
    queryFn: () => fetchWidgetTimeseries(seedSlug, formula, window, groupColumn),
    enabled: !!seedSlug,
    staleTime: STALE_TIME,
  })
}

export function useWidgetDistribution(seedSlug: string, column: string, window: TimeWindow, limit: number) {
  return useQuery({
    queryKey: ["widget", "distribution", seedSlug, column, window, limit],
    queryFn: () => fetchWidgetDistribution(seedSlug, column, window, limit),
    enabled: !!seedSlug && !!column,
    staleTime: STALE_TIME,
  })
}

export function useWidgetList(seedSlug: string, params: WidgetListParams) {
  return useQuery({
    queryKey: ["widget", "list", seedSlug, params],
    queryFn: () => fetchWidgetList(seedSlug, params),
    enabled: !!seedSlug,
    staleTime: STALE_TIME,
  })
}
