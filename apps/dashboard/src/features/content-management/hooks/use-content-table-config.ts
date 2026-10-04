// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import type {
  ColumnSizingState,
  GroupingState,
} from "@tanstack/react-table"
import type { Seed } from "@beechcms/core"
import {
  generateColumns,
  computeMaxLengths,
  defaultHiddenColumns,
  type ContentEntry,
} from "@/lib/dynamic-columns"
import type { ViewLayout } from "@/features/shared"

export interface UseContentTableConfigOptions {
  seed: Seed | null
  data: ContentEntry[]
  pageSize: number
  layout: Pick<ViewLayout, "groupBy" | "setGroupBy" | "dateGroupPrecision">
  selectedIds: string[]
  handleEdit: (id: string) => void
  handleDelete: (id: string) => void
  handleBulkDelete: (ids: string[]) => void
  handleBulkEdit: (ids: string[]) => void
  t: (key: string, options?: any) => string
}

export function useContentTableConfig({
  seed,
  data,
  pageSize,
  layout,
  selectedIds,
  handleEdit,
  handleDelete,
  handleBulkDelete,
  handleBulkEdit,
  t,
}: UseContentTableConfigOptions) {
  const { groupBy, setGroupBy, dateGroupPrecision } = layout

  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({})

  // Lunghezza max per colonna (dalla prima pagina) per troncamento consistente
  const maxLengths = React.useMemo(() => {
    if (!seed || data.length === 0) return undefined
    return computeMaxLengths(data, seed, pageSize)
  }, [seed, data, pageSize])

  const columns = React.useMemo(() => {
    if (!seed) return []
    return generateColumns(
      seed,
      handleEdit,
      handleDelete,
      maxLengths,
      selectedIds,
      handleBulkDelete,
      dateGroupPrecision,
      t,
      handleBulkEdit,
    )
  }, [seed, handleEdit, handleDelete, maxLengths, selectedIds, handleBulkDelete, dateGroupPrecision, t, handleBulkEdit])

  const grouping = React.useMemo<GroupingState>(
    () => (groupBy ? [groupBy] : []),
    [groupBy]
  )

  const isGroupingByDate = React.useMemo(() => {
    if (!seed || !groupBy) return false
    const branch = seed.branches.find((b: Seed["branches"][number]) => b.alias === groupBy)
    return branch?.type === "date"
  }, [groupBy, seed])

  const tableKey = React.useMemo(() => {
    // TanStack might not immediately recalculate groups when only getGroupingValue changes.
    // Force a table remount when active grouping is on date and precision changes.
    if (isGroupingByDate && groupBy) {
      let datePrecisionSegment: string
      if (dateGroupPrecision.day) {
        datePrecisionSegment = "day"
      } else if (dateGroupPrecision.year && !dateGroupPrecision.month) {
        datePrecisionSegment = "year"
      } else {
        datePrecisionSegment = "monthYear"
      }
      return `group:${groupBy}:date:${datePrecisionSegment}`
    }
    return `group:${groupBy ?? "none"}`
  }, [dateGroupPrecision.day, dateGroupPrecision.month, dateGroupPrecision.year, groupBy, isGroupingByDate])

  const handleGroupingChange = React.useCallback(
    (g: GroupingState | ((old: GroupingState) => GroupingState)) => {
      setGroupBy((prev) => {
        const next = typeof g === "function" ? g(prev ? [prev] : []) : g
        return next[0] ?? null
      })
    },
    []
  )

  const initialHiddenColumns = React.useMemo(
    () => (seed ? defaultHiddenColumns(seed) : ["id", "slug", "created_at"]),
    [seed]
  )

  return {
    columns,
    tableKey,
    initialHiddenColumns,
    columnSizing,
    setColumnSizing,
    grouping,
    handleGroupingChange,
  }
}
