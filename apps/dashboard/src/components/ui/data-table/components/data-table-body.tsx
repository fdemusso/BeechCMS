// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * DataTable skeleton (outside → inside). Each layer owns exactly one concern:
 *
 *   DataTable (index.tsx)
 *   ├─ frame          rounded border + overflow-hidden: the ONLY place that draws the outer
 *   │                 border and clips children to its rounded corners. Anything painted inside
 *   │                 (header background, row hover) must NOT draw its own outer edge.
 *   │  └─ DataTableBody
 *   │     └─ ScrollArea        scrolling (horizontal always; vertical only when grouping)
 *   │        └─ <table>
 *   │           ├─ <thead>     header cells: own background + column separators
 *   │           └─ <tbody>     data rows + placeholder rows (grouped: one <tbody> per group, group header first)
 *   └─ DataTablePagination
 *
 * Two modes share the same skeleton and differ only in how the <tbody> is filled:
 *   - paginated: real rows + dashed placeholder rows padding the page to `pageSize`.
 *   - grouped:   all rows (the list is capped upstream), the viewport is `pageSize` rows tall like a full page,
 *                and the column header + the current group header stay pinned while the table scrolls inside.
 */

import * as React from "react"
import type { Table as TanstackTable } from "@tanstack/react-table"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableRow, TableHeader } from "@/components/ui/table"
import { DataTableHeader } from "./data-table-header"
import { DataTableGroupRow } from "./data-table-group-row"
import { DataTableRow } from "./data-table-row"
import type { DataTableSelection } from "../hooks/use-data-table-selection"
import type { DataTableProps } from "../types"
import { COLUMN_SEPARATOR_CLASS, GROUPED_TABLE_CLASS, ROW_SEPARATOR_CLASS } from "../styles"
import { cn } from "@/lib/utils"

export interface DataTableBodyProps<TData, TValue> {
  table: TanstackTable<TData>
  isGroupingActive: boolean
  onToggleGroup: (groupId: string) => void
  rowHeight: number
  cellPadding: string
  props: Readonly<DataTableProps<TData, TValue>>
  selection: DataTableSelection
}

/** Single full-width row used for the "no results" message. */
function EmptyRow({ colSpan, isCustom, children }: Readonly<{ colSpan: number; isCustom: boolean; children: React.ReactNode }>) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className={isCustom ? "text-center" : "h-24 text-center"}>
        {children}
      </TableCell>
    </TableRow>
  )
}

/**
 * Empty rows that keep a short last page the same height as a full one.
 * Drawn exactly like data rows (same grid lines) but inert: no hover highlight.
 */
function PlaceholderRows({ count, columnCount, rowHeight }: Readonly<{ count: number; columnCount: number; rowHeight: number }>) {
  return Array.from({ length: count }, (_, i) => (
    <TableRow key={`placeholder-${i}`} className={cn(ROW_SEPARATOR_CLASS, "hover:bg-transparent")} style={{ height: rowHeight }} aria-hidden>
      {Array.from({ length: columnCount }, (_, colIndex) => (
        <TableCell key={colIndex} className={COLUMN_SEPARATOR_CLASS} />
      ))}
    </TableRow>
  ))
}

export function DataTableBody<TData, TValue>({
  table,
  isGroupingActive,
  onToggleGroup,
  rowHeight,
  cellPadding,
  props,
  selection,
}: DataTableBodyProps<TData, TValue>) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)
  const rows = table.getRowModel().rows
  const columnCount = table.getVisibleLeafColumns().length

  // The sticky group header sits right under the column header, so its offset is the header's measured height.
  const headerRef = React.useRef<HTMLTableSectionElement>(null)
  const [headerHeight, setHeaderHeight] = React.useState(0)
  React.useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    // Fractional height of the real header row (offsetHeight rounds, and a rounded-up offset leaves a visible gap).
    const measure = () => setHeaderHeight(el.getBoundingClientRect().height)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Same height as a full page of the ungrouped table: column header + `pageSize` rows.
  // Fixed while the dataset can fill a page (opening/closing a group must not resize the table); a smaller dataset
  // is not padded, like the ungrouped table, so it only gets the cap.
  const groupedHeight = props.pageSize === undefined ? undefined : headerHeight + props.pageSize * rowHeight
  const groupedFillsPage = props.pageSize !== undefined && (props.totalRows ?? data.length) >= props.pageSize

  const { emptyState, enableColumnResizing, manualPagination, data, totalRows: totalRowsProp } = props
  const enableColumnReorder = props.columnOrder !== undefined || props.onColumnOrderChange !== undefined

  // A closing group keeps its rows mounted until their exit animation ends (a collapsed group has no rows in the model).
  const groupRows = isGroupingActive ? rows.filter((row) => row.getIsGrouped()) : []
  const openGroupIds = groupRows.filter((row) => row.getIsExpanded()).map((row) => row.id)
  const [prevOpenGroupIds, setPrevOpenGroupIds] = React.useState(openGroupIds)
  const [closingGroupIds, setClosingGroupIds] = React.useState<string[]>([])
  if (openGroupIds.join("\n") !== prevOpenGroupIds.join("\n")) {
    setPrevOpenGroupIds(openGroupIds)
    // Without motion there is no animationend to wait for, so nothing may linger.
    const animates = typeof window !== "undefined" && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const stillThere = new Set(groupRows.map((row) => row.id))
    const justClosed = animates ? prevOpenGroupIds.filter((id) => stillThere.has(id) && !openGroupIds.includes(id)) : []
    setClosingGroupIds((current) => [...current.filter((id) => stillThere.has(id) && !openGroupIds.includes(id)), ...justClosed])
  }
  const handleExitEnd = React.useCallback(
    (groupId: string) => setClosingGroupIds((current) => (current.includes(groupId) ? current.filter((id) => id !== groupId) : current)),
    []
  )

  // Rows cannot be resized reliably, so a group opening/closing is animated by sliding the groups that FOLLOW it by the
  // height the rows take (FLIP): closing slides them up while the rows fade out, opening slides them down off the
  // new rows. Durations are read from the rows' own enter/exit animation, so the design-system tokens stay the source.
  const prevShiftOpenRef = React.useRef(openGroupIds)
  const prevShiftClosingRef = React.useRef<string[]>([])
  const shiftAnimationsRef = React.useRef(new Map<string, Animation[]>())
  React.useLayoutEffect(() => {
    const root = scrollContainerRef.current
    const wasOpen = prevShiftOpenRef.current
    const wasClosing = prevShiftClosingRef.current
    prevShiftOpenRef.current = openGroupIds
    prevShiftClosingRef.current = closingGroupIds
    if (!root || !isGroupingActive) return

    // Rows are gone (or the group reopened): drop the slide in the same commit, so nothing flashes.
    for (const id of wasClosing) {
      if (closingGroupIds.includes(id)) continue
      for (const animation of shiftAnimationsRef.current.get(id) ?? []) animation.cancel()
      shiftAnimationsRef.current.delete(id)
    }

    const bodies = Array.from(root.querySelectorAll<HTMLElement>("tbody[data-group-id]"))
    const slideFollowing = (groupId: string, from: number, to: number, kind: "enter" | "exit", fill: FillMode) => {
      const index = bodies.findIndex((body) => body.dataset.groupId === groupId)
      const body = bodies[index]
      const leaf = body?.children[1] as HTMLElement | undefined
      if (!body || !leaf) return
      const delta = body.offsetHeight - (body.firstElementChild as HTMLElement).offsetHeight
      const durationText = getComputedStyle(leaf).animationDuration
      const duration = durationText.endsWith("ms") ? Number.parseFloat(durationText) : Number.parseFloat(durationText) * 1000
      if (delta <= 0 || !(duration > 0)) return
      const sign = kind === "exit" ? -1 : 1
      const animations = bodies.slice(index + 1).map((following) =>
        following.animate(
          [{ transform: `translateY(${from * delta * sign}px)` }, { transform: `translateY(${to * delta * sign}px)` }],
          { duration, easing: "ease", fill }
        )
      )
      shiftAnimationsRef.current.set(groupId, [...(shiftAnimationsRef.current.get(groupId) ?? []), ...animations])
    }

    for (const id of closingGroupIds) {
      if (!wasClosing.includes(id)) slideFollowing(id, 0, 1, "exit", "forwards")
    }
    for (const id of openGroupIds) {
      if (!wasOpen.includes(id)) slideFollowing(id, -1, 0, "enter", "none")
    }
  })

  const renderRow = (row: (typeof rows)[number], motion?: "enter" | "exit") =>
    row.getIsGrouped() ? (
      <DataTableGroupRow key={row.id} row={row} rowHeight={rowHeight} table={table} isExpanded={row.getIsExpanded()} onToggle={onToggleGroup} />
    ) : (
      <DataTableRow
        key={row.id}
        row={row}
        rowHeight={rowHeight}
        cellPadding={cellPadding}
        props={props}
        selection={selection}
        motion={motion}
        onExitEnd={handleExitEnd}
      />
    )

  const renderPaginatedRows = () => {
    const { pageSize } = table.getState().pagination
    // Dataset size across ALL pages. With server-side pagination `data` holds only the current
    // page, so the real total must come from `totalRows`; `data.length` would shrink the last
    // page and make the footer jump.
    const totalRows = totalRowsProp ?? (manualPagination ? data.length : table.getFilteredRowModel().rows.length)
    // A page that can be full is always padded to `pageSize` rows so the table height never changes between pages.
    const placeholderCount = totalRows >= pageSize && rows.length < pageSize ? pageSize - rows.length : 0
    return (
      <>
        {rows.map(renderRow)}
        <PlaceholderRows count={placeholderCount} columnCount={columnCount} rowHeight={rowHeight} />
      </>
    )
  }

  const renderTableRows = () => {
    if (rows.length === 0) {
      return <EmptyRow colSpan={columnCount} isCustom={!!emptyState}>{emptyState ?? "Nessun risultato."}</EmptyRow>
    }
    return renderPaginatedRows()
  }

  /**
   * One <tbody> per group: the group header is its first row and sticks only while its own body is on screen,
   * then the next group's header pushes it out. Still ONE table, so columns stay aligned and there is ONE scroll.
   */
  const renderGroupBodies = () => {
    const bodies: React.ReactNode[] = []
    for (const row of rows) {
      if (!row.getIsGrouped()) continue
      const isClosing = closingGroupIds.includes(row.id)
      const leafRows = row.getIsExpanded() || isClosing ? row.subRows : []
      bodies.push(
        <TableBody key={row.id} data-group-id={row.id}>
          {renderRow(row)}
          {leafRows.map((leaf) => renderRow(leaf, isClosing ? "exit" : "enter"))}
        </TableBody>
      )
    }
    return bodies
  }

  return (
    <ScrollArea
      ref={scrollContainerRef}
      className="min-h-0 w-full"
      style={
        isGroupingActive
          ? ({ ...(groupedFillsPage ? { height: groupedHeight } : { maxHeight: groupedHeight }), "--dt-header-h": `${headerHeight}px` } as React.CSSProperties)
          : undefined
      }
    >
      {/* The ScrollArea scrolls, not the table's own wrapper: a native overflow there would hide the themed bar. */}
      <Table
        containerClassName="overflow-visible"
        // Collapsed borders belong to the table, not the cells: they don't follow a sticky cell and leave gaps the
        // scrolling rows show through. Grouped mode puts the borders on the cells, so the pinned headers carry them.
        className={isGroupingActive ? GROUPED_TABLE_CLASS : undefined}
      >
        <TableHeader ref={headerRef}>
          <DataTableHeader
            table={table}
            enableColumnResizing={enableColumnResizing}
            enableColumnReorder={enableColumnReorder}
            stickyHeader={isGroupingActive}
          />
        </TableHeader>
        {isGroupingActive && rows.length > 0 ? renderGroupBodies() : <TableBody>{renderTableRows()}</TableBody>}
      </Table>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}
