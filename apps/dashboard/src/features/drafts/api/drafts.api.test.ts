// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Tests for drafts/api/drafts.api.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { fetchGlobalDrafts, publishDraft, discardDraft } from "./drafts.api"

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from "@/lib/api"

const mockDrafts = [
  { id: "d1", seedSlug: "posts", displayName: "My Post", updated_at: 1000 },
  { id: "d2", seedSlug: "articles", displayName: "An Article", updated_at: 2000 },
]

describe("fetchGlobalDrafts", () => {
  beforeEach(() => vi.clearAllMocks())

  it("calls GET /content/drafts and returns data", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: mockDrafts })

    const result = await fetchGlobalDrafts()

    expect(api.get).toHaveBeenCalledWith("/content/drafts")
    expect(result).toEqual(mockDrafts)
  })

  it("propagates errors", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error("Server error"))

    await expect(fetchGlobalDrafts()).rejects.toThrow("Server error")
  })
})

describe("publishDraft", () => {
  beforeEach(() => vi.clearAllMocks())

  it("calls POST /content/:slug/:id/draft/publish", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({})

    await publishDraft("posts", "d1")

    expect(api.post).toHaveBeenCalledWith("/content/posts/d1/draft/publish")
  })

  it("propagates errors", async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error("Forbidden"))

    await expect(publishDraft("posts", "d1")).rejects.toThrow("Forbidden")
  })
})

describe("discardDraft", () => {
  beforeEach(() => vi.clearAllMocks())

  it("calls DELETE /content/:slug/:id/draft", async () => {
    vi.mocked(api.delete).mockResolvedValueOnce({})

    await discardDraft("articles", "d2")

    expect(api.delete).toHaveBeenCalledWith("/content/articles/d2/draft")
  })

  it("propagates errors", async () => {
    vi.mocked(api.delete).mockRejectedValueOnce(new Error("Not found"))

    await expect(discardDraft("articles", "d2")).rejects.toThrow("Not found")
  })
})
