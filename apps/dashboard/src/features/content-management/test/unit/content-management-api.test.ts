// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, beforeEach, describe, it, expect, vi } from "vitest"
import { clearAccessToken } from "@/lib/api"
import { ApiError } from "@/lib/http/api-error"
import { contentApi } from "@/features/content-management/api/content.api"
import { CONTENT_QUERY_KEYS } from "@/features/content-management/consts/content.keys"

describe("CONTENT_QUERY_KEYS.draft", () => {
  it("produce la chiave corretta distinta da detail", () => {
    const draftKey = CONTENT_QUERY_KEYS.draft("posts", "entry-1")
    const detailKey = CONTENT_QUERY_KEYS.detail("posts", "entry-1")

    expect(draftKey).toEqual(["content", "draft", "posts", "entry-1"])
    expect(detailKey).toEqual(["content", "detail", "posts", "entry-1"])
    expect(draftKey).not.toEqual(detailKey)
  })

  it("prefissa sempre con CONTENT_QUERY_KEYS.all", () => {
    const key = CONTENT_QUERY_KEYS.draft("news", "abc")
    expect(key[0]).toBe("content")
    expect(key[1]).toBe("draft")
  })
})

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

describe("contentApi — metodi draft", () => {
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

  describe("fetchDraft", () => {
    it("chiama GET /api/content/:slug/:id/draft e disimballa il campo data", async () => {
      const draftFields = { title: "Bozza", body: "Contenuto bozza" }
      fetchMock.mockResolvedValueOnce(json(200, { data: draftFields }))

      const result = await contentApi.fetchDraft("posts", "entry-1")

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/content/posts/entry-1/draft")
      expect(init?.method).toBe("GET")
      expect(result).toEqual(draftFields)
    })

    it("lancia un ApiError col problem type quando non c'è nessuna bozza", async () => {
      fetchMock.mockResolvedValueOnce(json(404, { type: "https://beechcms.dev/problems/draft-not-found", status: 404 }))

      const failure = contentApi.fetchDraft("posts", "missing")

      await expect(failure).rejects.toBeInstanceOf(ApiError)
      await expect(failure).rejects.toMatchObject({ status: 404 })
    })
  })

  describe("saveDraft", () => {
    it("chiama PUT /api/content/:slug/:id/draft col payload come JSON", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { success: true }))

      const result = await contentApi.saveDraft("posts", "entry-1", { title: "Aggiornato" })

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/content/posts/entry-1/draft")
      expect(init?.method).toBe("PUT")
      expect(init?.body).toBe(JSON.stringify({ title: "Aggiornato" }))
      expect(result).toEqual({ success: true })
    })

    it("invia un payload vuoto come oggetto vuoto", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { success: true }))

      await contentApi.saveDraft("posts", "entry-1", {})

      const [, init] = fetchMock.mock.calls[0]
      expect(init?.body).toBe("{}")
    })
  })

  describe("publishDraft", () => {
    it("chiama POST /api/content/:slug/:id/draft/publish senza body", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { success: true }))

      const result = await contentApi.publishDraft("posts", "entry-1")

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/content/posts/entry-1/draft/publish")
      expect(init?.method).toBe("POST")
      expect(init?.body).toBeUndefined()
      expect(result).toEqual({ success: true })
    })
  })

  describe("discardDraft", () => {
    it("chiama DELETE /api/content/:slug/:id/draft, non il delete live dell'entry", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { success: true }))

      const result = await contentApi.discardDraft("posts", "entry-42")

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/content/posts/entry-42/draft")
      expect(init?.method).toBe("DELETE")
      expect(result).toEqual({ success: true })
    })
  })
})
