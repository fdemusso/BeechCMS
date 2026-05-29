// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useQuery } from '@tanstack/react-query'
import type { TimeWindow, TimeseriesResult } from '../types'
import { timeseriesFetch } from '../widget.api'
import { WIDGET_QUERY_KEYS } from '../query-keys'

export function useWidgetTimeseries(
  seed: string,
  valueColumn: string,
  groupColumn: string,
  window: TimeWindow,
): {
  data: TimeseriesResult | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
} {
  return useQuery({
    queryKey: WIDGET_QUERY_KEYS.timeseries(seed, valueColumn, groupColumn, window),
    queryFn: () => timeseriesFetch(seed, valueColumn, groupColumn, 'sum', window),
    staleTime: 5 * 60 * 1000,
  })
}
