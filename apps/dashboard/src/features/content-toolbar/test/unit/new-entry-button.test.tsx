// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import { toast } from "sonner"

import { TooltipProvider } from "@/components/ui/tooltip"
import { NewEntryButton } from "@/features/content-toolbar/toolbar-components/new-entry-button"

vi.mock("sonner", () => ({ toast: { info: vi.fn() } }))

describe("NewEntryButton", () => {
  it("creates an entry when the user clicks New", () => {
    const onCreate = vi.fn()
    render(
      <TooltipProvider>
        <NewEntryButton canCreate onCreate={onCreate} seedLabel="Posts" />
      </TooltipProvider>
    )

    fireEvent.click(screen.getByText("New"))

    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it("opens a templates menu for the content type with a New template item", async () => {
    render(
      <TooltipProvider>
        <NewEntryButton canCreate onCreate={vi.fn()} seedLabel="Posts" />
      </TooltipProvider>
    )

    fireEvent.pointerDown(screen.getByRole("button", { name: /templates/i }))

    expect(await screen.findByText("Templates for Posts")).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: /new template/i })).toBeInTheDocument()
  })

  it("notifies that templates are not implemented and creates nothing when New template is clicked", async () => {
    const onCreate = vi.fn()
    render(
      <TooltipProvider>
        <NewEntryButton canCreate onCreate={onCreate} seedLabel="Posts" />
      </TooltipProvider>
    )

    fireEvent.pointerDown(screen.getByRole("button", { name: /templates/i }))
    const item = await screen.findByRole("menuitem", { name: /new template/i })

    fireEvent.click(item)

    expect(toast.info).toHaveBeenCalledWith("Templates are not implemented yet.")
    expect(onCreate).not.toHaveBeenCalled()
  })

  it("disables both buttons without content:create", () => {
    render(
      <TooltipProvider>
        <NewEntryButton canCreate={false} onCreate={vi.fn()} seedLabel="Posts" />
      </TooltipProvider>
    )

    expect(screen.getByText("New").closest("button")).toBeDisabled()
    expect(screen.getByRole("button", { name: /templates/i })).toBeDisabled()
  })
})
