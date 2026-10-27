// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError, type ApiErrorBody } from "@/lib/http/api-error"
import {
  createContentView,
  deleteContentView,
  fetchContentViews,
  reorderContentViews,
  updateContentView,
  viewProblemType,
} from "../../api/content-views.api"

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

describe("content views api", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("fetchContentViews", () => {
    it("requests GET /api/content/:slug/views and returns the payload unchanged", async () => {
      const views = [{ id: "v1" }]
      fetchMock.mockResolvedValueOnce(json(200, views))

      const result = await fetchContentViews("posts")

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/content/posts/views")
      expect(init?.method).toBe("GET")
      expect(result).toEqual(views)
    })
  })

  describe("createContentView", () => {
    it("posts the new view's type to /api/content/:slug/views", async () => {
      fetchMock.mockResolvedValueOnce(json(201, { id: "v1", type: "table" }))

      const result = await createContentView("posts", { type: "table" })

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/content/posts/views")
      expect(init?.method).toBe("POST")
      expect(init?.body).toBe(JSON.stringify({ type: "table" }))
      expect(result).toEqual({ id: "v1", type: "table" })
    })
  })

  describe("updateContentView", () => {
    it("patches the view's id with the whole-config replacement body", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { id: "v1", title: "Renamed" }))

      const result = await updateContentView("posts", "v1", { title: "Renamed" })

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/content/posts/views/v1")
      expect(init?.method).toBe("PATCH")
      expect(init?.body).toBe(JSON.stringify({ title: "Renamed" }))
      expect(result).toEqual({ id: "v1", title: "Renamed" })
    })
  })

  describe("reorderContentViews", () => {
    it("puts the ordered ids to /api/content/:slug/views/order and returns the payload unchanged", async () => {
      const ordered = [{ id: "v2" }, { id: "v1" }]
      fetchMock.mockResolvedValueOnce(json(200, ordered))

      const result = await reorderContentViews("posts", ["v2", "v1"])

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/content/posts/views/order")
      expect(init?.method).toBe("PUT")
      expect(init?.body).toBe(JSON.stringify({ ids: ["v2", "v1"] }))
      expect(result).toEqual(ordered)
    })
  })

  describe("deleteContentView", () => {
    it("deletes the view by id", async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

      await deleteContentView("posts", "v1")

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/content/posts/views/v1")
      expect(init?.method).toBe("DELETE")
    })

    it("throws an ApiError carrying the problem type when the last table is refused", async () => {
      fetchMock.mockResolvedValueOnce(json(409, { type: "https://beechcms.dev/problems/content-view-last-table" }))

      const failure = deleteContentView("posts", "v1")

      await expect(failure).rejects.toBeInstanceOf(ApiError)
      await expect(failure).rejects.toMatchObject({ status: 409 })
    })
  })
})

describe("viewProblemType", () => {
  it("extracts the problem slug from a full RFC 9457 URI", () => {
    // Regression guard: BeechCMS API wraps problem types via normalizeProblemType into full URIs
    // (e.g. https://beechcms.dev/problems/content-view-last-table), while dashboard call sites
    // compare against bare problem slugs.
    const error = new ApiError(409, { type: "https://beechcms.dev/problems/content-view-last-table" })

    const result = viewProblemType(error)

    expect(result).toBe("content-view-last-table")
  })

  it("returns the problem slug unchanged when given a bare slug", () => {
    const error = new ApiError(409, { type: "content-view-last-table" })

    const result = viewProblemType(error)

    expect(result).toBe("content-view-last-table")
  })

  it("returns null for an error that is not an ApiError", () => {
    const error = new Error("boom")

    const result = viewProblemType(error)

    expect(result).toBeNull()
  })

  it.each([
    ["null response data", new ApiError(409, null)],
    ["empty response object", new ApiError(409, {})],
    ["non-string problem type", new ApiError(409, { type: 123 } as unknown as ApiErrorBody)],
  ])("returns null when the response body is %s", (_, error) => {
    const result = viewProblemType(error)

    expect(result).toBeNull()
  })
})
