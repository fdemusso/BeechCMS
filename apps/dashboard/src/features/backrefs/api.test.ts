// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Tests for backrefs/api.ts: the real `hc` client against a stubbed `fetch`, so the URL, the verb
 * and the query string of the backrefs endpoint are pinned.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { backrefsApi } from "./api"

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

const mockGroups = [
  {
    sourceSlug: "articles",
    sourceLabel: "Articles",
    branchAlias: "author_id",
    branchLabel: "Author",
    relationship: "single",
    restricts: false,
    total: 3,
    items: [{ id: "art-1", displayName: "Hello World", status: "published", updated_at: 0 }],
  },
]

describe("backrefsApi", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("fetch", () => {
    it("requests the preview of every group and returns them", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { groups: mockGroups }))

      const result = await backrefsApi.fetch("team", "member-1")

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/content/team/member-1/backrefs")
      expect(init?.method).toBe("GET")
      expect(result.groups).toEqual(mockGroups)
    })

    it("propagates errors from the API", async () => {
      fetchMock.mockRejectedValueOnce(new Error("Network error"))

      await expect(backrefsApi.fetch("team", "member-1")).rejects.toThrow("Network error")
    })
  })

  describe("fetchGroup", () => {
    it("requests one group with the page and the limit", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { groups: mockGroups }))

      await backrefsApi.fetchGroup("team", "member-1", "articles", "author_id", 2, 10)

      const url = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost")
      expect(url.pathname).toBe("/api/content/team/member-1/backrefs")
      expect(Object.fromEntries(url.searchParams)).toEqual({ group: "articles:author_id", page: "2", limit: "10" })
    })

    it("defaults to page 1 and limit 20", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { groups: [] }))

      await backrefsApi.fetchGroup("team", "member-1", "articles", "author_id")

      const url = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost")
      expect(Object.fromEntries(url.searchParams)).toEqual({ group: "articles:author_id", page: "1", limit: "20" })
    })

    it("returns the groups of the response", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { groups: mockGroups }))

      const result = await backrefsApi.fetchGroup("team", "member-1", "articles", "author_id")

      expect(result.groups).toHaveLength(1)
      expect(result.groups[0].sourceSlug).toBe("articles")
    })
  })
})
