// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { flexRender, type Row } from "@tanstack/react-table"
import { cn } from "@/lib/utils"
import { TableCell, TableRow } from "@/components/ui/table"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { DataTableProps } from "../types"
import { CELL_CLICK_DELAY_MS } from "../types"

export interface DataTableRowProps<TData, TValue> {
  row: Row<TData>
  rowHeight: number
  cellPadding: string
  props: Readonly<DataTableProps<TData, TValue>>
}

function DataTableRowInner<TData, TValue>({
  row,
  rowHeight,
  cellPadding,
  props,
}: DataTableRowProps<TData, TValue>) {
  const {
    getRowStyles,
    getRowClassName,
    getCellClassName,
    onRowDoubleClick,
    onCellActivate,
    cellActivateExcludedColumnIds,
    renderRowContextMenuContent,
    rowContextMenuExcludedColumnIds,
    enableColumnResizing,
  } = props

  const cellClickTimerRef = React.useRef<number | null>(null)
  
  React.useEffect(() => {
    return () => {
      if (cellClickTimerRef.current) window.clearTimeout(cellClickTimerRef.current)
    }
  }, [])

  const cellActivateExcludedColumnIdSet = React.useMemo(
    () => new Set(cellActivateExcludedColumnIds ?? []),
    [cellActivateExcludedColumnIds]
  )

  const excludedContextMenuColumnIds = React.useMemo(() => {
    return new Set(rowContextMenuExcludedColumnIds ?? ["select", "actions"])
  }, [rowContextMenuExcludedColumnIds])

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
      style={{ height: rowHeight }}
      onDoubleClick={() => {
        if (cellClickTimerRef.current) window.clearTimeout(cellClickTimerRef.current)
        onRowDoubleClick?.(row.original)
      }}
    >
      {row.getVisibleCells().map((cell) => {
        const cellInner = flexRender(cell.column.columnDef.cell, cell.getContext())
        const canActivateCell = !!onCellActivate && !cellActivateExcludedColumnIdSet.has(cell.column.id)
        const cellClassName = cn(
          cellPadding,
          rowStyles?.cellClassNameByColumnId?.[cell.column.id] ?? getCellClassName?.(row.original, cell.column.id),
          canActivateCell && "cursor-pointer"
        )
        const cellStyle = enableColumnResizing ? { width: cell.column.getSize() } : undefined

        const handleCellClick = (e: React.MouseEvent<HTMLTableCellElement>) => {
          if (!canActivateCell) return
          if ((e.target as HTMLElement).closest("button, a, input, [role='button'], [data-no-cell-filter]")) return
          if (cellClickTimerRef.current) window.clearTimeout(cellClickTimerRef.current)
          cellClickTimerRef.current = window.setTimeout(() => {
            onCellActivate?.(cell.column.id, row.original)
          }, CELL_CLICK_DELAY_MS)
        }

        const shouldWrapWithContextMenu = !!renderRowContextMenuContent && !excludedContextMenuColumnIds.has(cell.column.id)

        if (!shouldWrapWithContextMenu) {
          return (
            <TableCell key={cell.id} className={cellClassName} style={cellStyle} onClick={handleCellClick}>
              {cellInner}
            </TableCell>
          )
        }

        return (
          <ContextMenu key={cell.id}>
            <ContextMenuTrigger asChild>
              <TableCell className={cellClassName} style={cellStyle} onClick={handleCellClick}>
                {cellInner}
              </TableCell>
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

export const DataTableRow = React.memo(DataTableRowInner) as typeof DataTableRowInner
