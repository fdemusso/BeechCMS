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
  type ColumnOrderState,
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

type Updater<T> = T | ((old: T) => T)

/** State that follows the controlled prop when defined, else keeps internal state; notifies `onChange` either way. */
function useControllableState<T>(
  controlled: T | undefined,
  initial: T,
  onChange?: (value: T) => void
): [T, (updaterOrValue: Updater<T>) => void] {
  const [internal, setInternal] = React.useState<T>(initial)
  const isControlled = controlled !== undefined
  const value = controlled ?? internal
  const handleChange = React.useCallback(
    (updaterOrValue: Updater<T>) => {
      const next = typeof updaterOrValue === "function" ? (updaterOrValue as (old: T) => T)(value) : updaterOrValue
      if (!isControlled) setInternal(next)
      onChange?.(next)
    },
    [isControlled, onChange, value]
  )
  return [value, handleChange]
}

function useDataTablePagination(
  pageSizeProp: number | undefined,
  pageIndexProp: number | undefined,
  onPageSizeChange: ((pageSize: number) => void) | undefined,
  onPageIndexChange: ((pageIndex: number) => void) | undefined
) {
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

  const handlePaginationChange = React.useCallback(
    (updaterOrValue: Updater<PaginationState>) => {
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

  return { pagination, handlePaginationChange }
}

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
    columnOrder: columnOrderProp,
    onColumnOrderChange,
    density,
  } = props

  const [sorting, handleSortingChange] = useControllableState<SortingState>(sortingProp, [], onSortingChange)
  const [columnFilters, handleColumnFiltersChange] = useControllableState<ColumnFiltersState>(
    columnFiltersProp,
    [],
    onColumnFiltersChange
  )

  const initialVisibility = React.useMemo(() => {
    const visibility: VisibilityState = {}
    initialHiddenColumns.forEach((colId) => {
      visibility[colId] = false
    })
    return visibility
  }, [initialHiddenColumns])

  const [columnVisibility, handleColumnVisibilityChange] = useControllableState<VisibilityState>(
    columnVisibilityProp,
    initialVisibility,
    onColumnVisibilityChange
  )

  const [columnSizing, handleColumnSizingChange] = useControllableState<ColumnSizingState>(
    columnSizingProp,
    {},
    onColumnSizingChange
  )

  const [internalColumnOrder, setInternalColumnOrder] = React.useState<ColumnOrderState>([])
  const isControlledColumnOrder = columnOrderProp !== undefined
  const columnOrder = columnOrderProp ?? internalColumnOrder
  // Leading non-hideable columns (select) stay first: TanStack puts unlisted columns after listed ones.
  const effectiveColumnOrder = React.useMemo<ColumnOrderState>(() => {
    if (columnOrder.length === 0) return []
    const leading: string[] = []
    for (const column of columns) {
      const id = column.id ?? (column as { accessorKey?: string }).accessorKey
      if (column.enableHiding !== false || !id) break
      leading.push(id)
    }
    return [...leading, ...columnOrder.filter((id) => !leading.includes(id))]
  }, [columns, columnOrder])

  const [rowSelection, handleRowSelectionChange] = useControllableState<RowSelectionState>(
    rowSelectionProp,
    {},
    onRowSelectionChange
  )

  const [internalGlobalFilter, setInternalGlobalFilter] = React.useState("")
  const isControlledFilter = globalFilterProp !== undefined
  const globalFilter = globalFilterProp ?? internalGlobalFilter
  const setGlobalFilter = isControlledFilter
    ? (onGlobalFilterChange ?? (() => {}))
    : setInternalGlobalFilter

  const { pagination, handlePaginationChange } = useDataTablePagination(
    pageSizeProp,
    pageIndexProp,
    onPageSizeChange,
    onPageIndexChange
  )

  const [grouping, handleGroupingChange] = useControllableState<GroupingState>(groupingProp, [], onGroupingChange)
  const isGroupingActive = grouping.length > 0

  // The grouped column is hidden only while grouping is active; the user's own visibility
  // choice is left untouched, so it comes back as it was when grouping is turned off.
  const effectiveColumnVisibility = React.useMemo<VisibilityState>(() => {
    if (!isGroupingActive) return columnVisibility
    return { ...columnVisibility, ...Object.fromEntries(grouping.map((id) => [id, false])) }
  }, [columnVisibility, grouping, isGroupingActive])

  const [expanded, setExpanded] = React.useState<ExpandedState>(true)

  const activeDensity = density ?? DEFAULT_DENSITY
  const rowHeight = DENSITY_ROW_HEIGHT[activeDensity]
  const cellPadding = DENSITY_CELL_PADDING[activeDensity]

  const handleColumnOrderChange = React.useCallback(
    (updaterOrValue: ColumnOrderState | ((old: ColumnOrderState) => ColumnOrderState)) => {
      const next = typeof updaterOrValue === "function" ? updaterOrValue(effectiveColumnOrder) : updaterOrValue
      if (!isControlledColumnOrder) setInternalColumnOrder(next)
      onColumnOrderChange?.(next)
    },
    [effectiveColumnOrder, isControlledColumnOrder, onColumnOrderChange]
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
    onColumnOrderChange: handleColumnOrderChange,
    state: {
      sorting,
      columnFilters,
      columnVisibility: effectiveColumnVisibility,
      rowSelection,
      globalFilter,
      pagination: isGroupingActive ? { pageIndex: 0, pageSize: Number.MAX_SAFE_INTEGER } : pagination,
      grouping,
      expanded,
      columnSizing,
      columnOrder: effectiveColumnOrder,
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
