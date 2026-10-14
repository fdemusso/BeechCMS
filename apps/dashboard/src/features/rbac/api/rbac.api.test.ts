// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }))

import { api } from "@/lib/api"
import { rbacApi } from "./rbac.api"

const page = (users: { id: string }[], nextOffset: number | null) => ({ data: { users, nextOffset } })

describe("rbacApi.listUsers", () => {
  beforeEach(() => vi.clearAllMocks())

  it("walks every page until nextOffset is null and returns the rows in order", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce(page([{ id: "u1" }, { id: "u2" }], 2))
      .mockResolvedValueOnce(page([{ id: "u3" }], null))

    const users = await rbacApi.listUsers()

    expect(users.map((user) => user.id)).toEqual(["u1", "u2", "u3"])
    expect(api.get).toHaveBeenNthCalledWith(1, "/rbac/users", { params: { limit: 100, offset: 0 } })
    expect(api.get).toHaveBeenNthCalledWith(2, "/rbac/users", { params: { limit: 100, offset: 2 } })
  })
})

describe("rbacApi.listInvitations", () => {
  beforeEach(() => vi.clearAllMocks())

  it("requests a single page when the API reports no further offset", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { invitations: [{ id: "i1" }], nextOffset: null } })

    const invitations = await rbacApi.listInvitations()

    expect(invitations).toEqual([{ id: "i1" }])
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith("/rbac/invitations", { params: { limit: 100, offset: 0 } })
  })
})
