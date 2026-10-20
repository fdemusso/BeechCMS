// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import * as React from "react"
import { emptyViewConfig, type ContentView } from "@beechcms/core"

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { api } from "@/lib/api"
import { toast } from "sonner"
import { CONTENT_VIEWS_QUERY_KEY, useContentViews, useReorderContentViews } from "../../hooks/use-content-views"

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client }, children)
}

function makeView(id: string, position: number): ContentView {
  return {
    id,
    seedSlug: "posts",
    type: "table",
    title: null,
    position,
    config: emptyViewConfig(),
    createdAt: 0,
    updatedAt: 0,
    updatedBy: "admin",
  }
}

describe("useReorderContentViews", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = makeQueryClient()
    queryClient.setQueryData<ContentView[]>(
      CONTENT_VIEWS_QUERY_KEY("posts"),
      [makeView("v1", 0), makeView("v2", 1), makeView("v3", 2)]
    )
  })

  it("reorders the cached views and rewrites their positions before the server answers", async () => {
    vi.mocked(api.put).mockReturnValueOnce(new Promise(() => {}))
    const { result } = renderHook(() => useReorderContentViews("posts"), { wrapper: wrapper(queryClient) })

    result.current.mutate(["v3", "v1", "v2"])

    await waitFor(() => {
      const cached = queryClient.getQueryData<ContentView[]>(CONTENT_VIEWS_QUERY_KEY("posts"))
      expect(cached?.map((view) => view.id)).toEqual(["v3", "v1", "v2"])
    })
    const cached = queryClient.getQueryData<ContentView[]>(CONTENT_VIEWS_QUERY_KEY("posts"))
    expect(cached?.map((view) => view.position)).toEqual([0, 1, 2])
  })

  it("refetches the views and reports the failure when the server rejects the order", async () => {
    vi.mocked(api.put).mockRejectedValueOnce(new Error("boom"))
    const { result } = renderHook(
      () => ({ query: useContentViews("posts"), reorder: useReorderContentViews("posts") }),
      { wrapper: wrapper(queryClient) }
    )
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true))
    vi.mocked(api.get).mockClear()

    result.current.reorder.mutate(["v3", "v1", "v2"])

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    expect(api.get).toHaveBeenCalledWith("/content/posts/views")
  })
})
