// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useCollapsedGroups } from "./use-collapsed-groups"

const KEY = "beech:groups-closed:posts:view-1:status"
const OTHER_KEY = "beech:groups-closed:posts:view-2:status"

function stored(key: string): unknown {
  const raw = localStorage.getItem(key)
  return raw === null ? null : JSON.parse(raw)
}

describe("useCollapsedGroups", () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it("starts with no closed group when nothing was stored", () => {
    const { result } = renderHook(() => useCollapsedGroups(KEY))

    expect(result.current.closed).toEqual([])
  })

  it("toggling an open group closes it and stores the closed id", () => {
    const { result } = renderHook(() => useCollapsedGroups(KEY))

    act(() => result.current.toggle("status:draft"))

    expect(result.current.closed).toEqual(["status:draft"])
    expect(stored(KEY)).toEqual(["status:draft"])
  })

  it("toggling a closed group reopens it and removes the key once nothing is closed", () => {
    localStorage.setItem(KEY, JSON.stringify(["status:draft"]))
    const { result } = renderHook(() => useCollapsedGroups(KEY))

    act(() => result.current.toggle("status:draft"))

    expect(result.current.closed).toEqual([])
    expect(stored(KEY)).toBeNull()
  })

  it("restores the closed groups saved by an earlier mount, as after a reload", () => {
    localStorage.setItem(KEY, JSON.stringify(["status:draft", "status:published"]))

    const { result } = renderHook(() => useCollapsedGroups(KEY))

    expect(result.current.closed).toEqual(["status:draft", "status:published"])
  })

  it("switching to another key loads that key's groups and leaves the first one untouched", () => {
    localStorage.setItem(KEY, JSON.stringify(["status:draft"]))
    localStorage.setItem(OTHER_KEY, JSON.stringify(["status:published"]))
    const { result, rerender } = renderHook(({ storageKey }) => useCollapsedGroups(storageKey), {
      initialProps: { storageKey: KEY },
    })

    rerender({ storageKey: OTHER_KEY })

    expect(result.current.closed).toEqual(["status:published"])
    expect(stored(KEY)).toEqual(["status:draft"])
  })

  it("without a key the choice lasts for the mount and nothing is written", () => {
    const { result } = renderHook(() => useCollapsedGroups(undefined))

    act(() => result.current.toggle("status:draft"))

    expect(result.current.closed).toEqual(["status:draft"])
    expect(localStorage.length).toBe(0)
  })

  it("ignores stored data that is not a list of ids", () => {
    localStorage.setItem(KEY, JSON.stringify({ closed: "status:draft" }))

    const { result } = renderHook(() => useCollapsedGroups(KEY))

    expect(result.current.closed).toEqual([])
  })

  it("ignores stored data that is not valid JSON", () => {
    localStorage.setItem(KEY, "{not json")

    const { result } = renderHook(() => useCollapsedGroups(KEY))

    expect(result.current.closed).toEqual([])
  })

  it("keeps only string ids when the stored list holds other values", () => {
    localStorage.setItem(KEY, JSON.stringify(["status:draft", 3, null]))

    const { result } = renderHook(() => useCollapsedGroups(KEY))

    expect(result.current.closed).toEqual(["status:draft"])
  })

  it("still toggles for the session when storage refuses the write", () => {
    // Private windows and blocked site data make setItem throw.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError")
    })
    const { result } = renderHook(() => useCollapsedGroups(KEY))

    act(() => result.current.toggle("status:draft"))

    expect(result.current.closed).toEqual(["status:draft"])
  })

  it("stores at most the 200 most recently closed ids, so dead groups cannot pile up", () => {
    const { result } = renderHook(() => useCollapsedGroups(KEY))

    for (let i = 0; i < 205; i += 1) act(() => result.current.toggle(`status:${i}`))

    const saved = stored(KEY) as string[]
    expect(saved).toHaveLength(200)
    expect(saved[0]).toBe("status:5")
    expect(saved.at(-1)).toBe("status:204")
  })
})
