// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RoleFormDialog } from "./role-form-dialog"

const mockCreateRole = vi.fn()
const mockUpdateRole = vi.fn()

vi.mock("../hooks/use-rbac", () => ({
  useCreateRole: () => ({ mutateAsync: mockCreateRole, isPending: false }),
  useUpdateRole: () => ({ mutateAsync: mockUpdateRole, isPending: false }),
}))

vi.mock("@/features/shared", () => ({
  usePermissions: () => ({
    effective: {
      global: new Set(["content:read", "content:create", "manage_users"]),
      byScope: new Map(),
    },
  }),
}))

describe("RoleFormDialog", () => {
  it("renders the icon button with default Users icon and submits with icon", async () => {
    mockCreateRole.mockResolvedValue({ id: "new-r1" })
    const onOpenChange = vi.fn()
    const user = userEvent.setup()

    render(<RoleFormDialog open={true} onOpenChange={onOpenChange} />)

    // Verify icon button exists with selectIcon label
    const iconBtn = screen.getByRole("button", { name: "Select icon" })
    expect(iconBtn).toBeInTheDocument()

    // Fill in name
    const nameInput = screen.getByLabelText("Name")
    await user.type(nameInput, "Author")

    // Select content:read permission
    const readCheckbox = screen.getByRole("checkbox", { name: "read" })
    await user.click(readCheckbox)

    // Click Save
    const saveBtn = screen.getByRole("button", { name: "Save" })
    await user.click(saveBtn)

    expect(mockCreateRole).toHaveBeenCalledWith({
      name: "Author",
      description: null,
      icon: "Users",
      permissions: ["content:read"],
    })
  })

  it("allows selecting a different icon from the popover", async () => {
    mockCreateRole.mockResolvedValue({ id: "new-r2" })
    const onOpenChange = vi.fn()
    const user = userEvent.setup()

    render(<RoleFormDialog open={true} onOpenChange={onOpenChange} />)

    const iconBtn = screen.getByRole("button", { name: "Select icon" })
    await user.click(iconBtn)

    // Search and select Shield icon
    const searchInput = screen.getByPlaceholderText("Search icons...")
    await user.type(searchInput, "Shield")

    const shieldOption = screen.getByTitle("Shield")
    await user.click(shieldOption)

    // Fill in name and permission
    await user.type(screen.getByLabelText("Name"), "Security Guard")
    await user.click(screen.getByRole("checkbox", { name: "read" }))

    await user.click(screen.getByRole("button", { name: "Save" }))

    expect(mockCreateRole).toHaveBeenCalledWith({
      name: "Security Guard",
      description: null,
      icon: "Shield",
      permissions: ["content:read"],
    })
  })
})
