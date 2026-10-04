// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import { TooltipProvider } from "@/components/ui/tooltip"
import { ViewTypePicker } from "@/features/content-toolbar/toolbar-components/view-type-picker"

function openPicker() {
  fireEvent.pointerDown(screen.getByRole("button", { name: /add view/i }))
}

describe("ViewTypePicker", () => {
  it("lists every catalogue View Type under the add-view heading", () => {
    render(
      <TooltipProvider>
        <ViewTypePicker creatableViewTypes={["table", "gallery"]} onCreateView={vi.fn()} />
      </TooltipProvider>
    )

    openPicker()

    for (const label of [
      "Table", "Gallery", "Kanban", "Chart", "Board", "List",
      "Calendar", "Map", "Timeline", "Feed", "Form", "Dashboard",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it("creates the authorized type the user picks", () => {
    const onCreateView = vi.fn()
    render(
      <TooltipProvider>
        <ViewTypePicker creatableViewTypes={["table", "gallery"]} onCreateView={onCreateView} />
      </TooltipProvider>
    )

    openPicker()
    fireEvent.click(screen.getByText("Gallery"))

    expect(onCreateView).toHaveBeenCalledTimes(1)
    expect(onCreateView).toHaveBeenCalledWith("gallery")
  })

  it("disables reserved types and implemented types the seed does not authorize", () => {
    const onCreateView = vi.fn()
    render(
      <TooltipProvider>
        <ViewTypePicker creatableViewTypes={["table", "gallery"]} onCreateView={onCreateView} />
      </TooltipProvider>
    )

    openPicker()

    expect(screen.getByRole("menuitem", { name: /calendar/i })).toHaveAttribute("data-disabled")
    const kanbanItem = screen.getByRole("menuitem", { name: /kanban/i })
    expect(kanbanItem).toHaveAttribute("data-disabled")

    fireEvent.click(kanbanItem)

    expect(onCreateView).not.toHaveBeenCalled()
  })

  it("renders a 4-column grid inside a properly sized card container", () => {
    render(
      <TooltipProvider>
        <ViewTypePicker creatableViewTypes={["table", "gallery"]} onCreateView={vi.fn()} />
      </TooltipProvider>
    )

    openPicker()

    const menu = screen.getByRole("menu")
    expect(menu).toHaveClass("w-[400px]")
    const grid = menu.querySelector(".grid")
    expect(grid).toHaveClass("grid-cols-4")
  })
})
