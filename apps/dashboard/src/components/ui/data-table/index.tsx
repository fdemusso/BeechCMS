// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// Layout invariants (frame clipping, stable page height, memoized footer props): read ./README.md before changing the structure.

import * as React from "react"
import { useDataTableState } from "./hooks/use-data-table-state"
import { useDataTableSelection } from "./hooks/use-data-table-selection"
import { DataTableBody } from "./components/data-table-body"
import { DataTablePagination } from "./components/data-table-pagination"
import type { DataTableProps } from "./types"
import { TAIL_SEPARATOR_CLASS } from "./styles"
import { cn } from "@/lib/utils"

export { ROW_HEIGHT_PX } from "./types"
export type { DataTableProps } from "./types"

function DataTableInner<TData, TValue>(
  props: Readonly<DataTableProps<TData, TValue>>
) {
  const { table, isGroupingActive, rowHeight, cellPadding } = useDataTableState(props)

  const selectionEnabled = props.rowSelection !== undefined || !!props.onRowSelectionChange
  const selection = useDataTableSelection(table, {
    enabled: selectionEnabled,
    rowHeight,
    onRowActivate: props.onRowDoubleClick,
    onDeleteRows: props.onDeleteRows,
  })
  // Selection is keyed by row id and survives page changes, so count it from state:
  // the row models only know the rows of the current page.
  const selectedCount = Object.values(table.getState().rowSelection).filter(Boolean).length

  return (
    <div className="flex h-full w-full flex-col">
      {/* Frame: sole owner of the outer border; overflow-hidden clips the header background to the rounded corners. */}
      <div
        className="group/dt flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border outline-none"
        data-datatable-root=""
        role="group"
        tabIndex={selectionEnabled ? 0 : undefined}
        onKeyDown={selection.handleKeyDown}
      >
        <DataTableBody
          table={table}
          isGroupingActive={isGroupingActive}
          rowHeight={rowHeight}
          cellPadding={cellPadding}
          props={props}
          selection={selection}
        />
        <div aria-hidden className={cn("min-h-0 flex-1", TAIL_SEPARATOR_CLASS)} />
      </div>

      <DataTablePagination
        table={table}
        totalRows={props.totalRows}
        selectedCount={selectedCount}
        hidePagination={isGroupingActive}
        pageIndex={table.getState().pagination.pageIndex}
        pageCount={table.getPageCount()}
      />
    </div>
  )
}

export const DataTable = React.memo(DataTableInner) as <TData, TValue>(
  props: Readonly<DataTableProps<TData, TValue>>
) => React.ReactElement
