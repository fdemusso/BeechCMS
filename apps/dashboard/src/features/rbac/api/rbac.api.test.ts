// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { rbacApi } from "./rbac.api"

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

const account = (id: string) => ({
  id, email: `${id}@beech.local`, name: null, surname: null, role: "editor", isActive: true, createdAt: 0, assignments: [],
})

describe("rbacApi", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("listUsers", () => {
    it("walks every page until nextOffset is null and returns the rows in order", async () => {
      fetchMock
        .mockResolvedValueOnce(json(200, { users: [account("u1"), account("u2")], nextOffset: 2 }))
        .mockResolvedValueOnce(json(200, { users: [account("u3")], nextOffset: null }))

      const users = await rbacApi.listUsers()

      expect(users.map((user) => user.id)).toEqual(["u1", "u2", "u3"])
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(String(fetchMock.mock.calls[0][0])).toBe("/api/rbac/users?limit=100&offset=0")
      expect(String(fetchMock.mock.calls[1][0])).toBe("/api/rbac/users?limit=100&offset=2")
    })
  })

  describe("listInvitations", () => {
    it("requests a single page when the API reports no further offset", async () => {
      const invitation = {
        id: "i1", email: "i1@beech.local", roleId: "r1", roleName: "Editor", scope: "*",
        invitedBy: "u1", expiresAt: 10, createdAt: 0, status: "pending",
      }
      fetchMock.mockResolvedValueOnce(json(200, { invitations: [invitation], nextOffset: null }))

      const invitations = await rbacApi.listInvitations()

      expect(invitations).toEqual([invitation])
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(String(fetchMock.mock.calls[0][0])).toBe("/api/rbac/invitations?limit=100&offset=0")
    })
  })

  describe("createUser", () => {
    it("posts the payload and returns the created account", async () => {
      fetchMock.mockResolvedValueOnce(json(201, account("u9")))

      const created = await rbacApi.createUser({ email: "u9@beech.local", password: "password123" })

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/rbac/users")
      expect(init?.method).toBe("POST")
      expect(init?.body).toBe(JSON.stringify({ email: "u9@beech.local", password: "password123" }))
      expect(created.id).toBe("u9")
    })
  })

  describe("setUserActive", () => {
    it("patches the active flag of the user", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { id: "u1", isActive: false }))

      await rbacApi.setUserActive("u1", false)

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/rbac/users/u1/active")
      expect(init?.method).toBe("PATCH")
      expect(init?.body).toBe(JSON.stringify({ isActive: false }))
    })
  })

  describe("listAssignments", () => {
    it("returns the assignments array of the user", async () => {
      const assignment = { id: "a1", userId: "u1", roleId: "r1", scope: "*", active: true, roleName: "Editor", permissions: [] }
      fetchMock.mockResolvedValueOnce(json(200, { assignments: [assignment] }))

      const assignments = await rbacApi.listAssignments("u1")

      expect(String(fetchMock.mock.calls[0][0])).toBe("/api/rbac/users/u1/assignments")
      expect(assignments).toEqual([assignment])
    })
  })

  describe("createAssignment", () => {
    it("posts the user, role and scope", async () => {
      fetchMock.mockResolvedValueOnce(json(201, { id: "a1", userId: "u1", roleId: "r1", scope: "articles" }))

      const created = await rbacApi.createAssignment({ userId: "u1", roleId: "r1", scope: "articles" })

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/rbac/assignments")
      expect(init?.method).toBe("POST")
      expect(init?.body).toBe(JSON.stringify({ userId: "u1", roleId: "r1", scope: "articles" }))
      expect(created.id).toBe("a1")
    })
  })

  describe("deleteAssignment", () => {
    it("deletes the assignment by id", async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

      await rbacApi.deleteAssignment("a1")

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/rbac/assignments/a1")
      expect(init?.method).toBe("DELETE")
    })
  })

  describe("roles", () => {
    it("listRoles returns the roles array", async () => {
      const role = { id: "r1", name: "Editor", description: null, isSystem: false, permissions: ["content:read"], createdAt: 0, updatedAt: 0 }
      fetchMock.mockResolvedValueOnce(json(200, { roles: [role] }))

      const roles = await rbacApi.listRoles()

      expect(String(fetchMock.mock.calls[0][0])).toBe("/api/rbac/roles")
      expect(roles).toEqual([role])
    })

    it("createRole posts the body and returns the new id", async () => {
      fetchMock.mockResolvedValueOnce(json(201, { id: "r2" }))

      const created = await rbacApi.createRole({ name: "Reviewer", permissions: ["content:read"] })

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/rbac/roles")
      expect(init?.method).toBe("POST")
      expect(init?.body).toBe(JSON.stringify({ name: "Reviewer", permissions: ["content:read"] }))
      expect(created).toEqual({ id: "r2" })
    })

    it("updateRole puts the whole body under the role id", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { id: "r2" }))

      await rbacApi.updateRole("r2", { name: "Reviewer", permissions: ["content:read"] })

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/rbac/roles/r2")
      expect(init?.method).toBe("PUT")
      expect(init?.body).toBe(JSON.stringify({ name: "Reviewer", permissions: ["content:read"] }))
    })

    it("deleteRole deletes by id", async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

      await rbacApi.deleteRole("r2")

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/rbac/roles/r2")
      expect(init?.method).toBe("DELETE")
    })
  })

  describe("invitations", () => {
    it("createInvitation posts the payload with the email locale", async () => {
      const issued = { id: "i1", email: "i@beech.local", roleId: "r1", scope: "*", expiresAt: 10, inviteUrl: "https://cms/admin/accept-invite?token=t" }
      fetchMock.mockResolvedValueOnce(json(201, issued))

      const result = await rbacApi.createInvitation({ email: "i@beech.local", roleId: "r1", scope: "*", locale: "it" })

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/rbac/invitations")
      expect(init?.method).toBe("POST")
      expect(init?.body).toBe(JSON.stringify({ email: "i@beech.local", roleId: "r1", scope: "*", locale: "it" }))
      expect(result.inviteUrl).toBe(issued.inviteUrl)
    })

    it("regenerateInvitation posts to the regenerate route and returns the new link", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { id: "i1", expiresAt: 20, inviteUrl: "https://cms/admin/accept-invite?token=n" }))

      const result = await rbacApi.regenerateInvitation("i1")

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/rbac/invitations/i1/regenerate")
      expect(init?.method).toBe("POST")
      expect(result.expiresAt).toBe(20)
    })

    it("revokeInvitation deletes by id", async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

      await rbacApi.revokeInvitation("i1")

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/rbac/invitations/i1")
      expect(init?.method).toBe("DELETE")
    })
  })
})
