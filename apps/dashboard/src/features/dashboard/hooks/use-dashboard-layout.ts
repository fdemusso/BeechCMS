// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024â€“2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { generateDefaultDashboardLayout, type DashboardLayout, type Seed } from "@beechcms/core"
import { useSchema } from "@/features/shared"
import { DASHBOARD_QUERY_KEYS } from "@/features/shared"
import { dashboardApi } from "../api/dashboard.api"

const EMPTY_SEEDS: Seed[] = []

export interface UseDashboardLayoutResult {
  /** Stored layout, or the generated default when none is stored yet. */
  layout: DashboardLayout
  /** False when `layout` is the generated fallback, not a persisted one. */
  isStored: boolean
  /** Winning scope from the server's resolution chain (`role:<role>` or `default`). */
  scope: string
  isLoading: boolean
}

export function useDashboardLayout(): UseDashboardLayoutResult {
  const layoutQuery = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.layout(),
    queryFn: dashboardApi.getDashboardLayout,
  })
  const { data: seeds = EMPTY_SEEDS } = useSchema()

  // crypto.randomUUID() in the generator means an unmemoized call would
  // change every widget/section/page id on each render.
  const generatedDefault = useMemo(() => generateDefaultDashboardLayout(seeds), [seeds])

  const stored = layoutQuery.data?.layout ?? null

  return {
    layout: stored ?? generatedDefault,
    isStored: stored !== null,
    scope: layoutQuery.data?.scope ?? 'default',
    isLoading: layoutQuery.isLoading,
  }
}
