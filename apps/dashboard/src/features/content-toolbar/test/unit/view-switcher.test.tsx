// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import { TooltipProvider } from "@/components/ui/tooltip"
import { ViewSwitcher } from "@/features/content-toolbar/toolbar-components/view-switcher"
import type { UserViewInstance } from "@/features/content-toolbar"

const TABLE_VIEW_ID = "3f0b6a52-5c1e-4c8e-9a51-2f7f1c9b8d10"
const GALLERY_VIEW_ID = "8a1e2f3c-9d4b-4a5e-8c6d-1b2a3c4d5e6f"

const views: UserViewInstance[] = [
  { id: TABLE_VIEW_ID, label: "Table", type: "table", enabledTools: [], settings: [] },
  { id: GALLERY_VIEW_ID, label: "Gallery", type: "gallery", enabledTools: [], settings: [] },
]

describe("ViewSwitcher", () => {
  it("renders one tab per view and marks only the active one as selected", () => {
    render(
      <TooltipProvider>
        <ViewSwitcher views={views} activeViewId={TABLE_VIEW_ID} onChangeView={vi.fn()} />
      </TooltipProvider>
    )

    const tabs = screen.getAllByRole("tab")
    expect(tabs).toHaveLength(2)
    expect(screen.getByRole("tab", { name: "Table" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tab", { name: "Gallery" })).toHaveAttribute("aria-selected", "false")
  })

  it("selects a view when the user clicks its tab", () => {
    const onChangeView = vi.fn()
    render(
      <TooltipProvider>
        <ViewSwitcher views={views} activeViewId={TABLE_VIEW_ID} onChangeView={onChangeView} />
      </TooltipProvider>
    )

    fireEvent.click(screen.getByRole("tab", { name: "Gallery" }))

    expect(onChangeView).toHaveBeenCalledWith(GALLERY_VIEW_ID)
  })

  it("marks no tab as selected when no view is active", () => {
    render(
      <TooltipProvider>
        <ViewSwitcher views={views} activeViewId={null} onChangeView={vi.fn()} />
      </TooltipProvider>
    )

    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toHaveAttribute("aria-selected", "false")
    }
  })

  it("renders no add-view trigger when onCreateView is absent", () => {
    render(
      <TooltipProvider>
        <ViewSwitcher views={views} activeViewId={TABLE_VIEW_ID} onChangeView={vi.fn()} />
      </TooltipProvider>
    )

    expect(screen.queryByRole("button", { name: /add view/i })).not.toBeInTheDocument()
  })
})
