// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { UsersTab } from "./users-tab"

const mockUsers = vi.fn()
vi.mock("../hooks/use-rbac", () => ({
  useRbacUsers: () => mockUsers(),
  useSetUserActive: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock("@/features/shared", () => ({
  useMe: () => ({ data: { id: "u1" } }),
  usePermissions: () => ({ manageableScopes: [], can: () => false, canAnywhere: () => false, canGlobally: () => false, effective: { global: new Set(), byScope: new Map() }, isDeveloper: false, isLoading: false }),
  useSchema: () => ({ data: [] }),
}))
vi.mock("./user-form-dialog", () => ({ UserFormDialog: () => null }))
vi.mock("./assignments-dialog", () => ({ AssignmentsDialog: () => null }))

function renderTab() {
  return render(
    <MemoryRouter>
      <UsersTab />
    </MemoryRouter>
  )
}

describe("UsersTab", () => {
  it("renders rows from the mocked hook, disables the switch on caller's own row, and renders manage roles icon button", () => {
    mockUsers.mockReturnValue({
      data: [
        { id: "u1", email: "me@beech.local", name: "Me", surname: null, isActive: true, assignments: [] },
        { id: "u2", email: "other@beech.local", name: "Other", surname: null, isActive: true, assignments: [] },
      ],
      isLoading: false,
    })
    renderTab()

    expect(screen.getByText("me@beech.local")).toBeInTheDocument()
    expect(screen.getByText("You")).toBeInTheDocument()
    expect(screen.getByText("other@beech.local")).toBeInTheDocument()

    // Status switches
    const switches = screen.getAllByRole("switch")
    expect(switches).toHaveLength(2)
    // The caller's own row switch is disabled
    expect(switches[0]).toBeDisabled()
    // The other user's switch is enabled
    expect(switches[1]).not.toBeDisabled()

    // Manage roles icon buttons with accessible label
    const manageRolesButtons = screen.getAllByRole("button", { name: "Manage roles" })
    expect(manageRolesButtons).toHaveLength(2)
  })

  it("always renders the current user in the first position even if returned later in the list", () => {
    mockUsers.mockReturnValue({
      data: [
        { id: "u2", email: "other@beech.local", name: "Other", surname: null, isActive: true, assignments: [] },
        { id: "u3", email: "third@beech.local", name: "Third", surname: null, isActive: true, assignments: [] },
        { id: "u1", email: "me@beech.local", name: "Me", surname: null, isActive: true, assignments: [] },
      ],
      isLoading: false,
    })
    renderTab()

    const rows = screen.getAllByRole("row")
    // rows[0] is table header, rows[1] is the first user row
    expect(rows[1]).toHaveTextContent("me@beech.local")
  })

  it("disables status switch for a developer account (role === 'admin')", () => {
    mockUsers.mockReturnValue({
      data: [
        { id: "u2", email: "dev@beech.local", role: "admin", name: "Dev", surname: null, isActive: true, assignments: [] },
        { id: "u3", email: "editor@beech.local", role: "editor", name: "Editor", surname: null, isActive: true, assignments: [] },
      ],
      isLoading: false,
    })
    renderTab()

    const switches = screen.getAllByRole("switch")
    expect(switches).toHaveLength(2)
    // Developer account switch must be disabled even if not current user
    expect(switches[0]).toBeDisabled()
    // Standard user switch remains enabled
    expect(switches[1]).not.toBeDisabled()
  })
})
