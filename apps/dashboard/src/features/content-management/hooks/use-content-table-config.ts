// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import type {
  ColumnSizingState,
  GroupingState,
  VisibilityState,
} from "@tanstack/react-table"
import type { Seed } from "@beechcms/core"
import type { UserViewInstance } from "@/features/content-toolbar"
import {
  generateColumns,
  computeMaxLengths,
  type ContentEntry,
  type DateGroupPrecision,
  DEFAULT_DATE_GROUP_PRECISION,
} from "@/lib/dynamic-columns"
import { type TableDensity, DEFAULT_DENSITY } from "@/lib/density"
import {
  type ConditionalFormatRule,
  getConditionalFormatCellClass,
  getConditionalFormatRowClass,
} from "@/lib/conditional-format"
import {
  matchesFilterGroupStrict,
  type FilterGroupType,
} from "@/lib/filter-dsl"
import { getEntryValueForColumn } from "./use-content-list-query"

export interface UseContentTableConfigOptions {
  seed: Seed | null
  data: ContentEntry[]
  pageSize: number
  activeView?: UserViewInstance
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
  activeView,
  selectedIds,
  handleEdit,
  handleDelete,
  handleBulkDelete,
  handleBulkEdit,
  t,
}: UseContentTableConfigOptions) {
  // Table grouping: single column or null
  const [groupBy, setGroupBy] = React.useState<string | null>(null)

  // Precision for date-type branches (year/month/day)
  const [dateGroupPrecision, setDateGroupPrecision] = React.useState<DateGroupPrecision>(
    DEFAULT_DATE_GROUP_PRECISION
  )

  // When grouping changes to a non-date column, reset precision
  React.useEffect(() => {
    if (!groupBy || !seed) return
    const branch = seed.branches.find((b: Seed["branches"][number]) => b.alias === groupBy)
    if (branch?.type !== "date") {
      setDateGroupPrecision(DEFAULT_DATE_GROUP_PRECISION)
    }
  }, [groupBy, seed])

  const tagsParseCacheRef = React.useRef<Map<string, unknown>>(new Map())

  React.useEffect(() => {
    tagsParseCacheRef.current.clear()
  }, [seed?.slug, data])

  const getCachedValueForGroupType = React.useCallback(
    (entry: ContentEntry, columnId: string, groupType: FilterGroupType): unknown => {
      const value = getEntryValueForColumn(entry, columnId)
      if (groupType !== "tags") return value

      const key = `${entry.id}::${columnId}`
      if (tagsParseCacheRef.current.has(key)) {
        return tagsParseCacheRef.current.get(key)
      }

      let parsed: unknown = value
      if (typeof value === "string") {
        try {
          parsed = JSON.parse(value) as unknown
        } catch {
          parsed = null
        }
      }
      tagsParseCacheRef.current.set(key, parsed)
      return parsed
    },
    []
  )

  const conditionalRules = React.useMemo(() => {
    const rules = activeView?.conditionalFormats ?? []
    return rules
      .filter((r) => Boolean(r?.enabled))
      .slice()
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
  }, [activeView?.conditionalFormats])

  const rowRules = React.useMemo(() => {
    return conditionalRules.filter((r) => {
      const legacyTarget = (r as { target?: string }).target
      return legacyTarget === "row" || legacyTarget === "cell+row"
    })
  }, [conditionalRules])

  const cellRulesByColumnId = React.useMemo(() => {
    const map = new Map<string, ConditionalFormatRule[]>()
    for (const r of conditionalRules) {
      const legacyTarget = (r as { target?: string }).target
      if (legacyTarget === "row") continue
      const arr = map.get(r.columnId) ?? []
      arr.push(r)
      map.set(r.columnId, arr)
    }
    return map
  }, [conditionalRules])

  const getRowStyles = React.useCallback(
    (entry: ContentEntry) => {
      let rowClassName: string | undefined
      const cellClassNameByColumnId: Record<string, string | undefined> = {}

      // Row: first matching rule
      for (const rule of rowRules) {
        const value = getCachedValueForGroupType(entry, rule.columnId, rule.group.type)
        if (matchesFilterGroupStrict(value, rule.group)) {
          rowClassName = getConditionalFormatRowClass(
            rule.tone,
            rule.textStyles ?? []
          )
          break
        }
      }

      // Cell: evaluated only for columns with rules
      for (const [columnId, rules] of cellRulesByColumnId.entries()) {
        for (const rule of rules) {
          const value = getCachedValueForGroupType(entry, rule.columnId, rule.group.type)
          if (matchesFilterGroupStrict(value, rule.group)) {
            cellClassNameByColumnId[columnId] = getConditionalFormatCellClass(
              rule.tone,
              rule.textStyles ?? []
            )
            break
          }
        }
      }

      return { rowClassName, cellClassNameByColumnId }
    },
    [cellRulesByColumnId, getCachedValueForGroupType, rowRules]
  )

  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(
    () => {
      const visibility: VisibilityState = {}
      visibility["id"] = false
      visibility["slug"] = false
      visibility["created_at"] = false
      if (!seed) return visibility
      const metaAliases = seed.branches
        .filter(
          (b: Seed["branches"][number]) =>
            b.type === "json" &&
            (b.alias.toLowerCase().includes("metadata") ||
              b.alias.toLowerCase().includes("metadati"))
        )
        .map((b: Seed["branches"][number]) => b.alias)
      for (const alias of metaAliases) {
        visibility[alias] = false
      }
      return visibility
    }
  )

  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({})
  const [density, setDensity] = React.useState<TableDensity>(DEFAULT_DENSITY)

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

  // Hidden columns by default: system columns (id, slug) + json metadata/metadati
  const initialHiddenColumns = React.useMemo(() => {
    const hidden: string[] = ["id", "slug", "created_at"]
    if (!seed) return hidden
    const metaAliases = seed.branches
      .filter(
        (b: Seed["branches"][number]) =>
          b.type === "json" &&
          (b.alias.toLowerCase().includes("metadata") ||
            b.alias.toLowerCase().includes("metadati"))
      )
      .map((b: Seed["branches"][number]) => b.alias)
    return [...hidden, ...metaAliases]
  }, [seed])

  return {
    columns,
    tableKey,
    initialHiddenColumns,
    columnVisibility,
    setColumnVisibility,
    columnSizing,
    setColumnSizing,
    density,
    setDensity,
    groupBy,
    setGroupBy,
    grouping,
    handleGroupingChange,
    dateGroupPrecision,
    setDateGroupPrecision,
    getRowStyles,
  }
}
