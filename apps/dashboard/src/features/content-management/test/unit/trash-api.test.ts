// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

import { api } from "@/lib/api"
import { trashApi } from "@/features/content-management/api/trash.api"
import { contentApi } from "@/features/content-management/api/content.api"

describe("trashApi", () => {
  beforeEach(() => vi.clearAllMocks())

  it("fetchTrash requests the trash route with page and limit as query params", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { items: [], total: 0, page: 1, limit: 25 } })

    await trashApi.fetchTrash("posts", { page: 1, limit: 25 })

    expect(api.get).toHaveBeenCalledWith("/content/posts/trash", { params: { page: 1, limit: 25 } })
  })

  it("restore posts to the entry's restore route and returns the slug the server assigned", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { success: true, slug: "posts-2" } })

    const result = await trashApi.restore("posts", "entry-1")

    expect(api.post).toHaveBeenCalledWith("/content/posts/entry-1/restore")
    expect(result).toEqual({ success: true, slug: "posts-2" })
  })

  it("bulkRestore posts the id list to the bulk-restore route", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { succeeded: ["id-1"], failed: [] } })

    await trashApi.bulkRestore("posts", ["id-1"])

    expect(api.post).toHaveBeenCalledWith("/content/posts/trash/bulk-restore", { ids: ["id-1"] })
  })

  it("bulkPurge posts the id list to the bulk-purge route", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { succeeded: ["id-1"], failed: [] } })

    await trashApi.bulkPurge("posts", ["id-1"])

    expect(api.post).toHaveBeenCalledWith("/content/posts/trash/bulk-purge", { ids: ["id-1"] })
  })
})

describe("contentApi.delete", () => {
  beforeEach(() => vi.clearAllMocks())

  it("appends purge=true only when the purge option is set", async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true } })

    await contentApi.delete("posts", "entry-1")
    await contentApi.delete("posts", "entry-1", { purge: true })

    expect(api.delete).toHaveBeenNthCalledWith(1, "/content/posts/entry-1")
    expect(api.delete).toHaveBeenNthCalledWith(2, "/content/posts/entry-1?purge=true")
  })
})
