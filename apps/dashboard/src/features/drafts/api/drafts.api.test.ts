// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

/**
 * Tests for drafts/api/drafts.api.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { clearAccessToken } from "@/lib/api"
import { ApiError } from "@/lib/http/api-error"
import { fetchGlobalDrafts, publishDraft, discardDraft } from "./drafts.api"

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

// What `GET /api/content/drafts` sends: one summary per pending draft.
const mockDrafts = [
  { id: "d1", seedSlug: "posts", seedLabel: "Posts", title: "My Post", updatedAt: 1000, lastModifiedBy: { name: "Ada", email: "ada@example.com" } },
  { id: "d2", seedSlug: "articles", seedLabel: "Articles", title: "An Article", updatedAt: 2000, lastModifiedBy: { name: null, email: "bob@example.com" } },
]

describe("drafts api", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    clearAccessToken()
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("fetchGlobalDrafts", () => {
    it("calls GET /api/content/drafts and returns the summaries", async () => {
      fetchMock.mockResolvedValueOnce(json(200, mockDrafts))

      const result = await fetchGlobalDrafts()

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/content/drafts")
      expect(init?.method).toBe("GET")
      expect(result).toEqual(mockDrafts)
    })

    it("throws an ApiError carrying the status when the server fails", async () => {
      fetchMock.mockResolvedValueOnce(json(500, { error: "Server error" }))

      const failure = fetchGlobalDrafts()

      await expect(failure).rejects.toBeInstanceOf(ApiError)
      await expect(failure).rejects.toMatchObject({ status: 500 })
    })
  })

  describe("publishDraft", () => {
    it("calls POST /api/content/:slug/:id/draft/publish", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { success: true }))

      await publishDraft("posts", "d1")

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/content/posts/d1/draft/publish")
      expect(init?.method).toBe("POST")
    })

    it("throws an ApiError carrying the status when publishing is refused", async () => {
      fetchMock.mockResolvedValueOnce(json(403, { error: "Forbidden" }))

      const failure = publishDraft("posts", "d1")

      await expect(failure).rejects.toMatchObject({ status: 403 })
    })
  })

  describe("discardDraft", () => {
    it("calls DELETE /api/content/:slug/:id/draft", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { success: true }))

      await discardDraft("articles", "d2")

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/content/articles/d2/draft")
      expect(init?.method).toBe("DELETE")
    })

    it("throws an ApiError carrying the status when the draft is gone", async () => {
      fetchMock.mockResolvedValueOnce(json(404, { error: "Not found" }))

      const failure = discardDraft("articles", "d2")

      await expect(failure).rejects.toMatchObject({ status: 404 })
    })
  })
})
