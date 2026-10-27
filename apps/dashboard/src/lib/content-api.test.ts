// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { clearAccessToken } from "@/lib/api"
import { fetchKanbanColumn, moveKanbanCard } from "@/lib/content-api"

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

describe("content-api (kanban)", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    clearAccessToken()
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal("fetch", fetchMock)
    vi.stubGlobal("window", {})
    vi.stubGlobal("location", { pathname: "/admin/login", replace: vi.fn() })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("fetchKanbanColumn", () => {
    it("requests the column with the axis, page window and filters as a JSON string, leaving unset params out", async () => {
      const envelope = { items: [], total: 0, page: 1, limit: 20, relations: {} }
      fetchMock.mockResolvedValueOnce(json(200, envelope))
      const filters = [{ column: "br_11", type: "tags" as const, conditions: [{ op: "eq" as const, value: "low" }] }]

      const result = await fetchKanbanColumn("posts", { kanbanAxis: "br_11", limit: 20, offset: 40, filters })

      const [url, init] = fetchMock.mock.calls[0]
      const { pathname, searchParams } = new URL(String(url), "http://x")
      expect(pathname).toBe("/api/content/posts")
      expect([...searchParams.keys()]).toEqual(["kanbanAxis", "limit", "offset", "filters"])
      expect(searchParams.get("offset")).toBe("40")
      expect(JSON.parse(searchParams.get("filters") ?? "")).toEqual(filters)
      expect(init?.method).toBe("GET")
      expect(result).toEqual(envelope)
    })

    it("sends search and sort when they are set", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { items: [], total: 0, page: 1, limit: 20, relations: {} }))

      await fetchKanbanColumn("posts", { kanbanAxis: "br_11", limit: 20, offset: 0, search: "x", sortBy: "br_01", sortDir: "desc" })

      expect(String(fetchMock.mock.calls[0][0])).toBe("/api/content/posts?kanbanAxis=br_11&limit=20&offset=0&search=x&sortBy=br_01&sortDir=desc")
    })
  })

  describe("moveKanbanCard", () => {
    it("patches the move body as JSON to the kanban-move route of the entry", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { success: true }))

      const result = await moveKanbanCard("posts", "entry-1", { axisBranchId: "br_11", position: "a0", axis: { value: null } })

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/content/posts/entry-1/kanban-move")
      expect(init?.method).toBe("PATCH")
      expect(init?.body).toBe(JSON.stringify({ axisBranchId: "br_11", position: "a0", axis: { value: null } }))
      expect(result).toEqual({ success: true })
    })
  })
})
