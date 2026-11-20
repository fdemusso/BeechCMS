// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Palette, RowVertical as Rows3 } from "@/components/icons"
import { ContextMenuItem } from "@/components/ui/context-menu"
import type { ViewDefinition, ViewRendererProps } from "@/features/shared"
import { usePermissions } from "@/features/shared/hooks/use-permissions"
import type { ContentEntry } from "@/lib/dynamic-columns"
import { useContentTableConfig } from "../hooks/use-content-table-config"
import { ContentTableView } from "./ContentTableView"
import { toTableRowStyles } from "./table-row-styles"

/** The Table View Type's renderer: owns column/grouping derivation, the harness owns layout state. */
function ContentTableRenderer({ seed, slug, viewId, query, layout, formatElement, entries, columnActions }: ViewRendererProps) {
  const { t } = useTranslation()
  const { can } = usePermissions()

  const tableConfig = useContentTableConfig({
    seed,
    data: query.data,
    pageSize: query.pageSize,
    layout,
    selectedIds: entries.selectedIds,
    handleEdit: entries.handleEdit,
    handleDelete: entries.handleDelete,
    handleBulkDelete: entries.handleBulkDelete,
    handleBulkEdit: entries.handleBulkEdit,
    t,
  })

  const getRowStyles = React.useCallback(
    (entry: ContentEntry) => toTableRowStyles(formatElement(entry)),
    [formatElement]
  )

  const { groupBy, setGroupBy } = layout
  const renderHeaderContextMenuContent = React.useCallback(
    (columnId: string) => {
      if (!columnActions) return null
      const canGroup = columnActions.canGroupBy(columnId)
      const canFormat = columnActions.canFormat(columnId)
      if (!canGroup && !canFormat) return null
      return (
        <>
          {canGroup &&
            (groupBy === columnId ? (
              <ContextMenuItem onSelect={() => setGroupBy(null)}>
                <Rows3 className="size-4" />
                {t("toolbar.headerMenu.ungroup")}
              </ContextMenuItem>
            ) : (
              <ContextMenuItem onSelect={() => setGroupBy(columnId)}>
                <Rows3 className="size-4" />
                {t("toolbar.headerMenu.groupBy")}
              </ContextMenuItem>
            ))}
          {canFormat && (
            <ContextMenuItem onSelect={() => columnActions.addConditionalRule(columnId)}>
              <Palette className="size-4" />
              {t("toolbar.headerMenu.conditionalColor")}
            </ContextMenuItem>
          )}
        </>
      )
    },
    [columnActions, groupBy, setGroupBy, t]
  )

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <ContentTableView
      seed={seed}
      slug={slug}
      data={tableConfig.rows}
      columns={tableConfig.columns}
      tableKey={tableConfig.tableKey}
      initialHiddenColumns={tableConfig.initialHiddenColumns}
      columnVisibility={layout.columnVisibility}
      onColumnVisibilityChange={layout.setColumnVisibility}
      columnOrder={layout.columnOrder}
      onColumnOrderChange={layout.setColumnOrder}
      columnSizing={tableConfig.columnSizing}
      onColumnSizingChange={tableConfig.setColumnSizing}
      density={layout.density}
      getRowStyles={getRowStyles}
      rowSelection={entries.rowSelection}
      onRowSelectionChange={entries.setRowSelection}
      collapsedGroupsStorageKey={tableConfig.grouping[0] ? `beech:groups-closed:${slug}:${viewId}:${tableConfig.grouping[0]}` : undefined}
      grouping={tableConfig.grouping}
      onGroupingChange={tableConfig.handleGroupingChange}
      pageSize={query.pageSize}
      onPageSizeChange={query.handlePageSizeChange}
      pageIndex={query.pageIndex}
      onPageIndexChange={query.setPageIndex}
      pageCount={query.pageCount}
      totalRows={query.totalRows}
      tableSearch={query.tableSearch}
      onSearchChange={query.setTableSearch}
      sorting={query.sorting}
      onSortingChange={query.handleTableSortingChange}
      columnFilters={query.columnFilters}
      isEmptySeed={query.isEmptySeed}
      selectedIds={entries.selectedIds}
      can={can}
      onEdit={entries.handleEdit}
      onDelete={entries.handleDelete}
      onBulkDelete={entries.handleBulkDelete}
      onCreate={entries.handleCreate}
      onCellFilter={query.applyCellFilter}
      renderHeaderContextMenuContent={renderHeaderContextMenuContent}
    />
  )
}

export const TABLE_VIEW_DEFINITION: ViewDefinition = {
  type: "table",
  labelKey: "content.list.table",
  enabledTools: ["filter", "sort", "automation", "search", "settings", "create", "transfer"],
  settings: ["groupBy", "conditionalFormats", "columns", "pageSize", "density"],
  Renderer: ContentTableRenderer,
}
