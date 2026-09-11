// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import type { Table as TanstackTable } from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableRow, TableHeader } from "@/components/ui/table"
import { DataTableHeader } from "./data-table-header"
import { DataTableGroupRow } from "./data-table-group-row"
import { DataTableRow } from "./data-table-row"
import type { DataTableProps } from "../types"
import { VIRTUAL_CONTAINER_HEIGHT } from "../types"

export interface DataTableBodyProps<TData, TValue> {
  table: TanstackTable<TData>
  isGroupingActive: boolean
  rowHeight: number
  cellPadding: string
  props: Readonly<DataTableProps<TData, TValue>>
}

export function DataTableBody<TData, TValue>({
  table,
  isGroupingActive,
  rowHeight,
  cellPadding,
  props,
}: DataTableBodyProps<TData, TValue>) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)
  const flatRows = table.getRowModel().rows

  const virtualizer = useVirtualizer({
    count: isGroupingActive ? flatRows.length : 0,
    getScrollElement: () => (isGroupingActive ? scrollContainerRef.current : null),
    estimateSize: () => rowHeight,
    overscan: 5,
  })

  const virtualItems = isGroupingActive ? virtualizer.getVirtualItems() : []
  const totalVirtualSize = isGroupingActive ? virtualizer.getTotalSize() : 0
  const topPadding = virtualItems[0]?.start ?? 0
  const bottomPadding = totalVirtualSize - (virtualItems.at(-1)?.end ?? 0)

  const renderRowItem = (row: (typeof flatRows)[number]) => {
    if (row.getIsGrouped()) {
      return <DataTableGroupRow key={row.id} row={row} rowHeight={rowHeight} table={table} />
    }
    return (
      <DataTableRow
        key={row.id}
        row={row}
        rowHeight={rowHeight}
        cellPadding={cellPadding}
        props={props}
      />
    )
  }

  const { columns, emptyState, enableColumnResizing, manualPagination, data } = props

  if (isGroupingActive) {
    return (
      <ScrollArea
        ref={scrollContainerRef}
        className="w-full"
        style={{ maxHeight: VIRTUAL_CONTAINER_HEIGHT }}
      >
        <Table>
          <TableHeader>
            <DataTableHeader table={table} enableColumnResizing={enableColumnResizing} />
          </TableHeader>
          <TableBody>
            {flatRows.length > 0 ? (
              <>
                {topPadding > 0 && (
                  <TableRow style={{ height: topPadding }}>
                    <TableCell colSpan={table.getVisibleLeafColumns().length} />
                  </TableRow>
                )}
                {virtualItems.map((vRow) => renderRowItem(flatRows[vRow.index]))}
                {bottomPadding > 0 && (
                  <TableRow style={{ height: bottomPadding }}>
                    <TableCell colSpan={table.getVisibleLeafColumns().length} />
                  </TableRow>
                )}
              </>
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className={emptyState ? "text-center" : "h-24 text-center"}>
                  {emptyState ?? "Nessun risultato."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    )
  }

  // Modalità paginata (grouping inattivo)
  return (
    <ScrollArea
      className="h-full w-full"
      style={{
        minHeight: (() => {
          const totalRows = manualPagination ? data.length : table.getFilteredRowModel().rows.length
          const pagination = table.getState().pagination
          const rowCount = Math.min(totalRows, pagination.pageSize)
          return rowCount * rowHeight
        })(),
      }}
    >
      <Table>
        <TableHeader>
          <DataTableHeader table={table} enableColumnResizing={enableColumnResizing} />
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            <>
              {table.getRowModel().rows.map((row) => renderRowItem(row))}
              {(() => {
                const totalRows = manualPagination ? data.length : table.getFilteredRowModel().rows.length
                const visibleRows = table.getRowModel().rows.length
                const pagination = table.getState().pagination
                const placeholderCount =
                  totalRows >= pagination.pageSize && visibleRows < pagination.pageSize
                    ? pagination.pageSize - visibleRows
                    : 0
                const colCount = table.getVisibleLeafColumns().length
                return Array.from({ length: placeholderCount }, (_, i) => (
                  <TableRow key={`placeholder-${i}`} className="border-b border-dashed" style={{ height: rowHeight }}>
                    {Array.from({ length: colCount }, (_, colIndex) => (
                      <TableCell key={colIndex} className="align-middle" />
                    ))}
                  </TableRow>
                ))
              })()}
            </>
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className={emptyState ? "text-center" : "h-24 text-center"}>
                {emptyState ?? "Nessun risultato."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}
