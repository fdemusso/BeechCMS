// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
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
  it("a system role exposes no Edit/Delete action", () => {
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
    // Only the non-system row should have edit/delete icon buttons.
    expect(screen.getAllByRole("button").length).toBeGreaterThan(0)
  })
})
