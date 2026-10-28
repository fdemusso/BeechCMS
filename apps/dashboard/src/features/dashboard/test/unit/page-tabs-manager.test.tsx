// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, afterEach } from "vitest"
import type React from "react"
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import type { DashboardPageLayout } from "@beechcms/core"
import { PageTabsManager } from "@/features/dashboard/builder/page-tabs-manager"

afterEach(cleanup)

// The builder starts a drag only after a 5px move, so a click stays a click; the bare default would drag at once.
function Host({ children }: { children: React.ReactNode }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  return <DndContext sensors={sensors}>{children}</DndContext>
}

function makePages(count = 2): DashboardPageLayout[] {
  return [
    { id: "page-1", slug: "overview", label: "Overview", sections: [] },
    { id: "page-2", slug: "second", label: "Second", sections: [] },
    { id: "page-3", slug: "third", label: "Third", sections: [] },
  ].slice(0, count)
}

function renderManager(pages: DashboardPageLayout[], activePageId = "page-1", canAdd = true) {
  const onSetActive = vi.fn()
  const onAddPage = vi.fn()
  const onRenamePage = vi.fn()
  const onRemovePage = vi.fn()
  const onSetDefault = vi.fn()

  render(
    <Host>
      <PageTabsManager
        pages={pages}
        activePageId={activePageId}
        canAdd={canAdd}
        onSetActive={onSetActive}
        onAddPage={onAddPage}
        onRenamePage={onRenamePage}
        onRemovePage={onRemovePage}
        onSetDefault={onSetDefault}
      />
    </Host>,
  )

  return { onSetActive, onAddPage, onRenamePage, onRemovePage, onSetDefault }
}

const tab = (name: string) => screen.getByText(name).closest("[role='button']") as HTMLElement

describe("PageTabsManager", () => {
  it("renders one pill per page", () => {
    renderManager(makePages())

    expect(screen.getByText("Overview")).toBeInTheDocument()
    expect(screen.getByText("Second")).toBeInTheDocument()
  })

  it("marks only the first page as the default one", () => {
    renderManager(makePages())

    expect(screen.getAllByLabelText("Default page")).toHaveLength(1)
    expect(tab("Overview").querySelector("svg")).not.toBeNull()
  })

  it("calls onSetActive when a pill is clicked", async () => {
    const { onSetActive } = renderManager(makePages())

    await userEvent.click(screen.getByText("Second"))

    expect(onSetActive).toHaveBeenCalledWith("page-2")
  })

  it("calls onAddPage with no arguments when the add button is clicked", async () => {
    const { onAddPage } = renderManager(makePages())

    await userEvent.click(screen.getByRole("button", { name: /Add Page/i }))

    expect(onAddPage).toHaveBeenCalledWith()
  })

  it("disables the add button, rather than hiding it, at the page limit", () => {
    renderManager(makePages(), "page-1", false)

    expect(screen.getByRole("button", { name: /Add Page/i })).toBeDisabled()
  })

  it("renames a page on double click and commits with Enter", async () => {
    const { onRenamePage } = renderManager(makePages())

    await userEvent.dblClick(screen.getByText("Second"))
    const input = screen.getByDisplayValue("Second")
    await userEvent.clear(input)
    await userEvent.type(input, "Renamed{Enter}")

    expect(onRenamePage).toHaveBeenCalledWith("page-2", "Renamed")
  })

  it("commits a rename when the input loses focus", async () => {
    const { onRenamePage } = renderManager(makePages())

    await userEvent.dblClick(screen.getByText("Second"))
    const input = screen.getByDisplayValue("Second")
    await userEvent.clear(input)
    await userEvent.type(input, "Blurred")
    fireEvent.blur(input)

    expect(onRenamePage).toHaveBeenCalledWith("page-2", "Blurred")
  })

  it("cancels a rename on Escape without calling onRenamePage", async () => {
    const { onRenamePage } = renderManager(makePages())

    await userEvent.dblClick(screen.getByText("Second"))
    await userEvent.type(screen.getByDisplayValue("Second"), "x{Escape}")

    expect(onRenamePage).not.toHaveBeenCalled()
  })

  it("does not commit a blank rename", async () => {
    const { onRenamePage } = renderManager(makePages())

    await userEvent.dblClick(screen.getByText("Second"))
    const input = screen.getByDisplayValue("Second")
    await userEvent.clear(input)
    await userEvent.type(input, "   {Enter}")

    expect(onRenamePage).not.toHaveBeenCalled()
  })

  it("limits the rename input to the page label maximum", async () => {
    renderManager(makePages())

    await userEvent.dblClick(screen.getByText("Second"))

    expect(screen.getByDisplayValue("Second")).toHaveAttribute("maxlength", "60")
  })

  it("deletes a page from the red X on its pill", async () => {
    const { onRemovePage } = renderManager(makePages())

    await userEvent.click(within(tab("Second")).getByRole("button", { name: "Delete page" }))

    expect(onRemovePage).toHaveBeenCalledWith("page-2")
  })

  it("renders no delete control when there is only one page", () => {
    renderManager(makePages(1))

    expect(screen.queryByRole("button", { name: "Delete page" })).not.toBeInTheDocument()
  })

  it("offers rename, set default and delete in the right-click menu, and sets the default", async () => {
    const { onSetDefault } = renderManager(makePages())

    fireEvent.contextMenu(tab("Second"))
    await userEvent.click(await screen.findByRole("menuitem", { name: /Set as default/i }))

    expect(onSetDefault).toHaveBeenCalledWith("page-2")
  })

  it("disables 'Set as default' on the page that already is the default", async () => {
    renderManager(makePages())

    fireEvent.contextMenu(tab("Overview"))

    expect(await screen.findByRole("menuitem", { name: /Set as default/i })).toHaveAttribute("data-disabled")
  })
})
