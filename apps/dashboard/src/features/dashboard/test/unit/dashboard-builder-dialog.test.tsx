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
  getLayout: vi.fn(),
  saveLayout: vi.fn(),
  resetLayout: vi.fn(),
  getRoles: vi.fn(),
}))

vi.mock("@/lib/rpc", () => ({
  rpc: { api: { "dashboard-layout": {
    $get: mocked.getLayout,
    $put: mocked.saveLayout,
    $delete: mocked.resetLayout,
    roles: { $get: mocked.getRoles },
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

const ROLE_EDITOR_ID = "5b1f3c1e-7a42-4d2b-9c6e-0a1b2c3d4e51"
const ROLE_MERCHANT_ID = "c8e2a7d4-3f19-4b85-a1d0-6e7f8a9b0c62"
const ORPHAN_ROLE_ID = "e4d9b6a2-1c58-4f37-8b0a-9d2e3f4a5b73"

const ROLES = [
  { id: ROLE_EDITOR_ID, name: "Editor", icon: "Store" },
  { id: ROLE_MERCHANT_ID, name: "Merchant", icon: null },
]

function makeLayout(roles?: string[]): DashboardLayout {
  return {
    version: 1,
    pages: [
      {
        id: "page-1",
        slug: "overview",
        label: "Overview",
        ...(roles ? { roles } : {}),
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
    mocked.getLayout.mockResolvedValue({ json: async () => ({ layout: null }) })
    mocked.getRoles.mockResolvedValue({ json: async () => ROLES })
  })

  it("saves the cleaned layout via PUT and invalidates the layout query on success", async () => {
    mocked.saveLayout.mockResolvedValue({
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

    await waitFor(() => expect(mocked.saveLayout).toHaveBeenCalledTimes(1))
    expect(mocked.saveLayout).toHaveBeenCalledWith({
      json: expect.objectContaining({ version: 1 }),
    })
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("shows an error toast and does not close the dialog when the save request fails", async () => {
    mocked.saveLayout.mockRejectedValue(new ApiError(500, { detail: "boom" }))

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

  it("refuses to save when a page targets an id absent from GET /roles", async () => {
    const orphanLayout = makeLayout([ORPHAN_ROLE_ID])
    mocked.getLayout.mockResolvedValue({ json: async () => ({ layout: orphanLayout }) })
    render(
      <DashboardBuilderDialog open onOpenChange={vi.fn()} initialLayout={orphanLayout} />,
      { wrapper: wrapper(makeQueryClient()) },
    )
    await screen.findByText("Deleted role")
    await userEvent.click(screen.getByRole("button", { name: "Add Section" }))

    await userEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    expect(mocked.saveLayout).not.toHaveBeenCalled()
  })

  it("saves a page whose roles are all known", async () => {
    const targetedLayout = makeLayout([ROLE_EDITOR_ID])
    mocked.getLayout.mockResolvedValue({ json: async () => ({ layout: targetedLayout }) })
    mocked.saveLayout.mockResolvedValue({
      json: async () => ({ ok: true, layout: targetedLayout, warnings: [] }),
    })
    render(
      <DashboardBuilderDialog open onOpenChange={vi.fn()} initialLayout={targetedLayout} />,
      { wrapper: wrapper(makeQueryClient()) },
    )
    await screen.findByRole("button", { name: "Remove Editor" })
    await userEvent.click(screen.getByRole("button", { name: "Add Section" }))

    await userEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(mocked.saveLayout).toHaveBeenCalledTimes(1))
    expect(mocked.saveLayout).toHaveBeenCalledWith({
      json: expect.objectContaining({
        pages: [expect.objectContaining({ roles: [ROLE_EDITOR_ID] })],
      }),
    })
  })

  it("resets the layout via DELETE and closes the dialog", async () => {
    mocked.resetLayout.mockResolvedValue({ json: async () => ({ ok: true }) })

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

    await waitFor(() => expect(mocked.resetLayout).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
