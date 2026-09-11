// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { flexRender, type Table as TanstackTable } from "@tanstack/react-table"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { TableHead, TableRow } from "@/components/ui/table"

export interface DataTableHeaderProps<TData> {
  table: TanstackTable<TData>
  enableColumnResizing?: boolean
}

function DataTableHeaderInner<TData>({ table, enableColumnResizing }: DataTableHeaderProps<TData>) {
  const { t } = useTranslation()

  return (
    <>
      {table.getHeaderGroups().map((headerGroup) => (
        <TableRow key={headerGroup.id}>
          {headerGroup.headers.map((header) => (
            <TableHead
              key={header.id}
              style={enableColumnResizing ? { position: "relative", width: header.getSize() } : undefined}
            >
              {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
              {enableColumnResizing && header.column.getCanResize() && (
                <button
                  type="button"
                  aria-label={t("toolbar.settings.resizeColumn")}
                  onMouseDown={header.getResizeHandler()}
                  onTouchStart={header.getResizeHandler()}
                  className={cn(
                    "absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none",
                    "bg-transparent hover:bg-border",
                    header.column.getIsResizing() && "bg-primary"
                  )}
                />
              )}
            </TableHead>
          ))}
        </TableRow>
      ))}
    </>
  )
}

export const DataTableHeader = React.memo(DataTableHeaderInner) as typeof DataTableHeaderInner
