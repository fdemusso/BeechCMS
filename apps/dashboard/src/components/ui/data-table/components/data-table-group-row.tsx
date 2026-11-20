// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import type { Row, Table as TanstackTable } from "@tanstack/react-table"
import { ChevronRight } from "@/components/icons"
import { TableCell, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { STICKY_GROUP_CLASS } from "../styles"

export interface DataTableGroupRowProps<TData> {
  row: Row<TData>
  rowHeight: number
  table: TanstackTable<TData>
  /** A prop on purpose: the row object is reused when only the expanded state changes, so React.memo would skip the repaint. */
  isExpanded: boolean
  onToggle: (groupId: string) => void
}

function DataTableGroupRowInner<TData>({ row, rowHeight, table, isExpanded, onToggle }: DataTableGroupRowProps<TData>) {
  const groupValue = row.groupingValue
  const subRowCount = row.subRows.length

  return (
    <TableRow
      key={row.id}
      className="cursor-pointer select-none"
      aria-expanded={isExpanded}
      style={{ height: rowHeight }}
      onClick={() => onToggle(row.id)}
    >
      <TableCell
        colSpan={table.getVisibleLeafColumns().length}
        className={cn("py-0", STICKY_GROUP_CLASS)}
      >
        <div className="flex items-center gap-2 px-1">
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
              isExpanded ? "rotate-90 duration-(--duration-enter)" : "duration-(--duration-exit)"
            )}
          />
          <span className="text-sm font-medium">
            {groupValue == null || groupValue === "" ? "—" : String(groupValue)}
          </span>
          <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
            {subRowCount}
          </span>
        </div>
      </TableCell>
    </TableRow>
  )
}

export const DataTableGroupRow = React.memo(DataTableGroupRowInner) as typeof DataTableGroupRowInner
