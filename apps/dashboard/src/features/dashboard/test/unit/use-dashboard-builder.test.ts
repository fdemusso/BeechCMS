// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { renderHook, act } from "@testing-library/react"
import type { DashboardLayout } from "@beechcms/core"
import { useDashboardBuilder } from "@/features/dashboard/builder"

function makeLayout(): DashboardLayout {
  return {
    version: 1,
    pages: [
      {
        id: "page-1",
        slug: "overview",
        label: "Overview",
        sections: [
          {
            id: "section-1",
            columns: [
              { id: "col-1", widgets: [{ id: "widget-1", type: "core/stat", config: { statKey: "total" } }] },
              { id: "col-2", widgets: [{ id: "widget-2", type: "core/text", config: { content: "hello" } }] },
            ],
            columnSpans: [6, 6],
          },
        ],
      },
    ],
  }
}

describe("useDashboardBuilder", () => {
  it("adds, renames, reorders and removes pages", () => {
    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: makeLayout() }))

    act(() => result.current.addPage())
    expect(result.current.draft.pages).toHaveLength(2)
    expect(result.current.activePageId).toBe(result.current.draft.pages[1].id)

    const newPageId = result.current.draft.pages[1].id
    act(() => result.current.renamePage(newPageId, "Renamed"))
    expect(result.current.draft.pages[1].label).toBe("Renamed")

    act(() => result.current.movePage(1, 0))
    expect(result.current.draft.pages[0].id).toBe(newPageId)

    act(() => result.current.removePage(newPageId))
    expect(result.current.draft.pages).toHaveLength(1)

    // Cannot remove the last remaining page.
    const lastPageId = result.current.draft.pages[0].id
    act(() => result.current.removePage(lastPageId))
    expect(result.current.draft.pages).toHaveLength(1)
    expect(result.current.draft.pages[0].id).toBe(lastPageId)
  })

  it("moves sections within a page", () => {
    const layout = makeLayout()
    layout.pages[0].sections.push({
      id: "section-2",
      columns: [{ id: "col-3", widgets: [] }],
      columnSpans: [12],
    })

    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: layout }))

    act(() => result.current.moveSection("page-1", 0, 1))
    expect(result.current.draft.pages[0].sections.map((s) => s.id)).toEqual(["section-2", "section-1"])
  })

  it("setColumnPreset shrink rule preserves widgets by appending overflow to the last surviving column", () => {
    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: makeLayout() }))

    // Shrink from 2 columns ([6,6]) down to 1 column ([12]).
    act(() => result.current.setColumnPreset("page-1", "section-1", [12]))

    const section = result.current.draft.pages[0].sections[0]
    expect(section.columnSpans).toEqual([12])
    expect(section.columns).toHaveLength(1)
    expect(section.columns[0].widgets.map((w) => w.id)).toEqual(["widget-1", "widget-2"])
  })

  it("setColumnPreset grow rule adds empty columns", () => {
    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: makeLayout() }))

    act(() => result.current.setColumnPreset("page-1", "section-1", [4, 4, 4]))

    const section = result.current.draft.pages[0].sections[0]
    expect(section.columnSpans).toEqual([4, 4, 4])
    expect(section.columns).toHaveLength(3)
    expect(section.columns[2].widgets).toEqual([])
  })

  it("moves a widget across sections/columns", () => {
    const layout = makeLayout()
    layout.pages[0].sections.push({
      id: "section-2",
      columns: [{ id: "col-3", widgets: [] }],
      columnSpans: [12],
    })

    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: layout }))

    let ok = false
    act(() => {
      ok = result.current.moveWidget({
        from: { pageId: "page-1", sectionId: "section-1", columnId: "col-1", widgetId: "widget-1" },
        to: { pageId: "page-1", sectionId: "section-2", columnId: "col-3" },
      })
    })

    expect(ok).toBe(true)
    const sections = result.current.draft.pages[0].sections
    expect(sections[0].columns[0].widgets).toHaveLength(0)
    expect(sections[1].columns[0].widgets.map((w) => w.id)).toEqual(["widget-1"])
  })

  it("moveWidgetToPage moves a widget to the first section/column of the target page", () => {
    const layout = makeLayout()
    layout.pages.push({
      id: "page-2",
      slug: "second",
      label: "Second",
      sections: [{ id: "section-2", columns: [{ id: "col-3", widgets: [] }], columnSpans: [12] }],
    })

    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: layout }))

    let ok = false
    act(() => {
      ok = result.current.moveWidgetToPage(
        { pageId: "page-1", sectionId: "section-1", columnId: "col-1", widgetId: "widget-1" },
        "page-2",
      )
    })

    expect(ok).toBe(true)
    expect(result.current.draft.pages[0].sections[0].columns[0].widgets).toHaveLength(0)
    expect(result.current.draft.pages[1].sections[0].columns[0].widgets.map((w) => w.id)).toEqual(["widget-1"])
  })

  it("moveWidgetToPage returns false when the source widget cannot be found", () => {
    const layout = makeLayout()
    layout.pages.push({
      id: "page-2",
      slug: "second",
      label: "Second",
      sections: [{ id: "section-2", columns: [{ id: "col-3", widgets: [] }], columnSpans: [12] }],
    })

    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: layout }))

    let ok = true
    act(() => {
      ok = result.current.moveWidgetToPage(
        { pageId: "page-1", sectionId: "section-1", columnId: "col-1", widgetId: "missing-widget" },
        "page-2",
      )
    })

    expect(ok).toBe(false)
    expect(result.current.draft.pages[0].sections[0].columns[0].widgets).toHaveLength(1)
  })

  it("moveWidgetToPage returns false when the target page has no columns", () => {
    const layout = makeLayout()
    layout.pages.push({ id: "page-2", slug: "second", label: "Second", sections: [] })

    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: layout }))

    let ok = true
    act(() => {
      ok = result.current.moveWidgetToPage(
        { pageId: "page-1", sectionId: "section-1", columnId: "col-1", widgetId: "widget-1" },
        "page-2",
      )
    })

    expect(ok).toBe(false)
    expect(result.current.draft.pages[0].sections[0].columns[0].widgets).toHaveLength(1)
  })

  it("removeWidget removes the widget from its column", () => {
    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: makeLayout() }))

    act(() => result.current.removeWidget("page-1", "section-1", "col-1", "widget-1"))

    expect(result.current.draft.pages[0].sections[0].columns[0].widgets).toHaveLength(0)
  })

  it("duplicateSection clones a section with new IDs after the original", () => {
    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: makeLayout() }))

    act(() => result.current.duplicateSection("page-1", "section-1"))

    const sections = result.current.draft.pages[0].sections
    expect(sections).toHaveLength(2)
    expect(sections[1].id).not.toBe("section-1")
    expect(sections[1].columns[0].id).not.toBe("col-1")
    expect(sections[1].columns[0].widgets[0]?.id).not.toBe("widget-1")
    expect(sections[1].columns[0].widgets[0]?.type).toBe("core/stat")
  })

  it("addWidget appends a new widget with the type's default config", () => {
    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: makeLayout() }))

    act(() => result.current.addWidget("page-1", "section-1", "col-1", "core/text"))

    const widgets = result.current.draft.pages[0].sections[0].columns[0].widgets
    expect(widgets).toHaveLength(2)
    expect(widgets[1].type).toBe("core/text")
  })

  it("updateWidgetTitle sets and clears the widget title", () => {
    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: makeLayout() }))

    act(() => result.current.updateWidgetTitle("page-1", "section-1", "col-1", "widget-1", "Custom"))
    expect(result.current.draft.pages[0].sections[0].columns[0].widgets[0].title).toBe("Custom")

    act(() => result.current.updateWidgetTitle("page-1", "section-1", "col-1", "widget-1", ""))
    expect(result.current.draft.pages[0].sections[0].columns[0].widgets[0].title).toBeUndefined()
  })

  it("updateWidgetConfig replaces the widget's config", () => {
    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: makeLayout() }))

    act(() => result.current.updateWidgetConfig("page-1", "section-1", "col-1", "widget-1", { statKey: "active" }))

    expect(result.current.draft.pages[0].sections[0].columns[0].widgets[0].config).toEqual({ statKey: "active" })
  })

  it("addSection appends a section with the requested column count", () => {
    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: makeLayout() }))

    act(() => result.current.addSection("page-1", 3))

    const sections = result.current.draft.pages[0].sections
    expect(sections).toHaveLength(2)
    expect(sections[1].columns).toHaveLength(3)
    expect(sections[1].columnSpans).toEqual([4, 4, 4])
  })

  it("updateSection merges partial updates into the section", () => {
    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: makeLayout() }))

    act(() => result.current.updateSection("page-1", "section-1", { label: "Renamed", collapsible: true }))

    const section = result.current.draft.pages[0].sections[0]
    expect(section.label).toBe("Renamed")
    expect(section.collapsible).toBe(true)
  })

  it("removeSection removes the section from the page", () => {
    const layout = makeLayout()
    layout.pages[0].sections.push({ id: "section-2", columns: [{ id: "col-3", widgets: [] }], columnSpans: [12] })

    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: layout }))

    act(() => result.current.removeSection("page-1", "section-2"))

    expect(result.current.draft.pages[0].sections.map((s) => s.id)).toEqual(["section-1"])
  })

  it("moveWidget returns false and is a no-op when the source widget doesn't exist", () => {
    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: makeLayout() }))

    let ok = true
    act(() => {
      ok = result.current.moveWidget({
        from: { pageId: "page-1", sectionId: "section-1", columnId: "col-1", widgetId: "missing" },
        to: { pageId: "page-1", sectionId: "section-1", columnId: "col-2" },
      })
    })

    expect(ok).toBe(false)
  })

  it("moveWidget reorders within the same column when an index is given", () => {
    const layout = makeLayout()
    layout.pages[0].sections[0].columns[0].widgets.push({ id: "widget-3", type: "core/stat", config: {} })

    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: layout }))

    act(() => {
      result.current.moveWidget({
        from: { pageId: "page-1", sectionId: "section-1", columnId: "col-1", widgetId: "widget-3" },
        to: { pageId: "page-1", sectionId: "section-1", columnId: "col-1", index: 0 },
      })
    })

    const widgets = result.current.draft.pages[0].sections[0].columns[0].widgets
    expect(widgets.map((w) => w.id)[0]).toBe("widget-3")
  })

  it("replaceWidget resets config to the new type's default config", () => {
    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: makeLayout() }))

    act(() => result.current.replaceWidget("page-1", "section-1", "col-1", "widget-1", "core/text"))

    const widget = result.current.draft.pages[0].sections[0].columns[0].widgets[0]
    expect(widget.type).toBe("core/text")
    expect(widget.config).not.toEqual({ statKey: "total" })
  })

  it("tracks isDirty and resets back to the initial layout", () => {
    const initialLayout = makeLayout()
    const { result } = renderHook(() => useDashboardBuilder({ initialLayout }))

    expect(result.current.isDirty).toBe(false)

    act(() => result.current.addSection("page-1"))
    expect(result.current.isDirty).toBe(true)
    expect(result.current.draft.pages[0].sections).toHaveLength(2)

    act(() => result.current.reset())
    expect(result.current.isDirty).toBe(false)
    expect(result.current.draft).toEqual(initialLayout)
  })
})
