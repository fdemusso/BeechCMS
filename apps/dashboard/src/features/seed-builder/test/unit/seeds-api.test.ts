// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { seedsApi } from "@/features/seed-builder/api/seeds.api"
import { isApiError, problemCode } from "@/lib/http/api-error"
import type { Seed } from "@beechcms/core"

const mockSeed: Seed = {
  slug: "article",
  label: "Article",
  labelPlural: "Articles",
  displayNameAlias: "title",
  branches: [{ id: "br_01", alias: "title", label: "Title", type: "text" }],
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

describe("seedsApi", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  /** The request the client built: where it went, with which verb, and the JSON it carried. */
  function sentRequest() {
    const [url, init] = fetchMock.mock.calls[0]
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined
    return { url: String(url), method: init?.method, body, headers: new Headers(init?.headers) }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("list", () => {
    it("requests GET /api/seeds and returns the records", async () => {
      const records = [{ slug: "article", definition: mockSeed, status: "active", source: "runtime", createdAt: 1, updatedAt: 2 }]
      fetchMock.mockResolvedValueOnce(json(200, records))

      const result = await seedsApi.list()

      expect(sentRequest()).toMatchObject({ url: "/api/seeds", method: "GET" })
      expect(result).toEqual(records)
    })
  })

  describe("get", () => {
    it("requests GET /api/seeds/:slug", async () => {
      const record = { slug: "article", definition: mockSeed, status: "active", source: "code", createdAt: 1, updatedAt: 2 }
      fetchMock.mockResolvedValueOnce(json(200, record))

      const result = await seedsApi.get("article")

      expect(sentRequest()).toMatchObject({ url: "/api/seeds/article", method: "GET" })
      expect(result).toEqual(record)
    })
  })

  describe("create", () => {
    it("posts the seed to /api/seeds and returns the slug", async () => {
      fetchMock.mockResolvedValueOnce(json(201, { slug: "article" }))

      const result = await seedsApi.create(mockSeed)

      expect(sentRequest()).toMatchObject({ url: "/api/seeds", method: "POST", body: mockSeed })
      expect(result).toEqual({ slug: "article" })
    })
  })

  describe("update", () => {
    it("puts the seed to /api/seeds/:slug", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { slug: "article" }))

      await seedsApi.update("article", mockSeed)

      expect(sentRequest()).toMatchObject({ url: "/api/seeds/article", method: "PUT", body: mockSeed })
    })
  })

  describe("addBranch", () => {
    it("posts the branch, without an id, to /api/seeds/:slug/branches and returns the id the server minted", async () => {
      const branch = { alias: "summary", label: "Summary", type: "text" as const }
      fetchMock.mockResolvedValueOnce(json(200, { id: "br_02" }))

      const result = await seedsApi.addBranch("article", branch)

      expect(sentRequest()).toMatchObject({ url: "/api/seeds/article/branches", method: "POST", body: branch })
      expect(result).toEqual({ id: "br_02" })
    })
  })

  describe("remove", () => {
    it("deletes /api/seeds/:slug", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { success: true }))

      await seedsApi.remove("article")

      expect(sentRequest()).toMatchObject({ url: "/api/seeds/article", method: "DELETE" })
    })

    it("rejects with the ApiError of a 409 so the dialog can list the referencing seeds", async () => {
      const problem = { type: "https://beechcms.dev/problems/seed-referenced", title: "Seed referenced", status: 409, detail: "Seed 'article' is referenced by: comment." }
      fetchMock.mockResolvedValueOnce(json(409, problem))

      const failure = await seedsApi.remove("article").catch((error: unknown) => error)

      expect(isApiError(failure)).toBe(true)
      expect(problemCode(failure)).toBe("seed-referenced")
    })
  })

  describe("hardDelete", () => {
    // The route answers 202 Accepted, not 200: the client must expose that status or the call has no result.
    it("sends the confirmation as a JSON body on DELETE /api/seeds/:slug/hard and returns the purge job", async () => {
      fetchMock.mockResolvedValueOnce(json(202, { jobId: "job-1", status: "pending" }))

      const result = await seedsApi.hardDelete("article", "article")

      const request = sentRequest()
      expect(request).toMatchObject({ url: "/api/seeds/article/hard", method: "DELETE", body: { confirm: "article" } })
      expect(request.headers.get("content-type")).toContain("application/json")
      expect(result).toEqual({ jobId: "job-1", status: "pending" })
    })
  })

  describe("dropBranch", () => {
    it("sends the confirmation as a JSON body on DELETE /api/seeds/:slug/branches/:branchId", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { success: true }))

      await seedsApi.dropBranch("article", "br_02", "article.summary")

      expect(sentRequest()).toMatchObject({
        url: "/api/seeds/article/branches/br_02",
        method: "DELETE",
        body: { confirm: "article.summary" },
      })
    })
  })

  describe("dropOrphan", () => {
    it("sends the confirmation as a JSON body on DELETE /api/seeds/:slug/orphans/:column", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { success: true }))

      await seedsApi.dropOrphan("article", "legacy_col", "article.legacy_col")

      expect(sentRequest()).toMatchObject({
        url: "/api/seeds/article/orphans/legacy_col",
        method: "DELETE",
        body: { confirm: "article.legacy_col" },
      })
    })
  })

  describe("renameBranch", () => {
    it("patches the new alias and the confirmation, and returns the automations the rename touched", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { success: true, affectedAutomations: ["auto-1"] }))

      const result = await seedsApi.renameBranch("article", "br_01", "headline", "article.title")

      expect(sentRequest()).toMatchObject({
        url: "/api/seeds/article/branches/br_01/rename",
        method: "PATCH",
        body: { newAlias: "headline", confirm: "article.title" },
      })
      expect(result).toEqual({ success: true, affectedAutomations: ["auto-1"] })
    })
  })

  describe("retypeBranch", () => {
    it("patches the new type and the confirmation", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { success: true }))

      await seedsApi.retypeBranch("article", "br_01", "richtext", "article.title")

      expect(sentRequest()).toMatchObject({
        url: "/api/seeds/article/branches/br_01/retype",
        method: "PATCH",
        body: { newType: "richtext", confirm: "article.title" },
      })
    })
  })

  describe("rebuildFts", () => {
    it("posts to /api/seeds/:slug/fts/rebuild", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { success: true }))

      await seedsApi.rebuildFts("article")

      expect(sentRequest()).toMatchObject({ url: "/api/seeds/article/fts/rebuild", method: "POST" })
    })
  })

  describe("getOrphans", () => {
    it("requests GET /api/seeds/:slug/orphans and returns the column names", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { orphans: ["legacy_col"] }))

      const result = await seedsApi.getOrphans("article")

      expect(sentRequest()).toMatchObject({ url: "/api/seeds/article/orphans", method: "GET" })
      expect(result).toEqual({ orphans: ["legacy_col"] })
    })
  })
})
