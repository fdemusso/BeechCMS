// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useQuery } from '@tanstack/react-query'
import type { AggregateFormula, TimeWindow, GrowthResult } from '../types'
import { growthFetch } from '../widget.api'
import { WIDGET_QUERY_KEYS } from '../query-keys'

export function useWidgetGrowth(
  seed: string,
  formula: AggregateFormula,
  window: TimeWindow,
  windowColumn?: string,
): {
  data: GrowthResult | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
} {
  return useQuery({
    queryKey: WIDGET_QUERY_KEYS.growth(seed, formula, window),
    queryFn: () => growthFetch(seed, formula, window, windowColumn),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })
}
