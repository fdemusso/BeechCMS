// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useSearchParams } from "react-router-dom"
import type { SortingState, ColumnFiltersState } from "@tanstack/react-table"
import type { Seed } from "@beechcms/core"
import { useDebounce } from "@/hooks/use-debounce"
import {
  type ToolbarFiltersState,
  type ToolbarFilterGroup,
  type ToolbarFilterCondition,
  buildFilterableColumns,
  defaultOperatorForType,
  generateConditionId,
} from "@/features/content-toolbar"
import { extractTagNames } from "@/lib/tags-utils"
import { normalizeDateToYmd, type FilterGroupType } from "@/lib/filter-dsl"
import type { ContentEntry } from "@/lib/dynamic-columns"
import { useContentList } from "./use-content-list"
import { useContentFacets } from "./use-content-facets"
import { useAutomations } from "@/features/automations"

export function normalizeCellFilterValue(
  type: FilterGroupType,
  raw: unknown
): string | number | boolean | null {
  switch (type) {
    case "number":
      return typeof raw === "number" ? raw : (raw != null && raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : null)
    case "boolean":
      return typeof raw === "boolean" ? raw : null
    case "tags": {
      const names = extractTagNames(raw)
      return names.length > 0 ? names[0] : null
    }
    case "date":
      return normalizeDateToYmd(raw)
    case "select":
    case "text":
    case "system":
    default: {
      const s = raw == null ? "" : String(raw).trim()
      return s.length > 0 ? s : null
    }
  }
}

export function getEntryValueForColumn(entry: ContentEntry, columnId: string): unknown {
  if (columnId === "id") return entry.id
  if (columnId === "slug") return entry.slug
  if (columnId === "status") return entry.status
  return entry.data?.[columnId]
}

export function useContentListQuery(
  slug: string | undefined,
  seed: Seed | null
) {
  const [pageIndex, setPageIndex] = React.useState(0)
  const ROWS_PER_PAGE = 10
  const [pageSize, setPageSize] = React.useState<number>(ROWS_PER_PAGE)
  const [tableSearch, setTableSearch] = React.useState("")
  const debouncedSearch = useDebounce(tableSearch, 300)
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [searchParams] = useSearchParams()
  const prefilterStatus = searchParams.get("status")

  const [toolbarFilters, setToolbarFilters] = React.useState<ToolbarFiltersState>(() => {
    if (!prefilterStatus) return {} as ToolbarFiltersState
    return {
      status: {
        columnId: "status",
        label: "Status",
        type: "select",
        conditions: [{ id: "status-prefilter", op: "eq", value: prefilterStatus }],
        selectOptions: ["draft", "published"],
      },
    }
  })

  // --- DATA FETCHING (TANSTACK QUERY) ---
  const { 
    data: listData, 
    isLoading: isListLoading, 
    error: listError,
  } = useContentList(slug, {
    page: pageIndex + 1,
    limit: pageSize,
    search: debouncedSearch.trim() || undefined,
    sortBy: sorting[0]?.id,
    sortDir: sorting[0]?.desc ? "desc" : "asc",
    filters: toolbarFilters,
  })

  const { 
    data: facetsData,
  } = useContentFacets(slug)

  useAutomations(slug)

  const data = React.useMemo(() => listData?.items ?? [], [listData])
  const totalRows = listData?.total ?? 0
  const isLoading = isListLoading
  const error = listError ? (listError as Error).message : null

  // Reset pagination when filter/slug changes
  React.useEffect(() => {
    setPageIndex(0)
  }, [slug, debouncedSearch, sorting, toolbarFilters, pageSize])

  const singleSort = sorting[0]

  const availableStatusOptionsFromData = React.useMemo(() => {
    const set = new Set<string>()
    for (const row of data) {
      const status = typeof row.status === "string" ? row.status.trim() : ""
      if (status) set.add(status)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "it"))
  }, [data])

  const availableTagsByColumnIdFromData = React.useMemo(() => {
    if (!seed) return {}
    const tagBranches = seed.branches.filter(
      (b: Seed["branches"][number]) => b.type === "json" && b.alias.toLowerCase().includes("tag")
    )
    if (tagBranches.length === 0) return {}

    const result: Record<string, string[]> = {}
    for (const branch of tagBranches) {
      const set = new Set<string>(branch.options ?? [])

      for (const row of data) {
        for (const tag of extractTagNames(row.data[branch.alias])) {
          set.add(tag)
        }
      }
      result[branch.alias] = Array.from(set).sort((a, b) =>
        a.localeCompare(b, "it")
      )
    }
    return result
  }, [data, seed])

  const availableTagsByColumnId = React.useMemo(() => {
    const aliases = new Set<string>([
      ...Object.keys(availableTagsByColumnIdFromData),
      ...Object.keys(facetsData?.tagsByColumnId ?? {}),
    ])
    const result: Record<string, string[]> = {}
    for (const alias of aliases) {
      const set = new Set<string>([
        ...(availableTagsByColumnIdFromData[alias] ?? []),
        ...(facetsData?.tagsByColumnId?.[alias] ?? []),
      ])
      result[alias] = Array.from(set).sort((a, b) => a.localeCompare(b, "it"))
    }
    return result
  }, [availableTagsByColumnIdFromData, facetsData?.tagsByColumnId])

  const effectiveStatusOptions = React.useMemo(() => {
    if (facetsData?.statuses && facetsData.statuses.length > 0) return facetsData.statuses
    return availableStatusOptionsFromData
  }, [facetsData?.statuses, availableStatusOptionsFromData])

  const filterableColumns = React.useMemo(
    () => (seed ? buildFilterableColumns(seed, effectiveStatusOptions) : []),
    [seed, effectiveStatusOptions]
  )

  const applyCellFilter = React.useCallback(
    (columnId: string, entry: ContentEntry) => {
      const col = filterableColumns.find((c) => c.columnId === columnId)
      if (!col) return
      const rawValue = getEntryValueForColumn(entry, columnId)
      const value = normalizeCellFilterValue(col.type, rawValue)
      if (value === null && col.type !== "boolean") return
      const op = defaultOperatorForType(col.type)
      const nextCondition: ToolbarFilterCondition = { id: generateConditionId(), op, value }
      setToolbarFilters((prev) => {
        const existing = prev[columnId]
        if (existing?.conditions.some((c) => c.op === op && c.value === value)) return prev
        return {
          ...prev,
          [columnId]: existing
            ? { ...existing, conditions: [...existing.conditions, nextCondition] }
            : { columnId, label: col.label, type: col.type, selectOptions: col.selectOptions, conditions: [nextCondition] },
        }
      })
    },
    [filterableColumns]
  )

  const columnFilters = React.useMemo<ColumnFiltersState>(() => {
    const next: ColumnFiltersState = []

    const isNonEmptyString = (value: unknown): value is string =>
      typeof value === "string" && value.trim().length > 0

    const isValidNumber = (value: unknown): value is number =>
      typeof value === "number" && !Number.isNaN(value)

    const isEqEffective = (
      groupType: ToolbarFilterGroup["type"],
      value: ToolbarFilterCondition["value"]
    ): boolean => {
      switch (groupType) {
        case "boolean":
          return value === true || value === false
        case "number":
          return isValidNumber(value)
        case "date":
        case "select":
        default:
          return isNonEmptyString(value)
      }
    }

    const isRangeEffective = (
      groupType: ToolbarFilterGroup["type"],
      value: ToolbarFilterCondition["value"]
    ): boolean => {
      switch (groupType) {
        case "number":
          return isValidNumber(value)
        case "date":
          return isNonEmptyString(value)
        default:
          return false
      }
    }

    const isConditionEffective = (
      group: ToolbarFilterGroup,
      c: ToolbarFilterCondition
    ): boolean => {
      switch (c.op) {
        case "is_empty":
        case "is_not_empty":
          return true
        case "contains":
          return isNonEmptyString(c.value)
        case "eq":
          return isEqEffective(group.type, c.value)
        case "gt":
        case "gte":
        case "lt":
        case "lte":
          return isRangeEffective(group.type, c.value)
        default:
          return false
      }
    }

    for (const [columnId, group] of Object.entries(toolbarFilters)) {
      // Pass only groups with at least 1 "effective" condition to the table state.
      const hasEffectiveCondition = group.conditions.some((c) =>
        isConditionEffective(group, c)
      )
      if (!hasEffectiveCondition) continue
      next.push({ id: columnId, value: group })
    }
    return next
  }, [toolbarFilters])

  const hasActiveFilters = columnFilters.length > 0 || debouncedSearch.trim().length > 0
  const isEmptySeed = !isLoading && !hasActiveFilters && totalRows === 0

  const handleTableSortingChange = React.useCallback(
    (next: SortingState) => {
      if (!next.length) {
        setSorting([])
        return
      }
      const [first] = next
      setSorting([{ id: first.id, desc: first.desc ?? false }])
    },
    []
  )

  const handleToolbarSortChange = React.useCallback(
    (state: { columnId: string | null; desc: boolean }) => {
      if (!state.columnId) {
        setSorting([])
        return
      }
      setSorting([{ id: state.columnId, desc: state.desc }])
    },
    []
  )

  const handlePageSizeChange = React.useCallback((size: number) => {
    setPageSize(size)
    setPageIndex(0)
  }, [])

  const pageCount = React.useMemo(() => {
    if (totalRows <= 0) return 1
    return Math.max(1, Math.ceil(totalRows / pageSize))
  }, [pageSize, totalRows])

  return {
    data,
    totalRows,
    isLoading,
    error,
    pageIndex,
    setPageIndex,
    pageSize,
    setPageSize,
    handlePageSizeChange,
    pageCount,
    tableSearch,
    setTableSearch,
    debouncedSearch,
    sorting,
    singleSort,
    handleTableSortingChange,
    handleToolbarSortChange,
    toolbarFilters,
    setToolbarFilters,
    columnFilters,
    availableTagsByColumnId,
    effectiveStatusOptions,
    filterableColumns,
    applyCellFilter,
    isEmptySeed,
  }
}
