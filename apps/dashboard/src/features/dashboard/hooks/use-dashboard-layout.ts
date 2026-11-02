// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024â€“2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  filterDashboardLayoutByWidgetRequirements,
  generateDefaultDashboardLayout,
  type DashboardLayout,
  type Seed,
} from "@beechcms/core"
import { useSchema } from "@/features/shared"
import { DASHBOARD_QUERY_KEYS } from "@/features/shared"
import { usePermissions } from "@/features/shared/hooks/use-permissions"
import { dashboardApi } from "../api/dashboard.api"
import { widgetRequirementOf } from "../registry/widget-registry"

const EMPTY_SEEDS: Seed[] = []

export interface UseDashboardLayoutResult {
  /** Stored layout, or the generated default when none is stored yet, minus the widgets the caller cannot use. */
  layout: DashboardLayout
  /** False when `layout` is the generated fallback, not a persisted one. */
  isStored: boolean
  /** True until both the layout query and the caller's permissions have resolved. */
  isLoading: boolean
}

export function useDashboardLayout(): UseDashboardLayoutResult {
  const layoutQuery = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.layout(),
    queryFn: dashboardApi.getDashboardLayout,
    // Per-caller authorization projection served no-store; the global 5-minute cache would outlive an assignment change.
    staleTime: 0,
  })
  const { data: seeds = EMPTY_SEEDS } = useSchema()
  const { effective, isLoading: permissionsLoading } = usePermissions()

  // crypto.randomUUID() in the generator means an unmemoized call would
  // change every widget/section/page id on each render.
  const generatedDefault = useMemo(() => generateDefaultDashboardLayout(seeds, effective), [seeds, effective])

  const stored = layoutQuery.data?.layout ?? null

  // Cosmetic projection: data routes remain the enforcement point.
  const layout = useMemo(
    () => filterDashboardLayoutByWidgetRequirements(stored ?? generatedDefault, effective, widgetRequirementOf),
    [stored, generatedDefault, effective],
  )

  return {
    layout,
    isStored: stored !== null,
    isLoading: layoutQuery.isLoading || permissionsLoading,
  }
}
