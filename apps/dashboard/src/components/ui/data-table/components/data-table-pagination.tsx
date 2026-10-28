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
  /** Selected rows across all pages. A prop so the memoized footer re-renders on selection changes. */
  selectedCount: number
  /** Hides the page controls (grouping mode), keeping the selection counter. */
  hidePagination?: boolean
  /**
   * Current page and page count. `table` is a stable reference, so the memoized footer only
   * re-renders on prop changes: without these it would never repaint on page change.
   */
  pageIndex: number
  pageCount: number
}

function DataTablePaginationInner<TData>({
  table,
  totalRows,
  selectedCount,
  hidePagination = false,
  pageIndex,
  pageCount,
}: DataTablePaginationProps<TData>) {
  const canPreviousPage = pageIndex > 0
  const canNextPage = pageIndex < pageCount - 1
  const { t } = useTranslation()
  // Walks every row, so only computed when the counter is actually shown.
  const totalCount =
    selectedCount > 0
      ? (totalRows ?? table.getFilteredRowModel().flatRows.filter((r) => !r.getIsGrouped()).length)
      : 0

  return (
    <div className="flex shrink-0 items-center justify-between gap-4 py-4">
      {selectedCount > 0 && (
        <div className="text-muted-foreground text-sm whitespace-nowrap">
          {t("common.selectedOfTotal", { count: selectedCount, selected: selectedCount, total: totalCount })}
        </div>
      )}
      {!hidePagination && (
      <Pagination className="ml-auto justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              text={t("common.previous")}
              href="#"
              onClick={(e) => {
                e.preventDefault()
                if (canPreviousPage) table.previousPage()
              }}
              className={canPreviousPage ? undefined : "pointer-events-none opacity-50"}
            />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink
              href="#"
              isActive
              onClick={(e) => e.preventDefault()}
              className="pointer-events-none select-none tabular-nums"
            >
              {pageIndex + 1}
            </PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              text={t("common.next")}
              href="#"
              onClick={(e) => {
                e.preventDefault()
                if (canNextPage) table.nextPage()
              }}
              className={canNextPage ? undefined : "pointer-events-none opacity-50"}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
      )}
    </div>
  )
}

export const DataTablePagination = React.memo(DataTablePaginationInner) as typeof DataTablePaginationInner
