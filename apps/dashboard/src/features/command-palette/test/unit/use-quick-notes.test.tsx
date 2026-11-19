// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { CANONICAL_USERS } from "@beechcms/testing"

const { toastMock } = vi.hoisted(() => ({
  toastMock: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("sonner", () => ({ toast: toastMock }))

import { useQuickNotes, type QuickNotesState } from "../../use-quick-notes"
import {
  insertNote,
  QUICK_NOTES_MAX_COUNT,
  readNotes,
  type QuickNote,
} from "../../lib/quick-notes-storage"

const USER_ID = CANONICAL_USERS.editor.id
const NEXT_USER_ID = CANONICAL_USERS.viewer.id

const OLDEST: QuickNote = { id: "5b0e2c1a-3d4f-4a6b-8c7d-9e0f1a2b3c4d", text: "oldest", createdAt: 1_700_000_000_000 }
const NEWEST: QuickNote = { id: "7d2a4e3c-5f6b-4c8d-8e9f-1a2b3c4d5e6f", text: "newest", createdAt: 1_700_000_200_000 }

interface UndoToastOptions {
  readonly duration: number
  readonly className: string
  readonly action: { readonly label: string; readonly onClick: () => void }
}

function undoToastOptions(): UndoToastOptions {
  return toastMock.success.mock.calls[0][1] as UndoToastOptions
}

function notesAtCap(): QuickNote[] {
  return Array.from({ length: QUICK_NOTES_MAX_COUNT }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    text: `note ${index}`,
    createdAt: 1_700_000_000_000 + index,
  }))
}

// happy-dom's localStorage is a proxy: vi.restoreAllMocks() leaves an instance spy in place, so it is restored by hand.
let refusedWrites: MockInstance | undefined

describe("useQuickNotes", () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => refusedWrites?.mockRestore())

  it("without a user id the state is unavailable", () => {
    const { result } = renderHook(() => useQuickNotes(undefined, true))

    expect(result.current.state).toEqual({ status: "unavailable" })
  })

  it("when storage refuses writes the state is unavailable", () => {
    refusedWrites = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError")
    })

    const { result } = renderHook(() => useQuickNotes(USER_ID, true))

    expect(result.current.state).toEqual({ status: "unavailable" })
  })

  it("save stores the trimmed text as the newest note and toasts the browser-only message", () => {
    insertNote(localStorage, USER_ID, OLDEST)
    const { result } = renderHook(() => useQuickNotes(USER_ID, true))

    act(() => result.current.save("  buy milk  "))

    const stored = readNotes(localStorage, USER_ID)
    expect(toastMock.success).toHaveBeenCalledWith("Note saved on this browser only")
    expect(stored.map((note) => note.text)).toEqual(["buy milk", "oldest"])
    expect(result.current.state).toEqual({ status: "ready", notes: stored })
  })

  it("save on a full list stores nothing and toasts an error", () => {
    const atCap = notesAtCap()
    atCap.forEach((note) => insertNote(localStorage, USER_ID, note))
    const { result } = renderHook(() => useQuickNotes(USER_ID, true))

    act(() => result.current.save("one too many"))

    expect(toastMock.error).toHaveBeenCalledWith(`${QUICK_NOTES_MAX_COUNT} notes saved: delete one to save a new one`)
    expect(toastMock.success).not.toHaveBeenCalled()
    expect(readNotes(localStorage, USER_ID)).toHaveLength(QUICK_NOTES_MAX_COUNT)
  })

  it("remove deletes only that note and toasts with an Undo action", () => {
    insertNote(localStorage, USER_ID, OLDEST)
    insertNote(localStorage, USER_ID, NEWEST)
    const { result } = renderHook(() => useQuickNotes(USER_ID, true))

    act(() => result.current.remove(NEWEST))

    expect(readNotes(localStorage, USER_ID)).toEqual([OLDEST])
    expect(toastMock.success).toHaveBeenCalledWith("Note deleted", expect.any(Object))
    expect(undoToastOptions()).toMatchObject({
      duration: 5000,
      className: "undo-toast",
      action: { label: "Undo" },
    })
  })

  it("running the Undo action restores the deleted note at its place", () => {
    insertNote(localStorage, USER_ID, OLDEST)
    insertNote(localStorage, USER_ID, NEWEST)
    const { result } = renderHook(() => useQuickNotes(USER_ID, true))
    act(() => result.current.remove(NEWEST))

    act(() => undoToastOptions().action.onClick())

    expect(readNotes(localStorage, USER_ID)).toEqual([NEWEST, OLDEST])
    expect(result.current.state).toEqual({ status: "ready", notes: [NEWEST, OLDEST] })
    expect(toastMock.success).toHaveBeenLastCalledWith("Note restored")
  })

  it("after the signed-in user changes no render exposes the previous user's notes", () => {
    insertNote(localStorage, USER_ID, NEWEST)
    const statesSeenByNextUser: QuickNotesState[] = []
    const { rerender } = renderHook(
      ({ userId, open }) => {
        const api = useQuickNotes(userId, open)
        if (userId === NEXT_USER_ID) statesSeenByNextUser.push(api.state)
        return api
      },
      { initialProps: { userId: USER_ID as string, open: true } },
    )

    rerender({ userId: USER_ID, open: false })
    rerender({ userId: NEXT_USER_ID, open: false })
    rerender({ userId: NEXT_USER_ID, open: true })

    // Regression guard: the notes lived in plain state refreshed only while open, so after A -> B with
    // the palette closed the first render of B's open palette still carried A's notes.
    expect(statesSeenByNextUser.length).toBeGreaterThan(0)
    expect(statesSeenByNextUser).toEqual(statesSeenByNextUser.map(() => ({ status: "ready", notes: [] })))
  })

  it("notes written to storage while the palette was closed are listed after open turns true", () => {
    const { result, rerender } = renderHook(({ open }) => useQuickNotes(USER_ID, open), {
      initialProps: { open: false },
    })
    insertNote(localStorage, USER_ID, NEWEST)

    rerender({ open: true })

    expect(result.current.state).toEqual({ status: "ready", notes: [NEWEST] })
  })
})
