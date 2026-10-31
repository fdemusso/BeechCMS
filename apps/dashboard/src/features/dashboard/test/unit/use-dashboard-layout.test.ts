// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import type { DashboardLayout } from "@beechcms/core"
import { CANONICAL_SEEDS } from "@beechcms/testing"
import { DASHBOARD_QUERY_KEYS } from "@/features/shared"

const mocked = vi.hoisted(() => ({ layout: vi.fn(), schema: vi.fn(), me: vi.fn() }))

vi.mock("@/lib/rpc", () => ({
  rpc: { api: {
    "dashboard-layout": { $get: mocked.layout },
    schema: { $get: mocked.schema },
    settings: { me: { $get: mocked.me } },
  } },
}))

import { useDashboardLayout } from "@/features/dashboard/hooks/use-dashboard-layout"
import { FULL_AUTHORITY, meResponseBody, type MePermissions } from "@/test/me-payload"

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children)
}

/** The layout, the schema and the caller's authority are all read through rpc. */
function mockResponses({
  layout,
  schema,
  permissions = FULL_AUTHORITY,
}: {
  layout: unknown
  schema: unknown
  permissions?: MePermissions
}) {
  mocked.layout.mockResolvedValue({ json: async () => layout })
  mocked.schema.mockResolvedValue({ json: async () => schema })
  mocked.me.mockResolvedValue({ json: async () => meResponseBody(permissions) })
}

const READER_OF_POSTS: MePermissions = { global: [], byScope: { posts: ["content:read"] } }

function pageOf(widgets: DashboardLayout["pages"][number]["sections"][number]["columns"][number]["widgets"]): DashboardLayout {
  return {
    version: 1,
    pages: [
      {
        id: "page-1",
        slug: "custom",
        label: "Custom",
        sections: [{ id: "section-1", columns: [{ id: "col-1", widgets }] }],
      },
    ],
  }
}

describe("useDashboardLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("falls back to the generated default layout when none is stored", async () => {
    mockResponses({ layout: { layout: null }, schema: [] })

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

    mockResponses({ layout: { layout: storedLayout }, schema: [] })

    const { result } = renderHook(() => useDashboardLayout(), {
      wrapper: wrapper(makeQueryClient()),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isStored).toBe(true)
    expect(result.current.layout).toEqual(storedLayout)
  })

  it("re-requests the layout on remount even inside the app-wide staleTime", async () => {
    mockResponses({ layout: { layout: null }, schema: [] })
    // Mirrors the production default in lib/query-client.ts, which the hook must override.
    const appWideStaleTime = 5 * 60 * 1000
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: appWideStaleTime } },
    })
    const first = renderHook(() => useDashboardLayout(), { wrapper: wrapper(client) })
    await waitFor(() => expect(first.result.current.isLoading).toBe(false))
    first.unmount()

    renderHook(() => useDashboardLayout(), { wrapper: wrapper(client) })

    await waitFor(() => expect(mocked.layout).toHaveBeenCalledTimes(2))
  })

  it("returns a stored layout with no pages as-is instead of the generated default", async () => {
    const emptyStoredLayout: DashboardLayout = { version: 1, pages: [] }
    mockResponses({ layout: { layout: emptyStoredLayout }, schema: CANONICAL_SEEDS })

    const { result } = renderHook(() => useDashboardLayout(), {
      wrapper: wrapper(makeQueryClient()),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.layout.pages).toHaveLength(0)
    expect(result.current.isStored).toBe(true)
  })

  it("generates a default without admin widgets for a caller reading only posts", async () => {
    mockResponses({ layout: { layout: null }, schema: CANONICAL_SEEDS, permissions: READER_OF_POSTS })

    const { result } = renderHook(() => useDashboardLayout(), {
      wrapper: wrapper(makeQueryClient()),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const types = result.current.layout.pages.flatMap((page) =>
      page.sections.flatMap((section) => section.columns.flatMap((col) => col.widgets.map((w) => w.type))),
    )
    expect(types.length).toBeGreaterThan(0)
    for (const hidden of ["core/setup-checklist", "core/site-status", "core/storage", "core/media-gallery"]) {
      expect(types).not.toContain(hidden)
    }
  })

  it("returns a stored layout without the widgets the caller cannot use", async () => {
    const stored = pageOf([
      { id: "w-checklist", type: "core/setup-checklist", config: {} },
      { id: "w-text", type: "core/text", config: {} },
    ])
    mockResponses({ layout: { layout: stored }, schema: [], permissions: READER_OF_POSTS })

    const { result } = renderHook(() => useDashboardLayout(), {
      wrapper: wrapper(makeQueryClient()),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const widgets = result.current.layout.pages[0].sections[0].columns[0].widgets
    expect(widgets.map((w) => w.id)).toEqual(["w-text"])
    expect(result.current.isStored).toBe(true)
  })

  it("removes a stored page left with no usable widget", async () => {
    const stored = pageOf([{ id: "w-checklist", type: "core/setup-checklist", config: {} }])
    mockResponses({ layout: { layout: stored }, schema: [], permissions: READER_OF_POSTS })

    const { result } = renderHook(() => useDashboardLayout(), {
      wrapper: wrapper(makeQueryClient()),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.layout.pages).toEqual([])
  })

  it("stays loading while me is unresolved even after the layout query settles", async () => {
    mockResponses({ layout: { layout: null }, schema: [] })
    mocked.me.mockReturnValue(new Promise(() => {}))
    const client = makeQueryClient()

    const { result } = renderHook(() => useDashboardLayout(), { wrapper: wrapper(client) })
    await waitFor(() => expect(client.getQueryState(DASHBOARD_QUERY_KEYS.layout())?.status).toBe("success"))

    expect(result.current.isLoading).toBe(true)
  })
})
