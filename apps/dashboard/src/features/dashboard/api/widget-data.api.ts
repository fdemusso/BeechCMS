// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { api } from "@/lib/api"
import type {
  AggregateFormula,
  TimeWindow,
  TimeseriesPoint,
  DistributionSlice,
} from "@beechcms/core"

export interface WidgetAggregateResponse {
  value: number
  window: TimeWindow
}

export interface WidgetGrowthResponse {
  current: number
  previous: number
  percentageChange: number
  trend: "up" | "down" | "flat"
}

export interface WidgetTimeseriesResponse {
  points: TimeseriesPoint[]
}

export interface WidgetDistributionResponse {
  slices: DistributionSlice[]
}

export interface WidgetListEntry {
  id: string
  slug: string
  status: string
  createdAt: number
  updatedAt: number
  [key: string]: unknown
}

export interface WidgetListResponse {
  entries: WidgetListEntry[]
  total: number
}

export interface WidgetListParams {
  limit: number
  offset: number
  search?: string
  orderByColumn?: string
  orderDirection?: "ASC" | "DESC"
}

export async function fetchWidgetAggregate(
  seedSlug: string,
  formula: AggregateFormula,
  window: TimeWindow,
): Promise<WidgetAggregateResponse> {
  const res = await api.get<WidgetAggregateResponse>(`/widget/aggregate/${seedSlug}`, {
    params: { formula: JSON.stringify(formula), window },
  })
  return res.data
}

export async function fetchWidgetGrowth(
  seedSlug: string,
  formula: AggregateFormula,
  window: TimeWindow,
): Promise<WidgetGrowthResponse> {
  const res = await api.get<WidgetGrowthResponse>(`/widget/growth/${seedSlug}`, {
    params: { formula: JSON.stringify(formula), window },
  })
  return res.data
}

/** Translates the formula into the timeseries route's flat `formula`/`valueColumn` params. */
function timeseriesFormulaParams(formula: AggregateFormula): { formula: string; valueColumn?: string } {
  switch (formula.op) {
    case "sum":
    case "avg":
      return { formula: formula.op, valueColumn: formula.column }
    default:
      return { formula: "count" }
  }
}

export async function fetchWidgetTimeseries(
  seedSlug: string,
  formula: AggregateFormula,
  window: TimeWindow,
  groupColumn: string,
): Promise<WidgetTimeseriesResponse> {
  const res = await api.get<WidgetTimeseriesResponse>(`/widget/timeseries/${seedSlug}`, {
    params: { ...timeseriesFormulaParams(formula), groupColumn, window },
  })
  return res.data
}

export async function fetchWidgetDistribution(
  seedSlug: string,
  column: string,
  window: TimeWindow,
  limit: number,
): Promise<WidgetDistributionResponse> {
  const res = await api.get<WidgetDistributionResponse>(`/widget/distribution/${seedSlug}`, {
    params: { column, window, limit },
  })
  return res.data
}

export async function fetchWidgetList(
  seedSlug: string,
  params: WidgetListParams,
): Promise<WidgetListResponse> {
  const res = await api.get<WidgetListResponse>(`/widget/list/${seedSlug}`, {
    params: {
      limit: params.limit,
      offset: params.offset,
      search: params.search,
      orderBy: params.orderByColumn,
      orderDir: params.orderDirection?.toLowerCase(),
    },
  })
  return res.data
}
