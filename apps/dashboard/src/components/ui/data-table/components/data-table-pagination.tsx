// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import type { Table as TanstackTable } from "@tanstack/react-table"
import { useTranslation } from "react-i18next"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

export interface DataTablePaginationProps<TData> {
  table: TanstackTable<TData>
  totalRows?: number
}

function DataTablePaginationInner<TData>({ table, totalRows }: DataTablePaginationProps<TData>) {
  const { t } = useTranslation()

  return (
    <div className="flex shrink-0 items-center justify-between gap-4 py-4">
      {table.getFilteredSelectedRowModel().rows.length > 0 && (
        <div className="text-muted-foreground text-sm whitespace-nowrap">
          {table.getFilteredSelectedRowModel().rows.length} di{" "}
          {totalRows ?? table.getFilteredRowModel().rows.length} selezionate
        </div>
      )}
      <Pagination className="ml-auto justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              text={t("common.previous")}
              href="#"
              onClick={(e) => {
                e.preventDefault()
                if (table.getCanPreviousPage()) table.previousPage()
              }}
              className={table.getCanPreviousPage() ? undefined : "pointer-events-none opacity-50"}
            />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink
              href="#"
              isActive
              onClick={(e) => e.preventDefault()}
              className="pointer-events-none select-none tabular-nums"
            >
              {table.getState().pagination.pageIndex + 1}
            </PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              text={t("common.next")}
              href="#"
              onClick={(e) => {
                e.preventDefault()
                if (table.getCanNextPage()) table.nextPage()
              }}
              className={table.getCanNextPage() ? undefined : "pointer-events-none opacity-50"}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}

export const DataTablePagination = React.memo(DataTablePaginationInner) as typeof DataTablePaginationInner
