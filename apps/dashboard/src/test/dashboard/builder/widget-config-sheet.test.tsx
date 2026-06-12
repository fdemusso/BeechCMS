// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

import { api } from "@/lib/api"
import "@/features/dashboard/registry/builtin-widgets"
import { WidgetConfigSheet } from "@/features/dashboard/builder/widget-config-sheet"

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
}

function renderWithClient(ui: React.ReactElement) {
  const client = makeQueryClient()
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe("WidgetConfigSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] })
  })

  it("renders nothing (closed sheet) when widget is null", () => {
    renderWithClient(
      <WidgetConfigSheet
        widget={null}
        onOpenChange={vi.fn()}
        onTitleChange={vi.fn()}
        onConfigChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.queryByText("Title")).not.toBeInTheDocument()
  })

  it("renders the widget label and title field when a widget is provided", () => {
    renderWithClient(
      <WidgetConfigSheet
        widget={{ id: "w1", type: "core/text", title: "Custom Title", config: { content: "hello" } }}
        onOpenChange={vi.fn()}
        onTitleChange={vi.fn()}
        onConfigChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getByText("Text")).toBeInTheDocument()
    expect(screen.getByDisplayValue("Custom Title")).toBeInTheDocument()
  })

  it("calls onTitleChange when the title field is edited", async () => {
    const onTitleChange = vi.fn()
    renderWithClient(
      <WidgetConfigSheet
        widget={{ id: "w1", type: "core/text", config: { content: "hello" } }}
        onOpenChange={vi.fn()}
        onTitleChange={onTitleChange}
        onConfigChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    const titleInputs = screen.getAllByRole("textbox")
    await userEvent.type(titleInputs[0], "x")
    expect(onTitleChange).toHaveBeenCalled()
  })

  it("renders ConfigPanel for widgets that define one", () => {
    renderWithClient(
      <WidgetConfigSheet
        widget={{ id: "w1", type: "core/text", config: { content: "hello" } }}
        onOpenChange={vi.fn()}
        onTitleChange={vi.fn()}
        onConfigChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    // core/text has a ConfigPanel with a content textarea + alignment select
    expect(screen.getByText("Content")).toBeInTheDocument()
    expect(screen.queryByText("This widget has no configurable options.")).not.toBeInTheDocument()
  })

  it("shows the no-options message for unknown widget types", () => {
    renderWithClient(
      <WidgetConfigSheet
        widget={{ id: "w1", type: "custom/unknown", config: {} }}
        onOpenChange={vi.fn()}
        onTitleChange={vi.fn()}
        onConfigChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getByText("This widget has no configurable options.")).toBeInTheDocument()
    expect(screen.getByText("custom/unknown")).toBeInTheDocument()
  })

  it("calls onRemove when the remove button is clicked", async () => {
    const onRemove = vi.fn()
    renderWithClient(
      <WidgetConfigSheet
        widget={{ id: "w1", type: "core/text", config: {} }}
        onOpenChange={vi.fn()}
        onTitleChange={vi.fn()}
        onConfigChange={vi.fn()}
        onRemove={onRemove}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: /Remove/i }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })
})
