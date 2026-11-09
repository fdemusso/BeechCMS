// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { SETTINGS_ENTRIES } from "../lib/settings-registry"

const soon = Math.floor(Date.now() / 1000) + 86_400

const users = [
  { id: "u2", email: "other@beech.local", name: "Other", surname: "Person", isActive: true, createdAt: 0, assignments: [{ id: "a1", roleId: "r2", scope: "*" }] },
  { id: "u1", email: "me@beech.local", name: "Me", surname: null, isActive: true, createdAt: 0, assignments: [] },
  { id: "u3", email: "gone@beech.local", name: null, surname: null, isActive: false, createdAt: 0, assignments: [] },
]
const roles = [
  { id: "r1", name: "SuperAdmin", description: "Everything", isSystem: true, icon: "Shield", permissions: ["manage_users"], createdAt: 0, updatedAt: 0 },
  { id: "r2", name: "Editor", description: null, isSystem: false, icon: "Users", permissions: ["content:read", "content:update"], createdAt: 0, updatedAt: 0 },
]
const invitations = [
  { id: "i1", email: "pending@beech.local", roleId: "r2", roleName: "Editor", scope: "*", invitedBy: "u1", expiresAt: soon, createdAt: 0, status: "pending" },
  { id: "i2", email: "accepted@beech.local", roleId: "r2", roleName: "Editor", scope: "*", invitedBy: "u1", expiresAt: soon, createdAt: 0, status: "accepted" },
]

vi.mock("@/features/rbac/hooks/use-rbac", () => {
  const mutation = () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false })
  return {
    useRbacUsers: () => ({ data: users, isLoading: false }),
    useRbacRoles: () => ({ data: roles, isLoading: false }),
    useInvitations: () => ({ data: invitations, isLoading: false }),
    useSetUserActive: mutation, useRegenerateInvitation: mutation, useRevokeInvitation: mutation, useDeleteRole: mutation,
    useCreateUser: mutation, useCreateInvitation: mutation, useCreateRole: mutation, useUpdateRole: mutation,
    useCreateAssignment: mutation, useDeleteAssignment: mutation,
    useUserAssignments: () => ({ data: [] }),
  }
})
vi.mock("@/features/shared", () => ({
  useMe: () => ({ data: { id: "u1" } }),
  useSchema: () => ({ data: [] }),
  usePermissions: () => ({
    canAnywhere: () => true,
    canGlobally: () => true,
    can: () => true,
    manageableScopes: ["*"],
    effective: { global: new Set(["manage_users"]), byScope: new Map() },
    isLoading: false,
  }),
}))

import { PeopleTab } from "./people-tab"

/**
 * The shape of Users & roles, written down as tests: three sections in the order of the sidebar bookmarks, each a
 * table whose columns are named at the top, a single action beside each title, and every button named after the
 * thing it acts on, so a screen reader never meets "button, button, button".
 */
describe("Users & roles markup", () => {
  beforeEach(() => {
    render(<PeopleTab />)
  })

  it("is the sections of the sidebar bookmarks, in the same order, each opened by one heading", () => {
    const bookmarks = SETTINGS_ENTRIES.find((entry) => entry.id === "people")!.sections.map((section) => section.id)
    const sectionIds = Array.from(document.querySelectorAll("section")).map((section) => section.id.replace("settings-section-", ""))
    expect(sectionIds).toEqual(bookmarks)
    expect(screen.getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["Users", "Invitations", "Roles"])
  })

  it("never repeats an id", () => {
    const ids = Array.from(document.querySelectorAll("[id]")).map((el) => el.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("is three named tables, one body row per person, invitation and role", () => {
    const bodyRows = (name: string) => within(screen.getByRole("table", { name })).getAllByRole("row").slice(1)
    expect(bodyRows("Users")).toHaveLength(users.length)
    expect(bodyRows("Invitations")).toHaveLength(invitations.length)
    expect(bodyRows("Roles")).toHaveLength(roles.length)
  })

  it("names every column at the top of its table", () => {
    const columns = (name: string) => within(screen.getByRole("table", { name })).getAllByRole("columnheader").map((h) => h.textContent)
    expect(columns("Users")).toEqual(["Email", "Name", "Roles", "Actions"])
    expect(columns("Invitations")).toEqual(["Email", "Role", "Scope", "Status", "Expires", "Actions"])
    expect(columns("Roles")).toEqual(["Name", "Description", "Permissions", "Actions"])
  })

  it("puts the one action of each section in its title row", () => {
    for (const [region, action] of [["Users", "Create account"], ["Invitations", "Invite"], ["Roles", "Create role"]] as const) {
      const section = screen.getByRole("region", { name: region })
      expect(within(section).getByRole("button", { name: action })).toBeInTheDocument()
    }
  })

  it("puts the caller first, and says why their switch is off", () => {
    const rows = within(screen.getByRole("table", { name: "Users" })).getAllByRole("row").slice(1)
    expect(rows[0]).toHaveTextContent("me@beech.local")
    const own = within(rows[0]).getByRole("switch", { name: "Account active: me@beech.local" })
    expect(own).toBeDisabled()
    expect(own).toHaveAccessibleDescription("You cannot deactivate your own account")
    expect(within(rows[1]).getByRole("switch", { name: "Account active: other@beech.local" })).toBeEnabled()
  })

  it("marks a switched-off account and an account with no role in words", () => {
    expect(screen.getByText("Inactive")).toBeInTheDocument()
    expect(screen.getAllByText("No access").length).toBeGreaterThan(0)
  })

  it("names every button after the person, invitation or role it acts on", () => {
    expect(screen.getByRole("button", { name: "Manage roles of other@beech.local" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Regenerate the invitation for pending@beech.local" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Revoke the invitation for accepted@beech.local" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Edit role Editor" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Delete role Editor" })).toBeEnabled()
  })

  it("leaves no button without a name", () => {
    for (const button of screen.getAllByRole("button")) expect(button).toHaveAccessibleName()
  })

  it("gives an accepted invitation no Regenerate, only Revoke", () => {
    expect(screen.queryByRole("button", { name: "Regenerate the invitation for accepted@beech.local" })).not.toBeInTheDocument()
  })

  it("shows when an invitation expires as a real date", () => {
    const table = screen.getByRole("table", { name: "Invitations" })
    expect(table.querySelectorAll("time[datetime]")).toHaveLength(invitations.length)
  })

  it("marks a system role, keeps its buttons off and says why", () => {
    const row = screen.getByText("SuperAdmin").closest("tr")!
    expect(within(row).getByText("System")).toBeInTheDocument()
    const edit = within(row).getByRole("button", { name: "Edit role SuperAdmin" })
    expect(edit).toBeDisabled()
    expect(edit).toHaveAccessibleDescription("A system role is built in and cannot be changed or deleted.")
  })
})
