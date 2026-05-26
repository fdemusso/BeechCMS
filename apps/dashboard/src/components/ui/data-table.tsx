// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

"use client"

import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type GroupingState,
  type ExpandedState,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ChevronRight, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

const MAX_VISIBLE_PAGE_BUTTONS = 7
const DEFAULT_PAGE_SIZE = 10
const ROW_HEIGHT_PX = 48
/** Altezza container in modalità virtual scroll (gruppi espansi) */
const VIRTUAL_CONTAINER_HEIGHT = "calc(100vh - 280px)"

/**
 * Calcola l'array di pagine da mostrare (numeri o "ellipsis").
 * Se pageCount <= MAX_VISIBLE_PAGE_BUTTONS mostra tutte, altrimenti
 * prima, ellipsis, pagine centrali, ellipsis, ultima.
 */
function getPaginationPages(
  pageCount: number,
  pageIndex: number
): (number | "ellipsis")[] {
  const pages: (number | "ellipsis")[] = []
  if (pageCount <= MAX_VISIBLE_PAGE_BUTTONS) {
    for (let i = 0; i < pageCount; i++) pages.push(i)
  } else {
    pages.push(0)
    if (pageIndex > 2) pages.push("ellipsis")
    const start = Math.max(1, pageIndex - 1)
    const end = Math.min(pageCount - 2, pageIndex + 1)
    for (let i = start; i <= end; i++) pages.push(i)
    if (pageIndex < pageCount - 3) pages.push("ellipsis")
    if (pageCount > 1) pages.push(pageCount - 1)
  }
  return pages
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  initialHiddenColumns?: string[]
  /**
   * Calcolo styling per riga eseguito una volta sola e poi riusato per tutte le celle.
   * Se presente, ha priorità su `getRowClassName` / `getCellClassName`.
   */
  getRowStyles?: (row: TData) => {
    rowClassName?: string
    cellClassNameByColumnId?: Record<string, string | undefined>
  }
  /** Classi extra per la riga (esclude group header rows). */
  getRowClassName?: (row: TData) => string | undefined
  /** Classi extra per una cella specifica (esclude group header rows). */
  getCellClassName?: (row: TData, columnId: string) => string | undefined
  /**
   * Se fornito, abilita il menu contestuale (tasto destro) sulle celle della riga.
   * La funzione deve rendere SOLO gli items del menu (content interno).
   */
  renderRowContextMenuContent?: (row: TData) => React.ReactNode
  /** Colonne escluse dal menu contestuale (default: select, actions). */
  rowContextMenuExcludedColumnIds?: string[]
  /** Selezione righe controllata dall'esterno (chiavi: rowId). */
  rowSelection?: RowSelectionState
  /** Callback quando cambia la selezione righe (in modalità controllata). */
  onRowSelectionChange?: (next: RowSelectionState) => void
  /** Filtro globale (ricerca) controllato dall'esterno. Se non fornito, usa stato interno. */
  globalFilter?: string
  onGlobalFilterChange?: (value: string) => void
  /** Stato di ordinamento controllato dall'esterno (opzionale). */
  sorting?: SortingState
  /** Callback quando cambia l'ordinamento (usata in modalità controllata). */
  onSortingChange?: (sorting: SortingState) => void
  /** Filtri per-colonna controllati dall'esterno (opzionale). */
  columnFilters?: ColumnFiltersState
  /** Callback quando cambiano i filtri per-colonna (usata in modalità controllata). */
  onColumnFiltersChange?: (filters: ColumnFiltersState) => void
  /** Visibilità colonne controllata dall'esterno (opzionale). */
  columnVisibility?: VisibilityState
  /** Callback quando cambia la visibilità delle colonne (in modalità controllata). */
  onColumnVisibilityChange?: (visibility: VisibilityState) => void
  /** Numero di righe per pagina controllato dall'esterno (opzionale). */
  pageSize?: number
  /** Callback quando cambia il numero di righe per pagina (in modalità controllata). */
  onPageSizeChange?: (size: number) => void
  /** Indice pagina controllato dall'esterno (0-based). */
  pageIndex?: number
  /** Callback quando cambia la pagina corrente (0-based). */
  onPageIndexChange?: (index: number) => void
  /** Numero totale pagine (richiesto in manualPagination). */
  pageCount?: number
  /** Numero totale righe server-side (per testo "x di y selezionate"). */
  totalRows?: number
  /** Modalità paginazione server-side. */
  manualPagination?: boolean
  /** Modalità ordinamento server-side. */
  manualSorting?: boolean
  /** Modalità filtro server-side. */
  manualFiltering?: boolean
  /**
   * Stato di raggruppamento controllato dall'esterno.
   * Quando non vuoto, la tabella passa in modalità virtual scroll
   * e la paginazione viene disabilitata.
   */
  grouping?: GroupingState
  /** Callback quando cambia il raggruppamento. */
  onGroupingChange?: (grouping: GroupingState) => void
  /** Callback opzionale al doppio click su una riga. */
  onRowDoubleClick?: (row: TData) => void
}

export function DataTable<TData, TValue>(
  props: Readonly<DataTableProps<TData, TValue>>
) {
  const {
    columns,
    data,
    initialHiddenColumns = [],
    getRowStyles,
    getRowClassName,
    getCellClassName,
    renderRowContextMenuContent,
    rowContextMenuExcludedColumnIds,
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
    totalRows: totalRowsProp,
    manualPagination = false,
    manualSorting = false,
    manualFiltering = false,
    grouping: groupingProp,
    onGroupingChange,
    onRowDoubleClick,
  } = props
  const [internalSorting, setInternalSorting] = React.useState<SortingState>([])
  const [internalColumnFilters, setInternalColumnFilters] =
    React.useState<ColumnFiltersState>([])
  const isControlledSorting = sortingProp !== undefined
  const sorting = sortingProp ?? internalSorting
  const isControlledColumnFilters = columnFiltersProp !== undefined
  const columnFilters = columnFiltersProp ?? internalColumnFilters

  // Inizializza columnVisibility nascondendo le colonne specificate
  const initialVisibility = React.useMemo(() => {
    const visibility: VisibilityState = {}
    initialHiddenColumns.forEach((colId) => {
      visibility[colId] = false
    })
    return visibility
  }, [initialHiddenColumns])

  const [internalColumnVisibility, setInternalColumnVisibility] =
    React.useState<VisibilityState>(initialVisibility)
  const isControlledColumnVisibility = columnVisibilityProp !== undefined
  const columnVisibility = columnVisibilityProp ?? internalColumnVisibility
  const [internalRowSelection, setInternalRowSelection] =
    React.useState<RowSelectionState>({})
  const isControlledRowSelection = rowSelectionProp !== undefined
  const rowSelection = rowSelectionProp ?? internalRowSelection
  const [internalGlobalFilter, setInternalGlobalFilter] = React.useState("")
  const [internalPagination, setInternalPagination] =
    React.useState<PaginationState>({
      pageIndex: 0,
      pageSize: DEFAULT_PAGE_SIZE,
    })
  const isControlledPageSize = pageSizeProp !== undefined
  const isControlledPageIndex = pageIndexProp !== undefined
  const pagination: PaginationState = React.useMemo(
    () => ({
      ...internalPagination,
      pageIndex: isControlledPageIndex
        ? pageIndexProp ?? internalPagination.pageIndex
        : internalPagination.pageIndex,
      pageSize: isControlledPageSize
        ? pageSizeProp ?? internalPagination.pageSize
        : internalPagination.pageSize,
    }),
    [internalPagination, isControlledPageIndex, isControlledPageSize, pageIndexProp, pageSizeProp]
  )

  const isControlledFilter = globalFilterProp !== undefined
  const globalFilter = globalFilterProp ?? internalGlobalFilter
  const setGlobalFilter = isControlledFilter
    ? (onGlobalFilterChange ?? (() => {}))
    : setInternalGlobalFilter

  // Grouping state
  const isControlledGrouping = groupingProp !== undefined
  const [internalGrouping, setInternalGrouping] = React.useState<GroupingState>([])
  const grouping = groupingProp ?? internalGrouping
  const isGroupingActive = grouping.length > 0

  // Expanded state (gestito internamente — gruppi espansi per default)
  const [expanded, setExpanded] = React.useState<ExpandedState>(true)

  // Ref per il container scroll virtuale
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)

  const handleSortingChange = React.useCallback(
    (
      updaterOrValue:
        | SortingState
        | ((old: SortingState) => SortingState)
    ) => {
      const nextSorting =
        typeof updaterOrValue === "function"
          ? updaterOrValue(sorting)
          : updaterOrValue

      if (!isControlledSorting) {
        setInternalSorting(nextSorting)
      }

      onSortingChange?.(nextSorting)
    },
    [isControlledSorting, onSortingChange, sorting]
  )

  const handleColumnFiltersChange = React.useCallback(
    (
      updaterOrValue:
        | ColumnFiltersState
        | ((old: ColumnFiltersState) => ColumnFiltersState)
    ) => {
      const next =
        typeof updaterOrValue === "function"
          ? updaterOrValue(columnFilters)
          : updaterOrValue

      if (!isControlledColumnFilters) {
        setInternalColumnFilters(next)
      }

      onColumnFiltersChange?.(next)
    },
    [columnFilters, isControlledColumnFilters, onColumnFiltersChange]
  )

  const handleColumnVisibilityChange = React.useCallback(
    (
      updaterOrValue:
        | VisibilityState
        | ((old: VisibilityState) => VisibilityState)
    ) => {
      const next =
        typeof updaterOrValue === "function"
          ? updaterOrValue(columnVisibility)
          : updaterOrValue

      if (!isControlledColumnVisibility) {
        setInternalColumnVisibility(next)
      }

      onColumnVisibilityChange?.(next)
    },
    [columnVisibility, isControlledColumnVisibility, onColumnVisibilityChange]
  )

  const handlePaginationChange = React.useCallback(
    (
      updaterOrValue:
        | PaginationState
        | ((old: PaginationState) => PaginationState)
    ) => {
      const next =
        typeof updaterOrValue === "function"
          ? updaterOrValue(pagination)
          : updaterOrValue

      if (!isControlledPageSize && !isControlledPageIndex) {
        setInternalPagination(next)
      } else {
        setInternalPagination((prev) => ({
          ...prev,
          pageIndex: isControlledPageIndex ? prev.pageIndex : next.pageIndex,
          pageSize: isControlledPageSize ? prev.pageSize : next.pageSize,
        }))
        if (next.pageIndex !== pagination.pageIndex) {
          onPageIndexChange?.(next.pageIndex)
        }
        if (next.pageSize !== pagination.pageSize) {
          onPageSizeChange?.(next.pageSize)
        }
      }
    },
    [isControlledPageIndex, isControlledPageSize, onPageIndexChange, onPageSizeChange, pagination]
  )

  const handleRowSelectionChange = React.useCallback(
    (
      updaterOrValue:
        | RowSelectionState
        | ((old: RowSelectionState) => RowSelectionState)
    ) => {
      const next =
        typeof updaterOrValue === "function"
          ? updaterOrValue(rowSelection)
          : updaterOrValue

      if (!isControlledRowSelection) {
        setInternalRowSelection(next)
      }

      onRowSelectionChange?.(next)
    },
    [isControlledRowSelection, onRowSelectionChange, rowSelection]
  )

  const handleGroupingChange = React.useCallback(
    (
      updaterOrValue:
        | GroupingState
        | ((old: GroupingState) => GroupingState)
    ) => {
      const next =
        typeof updaterOrValue === "function"
          ? updaterOrValue(grouping)
          : updaterOrValue

      if (!isControlledGrouping) {
        setInternalGrouping(next)
      }

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
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
      pagination: isGroupingActive
        ? { pageIndex: 0, pageSize: Number.MAX_SAFE_INTEGER }
        : pagination,
      grouping,
      expanded,
    },
    onPaginationChange: handlePaginationChange,
  })

  // Espandi tutti i gruppi quando il raggruppamento cambia
  React.useEffect(() => {
    if (isGroupingActive) {
      setExpanded(true)
    }
  }, [isGroupingActive, grouping])

  const excludedContextMenuColumnIds = React.useMemo(() => {
    return new Set(rowContextMenuExcludedColumnIds ?? ["select", "actions"])
  }, [rowContextMenuExcludedColumnIds])

  // Lista piatta di righe visibili (include group headers + subRows espanse)
  const flatRows = table.getRowModel().rows

  // Virtualizzatore — attivo solo in modalità grouping
  const virtualizer = useVirtualizer({
    count: isGroupingActive ? flatRows.length : 0,
    getScrollElement: () => (isGroupingActive ? scrollContainerRef.current : null),
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 5,
  })

  const virtualItems = isGroupingActive ? virtualizer.getVirtualItems() : []
  const totalVirtualSize = isGroupingActive ? virtualizer.getTotalSize() : 0
  const topPadding = virtualItems[0]?.start ?? 0
  const bottomPadding = totalVirtualSize - (virtualItems.at(-1)?.end ?? 0)

  /**
   * Renderizza una singola riga — gestisce sia group header rows che righe normali.
   * Usato sia in modalità paginata che in modalità virtuale.
   */
  const renderRow = (row: (typeof flatRows)[number]) => {
    if (row.getIsGrouped()) {
      const isExpanded = row.getIsExpanded()
      const groupValue = row.groupingValue
      const subRowCount = row.subRows.length

      return (
        <TableRow
          key={row.id}
          className="cursor-pointer bg-muted/40 hover:bg-muted/60"
          style={{ height: ROW_HEIGHT_PX }}
          onClick={() => row.toggleExpanded()}
        >
          <TableCell
            colSpan={table.getVisibleLeafColumns().length}
            className="py-0"
          >
            <div className="flex items-center gap-2 px-1">
              {isExpanded ? (
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">
                {groupValue == null || groupValue === "" ? "—" : String(groupValue)}
              </span>
              <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
                {subRowCount}
              </span>
            </div>
          </TableCell>
        </TableRow>
      )
    }

    const rowStyles = getRowStyles?.(row.original)
    return (
      <TableRow
        key={row.id}
        data-state={row.getIsSelected() && "selected"}
        className={cn(
          "transition-colors",
          onRowDoubleClick && "cursor-pointer select-none",
          rowStyles?.rowClassName ?? getRowClassName?.(row.original)
        )}
        style={{ height: ROW_HEIGHT_PX }}
        onDoubleClick={() => onRowDoubleClick?.(row.original)}
      >
        {row.getVisibleCells().map((cell) => {
          const cellInner = flexRender(
            cell.column.columnDef.cell,
            cell.getContext()
          )
          const cellClassName =
            rowStyles?.cellClassNameByColumnId?.[cell.column.id] ??
            getCellClassName?.(row.original, cell.column.id)

          const shouldWrapWithContextMenu =
            !!renderRowContextMenuContent &&
            !excludedContextMenuColumnIds.has(cell.column.id)

          if (!shouldWrapWithContextMenu) {
            return (
              <TableCell key={cell.id} className={cellClassName}>
                {cellInner}
              </TableCell>
            )
          }

          return (
            <ContextMenu key={cell.id}>
              <ContextMenuTrigger asChild>
                <TableCell className={cellClassName}>{cellInner}</TableCell>
              </ContextMenuTrigger>
              <ContextMenuContent>
                {renderRowContextMenuContent(row.original)}
              </ContextMenuContent>
            </ContextMenu>
          )
        })}
      </TableRow>
    )
  }

  return (
    <div className="w-full">
      <div className="rounded-md border">
        {isGroupingActive ? (
          /* ── Modalità virtual scroll (grouping attivo) ── */
          <div
            ref={scrollContainerRef}
            className="relative w-full overflow-auto"
            style={{ height: VIRTUAL_CONTAINER_HEIGHT }}
          >
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {flatRows.length > 0 ? (
                  <>
                    {/* Riga vuota superiore per offset scroll */}
                    {topPadding > 0 && (
                      <TableRow style={{ height: topPadding }}>
                        <TableCell colSpan={table.getVisibleLeafColumns().length} />
                      </TableRow>
                    )}
                    {virtualItems.map((vRow) => renderRow(flatRows[vRow.index]))}
                    {/* Riga vuota inferiore per mantenere la scrollbar corretta */}
                    {bottomPadding > 0 && (
                      <TableRow style={{ height: bottomPadding }}>
                        <TableCell colSpan={table.getVisibleLeafColumns().length} />
                      </TableRow>
                    )}
                  </>
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                    >
                      Nessun risultato.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          /* ── Modalità paginata (grouping inattivo) ── */
          <div
            className="relative w-full overflow-x-auto"
            style={{
              minHeight: (() => {
                const totalRows = manualPagination
                  ? data.length
                  : table.getFilteredRowModel().rows.length
                const rowCount = Math.min(totalRows, pagination.pageSize)
                return rowCount * ROW_HEIGHT_PX
              })(),
            }}
          >
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  <>
                    {table.getRowModel().rows.map((row) => renderRow(row))}
                    {(() => {
                      const totalRows = manualPagination
                        ? data.length
                        : table.getFilteredRowModel().rows.length
                      const visibleRows = table.getRowModel().rows.length
                      const placeholderCount =
                        totalRows >= pagination.pageSize &&
                        visibleRows < pagination.pageSize
                          ? pagination.pageSize - visibleRows
                          : 0
                      const colCount = table.getVisibleLeafColumns().length
                      return Array.from({ length: placeholderCount }, (_, i) => (
                        <TableRow
                          key={`placeholder-${i}`}
                          className="border-b border-dashed"
                          style={{ height: ROW_HEIGHT_PX }}
                        >
                          {Array.from({ length: colCount }, (_, colIndex) => (
                            <TableCell key={colIndex} className="align-middle" />
                          ))}
                        </TableRow>
                      ))
                    })()}
                  </>
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                    >
                      Nessun risultato.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Paginazione — nascosta in modalità grouping */}
      {!isGroupingActive && (
        <div className="flex items-center justify-between gap-4 py-4">
          {table.getFilteredSelectedRowModel().rows.length > 0 && (
            <div className="text-muted-foreground text-sm whitespace-nowrap">
              {table.getFilteredSelectedRowModel().rows.length} di{" "}
              {totalRowsProp ?? table.getFilteredRowModel().rows.length} selezionate
            </div>
          )}
          <Pagination className="ml-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    if (table.getCanPreviousPage()) table.previousPage()
                  }}
                  className={
                      table.getCanPreviousPage()
                        ? undefined
                        : "pointer-events-none opacity-50"
                  }
                />
              </PaginationItem>
              {(() => {
                const pageIndex = table.getState().pagination.pageIndex
                return getPaginationPages(
                  table.getPageCount(),
                  pageIndex
                ).map((pageItem, i, pages) => {
                  if (pageItem === "ellipsis") {
                    const prevPage = pages.slice(0, i)
                      .reverse()
                      .find((p): p is number => typeof p === "number")
                    const nextPage = pages
                      .slice(i + 1)
                      .find((p): p is number => typeof p === "number")
                    return (
                      <PaginationItem
                        key={`ellipsis-${prevPage ?? "?"}-${nextPage ?? "?"}`}
                      >
                        <PaginationEllipsis />
                      </PaginationItem>
                    )
                  }

                  return (
                    <PaginationItem key={pageItem}>
                      <PaginationLink
                        href="#"
                        isActive={pageIndex === pageItem}
                        onClick={(e) => {
                          e.preventDefault()
                          table.setPageIndex(pageItem)
                        }}
                      >
                        {pageItem + 1}
                      </PaginationLink>
                    </PaginationItem>
                  )
                })
              })()}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    if (table.getCanNextPage()) table.nextPage()
                  }}
                  className={
                    table.getCanNextPage()
                      ? undefined
                      : "pointer-events-none opacity-50"
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  )
}
