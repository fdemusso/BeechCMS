// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, afterEach } from "vitest"
import type React from "react"
import { render, screen, within, fireEvent, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DndContext } from "@dnd-kit/core"
import type { DashboardPageLayout } from "@beechcms/core"
import { PageTabsManager } from "@/features/dashboard/builder/page-tabs-manager"

// Radix DropdownMenu relies on pointer-event timing that jsdom doesn't
// replicate well; render a plain, always-open menu instead so item
// callbacks (onSelect) can be exercised directly via click.
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

function makePages(): DashboardPageLayout[] {
  return [
    { id: "page-1", slug: "overview", label: "Overview", sections: [] },
    { id: "page-2", slug: "second", label: "Second", sections: [] },
  ]
}

function renderManager(pages: DashboardPageLayout[], activePageId = "page-1") {
  const onSetActive = vi.fn()
  const onAddPage = vi.fn()
  const onRenamePage = vi.fn()
  const onRemovePage = vi.fn()

  render(
    <DndContext onDragEnd={() => {}}>
      <PageTabsManager
        pages={pages}
        activePageId={activePageId}
        onSetActive={onSetActive}
        onAddPage={onAddPage}
        onRenamePage={onRenamePage}
        onRemovePage={onRemovePage}
      />
    </DndContext>,
  )

  return { onSetActive, onAddPage, onRenamePage, onRemovePage }
}

describe("PageTabsManager", () => {
  it("renders a tab for each page and highlights the active one", () => {
    renderManager(makePages())
    expect(screen.getByText("Overview")).toBeInTheDocument()
    expect(screen.getByText("Second")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add Page" })).toBeInTheDocument()
  })

  it("calls onSetActive when clicking a tab", () => {
    const { onSetActive } = renderManager(makePages())
    fireEvent.click(screen.getByText("Second"))
    expect(onSetActive).toHaveBeenCalledWith("page-2")
  })

  it("calls onSetActive on Enter key press", () => {
    const { onSetActive } = renderManager(makePages())
    const tab = screen.getByText("Second").closest('[role="button"]') as HTMLElement
    fireEvent.keyDown(tab, { key: "Enter" })
    expect(onSetActive).toHaveBeenCalledWith("page-2")
  })

  it("calls onSetActive on Space key press", () => {
    const { onSetActive } = renderManager(makePages())
    const tab = screen.getByText("Second").closest('[role="button"]') as HTMLElement
    fireEvent.keyDown(tab, { key: " " })
    expect(onSetActive).toHaveBeenCalledWith("page-2")
  })

  it("does not call onSetActive on other key presses", () => {
    const { onSetActive } = renderManager(makePages())
    const tab = screen.getByText("Second").closest('[role="button"]') as HTMLElement
    fireEvent.keyDown(tab, { key: "Tab" })
    expect(onSetActive).not.toHaveBeenCalled()
  })

  it("calls onAddPage when clicking the add button", async () => {
    const { onAddPage } = renderManager(makePages())
    await userEvent.click(screen.getByRole("button", { name: "Add Page" }))
    expect(onAddPage).toHaveBeenCalledTimes(1)
  })

  it("renames a page via the dropdown menu and input commit", () => {
    const { onRenamePage } = renderManager(makePages())

    const overviewTab = screen.getByText("Overview").closest('[role="button"]') as HTMLElement
    const renameItem = within(overviewTab).getByText("Rename page")
    fireEvent.click(renameItem)

    const input = screen.getByDisplayValue("Overview")
    fireEvent.change(input, { target: { value: "Renamed" } })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(onRenamePage).toHaveBeenCalledWith("page-1", "Renamed")
  })

  it("cancels rename on Escape without calling onRenamePage", () => {
    const { onRenamePage } = renderManager(makePages())

    const overviewTab = screen.getByText("Overview").closest('[role="button"]') as HTMLElement
    fireEvent.click(within(overviewTab).getByText("Rename page"))

    const input = screen.getByDisplayValue("Overview")
    fireEvent.change(input, { target: { value: "X" } })
    fireEvent.keyDown(input, { key: "Escape" })

    expect(onRenamePage).not.toHaveBeenCalled()
    expect(screen.getByText("Overview")).toBeInTheDocument()
  })

  it("does not commit rename when the value is blank", () => {
    const { onRenamePage } = renderManager(makePages())

    const overviewTab = screen.getByText("Overview").closest('[role="button"]') as HTMLElement
    fireEvent.click(within(overviewTab).getByText("Rename page"))

    const input = screen.getByDisplayValue("Overview")
    fireEvent.change(input, { target: { value: "" } })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(onRenamePage).not.toHaveBeenCalled()
  })

  it("commits rename on input blur", () => {
    const { onRenamePage } = renderManager(makePages())

    const overviewTab = screen.getByText("Overview").closest('[role="button"]') as HTMLElement
    fireEvent.click(within(overviewTab).getByText("Rename page"))

    const input = screen.getByDisplayValue("Overview")
    fireEvent.change(input, { target: { value: "Blurred" } })
    fireEvent.blur(input)

    expect(onRenamePage).toHaveBeenCalledWith("page-1", "Blurred")
  })

  it("shows the delete option only when there is more than one page", () => {
    renderManager(makePages())
    const overviewTab = screen.getByText("Overview").closest('[role="button"]') as HTMLElement
    expect(within(overviewTab).getByText("Delete page")).toBeInTheDocument()
  })

  it("hides the delete option when there is only one page", () => {
    const onePage = [makePages()[0]]
    renderManager(onePage)
    const overviewTab = screen.getByText("Overview").closest('[role="button"]') as HTMLElement
    expect(within(overviewTab).getByText("Rename page")).toBeInTheDocument()
    expect(within(overviewTab).queryByText("Delete page")).not.toBeInTheDocument()
  })

  it("calls onRemovePage when delete is selected", () => {
    const { onRemovePage } = renderManager(makePages())
    const overviewTab = screen.getByText("Overview").closest('[role="button"]') as HTMLElement
    fireEvent.click(within(overviewTab).getByText("Delete page"))
    expect(onRemovePage).toHaveBeenCalledWith("page-1")
  })
})
