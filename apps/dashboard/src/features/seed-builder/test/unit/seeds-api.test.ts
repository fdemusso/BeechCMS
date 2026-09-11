// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from "@/lib/api"
import { seedsApi } from "@/features/seed-builder/api/seeds.api"
import type { Seed } from "@beechcms/core"

const mockSeed: Seed = {
  slug: "article",
  label: "Article",
  labelPlural: "Articles",
  displayNameAlias: "title",
  branches: [{ id: "br_01", alias: "title", label: "Title", type: "text" }],
}

describe("seedsApi", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("list: GET /seeds returns array", async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: [] })
    const res = await seedsApi.list()
    expect(api.get).toHaveBeenCalledWith("/seeds")
    expect(res).toEqual([])
  })

  it("create: POST /seeds with seed payload", async () => {
    ;(api.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: { slug: "article" } })
    const res = await seedsApi.create(mockSeed)
    expect(api.post).toHaveBeenCalledWith("/seeds", mockSeed)
    expect(res).toEqual({ slug: "article" })
  })

  it("update: PUT /seeds/:slug with seed payload", async () => {
    ;(api.put as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: {} })
    await seedsApi.update("article", mockSeed)
    expect(api.put).toHaveBeenCalledWith("/seeds/article", mockSeed)
  })

  it("remove: DELETE /seeds/:slug", async () => {
    ;(api.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: {} })
    await seedsApi.remove("article")
    expect(api.delete).toHaveBeenCalledWith("/seeds/article")
  })
})
