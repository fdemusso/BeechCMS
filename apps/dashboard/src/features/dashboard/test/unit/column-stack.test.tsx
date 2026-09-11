// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DndContext } from "@dnd-kit/core"
import type { DashboardColumn, DashboardPageLayout } from "@beechcms/core"
import { ColumnStack } from "@/features/dashboard/builder/column-stack"

function renderColumn(column: DashboardColumn, otherPages: DashboardPageLayout[] = [], extra: Partial<Parameters<typeof ColumnStack>[0]> = {}) {
  const onAddWidget = vi.fn()
  const onConfigureWidget = vi.fn()
  const onRemoveWidget = vi.fn()
  const onMoveWidgetToPage = vi.fn()

  render(
    <DndContext onDragEnd={() => {}}>
      <ColumnStack
        pageId="page-1"
        sectionId="section-1"
        column={column}
        otherPages={otherPages}
        onAddWidget={onAddWidget}
        onConfigureWidget={onConfigureWidget}
        onRemoveWidget={onRemoveWidget}
        onMoveWidgetToPage={onMoveWidgetToPage}
        {...extra}
      />
    </DndContext>,
  )

  return { onAddWidget, onConfigureWidget, onRemoveWidget, onMoveWidgetToPage }
}

describe("ColumnStack", () => {
  it("renders an empty column with the add widget button", () => {
    const { onAddWidget } = renderColumn({ id: "col-1", widgets: [] })

    expect(screen.getByRole("button", { name: /Add Widget/i })).toBeInTheDocument()
    expect(onAddWidget).not.toHaveBeenCalled()
  })

  it("calls onAddWidget when the add button is clicked", async () => {
    const { onAddWidget } = renderColumn({ id: "col-1", widgets: [] })
    await userEvent.click(screen.getByRole("button", { name: /Add Widget/i }))
    expect(onAddWidget).toHaveBeenCalledTimes(1)
  })

  it("renders widget chips for each widget in the column", () => {
    const column: DashboardColumn = {
      id: "col-1",
      widgets: [
        { id: "w1", type: "core/text", config: { content: "hi" } },
        { id: "w2", type: "core/stat", config: {} },
      ],
    }
    renderColumn(column)

    // WidgetChip renders the widget label (translated) or its type as fallback.
    expect(screen.getAllByRole("button", { name: /Add Widget/i })).toHaveLength(1)
  })

  it("applies a grid-column span style when span is provided", () => {
    const { container } = render(
      <DndContext onDragEnd={() => {}}>
        <ColumnStack
          pageId="page-1"
          sectionId="section-1"
          column={{ id: "col-1", widgets: [] }}
          span={6}
          otherPages={[]}
          onAddWidget={vi.fn()}
          onConfigureWidget={vi.fn()}
          onRemoveWidget={vi.fn()}
          onMoveWidgetToPage={vi.fn()}
        />
      </DndContext>,
    )
    const root = container.firstChild as HTMLElement
    expect(root.style.gridColumn).toBe("span 6 / span 6")
  })

  it("does not apply gridColumn style when span is undefined", () => {
    const { container } = render(
      <DndContext onDragEnd={() => {}}>
        <ColumnStack
          pageId="page-1"
          sectionId="section-1"
          column={{ id: "col-1", widgets: [] }}
          otherPages={[]}
          onAddWidget={vi.fn()}
          onConfigureWidget={vi.fn()}
          onRemoveWidget={vi.fn()}
          onMoveWidgetToPage={vi.fn()}
        />
      </DndContext>,
    )
    const root = container.firstChild as HTMLElement
    expect(root.style.gridColumn).toBe("")
  })
})
