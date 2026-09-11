// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import type {
  ColumnDef,
  ColumnFiltersState,
  ColumnSizingState,
  GroupingState,
  RowSelectionState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table"
import type { Seed } from "@beechcms/core"
import { DataTable } from "@/components/ui/data-table"
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import { SmallCta } from "@/components/ui/small-cta"
import { toast } from "sonner"
import type { ContentEntry } from "@/lib/dynamic-columns"
import type { TableDensity } from "@/lib/density"

export interface ContentTableViewProps {
  seed: Seed
  slug: string
  data: ContentEntry[]
  columns: ColumnDef<ContentEntry, any>[]
  tableKey: string
  initialHiddenColumns: string[]
  columnVisibility: VisibilityState
  onColumnVisibilityChange: (updater: VisibilityState | ((old: VisibilityState) => VisibilityState)) => void
  columnSizing: ColumnSizingState
  onColumnSizingChange: (updater: ColumnSizingState | ((old: ColumnSizingState) => ColumnSizingState)) => void
  density: TableDensity
  getRowStyles: (entry: ContentEntry) => { rowClassName?: string; cellClassNameByColumnId: Record<string, string | undefined> }
  rowSelection: RowSelectionState
  onRowSelectionChange: (updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) => void
  grouping: GroupingState
  onGroupingChange: (updater: GroupingState | ((old: GroupingState) => GroupingState)) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  pageIndex: number
  onPageIndexChange: (index: number) => void
  pageCount: number
  totalRows: number
  tableSearch: string
  onSearchChange: (search: string) => void
  sorting: SortingState
  onSortingChange: (next: SortingState) => void
  columnFilters: ColumnFiltersState
  isEmptySeed: boolean
  selectedIds: string[]
  can: (permission: any, resource: string) => boolean
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onBulkDelete: (ids: string[]) => void
  onCreate: (defaultValues?: Record<string, unknown> | React.SyntheticEvent | Event) => void
  onCellActivate: (columnId: string, entry: ContentEntry) => void
}

export function ContentTableView({
  seed,
  slug,
  data,
  columns,
  tableKey,
  initialHiddenColumns,
  columnVisibility,
  onColumnVisibilityChange,
  columnSizing,
  onColumnSizingChange,
  density,
  getRowStyles,
  rowSelection,
  onRowSelectionChange,
  grouping,
  onGroupingChange,
  pageSize,
  onPageSizeChange,
  pageIndex,
  onPageIndexChange,
  pageCount,
  totalRows,
  tableSearch,
  onSearchChange,
  sorting,
  onSortingChange,
  columnFilters,
  isEmptySeed,
  selectedIds,
  can,
  onEdit,
  onDelete,
  onBulkDelete,
  onCreate,
  onCellActivate,
}: ContentTableViewProps) {
  const { t } = useTranslation()

  const handleRowDoubleClick = React.useCallback(
    (entry: ContentEntry) => onEdit(entry.id),
    [onEdit]
  )

  const memoizedExcludedColumns = React.useMemo(() => ["select", "actions"], [])

  const renderContextMenuContent = React.useCallback(
    (entry: ContentEntry) => (
      <>
        <ContextMenuLabel>Actions</ContextMenuLabel>
        {selectedIds.length > 1 ? (
          <ContextMenuItem
            onSelect={() => onBulkDelete(selectedIds)}
            className="text-destructive focus:text-destructive"
          >
            Delete
          </ContextMenuItem>
        ) : (
          <>
            <ContextMenuItem
              onSelect={() => {
                navigator.clipboard.writeText(entry.id).then(
                  () => toast.success("ID copied"),
                  () => toast.error("Copy failed")
                )
              }}
            >
              Copy ID
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => onEdit(entry.id)} disabled={!can("content:update", slug)}>
              Edit
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => onDelete(entry.id)}
              className="text-destructive focus:text-destructive"
              disabled={!can("content:delete", slug)}
            >
              Delete
            </ContextMenuItem>
          </>
        )}
      </>
    ),
    [selectedIds, onBulkDelete, onEdit, onDelete, can, slug]
  )

  const tableEmptyState = React.useMemo(
    () =>
      isEmptySeed ? (
        <SmallCta
          svgPath={`${import.meta.env.BASE_URL}working.svg`}
          title={t("content.list.emptyTitle")}
          buttonText={t("content.list.emptyCreateFirst", { label: seed.label })}
          onButtonClick={onCreate}
          buttonDisabled={!can("content:create", slug)}
          buttonTooltip="Manca il permesso 'content:create'"
        />
      ) : (
        <SmallCta
          svgPath={`${import.meta.env.BASE_URL}noResult.svg`}
          title={t("common.noResults")}
        />
      ),
    [isEmptySeed, t, seed.label, onCreate, can, slug]
  )

  return (
    <DataTable
      key={tableKey}
      columns={columns}
      data={data}
      initialHiddenColumns={initialHiddenColumns}
      enableColumnResizing
      columnSizing={columnSizing}
      onColumnSizingChange={onColumnSizingChange}
      density={density}
      getRowStyles={getRowStyles}
      rowSelection={rowSelection}
      onRowSelectionChange={onRowSelectionChange}
      onRowDoubleClick={handleRowDoubleClick}
      onCellActivate={onCellActivate}
      cellActivateExcludedColumnIds={memoizedExcludedColumns}
      grouping={grouping}
      onGroupingChange={onGroupingChange}
      renderRowContextMenuContent={renderContextMenuContent}
      pageSize={pageSize}
      onPageSizeChange={onPageSizeChange}
      pageIndex={pageIndex}
      onPageIndexChange={onPageIndexChange}
      pageCount={pageCount}
      totalRows={totalRows}
      manualPagination
      manualSorting
      manualFiltering
      columnVisibility={columnVisibility}
      onColumnVisibilityChange={onColumnVisibilityChange}
      globalFilter={tableSearch}
      onGlobalFilterChange={onSearchChange}
      sorting={sorting}
      onSortingChange={onSortingChange}
      columnFilters={columnFilters}
      emptyState={tableEmptyState}
    />
  )
}
