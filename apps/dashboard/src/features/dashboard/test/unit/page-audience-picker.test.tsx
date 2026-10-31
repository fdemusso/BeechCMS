// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import { MAX_ROLES_PER_PAGE } from "@beechcms/core"

const mocked = vi.hoisted(() => ({ getRoles: vi.fn() }))

vi.mock("@/lib/rpc", () => ({
  rpc: { api: { "dashboard-layout": { roles: { $get: mocked.getRoles } } } },
}))

import { PageAudiencePicker } from "@/features/dashboard/builder/page-audience-picker"

const ROLE_EDITOR_ID = "5b1f3c1e-7a42-4d2b-9c6e-0a1b2c3d4e51"
const ROLE_MERCHANT_ID = "c8e2a7d4-3f19-4b85-a1d0-6e7f8a9b0c62"
const ORPHAN_ROLE_ID = "e4d9b6a2-1c58-4f37-8b0a-9d2e3f4a5b73"

const ROLES = [
  { id: ROLE_EDITOR_ID, name: "Editor", icon: "Store" },
  { id: ROLE_MERCHANT_ID, name: "Merchant", icon: null },
]

function renderPicker(roleIds: string[], onChange = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(
    <QueryClientProvider client={client}>
      <PageAudiencePicker roleIds={roleIds} onChange={onChange} />
    </QueryClientProvider>,
  )
  return onChange
}

async function openPopover() {
  const trigger = screen.getByRole("button", { name: "Add role" })
  await waitFor(() => expect(trigger).toBeEnabled())
  await userEvent.click(trigger)
}

describe("PageAudiencePicker", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.getRoles.mockResolvedValue({ json: async () => ROLES })
  })

  it("renders Everyone and no chip when roleIds is empty", async () => {
    renderPicker([])

    expect(await screen.findByText("Everyone")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Remove/ })).not.toBeInTheDocument()
  })

  it("renders one chip per targeted role, resolving the name by id", async () => {
    renderPicker([ROLE_MERCHANT_ID, ROLE_EDITOR_ID])

    expect(await screen.findByRole("button", { name: "Remove Merchant" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Remove Editor" })).toBeInTheDocument()
    expect(screen.queryByText("Everyone")).not.toBeInTheDocument()
  })

  it("renders an id absent from the loaded list as a Deleted role chip and never prints the raw id", async () => {
    renderPicker([ORPHAN_ROLE_ID])

    expect(await screen.findByText("Deleted role")).toBeInTheDocument()
    expect(screen.queryByText(ORPHAN_ROLE_ID)).not.toBeInTheDocument()
  })

  it("removing the Deleted role chip calls onChange with the list minus that id", async () => {
    const onChange = renderPicker([ROLE_EDITOR_ID, ORPHAN_ROLE_ID])
    const removeOrphan = await screen.findByRole("button", { name: "Remove Deleted role" })

    await userEvent.click(removeOrphan)

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith([ROLE_EDITOR_ID])
  })

  it("choosing an unselected role in the popover calls onChange with that id appended", async () => {
    const onChange = renderPicker([ROLE_EDITOR_ID])
    await openPopover()

    await userEvent.click(await screen.findByRole("option", { name: /Merchant/ }))

    expect(onChange).toHaveBeenCalledWith([ROLE_EDITOR_ID, ROLE_MERCHANT_ID])
  })

  it("choosing an already-selected role in the popover calls onChange with that id removed", async () => {
    const onChange = renderPicker([ROLE_EDITOR_ID, ROLE_MERCHANT_ID])
    await openPopover()

    await userEvent.click(await screen.findByRole("option", { name: /Editor/ }))

    expect(onChange).toHaveBeenCalledWith([ROLE_MERCHANT_ID])
  })

  it("keeps the add trigger disabled and labels no id Deleted role while the roles request is pending", async () => {
    // Regression guard: an unresolved list must never mark ids orphan, or a slow request would look like a mass deletion.
    mocked.getRoles.mockReturnValue(new Promise(() => {}))

    renderPicker([ORPHAN_ROLE_ID])

    await waitFor(() => expect(mocked.getRoles).toHaveBeenCalledTimes(1))
    expect(screen.queryByText("Deleted role")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add role" })).toBeDisabled()
  })

  it("shows the load error, disables the add trigger and never calls onChange when the roles request rejects", async () => {
    mocked.getRoles.mockRejectedValue(new Error("network down"))

    const onChange = renderPicker([ORPHAN_ROLE_ID])

    expect(await screen.findByText("Could not load roles.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add role" })).toBeDisabled()
    expect(screen.queryByText("Deleted role")).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it("disables an unselected role's item once MAX_ROLES_PER_PAGE ids are selected", async () => {
    // Deterministic UUIDv4 ids (version 4, variant 8): a counter in the last group, never random.
    const manyRoles = Array.from({ length: MAX_ROLES_PER_PAGE + 1 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      name: `Role ${String(index).padStart(2, "0")}`,
      icon: null,
    }))
    mocked.getRoles.mockResolvedValue({ json: async () => manyRoles })
    const selectedIds = manyRoles.slice(0, MAX_ROLES_PER_PAGE).map((role) => role.id)
    renderPicker(selectedIds)
    await openPopover()

    const unselectedItem = await screen.findByRole("option", { name: /Role 32/ })

    expect(unselectedItem).toHaveAttribute("aria-disabled", "true")
  })
})
