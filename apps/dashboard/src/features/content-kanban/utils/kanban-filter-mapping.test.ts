// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from "vitest"
import type { ColumnFiltersState } from "@tanstack/react-table"
import { toActiveFilters } from "./kanban-filter-mapping"

describe("toActiveFilters", () => {
  it("returns an empty array when both inputs are undefined or empty", () => {
    const filters = toActiveFilters([], undefined)

    expect(filters).toEqual([])
  })

  it("maps ToolbarFilterGroup from columnFilters into FilterGroup with normalized conditions", () => {
    const columnFilters: ColumnFiltersState = [
      {
        id: "status",
        value: {
          columnId: "status",
          type: "select",
          conditions: [
            { id: "c1", op: "eq", value: "published" },
            { id: "c2", op: "eq", value: "" },
          ],
        },
      },
    ]

    const filters = toActiveFilters(columnFilters)

    expect(filters).toEqual([
      {
        column: "status",
        type: "select",
        conditions: [{ op: "eq", value: "published" }],
      },
    ])
  })

  it("maps boolean, number and is_empty conditions correctly", () => {
    const columnFilters: ColumnFiltersState = [
      {
        id: "featured",
        value: {
          columnId: "featured",
          type: "boolean",
          conditions: [{ id: "c1", op: "eq", value: true }],
        },
      },
      {
        id: "count",
        value: {
          columnId: "count",
          type: "number",
          conditions: [{ id: "c2", op: "gt", value: 10 }],
        },
      },
      {
        id: "archived",
        value: {
          columnId: "archived",
          type: "text",
          conditions: [{ id: "c3", op: "is_empty", value: null }],
        },
      },
    ]

    const filters = toActiveFilters(columnFilters)

    expect(filters).toEqual([
      {
        column: "featured",
        type: "boolean",
        conditions: [{ op: "eq", value: true }],
      },
      {
        column: "count",
        type: "number",
        conditions: [{ op: "gt", value: 10 }],
      },
      {
        column: "archived",
        type: "text",
        conditions: [{ op: "is_empty", value: null }],
      },
    ])
  })

  it("falls back to toolbarFilters when columnFilters is empty", () => {
    const toolbarFilters = {
      author: {
        columnId: "author",
        type: "text",
        conditions: [{ id: "c1", op: "contains", value: "Alice" }],
      },
    }

    const filters = toActiveFilters([], toolbarFilters)

    expect(filters).toEqual([
      {
        column: "author",
        type: "text",
        conditions: [{ op: "contains", value: "Alice" }],
      },
    ])
  })

  it("omits filter groups having zero effective conditions", () => {
    const columnFilters: ColumnFiltersState = [
      {
        id: "author",
        value: {
          columnId: "author",
          type: "text",
          conditions: [{ id: "c1", op: "contains", value: "   " }],
        },
      },
    ]

    const filters = toActiveFilters(columnFilters)

    expect(filters).toEqual([])
  })
})
