// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { clearAccessToken } from "@/lib/api"
import { ApiError } from "@/lib/http/api-error"
import { contentApi } from "@/features/content-management/api/content.api"

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

const entry = { id: "id-1", slug: "s", status: "draft", data: { title: "A" }, created_at: 1, updated_at: 2, has_pending_draft: false }

describe("contentApi — CRUD", () => {
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

  describe("fetchList", () => {
    it("serialises the params in order, with filters as a JSON string, and returns the envelope", async () => {
      const envelope = { items: [entry], total: 10, page: 1, limit: 25, relations: {} }
      fetchMock.mockResolvedValueOnce(json(200, envelope))

      const result = await contentApi.fetchList("posts", {
        page: 1,
        limit: 25,
        search: "hello",
        sortBy: "title",
        sortDir: "asc",
        filters: [{ column: "a", conditions: [] }],
      })

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe(
        "/api/content/posts?page=1&limit=25&search=hello&sortBy=title&sortDir=asc&filters=%5B%7B%22column%22%3A%22a%22%2C%22conditions%22%3A%5B%5D%7D%5D",
      )
      expect(init?.method).toBe("GET")
      expect(result).toEqual(envelope)
    })

    it("leaves filters out of the query when they are null or undefined", async () => {
      fetchMock.mockImplementation(async () => json(200, { items: [], total: 0, page: 1, limit: 10, relations: {} }))

      await contentApi.fetchList("posts", { page: 1, limit: 10, filters: undefined })
      await contentApi.fetchList("posts", { page: 1, limit: 10, filters: null })

      expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(["/api/content/posts?page=1&limit=10", "/api/content/posts?page=1&limit=10"])
    })

    it("wraps the bare array a request without query parameters gets back as one page", async () => {
      fetchMock.mockResolvedValueOnce(json(200, [entry]))

      const result = await contentApi.fetchList("posts", {})

      expect(String(fetchMock.mock.calls[0][0])).toBe("/api/content/posts")
      expect(result).toEqual({ items: [entry], total: 1, page: 1, limit: 1, relations: {}, relationAvatars: {} })
    })

    it("throws an ApiError for an unknown seed", async () => {
      fetchMock.mockResolvedValueOnce(json(404, { type: "https://beechcms.dev/problems/content-seed-not-found", status: 404 }))

      const failure = contentApi.fetchList("nope", { page: 1 })

      await expect(failure).rejects.toBeInstanceOf(ApiError)
      await expect(failure).rejects.toMatchObject({ status: 404 })
    })
  })

  it("fetchFacets requests the facets route and returns the payload unchanged", async () => {
    const facets = { statuses: ["draft"], tagsByColumnId: { br_01: ["react"] } }
    fetchMock.mockResolvedValueOnce(json(200, facets))

    const result = await contentApi.fetchFacets("posts")

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("/api/content/posts/facets")
    expect(init?.method).toBe("GET")
    expect(result).toEqual(facets)
  })

  it("fetchById requests the entry route and returns the entry", async () => {
    fetchMock.mockResolvedValueOnce(json(200, entry))

    const result = await contentApi.fetchById("posts", "id-1")

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("/api/content/posts/id-1")
    expect(init?.method).toBe("GET")
    expect(result).toEqual(entry)
  })

  it("create posts the fields as JSON to the seed route and returns the new id from the 201", async () => {
    fetchMock.mockResolvedValueOnce(json(201, { id: "new-id" }))

    const result = await contentApi.create("posts", { title: "Hello", status: "draft" })

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("/api/content/posts")
    expect(init?.method).toBe("POST")
    expect(init?.body).toBe(JSON.stringify({ title: "Hello", status: "draft" }))
    expect(result).toEqual({ id: "new-id" })
  })

  describe("update", () => {
    it("puts the fields as JSON to the entry route and sends no If-Match without a version", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { success: true }))

      const result = await contentApi.update("posts", "id-1", { title: "Updated" })

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/content/posts/id-1")
      expect(init?.method).toBe("PUT")
      expect(init?.body).toBe(JSON.stringify({ title: "Updated" }))
      expect(new Headers(init?.headers).has("If-Match")).toBe(false)
      expect(result).toEqual({ success: true })
    })

    it("sends the version as If-Match so the server can detect a concurrent edit", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { success: true }))

      await contentApi.update("posts", "id-1", { title: "Updated" }, "1700000000")

      const [, init] = fetchMock.mock.calls[0]
      expect(new Headers(init?.headers).get("If-Match")).toBe("1700000000")
    })

    it("throws an ApiError carrying the 409 of a concurrent edit", async () => {
      fetchMock.mockResolvedValueOnce(json(409, { type: "https://beechcms.dev/problems/content-update-conflict", status: 409 }))

      const failure = contentApi.update("posts", "id-1", { title: "Updated" }, "1")

      await expect(failure).rejects.toMatchObject({ status: 409 })
    })
  })

  describe("delete", () => {
    it("deletes the entry route without a query string by default", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { success: true, softDeleted: true }))

      const result = await contentApi.delete("posts", "entry-1")

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/content/posts/entry-1")
      expect(init?.method).toBe("DELETE")
      expect(result).toEqual({ success: true, softDeleted: true })
    })

    it("appends purge=true when the purge option is set", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { success: true, softDeleted: false }))

      await contentApi.delete("posts", "entry-1", { purge: true })

      expect(String(fetchMock.mock.calls[0][0])).toBe("/api/content/posts/entry-1?purge=true")
    })
  })

  describe("bulkUpdate", () => {
    it("patches ids and fields as JSON to the bulk route and returns the per-row failures", async () => {
      const outcome = { updated: 1, failed: [{ id: "b", problem: { status: 422, type: "content-not-found", detail: "not-found" } }] }
      fetchMock.mockResolvedValueOnce(json(200, outcome))

      const result = await contentApi.bulkUpdate("posts", { ids: ["a", "b"], fields: { priority: { mode: "add", value: ["x"] } } })

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/content/posts/bulk")
      expect(init?.method).toBe("PATCH")
      expect(init?.body).toBe(JSON.stringify({ ids: ["a", "b"], fields: { priority: { mode: "add", value: ["x"] } } }))
      expect(result).toEqual(outcome)
    })
  })
})
