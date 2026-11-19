// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, afterEach, vi, type MockInstance } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { CANONICAL_USERS } from "@beechcms/testing"
import { useRecentItems, type RecentItemsState } from "../../use-recent-items"
import { readRecentIds, recordRecentId } from "../../lib/recent-items-storage"

const USER_ID = CANONICAL_USERS.editor.id
const NEXT_USER_ID = CANONICAL_USERS.viewer.id

// happy-dom's localStorage is a proxy: vi.restoreAllMocks() leaves an instance spy in place, so it is restored by hand.
let refusedWrites: MockInstance | undefined

function refuseWrites() {
  refusedWrites = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
    throw new DOMException("Quota exceeded", "QuotaExceededError")
  })
}

describe("useRecentItems", () => {
  afterEach(() => refusedWrites?.mockRestore())

  it("without a user id the state is unavailable", () => {
    const { result } = renderHook(() => useRecentItems(undefined, true))

    expect(result.current.state).toEqual({ status: "unavailable" })
  })

  it("when storage refuses writes the state is unavailable", () => {
    refuseWrites()

    const { result } = renderHook(() => useRecentItems(USER_ID, true))

    expect(result.current.state).toEqual({ status: "unavailable" })
  })

  it("record stores the id first and the state lists it", () => {
    recordRecentId(localStorage, USER_ID, "nav:/old")
    const { result } = renderHook(() => useRecentItems(USER_ID, true))

    act(() => result.current.record("nav:/new"))

    expect(readRecentIds(localStorage, USER_ID)).toEqual(["nav:/new", "nav:/old"])
    expect(result.current.state).toEqual({ status: "ready", ids: ["nav:/new", "nav:/old"] })
  })

  it("a failed record leaves the state unchanged", () => {
    recordRecentId(localStorage, USER_ID, "nav:/old")
    const { result } = renderHook(() => useRecentItems(USER_ID, true))
    refuseWrites()

    act(() => result.current.record("nav:/new"))

    expect(result.current.state).toEqual({ status: "ready", ids: ["nav:/old"] })
    expect(readRecentIds(localStorage, USER_ID)).toEqual(["nav:/old"])
  })

  it("after the signed-in user changes no render exposes the previous user ids", () => {
    recordRecentId(localStorage, USER_ID, "nav:/previous-user")
    const statesSeenByNextUser: RecentItemsState[] = []
    const { rerender } = renderHook(
      ({ userId, open }) => {
        const api = useRecentItems(userId, open)
        if (userId === NEXT_USER_ID) statesSeenByNextUser.push(api.state)
        return api
      },
      { initialProps: { userId: USER_ID as string, open: true } },
    )

    rerender({ userId: USER_ID, open: false })
    rerender({ userId: NEXT_USER_ID, open: false })
    rerender({ userId: NEXT_USER_ID, open: true })

    // Regression guard: ids held in plain state were refreshed only while open, so after A -> B with
    // the palette closed the first render of B carried A ids.
    expect(statesSeenByNextUser.length).toBeGreaterThan(0)
    expect(statesSeenByNextUser).toEqual(statesSeenByNextUser.map(() => ({ status: "ready", ids: [] })))
  })

  it("ids written to storage while the palette was closed are listed after open turns true", () => {
    const { result, rerender } = renderHook(({ open }) => useRecentItems(USER_ID, open), {
      initialProps: { open: false },
    })
    recordRecentId(localStorage, USER_ID, "nav:/written-meanwhile")

    rerender({ open: true })

    expect(result.current.state).toEqual({ status: "ready", ids: ["nav:/written-meanwhile"] })
  })
})
