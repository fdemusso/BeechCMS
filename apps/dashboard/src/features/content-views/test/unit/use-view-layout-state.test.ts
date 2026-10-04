// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { CANONICAL_SEEDS } from "@beechcms/testing"
import { DEFAULT_DATE_GROUP_PRECISION } from "@/lib/dynamic-columns"
import { DEFAULT_DENSITY } from "@/lib/density"
import type { ViewToolbarState } from "../../lib/view-config-mapping"
import { useViewLayoutState } from "../../hooks/use-view-layout-state"

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

describe("useViewLayoutState", () => {
  it("hydrates groupBy, conditional formats, kanban and card from the initial state unchanged", () => {
    const initial = baseState({
      groupBy: "title",
      conditionalFormats: [
        { id: "r1", enabled: true, priority: 0, columnId: "title", group: { columnId: "title", label: "Title", type: "text", conditions: [] }, tone: "info", target: "element", textStyles: [] },
      ],
      kanban: { axisBranchId: "br_07", sort: null },
      card: { version: 1, media: null, header: null, subtitle: null, metadata: [] },
    })

    const { result } = renderHook(() => useViewLayoutState(initial, posts))

    expect(result.current.groupBy).toBe("title")
    expect(result.current.conditionalFormats).toEqual(initial.conditionalFormats)
    expect(result.current.kanban).toEqual({ axisBranchId: "br_07", sort: null })
    expect(result.current.card).toEqual(initial.card)
  })

  it("with columnVisibility undefined, hides exactly id, slug and created_at", () => {
    const { result } = renderHook(() => useViewLayoutState(baseState(), posts))

    expect(result.current.columnVisibility).toEqual({ id: false, slug: false, created_at: false })
  })

  it("with density and kanban undefined, yields the table default density and an empty kanban config", () => {
    const { result } = renderHook(() => useViewLayoutState(baseState(), posts))

    expect(result.current.density).toBe(DEFAULT_DENSITY)
    expect(result.current.kanban).toEqual({ axisBranchId: null, sort: null })
  })

  it("grouping by a non-date branch after a day-precision initial state resets dateGroupPrecision", () => {
    const initial = baseState({ groupBy: null, dateGroupPrecision: { year: false, month: false, day: true } })
    const { result } = renderHook(() => useViewLayoutState(initial, posts))
    expect(result.current.dateGroupPrecision).toEqual({ year: false, month: false, day: true })

    act(() => result.current.setGroupBy("title"))

    expect(result.current.dateGroupPrecision).toEqual(DEFAULT_DATE_GROUP_PRECISION)
  })
})
