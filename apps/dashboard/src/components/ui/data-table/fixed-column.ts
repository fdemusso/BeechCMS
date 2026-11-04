// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { CSSProperties } from "react"
import type { Column } from "@tanstack/react-table"

/**
 * Utility columns (row checkbox, row actions) are declared `enableResizing: false`: they hold one small control and
 * must be exactly as wide as their `size`. In an auto-layout table a table wider than its columns hands the spare width
 * to every column that has a set width, in proportion, so these would grow too and leave empty space beside the
 * control. They are pinned instead, and the resizable columns only get a `minWidth` (see `resizableColumnStyle`), so
 * the spare width goes to them.
 */
export function isFixedColumn<TData>(column: Column<TData, unknown>): boolean {
  return column.columnDef.enableResizing === false
}

/** Width pinned to the column's `size`, so the column neither grows nor shrinks. */
export function fixedColumnStyle<TData>(column: Column<TData, unknown>): CSSProperties | undefined {
  if (!isFixedColumn(column)) return undefined
  const size = column.getSize()
  return { width: size, minWidth: size, maxWidth: size }
}

/**
 * A resizable column: at least its size (the user's resize), and the table's spare width goes to it. A set `width`
 * would instead make it share that spare width with the pinned columns.
 */
export function resizableColumnStyle<TData>(column: Column<TData, unknown>): CSSProperties | undefined {
  return isFixedColumn(column) ? undefined : { minWidth: column.getSize() }
}

/**
 * Horizontally centres the column's one control (text-align for inline ones, auto margins for the block-level
 * checkbox); the equal sides come from the pinned width, not from padding.
 */
export const FIXED_COLUMN_CLASS = "px-0 text-center [&>*]:mx-auto"
