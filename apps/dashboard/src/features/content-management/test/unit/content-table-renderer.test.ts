// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from "vitest"
import { getConditionalFormatCellClass, getConditionalFormatRowClass, NO_ELEMENT_FORMAT, type ElementFormat } from "@/lib/conditional-format"
import { toTableRowStyles } from "../../components/table-row-styles"

describe("toTableRowStyles", () => {
  it("maps a matching element style to rowClassName equal to getConditionalFormatRowClass", () => {
    const format: ElementFormat = {
      element: { tone: "warning", textStyles: ["bold"] },
      fields: {},
    }

    const styles = toTableRowStyles(format)

    expect(styles.rowClassName).toBe(getConditionalFormatRowClass("warning", ["bold"]))
  })

  it("maps each matching field style to one cellClassNameByColumnId entry equal to getConditionalFormatCellClass", () => {
    const format: ElementFormat = {
      element: null,
      fields: {
        title: { tone: "danger", textStyles: [] },
        status: { tone: "info", textStyles: ["italic"] },
      },
    }

    const styles = toTableRowStyles(format)

    expect(styles.cellClassNameByColumnId).toEqual({
      title: getConditionalFormatCellClass("danger", []),
      status: getConditionalFormatCellClass("info", ["italic"]),
    })
  })

  it("maps NO_ELEMENT_FORMAT to an undefined rowClassName and an empty cell map", () => {
    const styles = toTableRowStyles(NO_ELEMENT_FORMAT)

    expect(styles.rowClassName).toBeUndefined()
    expect(styles.cellClassNameByColumnId).toEqual({})
  })
})
