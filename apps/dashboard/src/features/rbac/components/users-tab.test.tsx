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
  it("renders rows from the mocked hook, hides Deactivate on the caller's own row, shows the 'You' badge", () => {
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

    // Only one Deactivate button should exist (for the non-self row).
    const deactivateButtons = screen.getAllByText("Deactivate")
    expect(deactivateButtons).toHaveLength(1)
  })
})
