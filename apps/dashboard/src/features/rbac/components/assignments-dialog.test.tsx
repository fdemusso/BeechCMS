// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AssignmentsDialog } from "./assignments-dialog"

const mockAssignments = vi.fn()
const mockRoles = vi.fn()
vi.mock("../hooks/use-rbac", () => ({
  useUserAssignments: () => mockAssignments(),
  useCreateAssignment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteAssignment: () => ({ mutateAsync: vi.fn() }),
  useRbacRoles: () => mockRoles(),
}))
vi.mock("@/features/shared", () => ({
  usePermissions: () => ({
    can: (permission: string) => permission === "content:read",
    manageableScopes: ["articles"],
  }),
  useSchema: () => ({ data: [{ slug: "articles", label: "Articles", labelPlural: "Articles" }] }),
}))

describe("AssignmentsDialog", () => {
  it("disables Add before a role/scope is chosen, and keeps it disabled for a role the actor cannot fully grant (advisory escalation pre-check)", async () => {
    mockAssignments.mockReturnValue({ data: [] })
    mockRoles.mockReturnValue({
      data: [{ id: "r1", name: "Manager", description: null, isSystem: false, permissions: ["manage_users"], createdAt: 0, updatedAt: 0 }],
    })

    render(
      <AssignmentsDialog open={true} onOpenChange={vi.fn()} userId="u2" userEmail="u2@beech.local" />
    )

    // Nothing selected yet ⇒ disabled trivially.
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled()

    const user = userEvent.setup()
    const roleTrigger = screen.getAllByRole("combobox").find((el) => el.textContent === "Role")
    await user.click(roleTrigger!)
    await user.click(await screen.findByRole("option", { name: "Manager" }))

    // The mocked actor only holds `content:read`, never `manage_users` — the role's
    // permission — on any scope, so Add must stay disabled even once a role is picked.
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled()
  })
})
