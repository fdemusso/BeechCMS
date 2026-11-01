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
  me: vi.fn(),
}))

// The builder waits for me: its generated draft and its widget palette depend on the caller's authority.
vi.mock("@/lib/rpc", () => ({
  rpc: { api: {
    settings: { me: { $get: mocked.me } },
    "dashboard-layout": {
      $get: mocked.getLayout,
      $put: mocked.saveLayout,
      $delete: mocked.resetLayout,
      roles: { $get: mocked.getRoles },
    },
  } },
}))

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

import { widgetClientFromGet } from "@/test/widget-client"
import { FULL_AUTHORITY, meResponseBody } from "@/test/me-payload"
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
// The stored row's version, echoed back by the builder as the `If-Match` precondition.
const STORED_VERSION = 1_700_000_000

// A reload after a conflict lands on a newer stored version.
const RELOADED_VERSION = STORED_VERSION + 1
const CONFLICT_TITLE = "The layout was changed by someone else"
const CONFLICT = new ApiError(409, { type: "layout-conflict", detail: "Changed by someone else." })
const LAYOUT_ONLY_AUTHORITY = { global: ["manage_layout", "content:read"], byScope: {} }
const LOCKED_PLACEHOLDER = { id: "widget-locked", type: "core/locked", config: {} }

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

function stored(updatedAt: number, layout: DashboardLayout = makeLayout()) {
  return { json: async () => ({ layout, updatedAt }) }
}

function makeLockedLayout(): DashboardLayout {
  const layout = makeLayout()
  layout.pages[0].sections[0].columns[0].widgets.unshift(LOCKED_PLACEHOLDER)
  return layout
}

describe("DashboardBuilderDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.getLayout.mockResolvedValue({ json: async () => ({ layout: null, updatedAt: null }) })
    mocked.getRoles.mockResolvedValue({ json: async () => ROLES })
    mocked.me.mockResolvedValue({ json: async () => meResponseBody(FULL_AUTHORITY) })
  })

  it("saves the cleaned layout via PUT with the loaded version as If-Match and invalidates the layout query on success", async () => {
    mocked.getLayout.mockResolvedValue({ json: async () => ({ layout: makeLayout(), updatedAt: STORED_VERSION }) })
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
    expect(mocked.saveLayout).toHaveBeenCalledWith(
      { json: expect.objectContaining({ version: 1 }) },
      { headers: { "If-Match": `"${STORED_VERSION}"` } },
    )
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("saves with If-None-Match: * when the builder loaded no stored layout", async () => {
    mocked.saveLayout.mockResolvedValue({
      json: async () => ({ ok: true, layout: makeLayout(), warnings: [], updatedAt: STORED_VERSION }),
    })
    render(
      <DashboardBuilderDialog open onOpenChange={vi.fn()} initialLayout={makeLayout()} />,
      { wrapper: wrapper(makeQueryClient()) },
    )
    await userEvent.click(await screen.findByRole("button", { name: "Add Section" }))

    await userEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(mocked.saveLayout).toHaveBeenCalledTimes(1))
    expect(mocked.saveLayout).toHaveBeenCalledWith(expect.anything(), { headers: { "If-None-Match": "*" } })
  })

  it("opens the conflict prompt and toasts nothing when the save is refused with 409 layout-conflict", async () => {
    mocked.getLayout.mockResolvedValue(stored(STORED_VERSION))
    mocked.saveLayout.mockRejectedValue(CONFLICT)
    const onOpenChange = vi.fn()
    render(
      <DashboardBuilderDialog open onOpenChange={onOpenChange} initialLayout={makeLayout()} />,
      { wrapper: wrapper(makeQueryClient()) },
    )
    await userEvent.click(await screen.findByRole("button", { name: "Add Section" }))

    await userEvent.click(screen.getByRole("button", { name: "Save" }))

    const prompt = await screen.findByRole("alertdialog")
    expect(within(prompt).getByText(CONFLICT_TITLE)).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it("reloading from the conflict prompt refetches the layout and the next save sends the new version as If-Match", async () => {
    mocked.getLayout.mockResolvedValueOnce(stored(STORED_VERSION)).mockResolvedValue(stored(RELOADED_VERSION))
    mocked.saveLayout.mockRejectedValueOnce(CONFLICT).mockResolvedValue({
      json: async () => ({ ok: true, layout: makeLayout(), warnings: [] }),
    })
    render(
      <DashboardBuilderDialog open onOpenChange={vi.fn()} initialLayout={makeLayout()} />,
      { wrapper: wrapper(makeQueryClient()) },
    )
    await userEvent.click(await screen.findByRole("button", { name: "Add Section" }))
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    const prompt = await screen.findByRole("alertdialog")

    await userEvent.click(within(prompt).getByRole("button", { name: "Confirm" }))

    await waitFor(() => expect(mocked.getLayout).toHaveBeenCalledTimes(2))
    // A disabled Save means the controller remounted from the reloaded version with a clean draft.
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeDisabled())
    await userEvent.click(screen.getByRole("button", { name: "Add Section" }))
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(mocked.saveLayout).toHaveBeenCalledTimes(2))
    expect(mocked.saveLayout).toHaveBeenLastCalledWith(expect.anything(), { headers: { "If-Match": `"${RELOADED_VERSION}"` } })
  })

  it("reloading from the conflict prompt discards the unsaved draft", async () => {
    mocked.getLayout.mockResolvedValue(stored(STORED_VERSION))
    mocked.saveLayout.mockRejectedValue(CONFLICT)
    render(
      <DashboardBuilderDialog open onOpenChange={vi.fn()} initialLayout={makeLayout()} />,
      { wrapper: wrapper(makeQueryClient()) },
    )
    const sectionsBefore = (await screen.findAllByRole("button", { name: /Add Widget/i })).length
    await userEvent.click(screen.getByRole("button", { name: "Add Section" }))
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    const prompt = await screen.findByRole("alertdialog")

    await userEvent.click(within(prompt).getByRole("button", { name: "Confirm" }))

    await waitFor(() => expect(screen.getAllByRole("button", { name: /Add Widget/i })).toHaveLength(sectionsBefore))
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
  })

  it("keeps the draft when the conflict prompt is cancelled", async () => {
    mocked.getLayout.mockResolvedValue(stored(STORED_VERSION))
    mocked.saveLayout.mockRejectedValue(CONFLICT)
    render(
      <DashboardBuilderDialog open onOpenChange={vi.fn()} initialLayout={makeLayout()} />,
      { wrapper: wrapper(makeQueryClient()) },
    )
    const sectionsBefore = (await screen.findAllByRole("button", { name: /Add Widget/i })).length
    await userEvent.click(screen.getByRole("button", { name: "Add Section" }))
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    const prompt = await screen.findByRole("alertdialog")

    await userEvent.click(within(prompt).getByRole("button", { name: "Cancel" }))

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(screen.getAllByRole("button", { name: /Add Widget/i })).toHaveLength(sectionsBefore + 1)
    expect(mocked.getLayout).toHaveBeenCalledTimes(1)
  })

  it("opens the conflict prompt when the reset is refused with 409 layout-conflict", async () => {
    mocked.getLayout.mockResolvedValue(stored(STORED_VERSION))
    mocked.resetLayout.mockRejectedValue(CONFLICT)
    render(
      <DashboardBuilderDialog open onOpenChange={vi.fn()} initialLayout={makeLayout()} />,
      { wrapper: wrapper(makeQueryClient()) },
    )
    await userEvent.click(await screen.findByRole("button", { name: "Reset" }))
    const resetPrompt = await screen.findByRole("alertdialog")

    await userEvent.click(within(resetPrompt).getByRole("button", { name: "Confirm" }))

    expect(await screen.findByText(CONFLICT_TITLE)).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("refetches the stored layout on every opening instead of reusing the cached version", async () => {
    mocked.getLayout.mockResolvedValue(stored(STORED_VERSION))
    const { rerender } = render(
      <DashboardBuilderDialog open onOpenChange={vi.fn()} initialLayout={makeLayout()} />,
      { wrapper: wrapper(makeQueryClient()) },
    )
    await screen.findByRole("button", { name: "Add Section" })

    rerender(<DashboardBuilderDialog open={false} onOpenChange={vi.fn()} initialLayout={makeLayout()} />)
    rerender(<DashboardBuilderDialog open onOpenChange={vi.fn()} initialLayout={makeLayout()} />)

    await waitFor(() => expect(mocked.getLayout).toHaveBeenCalledTimes(2))
  })

  it("never requests GET /roles for an author holding manage_layout but not manage_roles", async () => {
    mocked.me.mockResolvedValue({ json: async () => meResponseBody(LAYOUT_ONLY_AUTHORITY) })
    mocked.getLayout.mockResolvedValue(stored(STORED_VERSION))
    render(
      <DashboardBuilderDialog open onOpenChange={vi.fn()} initialLayout={makeLayout()} />,
      { wrapper: wrapper(makeQueryClient()) },
    )

    await screen.findByRole("button", { name: "Add Section" })

    expect(mocked.getRoles).not.toHaveBeenCalled()
  })

  it("saves a manage_layout-only author's content edit with the loaded version as If-Match", async () => {
    mocked.me.mockResolvedValue({ json: async () => meResponseBody(LAYOUT_ONLY_AUTHORITY) })
    mocked.getLayout.mockResolvedValue(stored(STORED_VERSION))
    mocked.saveLayout.mockResolvedValue({ json: async () => ({ ok: true, layout: makeLayout(), warnings: [] }) })
    render(
      <DashboardBuilderDialog open onOpenChange={vi.fn()} initialLayout={makeLayout()} />,
      { wrapper: wrapper(makeQueryClient()) },
    )
    await userEvent.click(await screen.findByRole("button", { name: "Add Section" }))

    await userEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(mocked.saveLayout).toHaveBeenCalledTimes(1))
    expect(mocked.saveLayout).toHaveBeenCalledWith(expect.anything(), { headers: { "If-Match": `"${STORED_VERSION}"` } })
  })

  it("sends a locked placeholder back unchanged at its original column when saving", async () => {
    mocked.me.mockResolvedValue({ json: async () => meResponseBody(LAYOUT_ONLY_AUTHORITY) })
    mocked.getLayout.mockResolvedValue(stored(STORED_VERSION, makeLockedLayout()))
    mocked.saveLayout.mockResolvedValue({ json: async () => ({ ok: true, layout: makeLockedLayout(), warnings: [] }) })
    render(
      <DashboardBuilderDialog open onOpenChange={vi.fn()} initialLayout={makeLayout()} />,
      { wrapper: wrapper(makeQueryClient()) },
    )
    await userEvent.click(await screen.findByRole("button", { name: "Add Section" }))

    await userEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(mocked.saveLayout).toHaveBeenCalledTimes(1))
    const { json: saved } = mocked.saveLayout.mock.calls[0][0] as { json: DashboardLayout }
    const firstColumn = saved.pages[0].sections[0].columns[0]
    expect(firstColumn.id).toBe("col-1")
    expect(firstColumn.widgets).toContainEqual(LOCKED_PLACEHOLDER)
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
    mocked.getLayout.mockResolvedValue({ json: async () => ({ layout: orphanLayout, updatedAt: STORED_VERSION }) })
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
    mocked.getLayout.mockResolvedValue({ json: async () => ({ layout: targetedLayout, updatedAt: STORED_VERSION }) })
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
    expect(mocked.saveLayout).toHaveBeenCalledWith(
      { json: expect.objectContaining({ pages: [expect.objectContaining({ roles: [ROLE_EDITOR_ID] })] }) },
      { headers: { "If-Match": `"${STORED_VERSION}"` } },
    )
  })

  it("resets the layout via DELETE with the loaded version as If-Match and closes the dialog", async () => {
    mocked.getLayout.mockResolvedValue({ json: async () => ({ layout: makeLayout(), updatedAt: STORED_VERSION }) })
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
    expect(mocked.resetLayout).toHaveBeenCalledWith(undefined, { headers: { "If-Match": `"${STORED_VERSION}"` } })
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("saves a generated draft without the setup checklist for an author lacking manage_users", async () => {
    const author = { global: ["manage_roles", "content:read"], byScope: {} }
    mocked.me.mockResolvedValue({ json: async () => meResponseBody(author) })
    mocked.saveLayout.mockResolvedValue({
      json: async () => ({ ok: true, layout: makeLayout(), warnings: [] }),
    })
    render(
      <DashboardBuilderDialog open onOpenChange={vi.fn()} initialLayout={makeLayout()} />,
      { wrapper: wrapper(makeQueryClient()) },
    )
    await userEvent.click(await screen.findByRole("button", { name: "Add Section" }))

    await userEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(mocked.saveLayout).toHaveBeenCalledTimes(1))
    const { json: saved } = mocked.saveLayout.mock.calls[0][0] as { json: DashboardLayout }
    const savedTypes = saved.pages.flatMap((page) =>
      page.sections.flatMap((section) => section.columns.flatMap((col) => col.widgets.map((w) => w.type))),
    )
    expect(savedTypes).toEqual(["core/publication-stats"])
  })
})
