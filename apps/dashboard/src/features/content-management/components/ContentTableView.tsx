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
import { Copy, Edit as Pencil, Filter, Trash2 } from "@/components/icons"
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
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
  columnOrder: string[]
  onColumnOrderChange: (order: string[]) => void
  columnSizing: ColumnSizingState
  onColumnSizingChange: (updater: ColumnSizingState | ((old: ColumnSizingState) => ColumnSizingState)) => void
  density: TableDensity
  getRowStyles: (entry: ContentEntry) => { rowClassName?: string; cellClassNameByColumnId: Record<string, string | undefined> }
  rowSelection: RowSelectionState
  onRowSelectionChange: (updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) => void
  grouping: GroupingState
  /** localStorage key of the closed groups of this view + grouped field. */
  collapsedGroupsStorageKey?: string
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
  /** Items of the column-header context menu; null on a column with no shortcut. */
  renderHeaderContextMenuContent?: (columnId: string) => React.ReactNode
  /** Adds a toolbar filter for the value of `columnId` in `entry` (context menu). */
  onCellFilter: (columnId: string, entry: ContentEntry) => void
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
  columnOrder,
  onColumnOrderChange,
  columnSizing,
  onColumnSizingChange,
  density,
  getRowStyles,
  rowSelection,
  onRowSelectionChange,
  grouping,
  collapsedGroupsStorageKey,
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
  onCellFilter,
  renderHeaderContextMenuContent,
}: ContentTableViewProps) {
  const { t } = useTranslation()

  const handleRowDoubleClick = React.useCallback(
    (entry: ContentEntry) => onEdit(entry.id),
    [onEdit]
  )

  const handleCellCopy = React.useCallback(
    (_columnId: string, _entry: ContentEntry, cell: HTMLElement) => {
      // Copy what the cell shows, not the raw stored value.
      const text = (cell.innerText ?? cell.textContent ?? "").trim()
      if (!text) return
      navigator.clipboard.writeText(text).then(
        () => toast.success(t("content.list.cellCopied")),
        () => toast.error(t("common.copyFailed"))
      )
    },
    [t]
  )

  const handleDeleteRows = React.useCallback(
    (entries: ContentEntry[]) => {
      if (can("content:delete", slug)) onBulkDelete(entries.map((entry) => entry.id))
    },
    [can, onBulkDelete, slug]
  )

  const memoizedExcludedColumns = React.useMemo(() => ["select", "actions"], [])

  const renderContextMenuContent = React.useCallback(
    (entry: ContentEntry, columnId: string) => (
      <>
        <ContextMenuLabel>{t("content.actions.label")}</ContextMenuLabel>
        {selectedIds.length > 1 ? (
          <ContextMenuItem
            variant="destructive"
            onSelect={() => onBulkDelete(selectedIds)}
            disabled={!can("content:delete", slug)}
          >
            <Trash2 className="size-4" />
            {t("common.action.delete")}
            <ContextMenuShortcut>Del</ContextMenuShortcut>
          </ContextMenuItem>
        ) : (
          <>
            <ContextMenuItem
              onSelect={() => {
                navigator.clipboard.writeText(entry.id).then(
                  () => toast.success(t("common.copied")),
                  () => toast.error(t("common.copyFailed"))
                )
              }}
            >
              <Copy className="size-4" />
              {t("content.actions.copyId")}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onCellFilter(columnId, entry)}>
              <Filter className="size-4" />
              {t("content.actions.filterByValue")}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => onEdit(entry.id)} disabled={!can("content:update", slug)}>
              <Pencil className="size-4" />
              {t("common.edit")}
              <ContextMenuShortcut>Enter</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem
              variant="destructive"
              onSelect={() => onDelete(entry.id)}
              disabled={!can("content:delete", slug)}
            >
              <Trash2 className="size-4" />
              {t("common.action.delete")}
              <ContextMenuShortcut>Del</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        )}
      </>
    ),
    [selectedIds, onBulkDelete, onEdit, onDelete, onCellFilter, can, slug, t]
  )

  const tableEmptyState = React.useMemo(
    () =>
      isEmptySeed ? (
        <SmallCta
          svgPath={`${import.meta.env.BASE_URL}working.svg`}
          title={t("content.list.empty.title")}
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
      columnOrder={columnOrder}
      onColumnOrderChange={onColumnOrderChange}
      columnSizing={columnSizing}
      onColumnSizingChange={onColumnSizingChange}
      density={density}
      getRowStyles={getRowStyles}
      rowSelection={rowSelection}
      onRowSelectionChange={onRowSelectionChange}
      onRowDoubleClick={handleRowDoubleClick}
      onDeleteRows={handleDeleteRows}
      onCellActivate={handleCellCopy}
      cellActivateExcludedColumnIds={memoizedExcludedColumns}
      grouping={grouping}
      collapsedGroupsStorageKey={collapsedGroupsStorageKey}
      onGroupingChange={onGroupingChange}
      renderRowContextMenuContent={renderContextMenuContent}
      renderHeaderContextMenuContent={renderHeaderContextMenuContent}
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
