// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { useQuery } from '@tanstack/react-query'
import { isDateRange, type AggregateFormula, type WidgetWindow, type TimeseriesPoint, type DistributionSlice } from '@beechcms/core'
import { useWidgetSdkClient, type WidgetSdkClient } from '../provider.js'

const STALE_TIME = 60 * 1000

export interface WidgetAggregateResponse {
  value: number
  window: WidgetWindow
}

/** Serialises a {@link WidgetWindow} into the route's `window` or `from`/`to` query params. */
function windowParams(window: WidgetWindow): Record<string, string | number> {
  return isDateRange(window) ? { from: window.from, to: window.to } : { window }
}

export interface WidgetGrowthResponse {
  current: number
  previous: number
  percentageChange: number
  trend: 'up' | 'down' | 'flat'
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
  orderDirection?: 'ASC' | 'DESC'
}

/** Translates the formula into the timeseries route's flat `formula`/`valueColumn` params. */
function timeseriesFormulaParams(formula: AggregateFormula): { formula: string; valueColumn?: string } {
  switch (formula.op) {
    case 'sum':
    case 'avg':
      return { formula: formula.op, valueColumn: formula.column }
    default:
      return { formula: 'count' }
  }
}

async function fetchWidgetAggregate(
  client: WidgetSdkClient,
  seedSlug: string,
  formula: AggregateFormula,
  window: WidgetWindow,
): Promise<WidgetAggregateResponse> {
  const res = await client.get<WidgetAggregateResponse>(`/widget/aggregate/${seedSlug}`, {
    params: { formula: JSON.stringify(formula), ...windowParams(window) },
  })
  return res.data
}

async function fetchWidgetGrowth(
  client: WidgetSdkClient,
  seedSlug: string,
  formula: AggregateFormula,
  window: WidgetWindow,
): Promise<WidgetGrowthResponse> {
  const res = await client.get<WidgetGrowthResponse>(`/widget/growth/${seedSlug}`, {
    params: { formula: JSON.stringify(formula), ...windowParams(window) },
  })
  return res.data
}

async function fetchWidgetTimeseries(
  client: WidgetSdkClient,
  seedSlug: string,
  formula: AggregateFormula,
  window: WidgetWindow,
  groupColumn: string,
): Promise<WidgetTimeseriesResponse> {
  const res = await client.get<WidgetTimeseriesResponse>(`/widget/timeseries/${seedSlug}`, {
    params: { ...timeseriesFormulaParams(formula), groupColumn, ...windowParams(window) },
  })
  return res.data
}

async function fetchWidgetDistribution(
  client: WidgetSdkClient,
  seedSlug: string,
  column: string,
  window: WidgetWindow,
  limit: number,
): Promise<WidgetDistributionResponse> {
  const res = await client.get<WidgetDistributionResponse>(`/widget/distribution/${seedSlug}`, {
    params: { column, limit, ...windowParams(window) },
  })
  return res.data
}

async function fetchWidgetList(
  client: WidgetSdkClient,
  seedSlug: string,
  params: WidgetListParams,
): Promise<WidgetListResponse> {
  const res = await client.get<WidgetListResponse>(`/widget/list/${seedSlug}`, {
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

export function useWidgetAggregate(seedSlug: string, formula: AggregateFormula, window: WidgetWindow) {
  const client = useWidgetSdkClient()
  return useQuery({
    queryKey: ['widget', 'aggregate', seedSlug, formula, window],
    queryFn: () => fetchWidgetAggregate(client, seedSlug, formula, window),
    enabled: !!seedSlug,
    staleTime: STALE_TIME,
  })
}

export function useWidgetGrowth(seedSlug: string, formula: AggregateFormula, window: WidgetWindow) {
  const client = useWidgetSdkClient()
  return useQuery({
    queryKey: ['widget', 'growth', seedSlug, formula, window],
    queryFn: () => fetchWidgetGrowth(client, seedSlug, formula, window),
    enabled: !!seedSlug,
    staleTime: STALE_TIME,
  })
}

export function useWidgetTimeseries(
  seedSlug: string,
  formula: AggregateFormula,
  window: WidgetWindow,
  groupColumn: string,
) {
  const client = useWidgetSdkClient()
  return useQuery({
    queryKey: ['widget', 'timeseries', seedSlug, formula, window, groupColumn],
    queryFn: () => fetchWidgetTimeseries(client, seedSlug, formula, window, groupColumn),
    enabled: !!seedSlug,
    staleTime: STALE_TIME,
  })
}

export function useWidgetDistribution(seedSlug: string, column: string, window: WidgetWindow, limit: number) {
  const client = useWidgetSdkClient()
  return useQuery({
    queryKey: ['widget', 'distribution', seedSlug, column, window, limit],
    queryFn: () => fetchWidgetDistribution(client, seedSlug, column, window, limit),
    enabled: !!seedSlug && !!column,
    staleTime: STALE_TIME,
  })
}

export function useWidgetList(seedSlug: string, params: WidgetListParams) {
  const client = useWidgetSdkClient()
  return useQuery({
    queryKey: ['widget', 'list', seedSlug, params],
    queryFn: () => fetchWidgetList(client, seedSlug, params),
    enabled: !!seedSlug,
    staleTime: STALE_TIME,
  })
}
