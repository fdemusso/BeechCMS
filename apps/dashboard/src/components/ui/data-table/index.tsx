// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useDataTableState } from "./hooks/use-data-table-state"
import { useDataTableSelection } from "./hooks/use-data-table-selection"
import { DataTableBody } from "./components/data-table-body"
import { DataTablePagination } from "./components/data-table-pagination"
import type { DataTableProps } from "./types"

export { ROW_HEIGHT_PX } from "./types"
export type { DataTableProps } from "./types"

function DataTableInner<TData, TValue>(
  props: Readonly<DataTableProps<TData, TValue>>
) {
  const { table, isGroupingActive, rowHeight, cellPadding } = useDataTableState(props)

  const selectionEnabled = props.rowSelection !== undefined || !!props.onRowSelectionChange
  const selection = useDataTableSelection(table, selectionEnabled)

  return (
    <div className="flex h-full w-full flex-col">
      <div
        className="group/dt min-h-0 flex-1 rounded-md border outline-none"
        data-datatable-root=""
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
      </div>

      {!isGroupingActive && (
        <DataTablePagination
          table={table}
          totalRows={props.totalRows}
        />
      )}
    </div>
  )
}

export const DataTable = React.memo(DataTableInner) as <TData, TValue>(
  props: Readonly<DataTableProps<TData, TValue>>
) => React.ReactElement
