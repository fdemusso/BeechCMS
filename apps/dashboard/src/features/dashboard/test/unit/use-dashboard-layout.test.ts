// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import type { DashboardLayout } from "@beechcms/core"

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from "@/lib/api"
import { useDashboardLayout } from "@/features/dashboard/hooks/use-dashboard-layout"

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children)
}

function mockApiGet(responses: Record<string, unknown>) {
  ;(api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (url in responses) return Promise.resolve({ data: responses[url] })
    throw new Error(`Unexpected api.get("${url}")`)
  })
}

describe("useDashboardLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("falls back to the generated default layout when none is stored", async () => {
    mockApiGet({
      "/dashboard-layout": { scope: "user", layout: null },
      "/schema": [],
    })

    const { result } = renderHook(() => useDashboardLayout(), {
      wrapper: wrapper(makeQueryClient()),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isStored).toBe(false)
    expect(result.current.layout.version).toBe(1)
    expect(result.current.layout.pages[0].slug).toBe("overview")
    // No seeds registered → setup-checklist + status row only.
    expect(result.current.layout.pages[0].sections).toHaveLength(2)
  })

  it("returns the stored layout when present", async () => {
    const storedLayout: DashboardLayout = {
      version: 1,
      pages: [
        {
          id: "page-1",
          slug: "custom",
          label: "Custom",
          sections: [
            {
              id: "section-1",
              hideLabel: true,
              columns: [
                {
                  id: "col-1",
                  widgets: [{ id: "w-1", type: "core/stat", config: { statKey: "total" } }],
                },
              ],
            },
          ],
        },
      ],
    }

    mockApiGet({
      "/dashboard-layout": { scope: "user", layout: storedLayout },
      "/schema": [],
    })

    const { result } = renderHook(() => useDashboardLayout(), {
      wrapper: wrapper(makeQueryClient()),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isStored).toBe(true)
    expect(result.current.layout).toEqual(storedLayout)
  })
})
