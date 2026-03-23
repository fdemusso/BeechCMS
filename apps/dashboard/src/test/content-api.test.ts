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
import {
  createContent,
  deleteContent,
  fetchContentById,
  fetchContentFacets,
  fetchContentList,
  fetchContentListServer,
  updateContent,
} from "@/lib/content-api"

describe("content-api", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetchContentList: chiama GET /content/:slug e ritorna response.data", async () => {
    const payload = [{ id: "1", schema_slug: "items", slug: null, status: "draft", data: {}, created_at: null, updated_at: null }]
    ;(api.get as any).mockResolvedValueOnce({ data: payload })

    const res = await fetchContentList("items")

    expect(api.get).toHaveBeenCalledWith("/content/items")
    expect(res).toEqual(payload)
  })

  it("fetchContentListServer: serializza filters quando presente", async () => {
    const payload = {
      items: [{ id: "1", schema_slug: "items", slug: null, status: "draft", data: {}, created_at: null, updated_at: null }],
      total: 10,
      page: 1,
      limit: 25,
    }

    ;(api.get as any).mockResolvedValueOnce({ data: payload })

    const filters = { some: "filter", op: "eq", value: 1 }
    const res = await fetchContentListServer("items", {
      page: 1,
      limit: 25,
      search: "hello",
      sortBy: "title",
      sortDir: "asc",
      filters,
    })

    expect(api.get).toHaveBeenCalledWith(
      "/content/items",
      expect.objectContaining({
        params: expect.objectContaining({
          page: 1,
          limit: 25,
          search: "hello",
          sortBy: "title",
          sortDir: "asc",
          filters: JSON.stringify(filters),
        }),
      })
    )

    expect(res).toEqual(payload)
  })

  it("fetchContentListServer: filters null/undefined => filters undefined", async () => {
    const payload = {
      items: [],
      total: 0,
      page: 1,
      limit: 10,
    }

    ;(api.get as any).mockResolvedValueOnce({ data: payload })

    await fetchContentListServer("items", { page: 1, limit: 10, filters: undefined })

    const [, config] = (api.get as any).mock.calls[0]
    expect(config.params.filters).toBeUndefined()
  })

  it("fetchContentFacets: GET /content/:slug/facets", async () => {
    const payload = { statuses: ["draft"], tagsByColumnId: { tags: ["react"] } }
    ;(api.get as any).mockResolvedValueOnce({ data: payload })

    const res = await fetchContentFacets("items")

    expect(api.get).toHaveBeenCalledWith("/content/items/facets")
    expect(res).toEqual(payload)
  })

  it("fetchContentById: GET /content/:slug/:id", async () => {
    const payload = { id: "id-1", schema_slug: "items", slug: "s", status: "draft", data: {}, created_at: null, updated_at: null }
    ;(api.get as any).mockResolvedValueOnce({ data: payload })

    const res = await fetchContentById("items", "id-1")

    expect(api.get).toHaveBeenCalledWith("/content/items/id-1")
    expect(res).toEqual(payload)
  })

  it("createContent: POST /content/:slug con body data", async () => {
    const payload = { id: "new-id" }
    ;(api.post as any).mockResolvedValueOnce({ data: payload })

    const res = await createContent("items", { title: "Hello" })
    expect(api.post).toHaveBeenCalledWith("/content/items", { title: "Hello" })
    expect(res).toEqual(payload)
  })

  it("updateContent: PUT /content/:slug/:id con body data", async () => {
    const payload = { success: true }
    ;(api.put as any).mockResolvedValueOnce({ data: payload })

    const res = await updateContent("items", "id-1", { title: "Updated" })
    expect(api.put).toHaveBeenCalledWith("/content/items/id-1", { title: "Updated" })
    expect(res).toEqual(payload)
  })

  it("deleteContent: DELETE /content/:slug/:id", async () => {
    const payload = { success: true }
    ;(api.delete as any).mockResolvedValueOnce({ data: payload })

    const res = await deleteContent("items", "id-1")
    expect(api.delete).toHaveBeenCalledWith("/content/items/id-1")
    expect(res).toEqual(payload)
  })
})

