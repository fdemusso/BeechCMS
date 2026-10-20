// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import "@/features/dashboard/registry/builtin-widgets"
import { WidgetPickerDialog } from "@/features/dashboard/builder/widget-picker-dialog"

describe("WidgetPickerDialog", () => {
  it("renders nothing when closed", () => {
    render(<WidgetPickerDialog open={false} onOpenChange={vi.fn()} onSelect={vi.fn()} />)
    expect(screen.queryByText("Add Widget")).not.toBeInTheDocument()
  })

  it("renders category groups and widget options when open", () => {
    render(<WidgetPickerDialog open onOpenChange={vi.fn()} onSelect={vi.fn()} />)

    expect(screen.getByText("Add Widget")).toBeInTheDocument()
    // category headings
    expect(screen.getByText("Charts")).toBeInTheDocument()
    expect(screen.getByText("Stats")).toBeInTheDocument()
    expect(screen.getByText("System")).toBeInTheDocument()
    // a known widget label
    expect(screen.getByText("Text")).toBeInTheDocument()
  })

  it("calls onSelect with the widget type when an option is clicked", async () => {
    const onSelect = vi.fn()
    render(<WidgetPickerDialog open onOpenChange={vi.fn()} onSelect={onSelect} />)

    await userEvent.click(screen.getByText("Text"))
    expect(onSelect).toHaveBeenCalledWith("core/text")
  })

  it("invokes onOpenChange when the dialog requests a close", async () => {
    const onOpenChange = vi.fn()
    render(<WidgetPickerDialog open onOpenChange={onOpenChange} onSelect={vi.fn()} />)

    await userEvent.keyboard("{Escape}")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
