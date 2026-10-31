// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import "@/features/dashboard/registry/builtin-widgets"
import { WidgetPickerDialog } from "@/features/dashboard/builder/widget-picker-dialog"
import { hydrateEffectivePermissions } from "@/features/shared/hooks/use-permissions"
import { FULL_AUTHORITY } from "@/test/me-payload"

const fullAuthority = hydrateEffectivePermissions(FULL_AUTHORITY)

describe("WidgetPickerDialog", () => {
  it("renders nothing when closed", () => {
    render(<WidgetPickerDialog open={false} onOpenChange={vi.fn()} onSelect={vi.fn()} permissions={fullAuthority} />)
    expect(screen.queryByText("Add Widget")).not.toBeInTheDocument()
  })

  it("renders category groups and widget options when open", () => {
    render(<WidgetPickerDialog open onOpenChange={vi.fn()} onSelect={vi.fn()} permissions={fullAuthority} />)

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
    render(<WidgetPickerDialog open onOpenChange={vi.fn()} onSelect={onSelect} permissions={fullAuthority} />)

    await userEvent.click(screen.getByText("Text"))
    expect(onSelect).toHaveBeenCalledWith("core/text")
  })

  it("invokes onOpenChange when the dialog requests a close", async () => {
    const onOpenChange = vi.fn()
    render(<WidgetPickerDialog open onOpenChange={onOpenChange} onSelect={vi.fn()} permissions={fullAuthority} />)

    await userEvent.keyboard("{Escape}")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("does not offer Setup Checklist or Media Gallery to a caller holding only content:read on posts", () => {
    const reader = hydrateEffectivePermissions({ global: [], byScope: { posts: ["content:read"] } })

    render(<WidgetPickerDialog open onOpenChange={vi.fn()} onSelect={vi.fn()} permissions={reader} />)

    expect(screen.queryByText("Setup Checklist")).not.toBeInTheDocument()
    expect(screen.queryByText("Media Gallery")).not.toBeInTheDocument()
    expect(screen.getByText("Text")).toBeInTheDocument()
  })

  it("drops the Stats heading for a caller with no authority and still offers Text", () => {
    const nobody = hydrateEffectivePermissions(undefined)

    render(<WidgetPickerDialog open onOpenChange={vi.fn()} permissions={nobody} onSelect={vi.fn()} />)

    expect(screen.queryByText("Stats")).not.toBeInTheDocument()
    expect(screen.getByText("Text")).toBeInTheDocument()
  })
})
