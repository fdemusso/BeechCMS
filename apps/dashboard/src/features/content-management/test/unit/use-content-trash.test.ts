// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

import { api } from "@/lib/api"
import {
  useContentTrash,
  useRestoreContent,
  useBulkPurgeContent,
} from "@/features/content-management/hooks/use-content-trash"

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children)
}

describe("useRestoreContent", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = makeQueryClient()
  })

  it("a successful restore invalidates both the trash and the content list key spaces", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { success: true, slug: "posts" } })
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(() => useRestoreContent("posts"), { wrapper: wrapper(queryClient) })

    await act(async () => {
      await result.current.mutateAsync({ id: "entry-1" })
    })

    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify(c[0]))
    expect(invalidatedKeys).toContain(JSON.stringify({ queryKey: ["trash"] }))
    expect(invalidatedKeys).toContain(JSON.stringify({ queryKey: ["content"] }))
  })
})

describe("useBulkPurgeContent", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = makeQueryClient()
  })

  it("a successful bulk purge invalidates both the trash and the content list key spaces", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { succeeded: ["entry-1"], failed: [] } })
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(() => useBulkPurgeContent("posts"), { wrapper: wrapper(queryClient) })

    await act(async () => {
      await result.current.mutateAsync({ ids: ["entry-1"] })
    })

    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify(c[0]))
    expect(invalidatedKeys).toContain(JSON.stringify({ queryKey: ["trash"] }))
    expect(invalidatedKeys).toContain(JSON.stringify({ queryKey: ["content"] }))
  })
})

describe("useContentTrash", () => {
  beforeEach(() => vi.clearAllMocks())

  it("useContentTrash stays idle while the enabled flag is false", () => {
    const queryClient = makeQueryClient()

    renderHook(() => useContentTrash("posts", { page: 1, limit: 25 }, { enabled: false }), {
      wrapper: wrapper(queryClient),
    })

    expect(api.get).not.toHaveBeenCalled()
  })
})
