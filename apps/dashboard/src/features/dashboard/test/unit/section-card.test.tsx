// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, afterEach } from "vitest"
import type React from "react"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DndContext } from "@dnd-kit/core"
import type { DashboardPageLayout, DashboardSection } from "@beechcms/core"
import "@/features/dashboard/registry/builtin-widgets"
import { SectionCard } from "@/features/dashboard/builder/section-card"

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect, className }: { children: React.ReactNode; onSelect?: () => void; className?: string }) => (
    <div role="menuitem" className={className} onClick={() => onSelect?.()}>
      {children}
    </div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

afterEach(cleanup)

function makeSection(overrides: Partial<DashboardSection> = {}): DashboardSection {
  return {
    id: "section-1",
    columns: [
      { id: "col-1", widgets: [{ id: "w1", type: "core/text", config: {} }] },
      { id: "col-2", widgets: [] },
    ],
    columnSpans: [6, 6],
    ...overrides,
  }
}

function renderCard(section: DashboardSection, extra: Partial<Parameters<typeof SectionCard>[0]> = {}, otherPages: DashboardPageLayout[] = []) {
  const onUpdate = vi.fn()
  const onSetColumnPreset = vi.fn()
  const onDuplicate = vi.fn()
  const onRemove = vi.fn()
  const onAddWidget = vi.fn()
  const onConfigureWidget = vi.fn()
  const onRemoveWidget = vi.fn()
  const onMoveWidgetToPage = vi.fn()

  render(
    <DndContext onDragEnd={() => {}}>
      <SectionCard
        pageId="page-1"
        section={section}
        dragId={`section:page-1:${section.id}`}
        otherPages={otherPages}
        canRemove
        onUpdate={onUpdate}
        onSetColumnPreset={onSetColumnPreset}
        onDuplicate={onDuplicate}
        onRemove={onRemove}
        onAddWidget={onAddWidget}
        onConfigureWidget={onConfigureWidget}
        onRemoveWidget={onRemoveWidget}
        onMoveWidgetToPage={onMoveWidgetToPage}
        {...extra}
      />
    </DndContext>,
  )

  return { onUpdate, onSetColumnPreset, onDuplicate, onRemove, onAddWidget, onConfigureWidget, onRemoveWidget, onMoveWidgetToPage }
}

describe("SectionCard", () => {
  it("renders the section label when set", () => {
    renderCard(makeSection({ label: "My Section" }))
    expect(screen.getByText("My Section")).toBeInTheDocument()
  })

  it("renders the placeholder label when no label is set", () => {
    renderCard(makeSection({ label: undefined }))
    expect(screen.getByText("No Label")).toBeInTheDocument()
  })

  it("renders one ColumnStack per column", () => {
    renderCard(makeSection())
    expect(screen.getAllByRole("button", { name: /Add Widget/i })).toHaveLength(2)
  })

  it("enters rename mode on double-click and commits on Enter", () => {
    const { onUpdate } = renderCard(makeSection({ label: "Old" }))

    fireEvent.doubleClick(screen.getByText("Old"))
    const input = screen.getByDisplayValue("Old")
    fireEvent.change(input, { target: { value: "New Label" } })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(onUpdate).toHaveBeenCalledWith({ label: "New Label" })
  })

  it("commits an empty rename as undefined label", () => {
    const { onUpdate } = renderCard(makeSection({ label: "Old" }))

    fireEvent.doubleClick(screen.getByText("Old"))
    const input = screen.getByDisplayValue("Old")
    fireEvent.change(input, { target: { value: "   " } })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(onUpdate).toHaveBeenCalledWith({ label: undefined })
  })

  it("cancels rename on Escape", () => {
    const { onUpdate } = renderCard(makeSection({ label: "Old" }))

    fireEvent.doubleClick(screen.getByText("Old"))
    const input = screen.getByDisplayValue("Old")
    fireEvent.change(input, { target: { value: "New Label" } })
    fireEvent.keyDown(input, { key: "Escape" })

    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByText("Old")).toBeInTheDocument()
  })

  it("enters rename mode via Enter/Space key on the label", () => {
    renderCard(makeSection({ label: "Old" }))
    const label = screen.getByText("Old")
    fireEvent.keyDown(label, { key: "Enter" })
    expect(screen.getByDisplayValue("Old")).toBeInTheDocument()
  })

  it("toggles hideLabel via the dropdown menu", () => {
    const { onUpdate } = renderCard(makeSection({ hideLabel: false }))
    const menuItem = screen.getByText("Hide Label")
    fireEvent.click(menuItem)
    expect(onUpdate).toHaveBeenCalledWith({ hideLabel: true })
  })

  it("toggles collapsible via the dropdown menu", () => {
    const { onUpdate } = renderCard(makeSection({ collapsible: false }))
    const menuItem = screen.getByText("Collapsible")
    fireEvent.click(menuItem)
    expect(onUpdate).toHaveBeenCalledWith({ collapsible: true })
  })

  it("calls onSetColumnPreset with the selected preset", () => {
    const { onSetColumnPreset } = renderCard(makeSection())
    const presetItem = screen.getByText("[4, 4, 4]")
    fireEvent.click(presetItem)
    expect(onSetColumnPreset).toHaveBeenCalledWith([4, 4, 4])
  })

  it("calls onDuplicate from the dropdown menu", () => {
    const { onDuplicate } = renderCard(makeSection())
    fireEvent.click(screen.getByText("Duplicate"))
    expect(onDuplicate).toHaveBeenCalledTimes(1)
  })

  it("calls onRemove from the dropdown menu when canRemove is true", () => {
    const emptySection = makeSection({ columns: [{ id: "col-1", widgets: [] }, { id: "col-2", widgets: [] }] })
    const { onRemove } = renderCard(emptySection, { canRemove: true })
    fireEvent.click(screen.getByText("Remove"))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it("does not render the remove option when canRemove is false", () => {
    const emptySection = makeSection({ columns: [{ id: "col-1", widgets: [] }, { id: "col-2", widgets: [] }] })
    renderCard(emptySection, { canRemove: false })
    expect(screen.queryByText("Remove")).not.toBeInTheDocument()
  })

  it("derives column spans evenly when columnSpans is not set", () => {
    const section = makeSection({ columnSpans: undefined })
    const { container } = render(
      <DndContext onDragEnd={() => {}}>
        <SectionCard
          pageId="page-1"
          section={section}
          dragId="section:page-1:section-1"
          otherPages={[]}
          canRemove
          onUpdate={vi.fn()}
          onSetColumnPreset={vi.fn()}
          onDuplicate={vi.fn()}
          onRemove={vi.fn()}
          onAddWidget={vi.fn()}
          onConfigureWidget={vi.fn()}
          onRemoveWidget={vi.fn()}
          onMoveWidgetToPage={vi.fn()}
        />
      </DndContext>,
    )
    const columns = container.querySelectorAll(".grid.grid-cols-12 > div")
    expect(columns[0]).toHaveStyle({ gridColumn: "span 6 / span 6" })
  })

  it("forwards add/configure/remove widget callbacks per column", async () => {
    const { onAddWidget, onConfigureWidget, onRemoveWidget } = renderCard(makeSection())

    const addButtons = screen.getAllByRole("button", { name: /Add Widget/i })
    await userEvent.click(addButtons[1])
    expect(onAddWidget).toHaveBeenCalledWith("col-2")

    // Configure via clicking the widget label button in col-1.
    const configureButton = screen.getByRole("button", { name: "Text" })
    await userEvent.click(configureButton)
    expect(onConfigureWidget).toHaveBeenCalledWith("col-1", "w1")

    expect(onRemoveWidget).not.toHaveBeenCalled()
  })

  it("forwards onMoveWidgetToPage with column and widget context", () => {
    const otherPages: DashboardPageLayout[] = [
      { id: "page-2", slug: "second", label: "Second Page", sections: [] },
    ]
    const { onMoveWidgetToPage } = renderCard(makeSection(), {}, otherPages)

    const moveItem = screen.getByText("Move to page…")
    fireEvent.click(moveItem)
    const target = screen.getByText("Second Page")
    fireEvent.click(target)

    expect(onMoveWidgetToPage).toHaveBeenCalledWith("col-1", "w1", "page-2")
  })

  it("marks the currently active column preset", () => {
    renderCard(makeSection({ columnSpans: [4, 4, 4] }))
    const activePreset = screen.getByText("[4, 4, 4]")
    expect(activePreset).toHaveClass("font-semibold")
  })
})
