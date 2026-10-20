// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * The debounce delay is never faked (Rule 3.11 forbids fake timers). Most tests drive the flush
 * through unmount(), which proves a change still inside the debounce window is flushed, not
 * dropped, when the caller switches views. The retry test lets the real debounce timer fire once.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import * as React from "react"
import { emptyViewConfig, type ContentViewConfig } from "@beechcms/core"

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn().mockResolvedValue({ data: {} }), delete: vi.fn() },
}))

import { api } from "@/lib/api"
import { useViewConfigAutosave } from "../../hooks/use-view-config-autosave"

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client }, children)
}

const CONFIG_A: ContentViewConfig = { ...emptyViewConfig(), appearance: { pageSize: 10 } }
const CONFIG_B: ContentViewConfig = { ...emptyViewConfig(), appearance: { pageSize: 20 } }
const CONFIG_C: ContentViewConfig = { ...emptyViewConfig(), appearance: { pageSize: 30 } }

describe("useViewConfigAutosave", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = makeQueryClient()
  })

  it("writes nothing when the config never changed after mount", () => {
    const { unmount } = renderHook(
      () => useViewConfigAutosave({ slug: "posts", viewId: "v1", config: CONFIG_A, enabled: true }),
      { wrapper: wrapper(queryClient) }
    )

    unmount()

    expect(api.patch).not.toHaveBeenCalled()
  })

  it("flushes the latest config on unmount instead of dropping it", async () => {
    const { rerender, unmount } = renderHook(
      ({ config }) => useViewConfigAutosave({ slug: "posts", viewId: "v1", config, enabled: true }),
      { wrapper: wrapper(queryClient), initialProps: { config: CONFIG_A } }
    )

    rerender({ config: CONFIG_B })
    rerender({ config: CONFIG_C })
    unmount()

    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1))
    expect(api.patch).toHaveBeenCalledWith("/content/posts/views/v1", { config: CONFIG_C })
  })

  it("retries a config whose save failed instead of treating it as saved", async () => {
    vi.mocked(api.patch).mockRejectedValueOnce(new Error("network down"))
    const { result, rerender, unmount } = renderHook(
      ({ config }) => useViewConfigAutosave({ slug: "posts", viewId: "v1", config, enabled: true }),
      { wrapper: wrapper(queryClient), initialProps: { config: CONFIG_A } }
    )

    // Debounced save fires on the real timer and is rejected by the network.
    rerender({ config: CONFIG_B })
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1), { timeout: 3000 })
    await waitFor(() => expect(result.current.isSaving).toBe(false))
    unmount()

    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(2))
    expect(api.patch).toHaveBeenLastCalledWith("/content/posts/views/v1", { config: CONFIG_B })
  })

  it("never writes when disabled for a user without content:update", () => {
    const { rerender, unmount } = renderHook(
      ({ config }) => useViewConfigAutosave({ slug: "posts", viewId: "v1", config, enabled: false }),
      { wrapper: wrapper(queryClient), initialProps: { config: CONFIG_A } }
    )

    rerender({ config: CONFIG_B })
    unmount()

    expect(api.patch).not.toHaveBeenCalled()
  })
})
