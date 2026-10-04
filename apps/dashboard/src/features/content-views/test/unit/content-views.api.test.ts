// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

import { api } from "@/lib/api"
import {
  createContentView,
  deleteContentView,
  fetchContentViews,
  reorderContentViews,
  updateContentView,
  viewProblemType,
} from "../../api/content-views.api"

describe("fetchContentViews", () => {
  beforeEach(() => vi.clearAllMocks())

  it("requests GET /content/:slug/views and returns the payload unchanged", async () => {
    const views = [{ id: "v1" }]
    vi.mocked(api.get).mockResolvedValueOnce({ data: views })

    const result = await fetchContentViews("posts")

    expect(api.get).toHaveBeenCalledWith("/content/posts/views")
    expect(result).toEqual(views)
  })
})

describe("createContentView", () => {
  beforeEach(() => vi.clearAllMocks())

  it("posts the new view's type to /content/:slug/views", async () => {
    const created = { id: "v1", type: "table" }
    vi.mocked(api.post).mockResolvedValueOnce({ data: created })

    const result = await createContentView("posts", { type: "table" })

    expect(api.post).toHaveBeenCalledWith("/content/posts/views", { type: "table" })
    expect(result).toEqual(created)
  })
})

describe("updateContentView", () => {
  beforeEach(() => vi.clearAllMocks())

  it("patches the view's id with the whole-config replacement body", async () => {
    const updated = { id: "v1", title: "Renamed" }
    vi.mocked(api.patch).mockResolvedValueOnce({ data: updated })

    const result = await updateContentView("posts", "v1", { title: "Renamed" })

    expect(api.patch).toHaveBeenCalledWith("/content/posts/views/v1", { title: "Renamed" })
    expect(result).toEqual(updated)
  })
})

describe("reorderContentViews", () => {
  beforeEach(() => vi.clearAllMocks())

  it("puts the ordered ids to /content/:slug/views/order and returns the payload unchanged", async () => {
    const ordered = [{ id: "v2" }, { id: "v1" }]
    vi.mocked(api.put).mockResolvedValueOnce({ data: ordered })

    const result = await reorderContentViews("posts", ["v2", "v1"])

    expect(api.put).toHaveBeenCalledWith("/content/posts/views/order", { ids: ["v2", "v1"] })
    expect(result).toEqual(ordered)
  })
})

describe("deleteContentView", () => {
  beforeEach(() => vi.clearAllMocks())

  it("deletes the view by id", async () => {
    vi.mocked(api.delete).mockResolvedValueOnce({ data: undefined })

    await deleteContentView("posts", "v1")

    expect(api.delete).toHaveBeenCalledWith("/content/posts/views/v1")
  })
})

describe("viewProblemType", () => {
  it("returns the problem type of an Axios error", () => {
    const error = { isAxiosError: true, response: { data: { type: "content-view-last-table" } } }

    expect(viewProblemType(error)).toBe("content-view-last-table")
  })

  it("returns null for a non-Axios error", () => {
    expect(viewProblemType(new Error("boom"))).toBeNull()
  })
})
