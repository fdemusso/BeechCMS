// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"

const mocked = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), publish: vi.fn(), discard: vi.fn() }))

vi.mock("@/lib/rpc", () => ({
  rpc: {
    api: {
      content: {
        ":slug": {
          ":id": {
            draft: { $get: mocked.get, $put: mocked.put, $delete: mocked.discard, publish: { $post: mocked.publish } },
          },
        },
      },
    },
  },
}))
import {
  useDraftEntry,
  useSaveDraft,
  usePublishDraft,
  useDiscardDraft,
} from "@/features/content-management/hooks/use-content-item"
import { CONTENT_QUERY_KEYS } from "@/features/content-management/consts/content.keys"

// Helper: crea un QueryClient fresco con retry disabilitato
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children)
}

// ────────────────────────────────────────────────────────────────────────────
// useDraftEntry
// ────────────────────────────────────────────────────────────────────────────

describe("useDraftEntry", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = makeQueryClient()
  })

  it("rimane idle quando slug è undefined", () => {
    const { result } = renderHook(
      () => useDraftEntry(undefined, "entry-1"),
      { wrapper: wrapper(queryClient) }
    )

    expect(result.current.fetchStatus).toBe("idle")
    expect(mocked.get).not.toHaveBeenCalled()
  })

  it("rimane idle quando id è undefined", () => {
    const { result } = renderHook(
      () => useDraftEntry("posts", undefined),
      { wrapper: wrapper(queryClient) }
    )

    expect(result.current.fetchStatus).toBe("idle")
    expect(mocked.get).not.toHaveBeenCalled()
  })

  it("rimane idle quando sia slug che id sono undefined", () => {
    const { result } = renderHook(
      () => useDraftEntry(undefined, undefined),
      { wrapper: wrapper(queryClient) }
    )

    expect(result.current.fetchStatus).toBe("idle")
    expect(mocked.get).not.toHaveBeenCalled()
  })

  it("fetcha e restituisce i dati quando slug e id sono entrambi definiti", async () => {
    const draftFields = { title: "Titolo bozza", body: "Corpo bozza" }
    mocked.get.mockResolvedValueOnce({ json: async () => ({ data: draftFields }) })

    const { result } = renderHook(
      () => useDraftEntry("posts", "entry-1"),
      { wrapper: wrapper(queryClient) }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mocked.get).toHaveBeenCalledWith({ param: { slug: "posts", id: "entry-1" } })
    expect(result.current.data).toEqual(draftFields)
  })

  it("va in error state senza riprovare quando il server risponde 404 (retry: false)", async () => {
    mocked.get.mockRejectedValue(new Error("404 Not Found"))

    const { result } = renderHook(
      () => useDraftEntry("posts", "entry-1"),
      { wrapper: wrapper(queryClient) }
    )

    await waitFor(() => expect(result.current.isError).toBe(true))

    // retry: false → esattamente un tentativo
    expect(mocked.get).toHaveBeenCalledTimes(1)
  })

  it("usa la query key corretta", async () => {
    mocked.get.mockResolvedValueOnce({ json: async () => ({ data: {} }) })

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    renderHook(() => useDraftEntry("news", "abc"), { wrapper: wrapper(queryClient) })

    await waitFor(() => expect(mocked.get.mock.calls.length).toBeGreaterThan(0))

    // Invalida la chiave draft per verificare che il listener agisce sulla chiave giusta
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: CONTENT_QUERY_KEYS.draft("news", "abc"),
      })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["content", "draft", "news", "abc"],
    })
  })
})

// ────────────────────────────────────────────────────────────────────────────
// useSaveDraft
// ────────────────────────────────────────────────────────────────────────────

describe("useSaveDraft", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = makeQueryClient()
  })

  it("chiama PUT /content/:slug/:id/draft col payload come json e torna { success: true }", async () => {
    mocked.put.mockResolvedValueOnce({ json: async () => ({ success: true }) })

    const { result } = renderHook(() => useSaveDraft(), { wrapper: wrapper(queryClient) })

    let returned: unknown
    await act(async () => {
      returned = await result.current.mutateAsync({
        slug: "posts",
        id: "entry-1",
        data: { title: "Nuovo titolo" },
      })
    })

    expect(mocked.put).toHaveBeenCalledWith({ param: { slug: "posts", id: "entry-1" }, json: { title: "Nuovo titolo" } })
    expect(returned).toEqual({ success: true })
  })

  it("invalida draft, detail e all content keys al successo", async () => {
    mocked.put.mockResolvedValueOnce({ json: async () => ({ success: true }) })
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(() => useSaveDraft(), { wrapper: wrapper(queryClient) })

    await act(async () => {
      await result.current.mutateAsync({ slug: "posts", id: "entry-1", data: {} })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: CONTENT_QUERY_KEYS.draft("posts", "entry-1"),
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: CONTENT_QUERY_KEYS.detail("posts", "entry-1"),
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: CONTENT_QUERY_KEYS.all,
    })
  })

  it("NON invalida activity né stats (operazione narrowed, non publish)", async () => {
    mocked.put.mockResolvedValueOnce({ json: async () => ({ success: true }) })
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(() => useSaveDraft(), { wrapper: wrapper(queryClient) })

    await act(async () => {
      await result.current.mutateAsync({ slug: "posts", id: "entry-1", data: {} })
    })

    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => c[0])
    const hasActivity = invalidatedKeys.some(
      (arg) => JSON.stringify(arg) === JSON.stringify({ queryKey: ["dashboard", "activity"] })
    )
    const hasStats = invalidatedKeys.some(
      (arg) => JSON.stringify(arg) === JSON.stringify({ queryKey: ["dashboard", "stats"] })
    )
    expect(hasActivity).toBe(false)
    expect(hasStats).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// usePublishDraft
// ────────────────────────────────────────────────────────────────────────────

describe("usePublishDraft", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = makeQueryClient()
  })

  it("chiama POST /content/:slug/:id/draft/publish", async () => {
    mocked.publish.mockResolvedValueOnce({ json: async () => ({ success: true }) })

    const { result } = renderHook(() => usePublishDraft(), { wrapper: wrapper(queryClient) })

    await act(async () => {
      await result.current.mutateAsync({ slug: "posts", id: "entry-1" })
    })

    expect(mocked.publish).toHaveBeenCalledWith({ param: { slug: "posts", id: "entry-1" } })
    expect(mocked.publish).toHaveBeenCalledTimes(1)
  })

  it("invalida il set ampio di chiavi al successo (content, facets, draft, activity, stats)", async () => {
    mocked.publish.mockResolvedValueOnce({ json: async () => ({ success: true }) })
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(() => usePublishDraft(), { wrapper: wrapper(queryClient) })

    await act(async () => {
      await result.current.mutateAsync({ slug: "posts", id: "entry-1" })
    })

    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify(c[0]))

    expect(invalidatedKeys).toContain(JSON.stringify({ queryKey: ["content"] }))
    expect(invalidatedKeys).toContain(JSON.stringify({ queryKey: ["facets"] }))
    expect(invalidatedKeys).toContain(
      JSON.stringify({ queryKey: CONTENT_QUERY_KEYS.draft("posts", "entry-1") })
    )
    expect(invalidatedKeys).toContain(JSON.stringify({ queryKey: ["dashboard", "activity"] }))
    expect(invalidatedKeys).toContain(JSON.stringify({ queryKey: ["dashboard", "stats"] }))
  })

  it("invalida più chiavi di useSaveDraft (differenza semantica publish vs save)", async () => {
    mocked.publish.mockResolvedValueOnce({ json: async () => ({ success: true }) })
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(() => usePublishDraft(), { wrapper: wrapper(queryClient) })

    await act(async () => {
      await result.current.mutateAsync({ slug: "posts", id: "entry-1" })
    })

    // publish invalida almeno 5 chiavi (content, facets, draft, activity, stats)
    expect(invalidateSpy.mock.calls.length).toBeGreaterThanOrEqual(5)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// useDiscardDraft
// ────────────────────────────────────────────────────────────────────────────

describe("useDiscardDraft", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = makeQueryClient()
  })

  it("chiama DELETE /content/:slug/:id/draft", async () => {
    mocked.discard.mockResolvedValueOnce({ json: async () => ({ success: true }) })

    const { result } = renderHook(() => useDiscardDraft(), { wrapper: wrapper(queryClient) })

    await act(async () => {
      await result.current.mutateAsync({ slug: "posts", id: "entry-1" })
    })

    expect(mocked.discard).toHaveBeenCalledWith({ param: { slug: "posts", id: "entry-1" } })
  })

  it("invalida draft, detail e all content keys al successo", async () => {
    mocked.discard.mockResolvedValueOnce({ json: async () => ({ success: true }) })
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(() => useDiscardDraft(), { wrapper: wrapper(queryClient) })

    await act(async () => {
      await result.current.mutateAsync({ slug: "posts", id: "entry-1" })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: CONTENT_QUERY_KEYS.draft("posts", "entry-1"),
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: CONTENT_QUERY_KEYS.detail("posts", "entry-1"),
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: CONTENT_QUERY_KEYS.all,
    })
  })

  it("NON invalida facets né activity né stats (discard non pubblica live)", async () => {
    mocked.discard.mockResolvedValueOnce({ json: async () => ({ success: true }) })
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(() => useDiscardDraft(), { wrapper: wrapper(queryClient) })

    await act(async () => {
      await result.current.mutateAsync({ slug: "posts", id: "entry-1" })
    })

    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify(c[0]))

    expect(invalidatedKeys).not.toContain(JSON.stringify({ queryKey: ["facets"] }))
    expect(invalidatedKeys).not.toContain(
      JSON.stringify({ queryKey: ["dashboard", "activity"] })
    )
    expect(invalidatedKeys).not.toContain(
      JSON.stringify({ queryKey: ["dashboard", "stats"] })
    )
  })
})
