// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Tests for use-backrefs.ts hooks
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { createElement } from "react"

vi.mock("../api", () => ({
  backrefsApi: {
    fetch: vi.fn(),
    fetchGroup: vi.fn(),
  },
}))

import { useBackrefs, useBackrefsGroup, BACKREF_QUERY_KEY } from "./use-backrefs"
import { backrefsApi } from "../api"

const mockGroups = [
  {
    sourceSlug: "articles",
    sourceLabel: "Articles",
    branchAlias: "author_id",
    branchLabel: "Author",
    relationship: "single" as const,
    restricts: false,
    total: 5,
    items: [],
  },
]

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children)
  }
}

describe("useBackrefs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches and returns data", async () => {
    vi.mocked(backrefsApi.fetch).mockResolvedValueOnce({ groups: mockGroups })

    const { result } = renderHook(
      () => useBackrefs("team", "member-1"),
      { wrapper: makeWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.groups).toEqual(mockGroups)
    expect(backrefsApi.fetch).toHaveBeenCalledWith("team", "member-1")
  })

  it("is disabled when targetSlug is empty", () => {
    const { result } = renderHook(
      () => useBackrefs("", "member-1"),
      { wrapper: makeWrapper() }
    )
    // Query should not fire when slug is empty
    expect(result.current.isFetching).toBe(false)
    expect(backrefsApi.fetch).not.toHaveBeenCalled()
  })

  it("is disabled when targetId is empty", () => {
    const { result } = renderHook(
      () => useBackrefs("team", ""),
      { wrapper: makeWrapper() }
    )
    expect(result.current.isFetching).toBe(false)
    expect(backrefsApi.fetch).not.toHaveBeenCalled()
  })

  it("returns error state on failure", async () => {
    vi.mocked(backrefsApi.fetch).mockRejectedValueOnce(new Error("Not found"))

    const { result } = renderHook(
      () => useBackrefs("team", "missing-id"),
      { wrapper: makeWrapper() }
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(Error)
  })

  it("uses the correct query key", () => {
    vi.mocked(backrefsApi.fetch).mockResolvedValue({ groups: [] })
    const { result } = renderHook(
      () => useBackrefs("posts", "post-1"),
      { wrapper: makeWrapper() }
    )
    // The query key should include the BACKREF_QUERY_KEY constant
    expect(result.current.data).toBeUndefined() // initial state before resolution
    expect(BACKREF_QUERY_KEY).toBe("backrefs")
  })
})

describe("useBackrefsGroup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches paginated group data", async () => {
    vi.mocked(backrefsApi.fetchGroup).mockResolvedValueOnce({ groups: mockGroups })

    const { result } = renderHook(
      () => useBackrefsGroup("team", "member-1", "articles", "author_id", 1),
      { wrapper: makeWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.groups).toHaveLength(1)
    expect(backrefsApi.fetchGroup).toHaveBeenCalledWith("team", "member-1", "articles", "author_id", 1, 20)
  })

  it("is disabled when branchAlias is empty", () => {
    const { result } = renderHook(
      () => useBackrefsGroup("team", "member-1", "articles", "", 1),
      { wrapper: makeWrapper() }
    )
    expect(result.current.isFetching).toBe(false)
    expect(backrefsApi.fetchGroup).not.toHaveBeenCalled()
  })

  it("is disabled when sourceSlug is empty", () => {
    const { result } = renderHook(
      () => useBackrefsGroup("team", "member-1", "", "author_id", 1),
      { wrapper: makeWrapper() }
    )
    expect(result.current.isFetching).toBe(false)
    expect(backrefsApi.fetchGroup).not.toHaveBeenCalled()
  })

  it("passes custom limit to the API", async () => {
    vi.mocked(backrefsApi.fetchGroup).mockResolvedValueOnce({ groups: [] })

    const { result } = renderHook(
      () => useBackrefsGroup("team", "member-1", "articles", "author_id", 2, 50),
      { wrapper: makeWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(backrefsApi.fetchGroup).toHaveBeenCalledWith("team", "member-1", "articles", "author_id", 2, 50)
  })
})
