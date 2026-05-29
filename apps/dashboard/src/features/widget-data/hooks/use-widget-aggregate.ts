// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useQuery } from '@tanstack/react-query'
import type { AggregateFormula, TimeWindow, AggregateResult } from '../types'
import { aggregateFetch } from '../widget.api'
import { WIDGET_QUERY_KEYS } from '../query-keys'

export function useWidgetAggregate(
  seed: string,
  formula: AggregateFormula,
  window: TimeWindow = 'all',
): {
  data: AggregateResult | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
} {
  return useQuery({
    queryKey: WIDGET_QUERY_KEYS.aggregate(seed, formula, window),
    queryFn: () => aggregateFetch(seed, formula, window),
    staleTime: 5 * 60 * 1000,
  })
}
