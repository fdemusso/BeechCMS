// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DndContext } from "@dnd-kit/core"
import type { DashboardPageLayout, DashboardWidgetInstance } from "@beechcms/core"
import "@/features/dashboard/registry/builtin-widgets"
import { WidgetChip } from "@/features/dashboard/builder/widget-chip"

function renderChip(widget: DashboardWidgetInstance, otherPages: DashboardPageLayout[] = []) {
  const onConfigure = vi.fn()
  const onRemove = vi.fn()
  const onMoveToPage = vi.fn()

  render(
    <DndContext onDragEnd={() => {}}>
      <WidgetChip
        widget={widget}
        dragId={`widget:${widget.id}`}
        otherPages={otherPages}
        onConfigure={onConfigure}
        onRemove={onRemove}
        onMoveToPage={onMoveToPage}
      />
    </DndContext>,
  )

  return { onConfigure, onRemove, onMoveToPage }
}

describe("WidgetChip", () => {
  it("renders the translated label for a known widget type", () => {
    renderChip({ id: "w1", type: "core/text", config: {} })
    expect(screen.getByText("Text")).toBeInTheDocument()
  })

  it("renders a custom title when set, overriding the default label", () => {
    renderChip({ id: "w1", type: "core/text", title: "My Title", config: {} })
    expect(screen.getByText("My Title")).toBeInTheDocument()
  })

  it("shows the unavailable badge and falls back to the raw type for unknown widgets", () => {
    renderChip({ id: "w1", type: "custom/unknown-widget", config: {} })
    expect(screen.getByText("custom/unknown-widget")).toBeInTheDocument()
    expect(screen.getByText("Unavailable")).toBeInTheDocument()
  })

  it("shows the seedSlug badge when config.seedSlug is set", () => {
    renderChip({ id: "w1", type: "core/stat", config: { seedSlug: "posts" } })
    expect(screen.getByText("posts")).toBeInTheDocument()
  })

  it("calls onConfigure when clicking the label button", async () => {
    const { onConfigure } = renderChip({ id: "w1", type: "core/text", config: {} })
    await userEvent.click(screen.getByRole("button", { name: "Text" }))
    expect(onConfigure).toHaveBeenCalledTimes(1)
  })

  it("calls onConfigure and onRemove via the dropdown menu", async () => {
    const { onConfigure, onRemove } = renderChip({ id: "w1", type: "core/text", config: {} })

    const menuTrigger = screen.getByRole("button", { name: "", expanded: false })
    await userEvent.click(menuTrigger)

    const configureItem = await screen.findByText("Configure")
    await userEvent.click(configureItem)
    expect(onConfigure).toHaveBeenCalledTimes(1)

    await userEvent.click(menuTrigger)
    const removeItem = await screen.findByText("Remove")
    await userEvent.click(removeItem)
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it("renders a 'move to page' submenu only when other pages exist", async () => {
    const otherPages: DashboardPageLayout[] = [
      { id: "page-2", slug: "second", label: "Second Page", sections: [] },
    ]
    const { onMoveToPage } = renderChip({ id: "w1", type: "core/text", config: {} }, otherPages)

    const menuTrigger = screen.getByRole("button", { name: "", expanded: false })
    await userEvent.click(menuTrigger)

    expect(await screen.findByText("Move to page…")).toBeInTheDocument()
    await userEvent.click(screen.getByText("Move to page…"))

    const target = await screen.findByText("Second Page")
    await userEvent.click(target)
    expect(onMoveToPage).toHaveBeenCalledWith("page-2")
  })

  it("does not render the move-to-page item when there are no other pages", async () => {
    renderChip({ id: "w1", type: "core/text", config: {} }, [])
    const menuTrigger = screen.getByRole("button", { name: "", expanded: false })
    await userEvent.click(menuTrigger)
    expect(await screen.findByText("Configure")).toBeInTheDocument()
    expect(screen.queryByText("Move to page…")).not.toBeInTheDocument()
  })
})
