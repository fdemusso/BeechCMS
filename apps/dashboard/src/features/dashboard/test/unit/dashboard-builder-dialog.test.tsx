// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import type { DashboardLayout } from "@beechcms/core"

const mocked = vi.hoisted(() => ({
  scopes: vi.fn(),
  saveScope: vi.fn(),
  resetScope: vi.fn(),
}))

vi.mock("@/lib/rpc", () => ({
  rpc: { api: { "dashboard-layout": {
    scopes: { $get: mocked.scopes },
    ":scope": { $put: mocked.saveScope, $delete: mocked.resetScope },
  } } },
}))

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

import { widgetClientFromGet } from "@/test/widget-client"
import { ApiError } from "@/lib/http/api-error"
import { toast } from "sonner"
import { WidgetSdkProvider } from "@beechcms/widget-sdk"
import { DashboardBuilderDialog } from "@/features/dashboard/builder"

// The widgets in these layouts (core/text) never read the client; it only has to exist.
const widgetClient = widgetClientFromGet(async () => ({ data: [] }))

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <WidgetSdkProvider client={widgetClient}>
        {children}
      </WidgetSdkProvider>
    </QueryClientProvider>
  )
}

function makeLayout(): DashboardLayout {
  return {
    version: 1,
    pages: [
      {
        id: "page-1",
        slug: "overview",
        label: "Overview",
        sections: [
          {
            id: "section-1",
            columns: [{ id: "col-1", widgets: [{ id: "widget-1", type: "core/text", config: { content: "hi" } }] }],
            columnSpans: [12],
          },
        ],
      },
    ],
  }
}

describe("DashboardBuilderDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.scopes.mockResolvedValue({ json: async () => [] })
  })

  it("saves the cleaned layout via PUT and invalidates the layout query on success", async () => {
    mocked.saveScope.mockResolvedValue({
      json: async () => ({ ok: true, layout: makeLayout(), warnings: [] }),
    })

    const onOpenChange = vi.fn()
    render(
      <DashboardBuilderDialog open onOpenChange={onOpenChange} initialLayout={makeLayout()} />,
      { wrapper: wrapper(makeQueryClient()) },
    )

    const addSectionButton = await screen.findByRole("button", { name: "Add Section" })
    await userEvent.click(addSectionButton)

    const saveButton = screen.getByRole("button", { name: "Save" })
    await userEvent.click(saveButton)

    await waitFor(() => expect(mocked.saveScope).toHaveBeenCalledTimes(1))
    expect(mocked.saveScope).toHaveBeenCalledWith({
      param: { scope: "default" },
      json: expect.objectContaining({ version: 1 }),
    })
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("shows an error toast and does not close the dialog when the save request fails", async () => {
    mocked.saveScope.mockRejectedValue(new ApiError(500, { detail: "boom" }))

    const onOpenChange = vi.fn()
    render(
      <DashboardBuilderDialog open onOpenChange={onOpenChange} initialLayout={makeLayout()} />,
      { wrapper: wrapper(makeQueryClient()) },
    )

    const addSectionButton = await screen.findByRole("button", { name: "Add Section" })
    await userEvent.click(addSectionButton)

    const saveButton = screen.getByRole("button", { name: "Save" })
    await userEvent.click(saveButton)

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("boom"))
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it("resets the layout via DELETE and closes the dialog", async () => {
    mocked.resetScope.mockResolvedValue({ json: async () => ({ ok: true }) })

    const onOpenChange = vi.fn()
    render(
      <DashboardBuilderDialog open onOpenChange={onOpenChange} initialLayout={makeLayout()} />,
      { wrapper: wrapper(makeQueryClient()) },
    )

    const resetButton = await screen.findByRole("button", { name: "Reset" })
    await userEvent.click(resetButton)

    const dialog = await screen.findByRole("alertdialog")
    const confirmButton = within(dialog).getByRole("button", { name: "Confirm" })
    await userEvent.click(confirmButton)

    await waitFor(() => expect(mocked.resetScope).toHaveBeenCalledWith({ param: { scope: "default" } }))
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
