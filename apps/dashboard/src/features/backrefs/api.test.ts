// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Tests for backrefs/api.ts — the thin axios wrappers around the backrefs endpoint.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { backrefsApi } from "./api"

// Mock the axios instance
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
  },
}))

import { api } from "@/lib/api"

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

describe("backrefsApi.fetch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls the correct endpoint and returns groups", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { groups: mockGroups } })

    const result = await backrefsApi.fetch("team", "member-1")

    expect(api.get).toHaveBeenCalledWith("/content/team/member-1/backrefs")
    expect(result.groups).toEqual(mockGroups)
  })

  it("propagates errors from the API", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error("Network error"))

    await expect(backrefsApi.fetch("team", "member-1")).rejects.toThrow("Network error")
  })
})

describe("backrefsApi.fetchGroup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls the endpoint with group query param", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { groups: mockGroups } })

    await backrefsApi.fetchGroup("team", "member-1", "articles", "author_id", 2, 10)

    expect(api.get).toHaveBeenCalledWith("/content/team/member-1/backrefs", {
      params: { group: "articles:author_id", page: 2, limit: 10 },
    })
  })

  it("defaults to page 1 and limit 20", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { groups: [] } })

    await backrefsApi.fetchGroup("team", "member-1", "articles", "author_id")

    expect(api.get).toHaveBeenCalledWith("/content/team/member-1/backrefs", {
      params: { group: "articles:author_id", page: 1, limit: 20 },
    })
  })

  it("returns the response data", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { groups: mockGroups } })

    const result = await backrefsApi.fetchGroup("team", "member-1", "articles", "author_id")
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].sourceSlug).toBe("articles")
  })
})
