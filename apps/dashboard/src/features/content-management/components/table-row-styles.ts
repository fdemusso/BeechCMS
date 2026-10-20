// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import {
  getConditionalFormatCellClass,
  getConditionalFormatRowClass,
  type ElementFormat,
} from "@/lib/conditional-format"

export interface TableRowStyles {
  rowClassName?: string
  cellClassNameByColumnId: Record<string, string | undefined>
}

/** Adapts the harness's semantic `ElementFormat` to the table's row/cell class contract. */
export function toTableRowStyles(format: ElementFormat): TableRowStyles {
  const rowClassName = format.element
    ? getConditionalFormatRowClass(format.element.tone, format.element.textStyles)
    : undefined

  const cellClassNameByColumnId: Record<string, string | undefined> = {}
  for (const [columnId, style] of Object.entries(format.fields)) {
    cellClassNameByColumnId[columnId] = getConditionalFormatCellClass(style.tone, style.textStyles)
  }

  return { rowClassName, cellClassNameByColumnId }
}
