// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * The entry builder's drag adapter on top of the real layout builder: what a drag of each kind does to a form
 * layout. The drag engine's own rules (drop target, same-column reorder) live in components/builder/use-layout-dnd.test.tsx.
 */

import { act, renderHook } from "@testing-library/react"
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from "@dnd-kit/core"
import type { Branch, FormLayout, Seed } from "@beechcms/core"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("sonner", () => ({ toast: { warning: vi.fn() } }))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { label?: string }) => (options?.label === undefined ? key : `${key}:${options.label}`),
  }),
}))

import { useBuilderDnd } from "@/features/entry-editor/builder/use-builder-dnd"
import { useLayoutBuilder } from "@/features/entry-editor/builder/use-layout-builder"

const seed = {
  slug: "posts",
  label: "Post",
  labelPlural: "Posts",
  allowDrafts: true,
  branches: [
    { id: "b-title", alias: "title", label: "Title", type: "text" },
    { id: "b-published", alias: "published", label: "Published", type: "boolean" },
    // A multiple file branch is full width: it needs a section of its own.
    { id: "b-gallery", alias: "gallery", label: "Gallery", type: "file", multiple: true },
  ],
} as unknown as Seed

const branchById: Record<string, Branch> = Object.fromEntries(seed.branches.map((branch) => [branch.id, branch as Branch]))

const initialLayout: FormLayout = {
  version: 1,
  tabs: [
    {
      id: "t1",
      label: "Main",
      sections: [
        {
          id: "s1",
          columns: [
            { id: "c1", fields: [{ branchId: "b-title" }, { branchId: "b-published" }] },
            { id: "c2", fields: [] },
          ],
        },
        { id: "s2", columns: [{ id: "c3", fields: [{ branchId: "b-gallery" }] }] },
      ],
    },
    { id: "t2", label: "Other", sections: [{ id: "s9", columns: [{ id: "c9", fields: [] }] }] },
  ],
}

const startOf = (id: string) =>
  ({ active: { id, rect: { current: { initial: { width: 120 } } } } }) as unknown as DragStartEvent

const zoneOf = (rootId: string, sectionId: string, columnId: string) => ({
  id: `zone:${rootId}:${sectionId}:${columnId}`,
  data: { current: { type: "zone", rootId, sectionId, columnId } },
  rect: { top: 0, height: 10 },
})

const moveOver = (id: string, over: ReturnType<typeof zoneOf>) =>
  ({ active: { id, rect: { current: { translated: null } } }, over }) as unknown as DragMoveEvent

const dropOn = (id: string, over: { id: string; data: { current: { type: string } } }) =>
  ({ active: { id }, over }) as unknown as DragEndEvent

function renderBuilderDnd() {
  return renderHook(() => {
    const ops = useLayoutBuilder({ seed, initialLayout })
    return { ops, dnd: useBuilderDnd({ ops, branchById }) }
  })
}

describe("useBuilderDnd", () => {
  beforeEach(() => vi.clearAllMocks())

  it("draws the dragged field in the overlay from the start of the drag", () => {
    const { result } = renderBuilderDnd()

    act(() => result.current.dnd.onDragStart(startOf("field:b-title")))

    expect(result.current.dnd.preview).toMatchObject({ kind: "field", label: "Title", width: 120 })
  })

  it("leaves the layout alone while a field is dragged over another column", () => {
    const { result } = renderBuilderDnd()
    act(() => result.current.dnd.onDragStart(startOf("field:b-title")))

    act(() => result.current.dnd.onDragMove(moveOver("field:b-title", zoneOf("t1", "s1", "c2"))))

    expect(result.current.ops.draft).toEqual(initialLayout)
    expect(result.current.dnd.dragState).toEqual({ draggingItem: true, activeColumnKey: "t1:s1:c2", dropIndex: 0 })
  })

  it("moves the field into the column it is dropped on, once, at the drop", () => {
    const { result } = renderBuilderDnd()
    const zone = zoneOf("t1", "s1", "c2")
    act(() => result.current.dnd.onDragStart(startOf("field:b-title")))
    act(() => result.current.dnd.onDragMove(moveOver("field:b-title", zone)))

    act(() => result.current.dnd.onDragEnd(dropOn("field:b-title", zone)))

    const columns = result.current.ops.draft.tabs[0].sections[0].columns
    expect(columns[0].fields).toEqual([{ branchId: "b-published" }])
    expect(columns[1].fields).toEqual([{ branchId: "b-title" }])
    expect(toast.warning).not.toHaveBeenCalled()
  })

  it("refuses a field dropped into a section holding a full-width field, naming that field once", () => {
    const { result } = renderBuilderDnd()
    const zone = zoneOf("t1", "s2", "c3")
    act(() => result.current.dnd.onDragStart(startOf("field:b-title")))
    act(() => {
      result.current.dnd.onDragMove(moveOver("field:b-title", zone))
      result.current.dnd.onDragMove(moveOver("field:b-title", zone))
    })
    // Regression guard: a refused target used to be re-evaluated on every pointer move; the warning belongs to the drop.
    expect(toast.warning).not.toHaveBeenCalled()

    act(() => result.current.dnd.onDragEnd(dropOn("field:b-title", zone)))

    expect(result.current.ops.draft).toEqual(initialLayout)
    expect(toast.warning).toHaveBeenCalledTimes(1)
    expect(toast.warning).toHaveBeenCalledWith("layoutBuilder.warnFullWidth:Gallery")
  })

  it("reorders tabs without changing which tab is open", () => {
    const { result } = renderBuilderDnd()
    const over = { id: "tab:t2", data: { current: { type: "tab" } } }
    act(() => result.current.dnd.onDragStart(startOf("tab:t1")))

    act(() => result.current.dnd.onDragEnd(dropOn("tab:t1", over)))

    expect(result.current.ops.draft.tabs.map((tab) => tab.id)).toEqual(["t2", "t1"])
    expect(result.current.ops.activeTabId).toBe("t1")
  })

  it("warns and moves nothing when a section is dropped on a section of another tab", () => {
    const { result } = renderBuilderDnd()
    const over = { id: "section:t2:s9", data: { current: { type: "section" } } }
    act(() => result.current.dnd.onDragStart(startOf("section:t1:s1")))

    act(() => result.current.dnd.onDragEnd(dropOn("section:t1:s1", over)))

    expect(result.current.ops.draft).toEqual(initialLayout)
    expect(toast.warning).toHaveBeenCalledWith("layoutBuilder.warnNoCrossTabSection")
  })

  it("swaps two columns of a section when one is dropped on the other", () => {
    const { result } = renderBuilderDnd()
    const over = { id: "column:t1:s1:c2", data: { current: { type: "column" } } }
    act(() => result.current.dnd.onDragStart(startOf("column:t1:s1:c1")))

    act(() => result.current.dnd.onDragEnd(dropOn("column:t1:s1:c1", over)))

    expect(result.current.ops.draft.tabs[0].sections[0].columns.map((column) => column.id)).toEqual(["c2", "c1"])
  })
})
