import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from "@/lib/api"
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

describe("contentApi — metodi draft", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("fetchDraft", () => {
    it("chiama GET /content/:slug/:id/draft e disimballa response.data.data", async () => {
      const draftFields = { title: "Bozza", body: "Contenuto bozza" }
      ;(api.get as any).mockResolvedValueOnce({ data: { data: draftFields } })

      const result = await contentApi.fetchDraft("posts", "entry-1")

      expect(api.get).toHaveBeenCalledWith("/content/posts/entry-1/draft")
      expect(result).toEqual(draftFields)
    })

    it("propaga eccezioni dell'API verso il chiamante", async () => {
      ;(api.get as any).mockRejectedValueOnce(new Error("404 Not Found"))

      await expect(contentApi.fetchDraft("posts", "missing")).rejects.toThrow("404 Not Found")
    })
  })

  describe("saveDraft", () => {
    it("chiama PUT /content/:slug/:id/draft con il payload", async () => {
      ;(api.put as any).mockResolvedValueOnce({ data: { success: true } })

      const result = await contentApi.saveDraft("posts", "entry-1", { title: "Aggiornato" })

      expect(api.put).toHaveBeenCalledWith("/content/posts/entry-1/draft", { title: "Aggiornato" })
      expect(result).toEqual({ success: true })
    })

    it("invia payload vuoto senza errori", async () => {
      ;(api.put as any).mockResolvedValueOnce({ data: { success: true } })

      await contentApi.saveDraft("posts", "entry-1", {})

      expect(api.put).toHaveBeenCalledWith("/content/posts/entry-1/draft", {})
    })
  })

  describe("publishDraft", () => {
    it("chiama POST /content/:slug/:id/draft/publish senza body", async () => {
      ;(api.post as any).mockResolvedValueOnce({ data: { success: true } })

      const result = await contentApi.publishDraft("posts", "entry-1")

      expect(api.post).toHaveBeenCalledWith("/content/posts/entry-1/draft/publish")
      expect(api.post).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ success: true })
    })
  })

  describe("discardDraft", () => {
    it("chiama DELETE /content/:slug/:id/draft", async () => {
      ;(api.delete as any).mockResolvedValueOnce({ data: { success: true } })

      const result = await contentApi.discardDraft("posts", "entry-1")

      expect(api.delete).toHaveBeenCalledWith("/content/posts/entry-1/draft")
      expect(result).toEqual({ success: true })
    })

    it("usa il percorso /draft non /:id (distingue dal delete live)", async () => {
      ;(api.delete as any).mockResolvedValueOnce({ data: { success: true } })

      await contentApi.discardDraft("posts", "entry-42")

      const calledUrl = (api.delete as any).mock.calls[0][0] as string
      expect(calledUrl).toBe("/content/posts/entry-42/draft")
      expect(calledUrl).not.toBe("/content/posts/entry-42")
    })
  })
})
