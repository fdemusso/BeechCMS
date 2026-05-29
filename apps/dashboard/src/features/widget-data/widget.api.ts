// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import axios from 'axios'
import { api } from '@/lib/api'
import type {
  AggregateFormula,
  TimeWindow,
  ListParams,
  AggregateResult,
  GrowthResult,
  LeaderboardEntry,
  ListResult,
  TimeseriesResult,
} from './types'

/** Extract RFC 7807 detail from an Axios error, falling back to the error message */
function extractDetail(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as Record<string, unknown> | undefined
    if (data && typeof data.detail === 'string') return data.detail
    if (data && typeof data.title === 'string') return data.title
    return err.message
  }
  if (err instanceof Error) return err.message
  return 'Unknown error'
}

export async function aggregateFetch(
  seed: string,
  formula: AggregateFormula,
  window?: TimeWindow,
): Promise<AggregateResult> {
  try {
    const { data } = await api.get<AggregateResult>(`/widget/aggregate/${seed}`, {
      params: {
        formula: JSON.stringify(formula),
        ...(window ? { window } : {}),
      },
    })
    return data
  } catch (err) {
    throw new Error(`aggregateFetch failed: ${extractDetail(err)}`)
  }
}

export async function growthFetch(
  seed: string,
  formula: AggregateFormula,
  window: TimeWindow,
  windowColumn?: string,
): Promise<GrowthResult> {
  try {
    const { data } = await api.get<GrowthResult>(`/widget/growth/${seed}`, {
      params: {
        formula: JSON.stringify(formula),
        window,
        ...(windowColumn ? { windowColumn } : {}),
      },
    })
    return data
  } catch (err) {
    throw new Error(`growthFetch failed: ${extractDetail(err)}`)
  }
}

export async function leaderboardFetch(
  seed: string,
  scoreColumn: string,
  options?: { limit?: number; orderBy?: 'asc' | 'desc'; labelAlias?: string },
): Promise<LeaderboardEntry[]> {
  try {
    const { data } = await api.get<LeaderboardEntry[]>(`/widget/leaderboard/${seed}`, {
      params: {
        scoreColumn,
        ...(options?.limit !== undefined ? { limit: options.limit } : {}),
        ...(options?.orderBy ? { orderDir: options.orderBy } : {}),
        ...(options?.labelAlias ? { labelAlias: options.labelAlias } : {}),
      },
    })
    return data
  } catch (err) {
    throw new Error(`leaderboardFetch failed: ${extractDetail(err)}`)
  }
}

export async function listFetch(
  seed: string,
  params: ListParams,
): Promise<ListResult> {
  try {
    const { data } = await api.get<ListResult>(`/widget/list/${seed}`, {
      params: {
        ...(params.columns ? { columns: JSON.stringify(params.columns) } : {}),
        ...(params.search ? { search: params.search } : {}),
        ...(params.filters ? { filters: JSON.stringify(params.filters) } : {}),
        ...(params.orderBy ? { orderBy: params.orderBy } : {}),
        ...(params.orderDir ? { orderDir: params.orderDir } : {}),
        ...(params.limit !== undefined ? { limit: params.limit } : {}),
        ...(params.offset !== undefined ? { offset: params.offset } : {}),
      },
    })
    return data
  } catch (err) {
    throw new Error(`listFetch failed: ${extractDetail(err)}`)
  }
}

export async function timeseriesFetch(
  seed: string,
  valueColumn: string,
  groupColumn: string,
  formula: 'sum' | 'avg' | 'count',
  window: TimeWindow,
): Promise<TimeseriesResult> {
  try {
    const { data } = await api.get<TimeseriesResult>(`/widget/timeseries/${seed}`, {
      params: { valueColumn, groupColumn, formula, window },
    })
    return data
  } catch (err) {
    throw new Error(`timeseriesFetch failed: ${extractDetail(err)}`)
  }
}
