// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RolesTab } from "./roles-tab"

const mockRoles = vi.fn()
vi.mock("../hooks/use-rbac", () => ({
  useRbacRoles: () => mockRoles(),
  useDeleteRole: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock("@/features/shared", () => ({
  usePermissions: () => ({ canAnywhere: () => true, effective: { global: new Set(), byScope: new Map() } }),
}))
vi.mock("./role-form-dialog", () => ({ RoleFormDialog: () => null }))

describe("RolesTab", () => {
  it("a system role renders Edit/Delete actions as disabled", () => {
    mockRoles.mockReturnValue({
      data: [
        { id: "r1", name: "SuperAdmin", description: null, isSystem: true, permissions: ["manage_users"], createdAt: 0, updatedAt: 0 },
        { id: "r2", name: "Editor", description: null, isSystem: false, permissions: ["content:read"], createdAt: 0, updatedAt: 0 },
      ],
      isLoading: false,
    })
    render(<RolesTab />)

    expect(screen.getByText("SuperAdmin")).toBeInTheDocument()
    expect(screen.getByText("System")).toBeInTheDocument()
    const row = screen.getByText("SuperAdmin").closest("tr")!
    const buttons = row.querySelectorAll("button")
    expect(buttons.length).toBe(2)
    expect(buttons[0]).toBeDisabled()
    expect(buttons[1]).toBeDisabled()
  })

  it("renders permission badges directly when within max limit", () => {
    mockRoles.mockReturnValue({
      data: [
        {
          id: "r1",
          name: "Editor",
          description: null,
          isSystem: false,
          permissions: ["content:read", "content:create"],
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      isLoading: false,
    })
    render(<RolesTab />)

    expect(screen.getByLabelText("Read content")).toBeInTheDocument()
    expect(screen.getByLabelText("Create content")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /\+\d+/ })).not.toBeInTheDocument()
  })

  it("stacks permissions and shows +N popover when permissions exceed max", async () => {
    mockRoles.mockReturnValue({
      data: [
        {
          id: "r1",
          name: "Admin",
          description: null,
          isSystem: false,
          permissions: ["content:read", "content:create", "content:update", "content:delete"],
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      isLoading: false,
    })
    render(<RolesTab />)

    // First 2 are rendered directly
    expect(screen.getByLabelText("Read content")).toBeInTheDocument()
    expect(screen.getByLabelText("Create content")).toBeInTheDocument()

    // +2 button is rendered
    const moreButton = screen.getByRole("button", { name: "+2 more" })
    expect(moreButton).toBeInTheDocument()

    // Clicking +2 opens the popover card revealing the remaining permissions
    const user = userEvent.setup()
    await user.click(moreButton)

    expect(await screen.findByLabelText("Update content")).toBeInTheDocument()
    expect(screen.getByLabelText("Delete content")).toBeInTheDocument()
  })

  it("opens popover after hovering +N for 200ms and closes after 250ms leave", () => {
    vi.useFakeTimers()
    mockRoles.mockReturnValue({
      data: [
        {
          id: "r1",
          name: "Admin",
          description: null,
          isSystem: false,
          permissions: ["content:read", "content:create", "content:update", "content:delete"],
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      isLoading: false,
    })
    render(<RolesTab />)

    const moreButton = screen.getByRole("button", { name: "+2 more" })

    // Hover +N
    fireEvent.pointerEnter(moreButton)

    // Before 200ms, not open yet
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(screen.queryByLabelText("Update content")).not.toBeInTheDocument()

    // At 200ms, opens
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(screen.getByLabelText("Update content")).toBeInTheDocument()

    // Leave +N
    fireEvent.pointerLeave(moreButton)

    // Before 250ms, still open
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(screen.getByLabelText("Update content")).toBeInTheDocument()

    // After 250ms, closes
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(screen.queryByLabelText("Update content")).not.toBeInTheDocument()

    vi.useRealTimers()
  })
})
