// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import type { Seed } from "@beechcms/core"
import type { ViewLayout } from "@/features/shared"
import { defaultHiddenColumns, DEFAULT_DATE_GROUP_PRECISION } from "@/lib/dynamic-columns"
import { DEFAULT_DENSITY } from "@/lib/density"
import type { ViewToolbarState } from "../lib/view-config-mapping"

/** Hydrates one view instance's layout state from its persisted ViewToolbarState, filling in the table's defaults. */
export function useViewLayoutState(initial: ViewToolbarState, seed: Seed): ViewLayout {
  const [groupBy, setGroupBy] = React.useState(initial.groupBy)
  const [dateGroupPrecision, setDateGroupPrecision] = React.useState(initial.dateGroupPrecision)
  const [columnVisibility, setColumnVisibility] = React.useState(
    () => initial.columnVisibility ?? Object.fromEntries(defaultHiddenColumns(seed).map((alias) => [alias, false]))
  )
  const [density, setDensity] = React.useState(initial.density ?? DEFAULT_DENSITY)
  const [conditionalFormats, setConditionalFormats] = React.useState(initial.conditionalFormats)
  const [kanban, setKanban] = React.useState(initial.kanban ?? { axisBranchId: null, sort: null })
  const [card, setCard] = React.useState(initial.card)
  const [folders, setFolders] = React.useState(initial.folders)

  // Resets precision when grouping moves off a date branch. Also resets on the created_at/updated_at
  // system date columns (they have no branch) — a known quirk, out of scope for this move (SECTION 7).
  React.useEffect(() => {
    if (!groupBy) return
    const branch = seed.branches.find((b) => b.alias === groupBy)
    if (branch?.type !== "date") {
      setDateGroupPrecision(DEFAULT_DATE_GROUP_PRECISION)
    }
  }, [groupBy, seed])

  return React.useMemo<ViewLayout>(
    () => ({
      groupBy,
      setGroupBy,
      dateGroupPrecision,
      setDateGroupPrecision,
      columnVisibility,
      setColumnVisibility,
      density,
      setDensity,
      conditionalFormats,
      setConditionalFormats,
      kanban,
      setKanban,
      card,
      setCard,
      folders,
      setFolders,
    }),
    [groupBy, dateGroupPrecision, columnVisibility, density, conditionalFormats, kanban, card, folders]
  )
}
