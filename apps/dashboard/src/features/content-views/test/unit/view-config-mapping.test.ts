// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from "vitest"
import { CANONICAL_SEEDS } from "@beechcms/testing"
import { emptyViewConfig, type ContentViewConfig } from "@beechcms/core"
import { DEFAULT_DATE_GROUP_PRECISION } from "@/lib/dynamic-columns"
import { toContentViewConfig, toViewToolbarState, type ViewToolbarState } from "../../lib/view-config-mapping"

const posts = CANONICAL_SEEDS.find((seed) => seed.slug === "posts")!

function baseState(overrides: Partial<ViewToolbarState> = {}): ViewToolbarState {
  return {
    filters: {},
    sort: null,
    groupBy: null,
    dateGroupPrecision: DEFAULT_DATE_GROUP_PRECISION,
    columnVisibility: undefined,
    density: undefined,
    pageSize: undefined,
    conditionalFormats: [],
    kanban: undefined,
    card: undefined,
    ...overrides,
  }
}

describe("toContentViewConfig", () => {
  it("stores a filter by Branch ID, never by the column alias", () => {
    const state = baseState({
      filters: {
        title: { columnId: "title", label: "Title", type: "text", conditions: [{ id: "c1", op: "contains", value: "news" }] },
      },
    })

    const config = toContentViewConfig(state, posts, "table")

    expect(config.filters[0].columnRef).toBe("br_01")
    expect(JSON.stringify(config)).not.toContain("title")
  })

  it("keeps system columns status and created_at as column refs", () => {
    const state = baseState({
      filters: {
        status: { columnId: "status", label: "Status", type: "select", conditions: [{ id: "c1", op: "eq", value: "published" }] },
      },
      sort: { id: "created_at", desc: true },
    })

    const config = toContentViewConfig(state, posts, "table")

    expect(config.sort).toEqual({ columnRef: "created_at", desc: true })
    expect(config.filters[0].columnRef).toBe("status")
  })

  it("drops a filter group with zero conditions and caps conditions at 3", () => {
    const state = baseState({
      filters: {
        title: { columnId: "title", label: "Title", type: "text", conditions: [] },
        view_count: {
          columnId: "view_count",
          label: "View Count",
          type: "number",
          conditions: [
            { id: "c1", op: "gt", value: 1 },
            { id: "c2", op: "gt", value: 2 },
            { id: "c3", op: "gt", value: 3 },
            { id: "c4", op: "gt", value: 4 },
          ],
        },
      },
    })

    const config = toContentViewConfig(state, posts, "table")

    expect(config.filters).toHaveLength(1)
    expect(config.filters[0].conditions).toHaveLength(3)
  })

  it("truncates a string condition value to 500 characters", () => {
    const state = baseState({
      filters: {
        title: { columnId: "title", label: "Title", type: "text", conditions: [{ id: "c1", op: "contains", value: "x".repeat(600) }] },
      },
    })

    const config = toContentViewConfig(state, posts, "table")

    expect((config.filters[0].conditions[0].value as string)).toHaveLength(500)
  })

  it("stores datePrecision when grouping by a date column and omits it for a text column", () => {
    const byDate = toContentViewConfig(baseState({ groupBy: "created_at" }), posts, "table")
    const byText = toContentViewConfig(baseState({ groupBy: "title" }), posts, "table")

    expect(byDate.groupBy).toEqual({ columnRef: "created_at", datePrecision: DEFAULT_DATE_GROUP_PRECISION })
    expect(byText.groupBy).toEqual({ columnRef: "br_01" })
  })

  it("passes element and field targets through unchanged in both directions", () => {
    const makeRule = (target: "element" | "field") => ({
      id: `r-${target}`,
      enabled: true,
      priority: 0,
      columnId: "title",
      group: { columnId: "title", label: "Title", type: "text" as const, conditions: [{ id: "c1", op: "eq" as const, value: "x" }] },
      tone: "neutral" as const,
      target,
    })
    const state = baseState({ conditionalFormats: [makeRule("element"), makeRule("field")] })

    const config = toContentViewConfig(state, posts, "table")

    expect(config.conditionalFormats[0].target).toBe("element")
    expect(config.conditionalFormats[1].target).toBe("field")

    const roundTripped = toViewToolbarState(config, posts)

    expect(roundTripped.conditionalFormats[0].target).toBe("element")
    expect(roundTripped.conditionalFormats[1].target).toBe("field")
  })

  it("never persists the id column as hidden and stores hidden columns as Branch IDs", () => {
    const state = baseState({ columnVisibility: { id: false, title: false, slug: true } })

    const config = toContentViewConfig(state, posts, "table")

    expect(config.appearance.hiddenColumns).toEqual(["br_01"])
  })

  it("drops kanban and card for a non-kanban type and keeps them for kanban", () => {
    const kanban = { axisBranchId: "br_09", sort: null }
    const card = { version: 1 as const, metadata: [] }
    const state = baseState({ kanban, card })

    const table = toContentViewConfig(state, posts, "table")
    const kanbanView = toContentViewConfig(state, posts, "kanban")

    expect(table.kanban).toBeUndefined()
    expect(table.card).toBeUndefined()
    expect(kanbanView.kanban).toEqual(kanban)
    expect(kanbanView.card).toEqual(card)
  })
})

describe("toViewToolbarState", () => {
  it("turns a Branch-ID filter back into an alias-keyed group labelled from buildFilterableColumns", () => {
    const config: ContentViewConfig = {
      ...emptyViewConfig(),
      filters: [{ columnRef: "br_01", conditions: [{ op: "eq", value: "Foo" }] }],
    }

    const state = toViewToolbarState(config, posts)

    expect(state.filters.title).toMatchObject({ columnId: "title", label: "Title", type: "text" })
  })

  it("drops filters, sorts, groupings, hidden columns and rules that reference an unknown Branch ID", () => {
    const config: ContentViewConfig = {
      ...emptyViewConfig(),
      filters: [{ columnRef: "br_99", conditions: [{ op: "eq", value: "x" }] }],
      sort: { columnRef: "br_99", desc: false },
      groupBy: { columnRef: "br_99" },
      appearance: { hiddenColumns: ["br_99"] },
      conditionalFormats: [
        { id: "r1", enabled: true, priority: 0, columnRef: "br_99", conditions: [{ op: "eq", value: "x" }], tone: "neutral", target: "element", textStyles: [] },
      ],
    }

    const state = toViewToolbarState(config, posts)

    expect(state.filters).toEqual({})
    expect(state.sort).toBeNull()
    expect(state.groupBy).toBeNull()
    expect(state.columnVisibility).toEqual({ id: false })
    expect(state.conditionalFormats).toEqual([])
  })

  it("returns columnVisibility undefined when hiddenColumns is absent, so the table default applies", () => {
    const config: ContentViewConfig = { ...emptyViewConfig() }

    const state = toViewToolbarState(config, posts)

    expect(state.columnVisibility).toBeUndefined()
  })

  // Regression guard: autosave compares the config's JSON to decide whether to PATCH, so a lossy
  // round trip would write back on every mount even when the user changed nothing.
  it("round-trips a fully populated Table config without loss", () => {
    const config: ContentViewConfig = {
      filters: [
        { columnRef: "br_01", conditions: [{ op: "contains", value: "news" }] },
        { columnRef: "status", conditions: [{ op: "eq", value: "published" }] },
      ],
      sort: { columnRef: "created_at", desc: true },
      groupBy: { columnRef: "created_at", datePrecision: { year: true, month: true, day: false } },
      appearance: { density: "compact", hiddenColumns: ["br_05", "status"], pageSize: 25 },
      conditionalFormats: [
        {
          id: "rule-1",
          enabled: true,
          priority: 10,
          label: "Hot",
          columnRef: "br_05",
          conditions: [{ op: "gt", value: 100 }],
          tone: "success",
          target: "element",
          textStyles: ["bold"],
        },
      ],
    }

    const roundTripped = toContentViewConfig(toViewToolbarState(config, posts), posts, "table")

    expect(roundTripped).toEqual(config)
  })

  it("hydrates the same config twice with identical condition ids", () => {
    const config: ContentViewConfig = {
      ...emptyViewConfig(),
      filters: [{ columnRef: "br_01", conditions: [{ op: "eq", value: "a" }, { op: "eq", value: "b" }] }],
    }

    const first = toViewToolbarState(config, posts)
    const second = toViewToolbarState(config, posts)

    expect(first.filters.title.conditions.map((c) => c.id)).toEqual(second.filters.title.conditions.map((c) => c.id))
  })
})
