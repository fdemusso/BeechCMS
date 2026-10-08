// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { flexRender, type Header, type Table as TanstackTable } from "@tanstack/react-table"
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { TableHead, TableRow } from "@/components/ui/table"

export interface DataTableHeaderProps<TData> {
  table: TanstackTable<TData>
  enableColumnResizing?: boolean
  /** Horizontal drag of header cells. Columns that cannot be hidden (select, actions) stay put. */
  enableColumnReorder?: boolean
}

interface HeaderCellProps<TData> {
  header: Header<TData, unknown>
  enableColumnResizing?: boolean
  sortable: boolean
}

function HeaderCell<TData>({ header, enableColumnResizing, sortable }: HeaderCellProps<TData>) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: header.column.id,
    disabled: !sortable,
  })

  return (
    <TableHead
      ref={sortable ? setNodeRef : undefined}
      {...(sortable ? listeners : undefined)}
      aria-roledescription={sortable ? attributes["aria-roledescription"] : undefined}
      style={{
        ...(enableColumnResizing ? { position: "relative", width: header.getSize() } : undefined),
        ...(sortable && transform ? { transform: `translate3d(${transform.x}px, 0, 0)` } : undefined),
        ...(isDragging ? { zIndex: 10, opacity: 0.85 } : undefined),
      }}
      className={cn(
        sortable && "cursor-grab select-none touch-none",
        isDragging && "cursor-grabbing bg-muted shadow-sm"
      )}
    >
      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
      {enableColumnResizing && header.column.getCanResize() && (
        <button
          type="button"
          aria-label={t("toolbar.settings.resizeColumn")}
          onMouseDown={header.getResizeHandler()}
          onTouchStart={header.getResizeHandler()}
          // Keeps the resize handle from starting a column drag on the parent header.
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none",
            "bg-transparent hover:bg-border",
            header.column.getIsResizing() && "bg-primary"
          )}
        />
      )}
    </TableHead>
  )
}

function DataTableHeaderInner<TData>({
  table,
  enableColumnResizing,
  enableColumnReorder,
}: DataTableHeaderProps<TData>) {
  // Distance constraint: a plain click (sort) never turns into a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const reorderableIds = React.useMemo(
    () =>
      enableColumnReorder
        ? table.getVisibleLeafColumns().filter((c) => c.getCanHide()).map((c) => c.id)
        : [],
    // getVisibleLeafColumns follows visibility/order state, which re-renders this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enableColumnReorder, table, table.getState().columnVisibility, table.getState().columnOrder]
  )

  const handleDragEnd = React.useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) return
      // Full order (hidden columns included) so a hidden column keeps its slot.
      const ids = table.getAllLeafColumns().filter((c) => c.getCanHide()).map((c) => c.id)
      const from = ids.indexOf(String(active.id))
      const to = ids.indexOf(String(over.id))
      if (from < 0 || to < 0) return
      table.setColumnOrder(arrayMove(ids, from, to))
    },
    [table]
  )

  const rows = table.getHeaderGroups().map((headerGroup) => (
    <TableRow key={headerGroup.id} className="hover:bg-transparent">
      {headerGroup.headers.map((header) => (
        <HeaderCell
          key={header.id}
          header={header}
          enableColumnResizing={enableColumnResizing}
          sortable={reorderableIds.includes(header.column.id)}
        />
      ))}
    </TableRow>
  ))

  if (!enableColumnReorder) return <>{rows}</>

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={reorderableIds} strategy={horizontalListSortingStrategy}>
        {rows}
      </SortableContext>
    </DndContext>
  )
}

// Not memoized: `table` is a stable instance, so React.memo would skip re-renders and freeze
// header cells (e.g. the select-all checkbox) on stale state.
export const DataTableHeader = DataTableHeaderInner
