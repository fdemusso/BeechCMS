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

  it("removing the active page moves the selection to a page that still exists", () => {
    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: makeLayout() }))
    act(() => result.current.addPage())
    const activeId = result.current.activePageId
    expect(result.current.draft.pages.map((p) => p.id)).toContain(activeId)

    act(() => result.current.removePage(activeId))

    expect(result.current.draft.pages.map((p) => p.id)).toContain(result.current.activePageId)
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

  it("moveColumn carries each column's span with it", () => {
    const layout = makeLayout()
    layout.pages[0].sections[0].columnSpans = [8, 4]
    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: layout }))

    act(() => result.current.moveColumn("page-1", "section-1", 0, 1))

    const section = result.current.draft.pages[0].sections[0]
    expect(section.columns.map((c) => c.id)).toEqual(["col-2", "col-1"])
    expect(section.columnSpans).toEqual([4, 8])
  })

  it("moveColumn on a section without explicit spans keeps the equal split", () => {
    const layout = makeLayout()
    delete layout.pages[0].sections[0].columnSpans
    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: layout }))

    act(() => result.current.moveColumn("page-1", "section-1", 1, 0))

    expect(result.current.draft.pages[0].sections[0].columnSpans).toEqual([6, 6])
  })

  it("toggleSectionFlag turns a flag on and clears it again", () => {
    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: makeLayout() }))

    act(() => result.current.toggleSectionFlag("page-1", "section-1", "collapsible"))
    expect(result.current.draft.pages[0].sections[0].collapsible).toBe(true)

    act(() => result.current.toggleSectionFlag("page-1", "section-1", "collapsible"))
    expect(result.current.draft.pages[0].sections[0].collapsible).toBeUndefined()
  })

  it("duplicateWidget inserts a copy with a fresh id right after the original", () => {
    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: makeLayout() }))

    let ok = false
    act(() => { ok = result.current.duplicateWidget("page-1", "section-1", "col-1", "widget-1") })

    const widgets = result.current.draft.pages[0].sections[0].columns[0].widgets
    expect(ok).toBe(true)
    expect(widgets).toHaveLength(2)
    expect(widgets[1].id).not.toBe("widget-1")
    expect(widgets[1].config).toEqual(widgets[0].config)
  })

  it("reorderWidgetsInColumn moves a widget to the given index", () => {
    const layout = makeLayout()
    layout.pages[0].sections[0].columns[0].widgets.push({ id: "widget-3", type: "core/text", config: {} })
    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: layout }))

    act(() => result.current.reorderWidgetsInColumn("page-1", "section-1", "col-1", 0, 1))

    expect(result.current.draft.pages[0].sections[0].columns[0].widgets.map((w) => w.id)).toEqual(["widget-3", "widget-1"])
  })

  it("refuses to add a widget to a column that is full, and to move one into it", () => {
    const layout = makeLayout()
    layout.pages[0].sections[0].columns[0].widgets = Array.from({ length: 50 }, (_, i) => ({
      id: `full-${i}`,
      type: "core/text",
      config: {},
    }))
    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: layout }))

    let added = true
    let moved = true
    act(() => { added = result.current.addWidget("page-1", "section-1", "col-1", "core/text") })
    act(() => {
      moved = result.current.moveWidget({
        from: { pageId: "page-1", sectionId: "section-1", columnId: "col-2", widgetId: "widget-2" },
        to: { pageId: "page-1", sectionId: "section-1", columnId: "col-1" },
      })
    })

    expect(added).toBe(false)
    expect(moved).toBe(false)
    expect(result.current.draft.pages[0].sections[0].columns[0].widgets).toHaveLength(50)
  })

  it("refuses a ninth page", () => {
    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: makeLayout() }))

    for (let i = 0; i < 7; i += 1) act(() => { result.current.addPage() })
    let ninth = true
    act(() => { ninth = result.current.addPage() })

    expect(result.current.draft.pages).toHaveLength(8)
    expect(ninth).toBe(false)
  })

  it("starts from a restored draft while the initial layout stays the saved baseline", () => {
    const saved = makeLayout()
    const restored = makeLayout()
    restored.pages[0].label = "Edited"
    const { result } = renderHook(() => useDashboardBuilder({ initialLayout: saved, restoredDraft: restored }))

    expect(result.current.draft.pages[0].label).toBe("Edited")
    expect(result.current.saved).toEqual(saved)
    expect(result.current.isDirty).toBe(true)
  })

  it("restoreDraft puts a snapshot back without changing what counts as saved", () => {
    const initialLayout = makeLayout()
    const { result } = renderHook(() => useDashboardBuilder({ initialLayout }))
    const snapshot = structuredClone(result.current.draft)

    act(() => result.current.addSection("page-1"))
    act(() => result.current.restoreDraft(snapshot))

    expect(result.current.draft).toEqual(initialLayout)
    expect(result.current.isDirty).toBe(false)
  })
})
