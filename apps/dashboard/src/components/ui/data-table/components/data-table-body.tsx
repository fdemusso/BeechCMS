// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * DataTable skeleton (outside → inside). Each layer owns exactly one concern:
 *
 *   DataTable (index.tsx)
 *   ├─ frame          rounded border + overflow-hidden: the ONLY place that draws the outer
 *   │                 border and clips children to its rounded corners. Anything painted inside
 *   │                 (header background, row hover) must NOT draw its own outer edge.
 *   │  └─ DataTableBody
 *   │     └─ ScrollArea        scrolling (horizontal always; vertical only when grouping)
 *   │        └─ <table>
 *   │           ├─ <thead>     header cells: own background + column separators
 *   │           └─ <tbody>     data rows, group rows, spacer rows, placeholder rows
 *   └─ DataTablePagination
 *
 * Two modes share the same skeleton and differ only in how the <tbody> is filled:
 *   - paginated: real rows + dashed placeholder rows padding the page to `pageSize`.
 *   - grouped:   virtualized rows, with two spacer rows standing in for the off-screen ones.
 */

import * as React from "react"
import type { Table as TanstackTable } from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableRow, TableHeader } from "@/components/ui/table"
import { DataTableHeader } from "./data-table-header"
import { DataTableGroupRow } from "./data-table-group-row"
import { DataTableRow } from "./data-table-row"
import type { DataTableSelection } from "../hooks/use-data-table-selection"
import type { DataTableProps } from "../types"
import { VIRTUAL_CONTAINER_HEIGHT } from "../types"

export interface DataTableBodyProps<TData, TValue> {
  table: TanstackTable<TData>
  isGroupingActive: boolean
  rowHeight: number
  cellPadding: string
  props: Readonly<DataTableProps<TData, TValue>>
  selection: DataTableSelection
}

/** Single full-width row used for the "no results" message. */
function EmptyRow({ colSpan, isCustom, children }: Readonly<{ colSpan: number; isCustom: boolean; children: React.ReactNode }>) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className={isCustom ? "text-center" : "h-24 text-center"}>
        {children}
      </TableCell>
    </TableRow>
  )
}

/** Empty row whose height stands in for the virtualized rows that are not rendered. */
function VirtualSpacerRow({ height, colSpan }: Readonly<{ height: number; colSpan: number }>) {
  return (
    <TableRow style={{ height }}>
      <TableCell colSpan={colSpan} />
    </TableRow>
  )
}

/** Dashed empty rows that keep a short last page the same height as a full one. */
function PlaceholderRows({ count, columnCount, rowHeight }: Readonly<{ count: number; columnCount: number; rowHeight: number }>) {
  return Array.from({ length: count }, (_, i) => (
    <TableRow key={`placeholder-${i}`} className="border-dashed" style={{ height: rowHeight }}>
      {Array.from({ length: columnCount }, (_, colIndex) => (
        <TableCell key={colIndex} />
      ))}
    </TableRow>
  ))
}

export function DataTableBody<TData, TValue>({
  table,
  isGroupingActive,
  rowHeight,
  cellPadding,
  props,
  selection,
}: DataTableBodyProps<TData, TValue>) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)
  const rows = table.getRowModel().rows
  const columnCount = table.getVisibleLeafColumns().length

  const virtualizer = useVirtualizer({
    count: isGroupingActive ? rows.length : 0,
    getScrollElement: () => (isGroupingActive ? scrollContainerRef.current : null),
    estimateSize: () => rowHeight,
    overscan: 5,
  })

  const { emptyState, enableColumnResizing, manualPagination, data } = props
  const enableColumnReorder = props.columnOrder !== undefined || props.onColumnOrderChange !== undefined

  const renderRow = (row: (typeof rows)[number]) =>
    row.getIsGrouped() ? (
      <DataTableGroupRow key={row.id} row={row} rowHeight={rowHeight} table={table} />
    ) : (
      <DataTableRow
        key={row.id}
        row={row}
        rowHeight={rowHeight}
        cellPadding={cellPadding}
        props={props}
        selection={selection}
      />
    )

  const renderGroupedRows = () => {
    const virtualItems = virtualizer.getVirtualItems()
    const topPadding = virtualItems[0]?.start ?? 0
    const bottomPadding = virtualizer.getTotalSize() - (virtualItems.at(-1)?.end ?? 0)
    return (
      <>
        {topPadding > 0 && <VirtualSpacerRow height={topPadding} colSpan={columnCount} />}
        {virtualItems.map((vRow) => renderRow(rows[vRow.index]))}
        {bottomPadding > 0 && <VirtualSpacerRow height={bottomPadding} colSpan={columnCount} />}
      </>
    )
  }

  const renderPaginatedRows = () => {
    const { pageSize } = table.getState().pagination
    const totalRows = manualPagination ? data.length : table.getFilteredRowModel().rows.length
    const placeholderCount = totalRows >= pageSize && rows.length < pageSize ? pageSize - rows.length : 0
    return (
      <>
        {rows.map(renderRow)}
        <PlaceholderRows count={placeholderCount} columnCount={columnCount} rowHeight={rowHeight} />
      </>
    )
  }

  const paginatedMinHeight = isGroupingActive
    ? undefined
    : Math.min(manualPagination ? data.length : table.getFilteredRowModel().rows.length, table.getState().pagination.pageSize) * rowHeight

  return (
    <ScrollArea
      ref={scrollContainerRef}
      className="h-full w-full"
      style={isGroupingActive ? { maxHeight: VIRTUAL_CONTAINER_HEIGHT } : { minHeight: paginatedMinHeight }}
    >
      <Table>
        <TableHeader>
          <DataTableHeader table={table} enableColumnResizing={enableColumnResizing} enableColumnReorder={enableColumnReorder} />
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={columnCount} isCustom={!!emptyState}>{emptyState ?? "Nessun risultato."}</EmptyRow>
          ) : isGroupingActive ? (
            renderGroupedRows()
          ) : (
            renderPaginatedRows()
          )}
        </TableBody>
      </Table>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}
