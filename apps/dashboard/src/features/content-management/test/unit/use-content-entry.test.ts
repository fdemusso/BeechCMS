// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"

const mocked = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock("@/lib/rpc", () => ({
  rpc: { api: { content: { ":slug": { ":id": { $get: mocked.get } } } } },
}))

import { useContentEntry } from "@/features/content-management/hooks/use-content-item"
import { CONTENT_QUERY_KEYS } from "@/features/content-management/consts/content.keys"
import type { ContentEntry } from "@/lib/dynamic-columns"

const FULL_ENTRY: ContentEntry = {
  id: "3f1c2a4e-9b7d-4c1e-8a2f-5d6e7f8a9b0c",
  slug: "scarpa",
  status: "published",
  data: { title: { it: "Scarpa", en: "Shoe" }, sku: "S-1" },
  created_at: 1700000000,
  updated_at: 1700000100,
}
// Exactly the shape useContentList primes into the detail cache (use-content-list.ts).
const PRIMED_STUB: ContentEntry = {
  id: FULL_ENTRY.id,
  slug: null,
  status: "published",
  data: { title: "Scarpa" },
  created_at: null,
  updated_at: null,
}

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children)
}

describe("useContentEntry", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  it("reports a primed relation-label stub as loading and refetches the full entry", async () => {
    // Regression guard for carried-in (d): a primed stub must never be trusted as a complete entry.
    queryClient.setQueryData(CONTENT_QUERY_KEYS.detail("posts", FULL_ENTRY.id), PRIMED_STUB)
    mocked.get.mockResolvedValueOnce({ json: async () => FULL_ENTRY })

    const { result } = renderHook(() => useContentEntry("posts", FULL_ENTRY.id), {
      wrapper: makeWrapper(queryClient),
    })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()
    await waitFor(() => expect(result.current.data).toEqual(FULL_ENTRY))
    expect(mocked.get).toHaveBeenCalledWith({ param: { slug: "posts", id: FULL_ENTRY.id } })
  })

  it("serves a cached full entry without refetching", () => {
    queryClient.setQueryData(CONTENT_QUERY_KEYS.detail("posts", FULL_ENTRY.id), FULL_ENTRY)

    const { result } = renderHook(() => useContentEntry("posts", FULL_ENTRY.id), {
      wrapper: makeWrapper(queryClient),
    })

    expect(result.current.data).toEqual(FULL_ENTRY)
    expect(mocked.get).not.toHaveBeenCalled()
  })
})
