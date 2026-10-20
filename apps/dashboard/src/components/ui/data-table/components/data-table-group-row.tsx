// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import type { Row, Table as TanstackTable } from "@tanstack/react-table"
import { ChevronRight, ChevronDown } from "reicon-react"
import { TableCell, TableRow } from "@/components/ui/table"

export interface DataTableGroupRowProps<TData> {
  row: Row<TData>
  rowHeight: number
  table: TanstackTable<TData>
}

function DataTableGroupRowInner<TData>({ row, rowHeight, table }: DataTableGroupRowProps<TData>) {
  const isExpanded = row.getIsExpanded()
  const groupValue = row.groupingValue
  const subRowCount = row.subRows.length

  return (
    <TableRow
      key={row.id}
      className="cursor-pointer bg-muted/40 hover:bg-muted/60"
      style={{ height: rowHeight }}
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

export const DataTableGroupRow = React.memo(DataTableGroupRowInner) as typeof DataTableGroupRowInner
