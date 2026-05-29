// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Tests for useGlobalDrafts hook
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createElement } from "react"
import type { ReactNode } from "react"

vi.mock("../api/drafts.api", () => ({
  fetchGlobalDrafts: vi.fn(),
}))

vi.mock("@/features/shared", () => ({
  GLOBAL_DRAFTS_QUERY_KEY: ["globalDrafts"],
}))

import { useGlobalDrafts } from "./use-global-drafts"
import { fetchGlobalDrafts } from "../api/drafts.api"

const mockDrafts = [
  { id: "d1", seedSlug: "posts", displayName: "Post 1", updated_at: 1000 },
  { id: "d2", seedSlug: "posts", displayName: "Post 2", updated_at: 2000 },
]

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children)
  }
}

describe("useGlobalDrafts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches and returns data", async () => {
    vi.mocked(fetchGlobalDrafts).mockResolvedValueOnce(mockDrafts as any)

    const { result } = renderHook(
      () => useGlobalDrafts(),
      { wrapper: makeWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockDrafts)
    expect(fetchGlobalDrafts).toHaveBeenCalledOnce()
  })

  it("returns loading state initially", () => {
    vi.mocked(fetchGlobalDrafts).mockResolvedValue([] as any)

    const { result } = renderHook(
      () => useGlobalDrafts(),
      { wrapper: makeWrapper() }
    )

    // Should be pending/loading on first render before the query resolves
    expect(result.current.data).toBeUndefined()
  })

  it("returns error state on failure", async () => {
    vi.mocked(fetchGlobalDrafts).mockRejectedValueOnce(new Error("API Error"))

    const { result } = renderHook(
      () => useGlobalDrafts(),
      { wrapper: makeWrapper() }
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(Error)
  })

  it("returns empty array when there are no drafts", async () => {
    vi.mocked(fetchGlobalDrafts).mockResolvedValueOnce([] as any)

    const { result } = renderHook(
      () => useGlobalDrafts(),
      { wrapper: makeWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })
})
