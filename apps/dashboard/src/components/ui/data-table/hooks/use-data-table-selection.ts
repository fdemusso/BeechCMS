// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import type { Row, RowSelectionState, Table } from "@tanstack/react-table"

function focusRoot(el: Element) {
  el.closest<HTMLElement>("[data-datatable-root]")?.focus({ preventScroll: true })
}

const EDITABLE_SELECTOR = "input, textarea, select, [contenteditable='true']"

export interface DataTableSelection {
  focusedRowId: string | null
  /** Capture-phase row click: handles shift/ctrl/cmd combos. Returns true if consumed. */
  handleRowClickCapture: (rowId: string, e: React.MouseEvent) => boolean
  /** Bubble-phase plain row click: only moves anchor + focus. */
  handleRowClick: (rowId: string, e: React.MouseEvent) => void
  handleRowMouseDown: (e: React.MouseEvent) => void
  handleKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void
}

export interface DataTableSelectionOptions<TData> {
  enabled: boolean
  rowHeight: number
  /** Enter with exactly one row selected (same as a double click). */
  onRowActivate?: (row: TData) => void
  /** Delete/Backspace with a selection. Omit to disable the shortcut. */
  onDeleteRows?: (rows: TData[]) => void
}

/**
 * Standard list-selection shortcuts for DataTable:
 * - Shift+click: range from anchor (Ctrl/Cmd+Shift+click adds the range)
 * - Ctrl/Cmd+click: toggle one row
 * - Arrows: move focus + select; Shift+Arrows extend; Ctrl/Cmd+Arrows move focus only
 * - Enter: with exactly one row selected, acts like a double click on it (onRowActivate)
 * - Ctrl/Cmd+Space: toggle focused row; Ctrl/Cmd+A: select page; Ctrl/Cmd+Shift+A: deselect all
 * - Ctrl/Cmd+I: invert selection on the page; Home/End, PageUp/PageDown: move focus
 * - Ctrl/Cmd+Shift+Up/Down: extend selection to the first/last row of the page
 * - Alt+Left/Right: previous/next page; Delete/Backspace: onDeleteRows; Shift+F10 / ContextMenu key
 * - Esc: first clears the selection, second drops the focused row
 */
export function useDataTableSelection<TData>(
  table: Table<TData>,
  { enabled, rowHeight, onRowActivate, onDeleteRows }: DataTableSelectionOptions<TData>
): DataTableSelection {
  const anchorRef = React.useRef<string | null>(null)
  // Esc clears the selection but must keep the focused row (second Esc drops it).
  const keepFocusOnEmptyRef = React.useRef(false)
  const [focusedRowId, setFocusedRowId] = React.useState<string | null>(null)

  const selectionCount = Object.keys(table.getState().rowSelection).length
  React.useEffect(() => {
    // Nothing selected anymore (checkbox, Esc, bulk action): drop focus marker and anchor.
    if (selectionCount === 0) {
      anchorRef.current = null
      if (keepFocusOnEmptyRef.current) keepFocusOnEmptyRef.current = false
      else setFocusedRowId(null)
    }
  }, [selectionCount])

  const getLeafRows = React.useCallback(
    (): Row<TData>[] =>
      table.getRowModel().rows.filter((r) => !r.getIsGrouped() && r.getCanSelect()),
    [table]
  )

  const selectRange = React.useCallback(
    (rows: Row<TData>[], toId: string, additive: boolean) => {
      const anchorId = anchorRef.current ?? toId
      const a = rows.findIndex((r) => r.id === anchorId)
      const b = rows.findIndex((r) => r.id === toId)
      if (b < 0) return
      const [from, to] = a < 0 ? [b, b] : [Math.min(a, b), Math.max(a, b)]
      table.setRowSelection((old) => {
        const next: RowSelectionState = additive ? { ...old } : {}
        for (let i = from; i <= to; i++) next[rows[i].id] = true
        return next
      })
    },
    [table]
  )

  const handleRowClickCapture = React.useCallback(
    (rowId: string, e: React.MouseEvent) => {
      if (!enabled) return false
      const toggle = e.metaKey || e.ctrlKey
      if (!e.shiftKey && !toggle) return false
      if ((e.target as HTMLElement).closest("a")) return false

      e.preventDefault()
      e.stopPropagation()
      focusRoot(e.currentTarget)
      const rows = getLeafRows()
      if (!rows.some((r) => r.id === rowId)) return false

      const selectedIds = Object.keys(table.getState().rowSelection)
      const isSoleSelected =
        selectedIds.length === 1 && selectedIds[0] === rowId && anchorRef.current === rowId
      if (e.shiftKey && isSoleSelected) {
        // Shift+click on the only selected row (the anchor) toggles it off.
        table.setRowSelection({})
      } else if (e.shiftKey) {
        // Anchor stays put on shift-click so the range can be re-adjusted.
        anchorRef.current ??= focusedRowId ?? rowId
        selectRange(rows, rowId, toggle)
      } else {
        table.setRowSelection((old) => {
          const next = { ...old }
          if (next[rowId]) delete next[rowId]
          else next[rowId] = true
          return next
        })
        anchorRef.current = rowId
      }
      setFocusedRowId(rowId)
      return true
    },
    [enabled, focusedRowId, getLeafRows, selectRange, table]
  )

  const handleRowClick = React.useCallback(
    (rowId: string, e: React.MouseEvent) => {
      if (!enabled) return
      focusRoot(e.currentTarget)
      anchorRef.current = rowId
      setFocusedRowId(rowId)
    },
    [enabled]
  )

  // Stops the browser from starting a text selection on shift+click.
  const handleRowMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      if (enabled && e.shiftKey) e.preventDefault()
    },
    [enabled]
  )

  // Scroll the focused row into view when moving with the keyboard.
  React.useEffect(() => {
    if (!focusedRowId) return
    document
      .querySelector(`[data-row-id="${CSS.escape(focusedRowId)}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [focusedRowId])

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (!enabled) return
      const target = e.target as HTMLElement
      // Portals (menus, dialogs) bubble React events through the table: ignore them.
      if (!e.currentTarget.contains(target)) return
      if (target.closest(EDITABLE_SELECTOR)) return

      const mod = e.metaKey || e.ctrlKey
      const rows = getLeafRows()
      if (rows.length === 0) return
      const currentIdx = focusedRowId ? rows.findIndex((r) => r.id === focusedRowId) : -1

      const pageStep = Math.max(
        1,
        Math.floor(e.currentTarget.clientHeight / Math.max(rowHeight, 1)) - 1
      )

      const moveTo = (idx: number) => {
        const row = rows[Math.max(0, Math.min(rows.length - 1, idx))]
        setFocusedRowId(row.id)
        if (e.shiftKey) {
          anchorRef.current ??= focusedRowId ?? row.id
          selectRange(rows, row.id, mod)
        } else if (!mod) {
          table.setRowSelection({ [row.id]: true })
          anchorRef.current = row.id
        }
      }

      if (mod && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault()
        const edge = e.key === "ArrowUp" ? rows[0] : rows[rows.length - 1]
        anchorRef.current ??= focusedRowId ?? edge.id
        selectRange(rows, edge.id, false)
        setFocusedRowId(edge.id)
        return
      }

      switch (e.key) {
        case "Enter": {
          // Native buttons/links handle Enter themselves.
          if (!onRowActivate || target.closest("button, a, [role='button'], [role='checkbox']")) return
          const selectedIds = Object.keys(table.getState().rowSelection).filter(
            (id) => table.getState().rowSelection[id]
          )
          if (selectedIds.length !== 1) return
          const row = table.getCoreRowModel().rowsById[selectedIds[0]]
          if (!row) return
          e.preventDefault()
          onRowActivate(row.original)
          break
        }
        case "ArrowDown":
          e.preventDefault()
          moveTo(currentIdx < 0 ? 0 : currentIdx + 1)
          break
        case "ArrowUp":
          e.preventDefault()
          moveTo(currentIdx < 0 ? rows.length - 1 : currentIdx - 1)
          break
        case "PageDown":
          e.preventDefault()
          moveTo(currentIdx < 0 ? pageStep - 1 : currentIdx + pageStep)
          break
        case "PageUp":
          e.preventDefault()
          moveTo(currentIdx < 0 ? 0 : currentIdx - pageStep)
          break
        case "ArrowLeft":
        case "ArrowRight": {
          if (!e.altKey || table.getState().grouping.length > 0) return
          const forward = e.key === "ArrowRight"
          if (!(forward ? table.getCanNextPage() : table.getCanPreviousPage())) return
          e.preventDefault()
          if (forward) table.nextPage()
          else table.previousPage()
          break
        }
        case "Delete":
        case "Backspace": {
          if (!onDeleteRows || mod || e.altKey) return
          const rowsToDelete = Object.keys(table.getState().rowSelection)
            .filter((id) => table.getState().rowSelection[id])
            .map((id) => table.getCoreRowModel().rowsById[id])
            .filter((r): r is Row<TData> => !!r)
          if (rowsToDelete.length === 0) return
          e.preventDefault()
          onDeleteRows(rowsToDelete.map((r) => r.original))
          break
        }
        case "F10":
        case "ContextMenu": {
          if (e.key === "F10" && !e.shiftKey) return
          const rowId =
            focusedRowId ??
            Object.keys(table.getState().rowSelection).find((id) => table.getState().rowSelection[id])
          if (!rowId) return
          const cell = e.currentTarget.querySelector<HTMLElement>(
            `[data-row-id="${CSS.escape(rowId)}"] [data-context-menu]`
          )
          if (!cell) return
          e.preventDefault()
          const rect = cell.getBoundingClientRect()
          cell.dispatchEvent(
            new MouseEvent("contextmenu", {
              bubbles: true,
              cancelable: true,
              clientX: rect.left + Math.min(24, rect.width / 2),
              clientY: rect.top + rect.height / 2,
            })
          )
          break
        }
        case "Home":
          e.preventDefault()
          moveTo(0)
          break
        case "End":
          e.preventDefault()
          moveTo(rows.length - 1)
          break
        case " ":
          if (!mod || currentIdx < 0) return
          e.preventDefault()
          table.setRowSelection((old) => {
            const next = { ...old }
            if (next[rows[currentIdx].id]) delete next[rows[currentIdx].id]
            else next[rows[currentIdx].id] = true
            return next
          })
          anchorRef.current = rows[currentIdx].id
          break
        case "a":
        case "A":
          if (!mod) return
          e.preventDefault()
          if (e.shiftKey) {
            table.setRowSelection({})
            break
          }
          table.setRowSelection((old) => {
            const next = { ...old }
            for (const r of rows) next[r.id] = true
            return next
          })
          break
        case "i":
        case "I":
          if (!mod) return
          e.preventDefault()
          table.setRowSelection((old) => {
            const next = { ...old }
            for (const r of rows) {
              if (next[r.id]) delete next[r.id]
              else next[r.id] = true
            }
            return next
          })
          break
        case "Escape":
          if (Object.keys(table.getState().rowSelection).length > 0) {
            e.preventDefault()
            keepFocusOnEmptyRef.current = true
            table.setRowSelection({})
          } else if (focusedRowId) {
            e.preventDefault()
            setFocusedRowId(null)
          }
          break
        default:
          break
      }
    },
    [enabled, focusedRowId, getLeafRows, onDeleteRows, onRowActivate, rowHeight, selectRange, table]
  )

  return { focusedRowId, handleRowClickCapture, handleRowClick, handleRowMouseDown, handleKeyDown }
}
