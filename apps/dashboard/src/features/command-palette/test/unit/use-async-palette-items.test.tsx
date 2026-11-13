// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { describe, it, expect, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useAsyncPaletteItems } from "../../use-async-palette-items"
import type {
  CommandPage,
  PaletteAsyncProvider,
  PaletteItem,
  PalettePrefix,
  PaletteQueryContext,
} from "../../types"

// The debounce only delays the request; the tests are about what is requested and exposed.
vi.mock("@/hooks/use-debounce", () => ({ useDebounce: <T,>(value: T) => value }))

const ROW: PaletteItem = {
  id: "remote:1",
  section: "Remote",
  label: "Remote hit",
  icon: () => null,
  perform: { kind: "navigate", to: "/remote/1" },
}

const permissions: PaletteQueryContext["permissions"] = {
  can: () => true,
  canAnywhere: () => true,
  canGlobally: () => true,
}

interface HookProps {
  readonly providers: readonly PaletteAsyncProvider[]
  readonly query: string
  readonly page?: CommandPage
  readonly prefix?: PalettePrefix
}

function remoteProvider(
  fetchItems: PaletteAsyncProvider["fetchItems"],
  overrides: Partial<PaletteAsyncProvider> = {},
): PaletteAsyncProvider {
  return { id: "remote", pages: ["root"], minQueryLength: 2, fetchItems, ...overrides }
}

function renderLane(initialProps: HookProps) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(
    ({ providers, query, page = "root", prefix }: HookProps) =>
      useAsyncPaletteItems(providers, { page, query, prefix, permissions }),
    { initialProps, wrapper },
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

describe("useAsyncPaletteItems", () => {
  it("a query shorter than minQueryLength calls no provider and is not pending", () => {
    const fetchItems = vi.fn().mockResolvedValue([ROW])

    const { result } = renderLane({ providers: [remoteProvider(fetchItems)], query: "a" })

    expect(fetchItems).not.toHaveBeenCalled()
    expect(result.current.pending).toBe(false)
    expect(result.current.settled).toEqual([])
  })

  it("a qualifying query is pending and exposes no rows until the provider resolves", () => {
    const answer = deferred<readonly PaletteItem[]>()
    const fetchItems = vi.fn().mockReturnValue(answer.promise)

    const { result } = renderLane({ providers: [remoteProvider(fetchItems)], query: "ab" })

    expect(result.current.pending).toBe(true)
    expect(result.current.settled).toEqual([])
  })

  it("once the provider resolves its rows are exposed through one settled provider and the lane is no longer pending", async () => {
    const fetchItems = vi.fn().mockResolvedValue([ROW])

    const { result } = renderLane({ providers: [remoteProvider(fetchItems)], query: "ab" })

    await waitFor(() => expect(result.current.settled).toHaveLength(1))
    expect(result.current.pending).toBe(false)
    expect(result.current.settled[0].id).toBe("remote")
    expect(result.current.settled[0].getItems({ page: "root", query: "ab", permissions })).toEqual([ROW])
  })

  it("a provider that does not serve the current page is never called", () => {
    const fetchItems = vi.fn().mockResolvedValue([ROW])

    const { result } = renderLane({ providers: [remoteProvider(fetchItems)], query: "ab", page: "seeds" })

    expect(fetchItems).not.toHaveBeenCalled()
    expect(result.current.pending).toBe(false)
  })

  it("with a prefix in the context, a provider declaring another prefix is never called", () => {
    const fetchItems = vi.fn().mockResolvedValue([ROW])

    const { result } = renderLane({
      providers: [remoteProvider(fetchItems, { prefix: "/" })],
      query: "ab",
      prefix: "=",
    })

    expect(fetchItems).not.toHaveBeenCalled()
    expect(result.current.pending).toBe(false)
  })

  it("changing the query aborts the signal passed to the in-flight request", async () => {
    // The brief's "a new keystroke cancels the previous search"; the abort comes from the key change.
    const signals: AbortSignal[] = []
    const fetchItems = vi.fn((_context: PaletteQueryContext, signal: AbortSignal) => {
      signals.push(signal)
      return new Promise<readonly PaletteItem[]>(() => {})
    })
    const providers = [remoteProvider(fetchItems)]
    const { rerender } = renderLane({ providers, query: "ab" })
    await waitFor(() => expect(signals).toHaveLength(1))

    rerender({ providers, query: "abc" })

    await waitFor(() => expect(signals[0].aborted).toBe(true))
    expect(signals).toHaveLength(2)
    expect(signals[1].aborted).toBe(false)
  })

  it("after the query changes, the previous query's rows are not exposed while the new one is pending", async () => {
    const second = deferred<readonly PaletteItem[]>()
    const fetchItems = vi.fn().mockResolvedValueOnce([ROW]).mockReturnValueOnce(second.promise)
    const providers = [remoteProvider(fetchItems)]
    const { result, rerender } = renderLane({ providers, query: "ab" })
    await waitFor(() => expect(result.current.settled).toHaveLength(1))

    rerender({ providers, query: "abc" })

    expect(result.current.settled).toEqual([])
    expect(result.current.pending).toBe(true)
  })

  it("a rejecting provider ends with no settled entry and not pending, and the hook does not throw", async () => {
    const fetchItems = vi.fn().mockRejectedValue(new Error("network down"))

    const { result } = renderLane({ providers: [remoteProvider(fetchItems)], query: "ab" })

    await waitFor(() => expect(fetchItems).toHaveBeenCalledOnce())
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(result.current.settled).toEqual([])
  })

  it("a provider answering for the same text again within the stale time is not called a second time", async () => {
    const fetchItems = vi.fn().mockResolvedValue([ROW])
    const providers = [remoteProvider(fetchItems)]
    const { result, rerender } = renderLane({ providers, query: "ab" })
    await waitFor(() => expect(result.current.settled).toHaveLength(1))
    rerender({ providers, query: "abc" })
    await waitFor(() => expect(fetchItems).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.settled).toHaveLength(1))

    rerender({ providers, query: "ab" })

    expect(result.current.settled).toHaveLength(1)
    expect(fetchItems).toHaveBeenCalledTimes(2)
  })
})
