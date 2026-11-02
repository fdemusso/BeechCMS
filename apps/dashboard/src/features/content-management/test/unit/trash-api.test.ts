// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { clearAccessToken } from "@/lib/api"
import { ApiError } from "@/lib/http/api-error"
import { trashApi } from "@/features/content-management/api/trash.api"

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

describe("trashApi", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    clearAccessToken()
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("fetchTrash requests the trash route with page and limit as query params and returns the envelope", async () => {
    const page = { items: [], total: 0, page: 2, limit: 10, retentionDays: 30 }
    fetchMock.mockResolvedValueOnce(json(200, page))

    const result = await trashApi.fetchTrash("posts", { page: 2, limit: 10 })

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("/api/content/posts/trash?page=2&limit=10")
    expect(init?.method).toBe("GET")
    expect(result).toEqual(page)
  })

  it("restore posts to the entry's restore route and returns the slug the server assigned", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { success: true, slug: "posts-2" }))

    const result = await trashApi.restore("posts", "entry-1")

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("/api/content/posts/entry-1/restore")
    expect(init?.method).toBe("POST")
    expect(result).toEqual({ success: true, slug: "posts-2" })
  })

  it("bulkRestore posts the id list to the bulk-restore route", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { succeeded: ["id-1"], failed: [] }))

    const result = await trashApi.bulkRestore("posts", ["id-1"])

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("/api/content/posts/trash/bulk-restore")
    expect(init?.method).toBe("POST")
    expect(init?.body).toBe(JSON.stringify({ ids: ["id-1"] }))
    expect(result).toEqual({ succeeded: ["id-1"], failed: [] })
  })

  it("bulkPurge posts the id list to the bulk-purge route and keeps the per-id failures", async () => {
    const failed = [{ id: "id-2", problem: { status: 404, type: "content-not-found", detail: "not-found" } }]
    fetchMock.mockResolvedValueOnce(json(200, { succeeded: ["id-1"], failed }))

    const result = await trashApi.bulkPurge("posts", ["id-1", "id-2"])

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("/api/content/posts/trash/bulk-purge")
    expect(init?.body).toBe(JSON.stringify({ ids: ["id-1", "id-2"] }))
    expect(result).toEqual({ succeeded: ["id-1"], failed })
  })

  it("restore throws an ApiError carrying the status when the entry is not in the Trash", async () => {
    fetchMock.mockResolvedValueOnce(json(404, { type: "https://beechcms.dev/problems/content-not-found", status: 404 }))

    const failure = trashApi.restore("posts", "gone")

    await expect(failure).rejects.toBeInstanceOf(ApiError)
    await expect(failure).rejects.toMatchObject({ status: 404 })
  })
})
