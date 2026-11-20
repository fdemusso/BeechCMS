// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"

vi.mock("../hooks/use-rbac", () => {
  const mutation = () => ({ mutateAsync: vi.fn(), isPending: false })
  return {
    useCreateUser: mutation, useCreateRole: mutation, useUpdateRole: mutation, useCreateAssignment: mutation, useDeleteAssignment: mutation,
    useUserAssignments: () => ({ data: [] }),
    useRbacRoles: () => ({ data: [{ id: "r1", name: "Manager", permissions: ["manage_users"] }] }),
  }
})
vi.mock("@/features/shared", () => ({
  useSchema: () => ({ data: [] }),
  usePermissions: () => ({
    can: () => false,
    manageableScopes: ["*"],
    // Holds only reading: every other permission is one the actor cannot hand out.
    effective: { global: new Set(["content:read"]), byScope: new Map() },
  }),
}))

import { UserFormDialog } from "./user-form-dialog"
import { RoleFormDialog } from "./role-form-dialog"
import { AssignmentsDialog } from "./assignments-dialog"

describe("Create account dialog", () => {
  it("keeps the browser from filling in the admin's own details, and offers a new password", () => {
    render(<UserFormDialog open onOpenChange={vi.fn()} />)

    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "off")
    expect(screen.getByLabelText("Name")).toHaveAttribute("autocomplete", "off")
    expect(screen.getByLabelText("Surname")).toHaveAttribute("autocomplete", "off")
    const password = screen.getByLabelText("Password")
    expect(password).toHaveAttribute("autocomplete", "new-password")
    expect(password).toHaveAttribute("type", "password")
    expect(screen.getByRole("button", { name: "Show password" })).toBeInTheDocument()
  })
})

describe("Role dialog", () => {
  it("groups the permissions as fieldsets, so a checkbox is read with its group", () => {
    render(<RoleFormDialog open onOpenChange={vi.fn()} />)

    const permissions = screen.getByRole("group", { name: "Permissions" })
    const content = within(permissions).getByRole("group", { name: "Content" })
    expect(within(content).getByRole("checkbox", { name: "read" })).toBeInTheDocument()
  })

  it("says in words why some permissions cannot be ticked, and ties them to that line", () => {
    render(<RoleFormDialog open onOpenChange={vi.fn()} />)

    const hint = screen.getByText(/Greyed-out permissions are ones you do not hold/)
    const create = screen.getByRole("checkbox", { name: "create" })
    expect(create).toBeDisabled()
    expect(create.getAttribute("aria-describedby")).toBe(hint.id)
    expect(screen.getByRole("checkbox", { name: "read" })).not.toHaveAttribute("aria-describedby")
  })

  it("keeps autofill out of the role name", () => {
    render(<RoleFormDialog open onOpenChange={vi.fn()} />)
    expect(screen.getByLabelText("Name")).toHaveAttribute("autocomplete", "off")
  })
})

describe("Roles of one person dialog", () => {
  it("names the two pickers, which have no visible label of their own", () => {
    render(<AssignmentsDialog open onOpenChange={vi.fn()} userId="u2" userEmail="u2@beech.local" />)

    expect(screen.getByRole("combobox", { name: "Role to assign" })).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Where it applies" })).toBeInTheDocument()
  })
})
