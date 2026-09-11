// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import {
  getCoreRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnFiltersState,
  type ColumnSizingState,
  type GroupingState,
  type ExpandedState,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"
import {
  DEFAULT_DENSITY,
  DENSITY_ROW_HEIGHT,
  DENSITY_CELL_PADDING,
} from "@/lib/density"
import { DEFAULT_PAGE_SIZE, type DataTableProps } from "../types"

export function useDataTableState<TData, TValue>(
  props: Readonly<DataTableProps<TData, TValue>>
) {
  const {
    columns,
    data,
    initialHiddenColumns = [],
    rowSelection: rowSelectionProp,
    onRowSelectionChange,
    globalFilter: globalFilterProp,
    onGlobalFilterChange,
    sorting: sortingProp,
    onSortingChange,
    columnFilters: columnFiltersProp,
    onColumnFiltersChange,
    columnVisibility: columnVisibilityProp,
    onColumnVisibilityChange,
    pageSize: pageSizeProp,
    onPageSizeChange,
    pageIndex: pageIndexProp,
    onPageIndexChange,
    pageCount: pageCountProp,
    manualPagination = false,
    manualSorting = false,
    manualFiltering = false,
    grouping: groupingProp,
    onGroupingChange,
    enableColumnResizing,
    columnSizing: columnSizingProp,
    onColumnSizingChange,
    density,
  } = props

  const [internalSorting, setInternalSorting] = React.useState<SortingState>([])
  const [internalColumnFilters, setInternalColumnFilters] = React.useState<ColumnFiltersState>([])
  const isControlledSorting = sortingProp !== undefined
  const sorting = sortingProp ?? internalSorting
  const isControlledColumnFilters = columnFiltersProp !== undefined
  const columnFilters = columnFiltersProp ?? internalColumnFilters

  const initialVisibility = React.useMemo(() => {
    const visibility: VisibilityState = {}
    initialHiddenColumns.forEach((colId) => {
      visibility[colId] = false
    })
    return visibility
  }, [initialHiddenColumns])

  const [internalColumnVisibility, setInternalColumnVisibility] = React.useState<VisibilityState>(initialVisibility)
  const isControlledColumnVisibility = columnVisibilityProp !== undefined
  const columnVisibility = columnVisibilityProp ?? internalColumnVisibility

  const [internalColumnSizing, setInternalColumnSizing] = React.useState<ColumnSizingState>({})
  const isControlledColumnSizing = columnSizingProp !== undefined
  const columnSizing = columnSizingProp ?? internalColumnSizing

  const [internalRowSelection, setInternalRowSelection] = React.useState<RowSelectionState>({})
  const isControlledRowSelection = rowSelectionProp !== undefined
  const rowSelection = rowSelectionProp ?? internalRowSelection

  const [internalGlobalFilter, setInternalGlobalFilter] = React.useState("")
  const isControlledFilter = globalFilterProp !== undefined
  const globalFilter = globalFilterProp ?? internalGlobalFilter
  const setGlobalFilter = isControlledFilter
    ? (onGlobalFilterChange ?? (() => {}))
    : setInternalGlobalFilter

  const [internalPagination, setInternalPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  })
  const isControlledPageSize = pageSizeProp !== undefined
  const isControlledPageIndex = pageIndexProp !== undefined
  const pagination: PaginationState = React.useMemo(
    () => ({
      ...internalPagination,
      pageIndex: isControlledPageIndex ? (pageIndexProp ?? internalPagination.pageIndex) : internalPagination.pageIndex,
      pageSize: isControlledPageSize ? (pageSizeProp ?? internalPagination.pageSize) : internalPagination.pageSize,
    }),
    [internalPagination, isControlledPageIndex, isControlledPageSize, pageIndexProp, pageSizeProp]
  )

  const isControlledGrouping = groupingProp !== undefined
  const [internalGrouping, setInternalGrouping] = React.useState<GroupingState>([])
  const grouping = groupingProp ?? internalGrouping
  const isGroupingActive = grouping.length > 0

  const [expanded, setExpanded] = React.useState<ExpandedState>(true)

  const activeDensity = density ?? DEFAULT_DENSITY
  const rowHeight = DENSITY_ROW_HEIGHT[activeDensity]
  const cellPadding = DENSITY_CELL_PADDING[activeDensity]

  const handleSortingChange = React.useCallback(
    (updaterOrValue: SortingState | ((old: SortingState) => SortingState)) => {
      const nextSorting = typeof updaterOrValue === "function" ? updaterOrValue(sorting) : updaterOrValue
      if (!isControlledSorting) setInternalSorting(nextSorting)
      onSortingChange?.(nextSorting)
    },
    [isControlledSorting, onSortingChange, sorting]
  )

  const handleColumnFiltersChange = React.useCallback(
    (updaterOrValue: ColumnFiltersState | ((old: ColumnFiltersState) => ColumnFiltersState)) => {
      const next = typeof updaterOrValue === "function" ? updaterOrValue(columnFilters) : updaterOrValue
      if (!isControlledColumnFilters) setInternalColumnFilters(next)
      onColumnFiltersChange?.(next)
    },
    [columnFilters, isControlledColumnFilters, onColumnFiltersChange]
  )

  const handleColumnVisibilityChange = React.useCallback(
    (updaterOrValue: VisibilityState | ((old: VisibilityState) => VisibilityState)) => {
      const next = typeof updaterOrValue === "function" ? updaterOrValue(columnVisibility) : updaterOrValue
      if (!isControlledColumnVisibility) setInternalColumnVisibility(next)
      onColumnVisibilityChange?.(next)
    },
    [columnVisibility, isControlledColumnVisibility, onColumnVisibilityChange]
  )

  const handleColumnSizingChange = React.useCallback(
    (updaterOrValue: ColumnSizingState | ((old: ColumnSizingState) => ColumnSizingState)) => {
      const next = typeof updaterOrValue === "function" ? updaterOrValue(columnSizing) : updaterOrValue
      if (!isControlledColumnSizing) setInternalColumnSizing(next)
      onColumnSizingChange?.(next)
    },
    [columnSizing, isControlledColumnSizing, onColumnSizingChange]
  )

  const handlePaginationChange = React.useCallback(
    (updaterOrValue: PaginationState | ((old: PaginationState) => PaginationState)) => {
      const next = typeof updaterOrValue === "function" ? updaterOrValue(pagination) : updaterOrValue
      if (!isControlledPageSize && !isControlledPageIndex) {
        setInternalPagination(next)
      } else {
        setInternalPagination((prev) => ({
          ...prev,
          pageIndex: isControlledPageIndex ? prev.pageIndex : next.pageIndex,
          pageSize: isControlledPageSize ? prev.pageSize : next.pageSize,
        }))
        if (next.pageIndex !== pagination.pageIndex) onPageIndexChange?.(next.pageIndex)
        if (next.pageSize !== pagination.pageSize) onPageSizeChange?.(next.pageSize)
      }
    },
    [isControlledPageIndex, isControlledPageSize, onPageIndexChange, onPageSizeChange, pagination]
  )

  const handleRowSelectionChange = React.useCallback(
    (updaterOrValue: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) => {
      const next = typeof updaterOrValue === "function" ? updaterOrValue(rowSelection) : updaterOrValue
      if (!isControlledRowSelection) setInternalRowSelection(next)
      onRowSelectionChange?.(next)
    },
    [isControlledRowSelection, onRowSelectionChange, rowSelection]
  )

  const handleGroupingChange = React.useCallback(
    (updaterOrValue: GroupingState | ((old: GroupingState) => GroupingState)) => {
      const next = typeof updaterOrValue === "function" ? updaterOrValue(grouping) : updaterOrValue
      if (!isControlledGrouping) setInternalGrouping(next)
      onGroupingChange?.(next)
    },
    [grouping, isControlledGrouping, onGroupingChange]
  )

  const table = useReactTable({
    data,
    columns,
    getRowId: (original, index) => {
      const maybeId = (original as { id?: unknown }).id
      return typeof maybeId === "string" && maybeId ? maybeId : String(index)
    },
    onSortingChange: handleSortingChange,
    onColumnFiltersChange: handleColumnFiltersChange,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: manualPagination ? undefined : getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    onColumnVisibilityChange: handleColumnVisibilityChange,
    onRowSelectionChange: handleRowSelectionChange,
    onGlobalFilterChange: setGlobalFilter,
    onGroupingChange: handleGroupingChange,
    onExpandedChange: setExpanded,
    globalFilterFn: "includesString",
    autoResetExpanded: false,
    manualPagination,
    manualSorting,
    manualFiltering,
    pageCount: manualPagination ? pageCountProp : undefined,
    enableColumnResizing,
    columnResizeMode: "onChange",
    onColumnSizingChange: handleColumnSizingChange,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
      pagination: isGroupingActive ? { pageIndex: 0, pageSize: Number.MAX_SAFE_INTEGER } : pagination,
      grouping,
      expanded,
      columnSizing,
    },
    onPaginationChange: handlePaginationChange,
  })

  // Espandi tutti i gruppi quando il raggruppamento cambia
  const [prevGrouping, setPrevGrouping] = React.useState(grouping)
  if (grouping !== prevGrouping) {
    setPrevGrouping(grouping)
    if (isGroupingActive) {
      setExpanded(true)
    }
  }

  return {
    table,
    isGroupingActive,
    activeDensity,
    rowHeight,
    cellPadding,
  }
}
