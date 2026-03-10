"use client"

import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"
import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

const MAX_VISIBLE_PAGE_BUTTONS = 7
const DEFAULT_PAGE_SIZE = 10
const MIN_PAGE_SIZE = 1
const MAX_PAGE_SIZE = 100
const ROW_HEIGHT_PX = 48

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
}

export function DataTable<TData, TValue>({
  columns,
  data,
  initialHiddenColumns = [],
  globalFilter: globalFilterProp,
  onGlobalFilterChange,
  sorting: sortingProp,
  onSortingChange,
  columnFilters: columnFiltersProp,
  onColumnFiltersChange,
}: DataTableProps<TData, TValue>) {
  const [internalSorting, setInternalSorting] = React.useState<SortingState>([])
  const [internalColumnFilters, setInternalColumnFilters] =
    React.useState<ColumnFiltersState>([])
  const isControlledSorting = sortingProp !== undefined
  const sorting = isControlledSorting ? sortingProp : internalSorting
  const isControlledColumnFilters = columnFiltersProp !== undefined
  const columnFilters = isControlledColumnFilters
    ? columnFiltersProp
    : internalColumnFilters
  
  // Inizializza columnVisibility nascondendo le colonne specificate
  const initialVisibility = React.useMemo(() => {
    const visibility: VisibilityState = {}
    initialHiddenColumns.forEach((colId) => {
      visibility[colId] = false
    })
    return visibility
  }, [initialHiddenColumns])
  
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(initialVisibility)
  const [rowSelection, setRowSelection] = React.useState({})
  const [internalGlobalFilter, setInternalGlobalFilter] = React.useState("")
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  })

  const isControlledFilter = globalFilterProp !== undefined
  const globalFilter = isControlledFilter ? globalFilterProp : internalGlobalFilter
  const setGlobalFilter = isControlledFilter
    ? (onGlobalFilterChange ?? (() => {}))
    : setInternalGlobalFilter

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

  const table = useReactTable({
    data,
    columns,
    onSortingChange: handleSortingChange,
    onColumnFiltersChange: handleColumnFiltersChange,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "includesString",
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
      pagination,
    },
    onPaginationChange: setPagination,
  })

  const pageSize = table.getState().pagination.pageSize

  // Stato locale per permettere di cancellare e riscrivere (valori intermedi invalidi)
  const [pageSizeInput, setPageSizeInput] = React.useState(String(pageSize))
  React.useEffect(() => {
    setPageSizeInput(String(pageSize))
  }, [pageSize])

  const applyPageSize = React.useCallback(() => {
    const val = parseInt(pageSizeInput, 10)
    if (Number.isNaN(val) || val < MIN_PAGE_SIZE) {
      table.setPageSize(MIN_PAGE_SIZE)
      setPageSizeInput(String(MIN_PAGE_SIZE))
    } else if (val > MAX_PAGE_SIZE) {
      table.setPageSize(MAX_PAGE_SIZE)
      setPageSizeInput(String(MAX_PAGE_SIZE))
    } else {
      table.setPageSize(val)
      setPageSizeInput(String(val))
    }
  }, [pageSizeInput, table])

  const handlePageSizeBlur = () => applyPageSize()

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 py-4">
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="page-size" className="text-sm text-muted-foreground whitespace-nowrap">
              Righe
            </Label>
            <Input
              id="page-size"
              type="number"
              min={MIN_PAGE_SIZE}
              max={MAX_PAGE_SIZE}
              value={pageSizeInput}
              onChange={(e) => {
                setPageSizeInput(e.target.value)
                const val = parseInt(e.target.value, 10)
                if (!Number.isNaN(val) && val >= MIN_PAGE_SIZE && val <= MAX_PAGE_SIZE) {
                  table.setPageSize(val)
                }
              }}
              onBlur={handlePageSizeBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter") handlePageSizeBlur()
              }}
              className="w-16 h-9 text-center"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                Colonne <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                )
              })}
          </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="rounded-md border">
        <div
          className="relative w-full overflow-x-auto"
          style={{
            minHeight: (() => {
              const totalRows = table.getFilteredRowModel().rows.length
              const rowCount = totalRows < pageSize ? totalRows : pageSize
              return rowCount * ROW_HEIGHT_PX
            })(),
          }}
        >
          <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              <>
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    style={{ height: ROW_HEIGHT_PX }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {(() => {
                  const totalRows = table.getFilteredRowModel().rows.length
                  const visibleRows = table.getRowModel().rows.length
                  const placeholderCount =
                    totalRows >= pageSize && visibleRows < pageSize
                      ? pageSize - visibleRows
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
      </div>
      <div className="flex items-center justify-between gap-4 py-4">
        {table.getFilteredSelectedRowModel().rows.length > 0 && (
          <div className="text-muted-foreground text-sm whitespace-nowrap">
            {table.getFilteredSelectedRowModel().rows.length} di{" "}
            {table.getFilteredRowModel().rows.length} selezionate
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
                  !table.getCanPreviousPage()
                    ? "pointer-events-none opacity-50"
                    : undefined
                }
              />
            </PaginationItem>
            {(() => {
              const pageIndex = table.getState().pagination.pageIndex
              return getPaginationPages(
                table.getPageCount(),
                pageIndex
              ).map((pageItem, i) =>
                pageItem === "ellipsis" ? (
                  <PaginationItem key={`ellipsis-${i}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
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
              )
            })()}
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  if (table.getCanNextPage()) table.nextPage()
                }}
                className={
                  !table.getCanNextPage()
                    ? "pointer-events-none opacity-50"
                    : undefined
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  )
}
