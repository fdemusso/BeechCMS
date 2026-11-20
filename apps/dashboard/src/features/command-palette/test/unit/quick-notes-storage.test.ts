// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, afterEach, type MockInstance } from "vitest"
import { CANONICAL_USERS } from "@beechcms/testing"
import {
  deleteNote,
  insertNote,
  quickNotesKey,
  QUICK_NOTE_MAX_LENGTH,
  QUICK_NOTES_MAX_COUNT,
  readNotes,
  type QuickNote,
} from "../../lib/quick-notes-storage"

const USER_ID = CANONICAL_USERS.editor.id
const OTHER_USER_ID = CANONICAL_USERS.admin.id

const OLDEST: QuickNote = { id: "5b0e2c1a-3d4f-4a6b-8c7d-9e0f1a2b3c4d", text: "oldest", createdAt: 1_700_000_000_000 }
const MIDDLE: QuickNote = { id: "6c1f3d2b-4e5a-4b7c-9d8e-0f1a2b3c4d5e", text: "middle", createdAt: 1_700_000_100_000 }
const NEWEST: QuickNote = { id: "7d2a4e3c-5f6b-4c8d-8e9f-1a2b3c4d5e6f", text: "newest", createdAt: 1_700_000_200_000 }

function storeRaw(userId: string, value: unknown) {
  localStorage.setItem(quickNotesKey(userId), typeof value === "string" ? value : JSON.stringify(value))
}

function storedRaw(userId: string) {
  return localStorage.getItem(quickNotesKey(userId))
}

function notesAtCap(): QuickNote[] {
  return Array.from({ length: QUICK_NOTES_MAX_COUNT }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    text: `note ${index}`,
    createdAt: 1_700_000_000_000 + index,
  }))
}

// happy-dom's localStorage is a proxy: vi.restoreAllMocks() leaves an instance spy in place and a Storage.prototype
// spy is bypassed once the store has been used, so the spy is restored by hand.
let refusedWrites: MockInstance | undefined

function refuseWrites() {
  refusedWrites = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
    throw new DOMException("Quota exceeded", "QuotaExceededError")
  })
}

describe("quick notes storage", () => {
  afterEach(() => refusedWrites?.mockRestore())

  describe("readNotes", () => {
    it("a missing key yields an empty list", () => {
      const notes = readNotes(localStorage, USER_ID)

      expect(notes).toEqual([])
    })

    it("corrupt JSON yields an empty list without throwing", () => {
      storeRaw(USER_ID, "{not json")

      const notes = readNotes(localStorage, USER_ID)

      expect(notes).toEqual([])
    })

    it("entries with a wrong shape are dropped and the rest is returned newest first", () => {
      storeRaw(USER_ID, [OLDEST, { id: 7, text: "bad id", createdAt: 1 }, { id: "x", text: "no date" }, null, NEWEST])

      const notes = readNotes(localStorage, USER_ID)

      expect(notes).toEqual([NEWEST, OLDEST])
    })
  })

  describe("insertNote", () => {
    it("stores the note under the user's key, newest first, and leaves another user's key untouched", () => {
      storeRaw(USER_ID, [OLDEST])
      storeRaw(OTHER_USER_ID, [MIDDLE])

      const result = insertNote(localStorage, USER_ID, NEWEST)

      expect(result).toEqual({ ok: true, notes: [NEWEST, OLDEST] })
      expect(readNotes(localStorage, USER_ID)).toEqual([NEWEST, OLDEST])
      expect(readNotes(localStorage, OTHER_USER_ID)).toEqual([MIDDLE])
    })

    it("empty or over-length text is rejected with empty or too-long and nothing is stored", () => {
      const cases: [string, "empty" | "too-long"][] = [
        ["", "empty"],
        ["x".repeat(QUICK_NOTE_MAX_LENGTH + 1), "too-long"],
      ]

      const results = cases.map(([text]) => insertNote(localStorage, USER_ID, { ...NEWEST, text }))

      expect(results).toEqual(cases.map(([, reason]) => ({ ok: false, reason })))
      expect(storedRaw(USER_ID)).toBeNull()
    })

    it("at QUICK_NOTES_MAX_COUNT it returns full and the stored list is unchanged", () => {
      storeRaw(USER_ID, notesAtCap())
      const before = storedRaw(USER_ID)

      const result = insertNote(localStorage, USER_ID, NEWEST)

      expect(result).toEqual({ ok: false, reason: "full" })
      expect(storedRaw(USER_ID)).toBe(before)
    })

    it("an id already stored returns ok and the stored list is unchanged", () => {
      storeRaw(USER_ID, [OLDEST, NEWEST])
      const before = storedRaw(USER_ID)

      const result = insertNote(localStorage, USER_ID, NEWEST)

      expect(result).toEqual({ ok: true, notes: [NEWEST, OLDEST] })
      expect(storedRaw(USER_ID)).toBe(before)
    })

    it("a throwing setItem returns write-failed and the stored list is unchanged", () => {
      storeRaw(USER_ID, [OLDEST])
      const before = storedRaw(USER_ID)
      refuseWrites()

      const result = insertNote(localStorage, USER_ID, NEWEST)

      expect(result).toEqual({ ok: false, reason: "write-failed" })
      expect(storedRaw(USER_ID)).toBe(before)
    })

    it("works from storage, not from a stale list: a note written by another tab between two inserts survives", () => {
      // Regression guard: writing the caller's in-memory list would erase the other tab's note.
      insertNote(localStorage, USER_ID, OLDEST)
      storeRaw(USER_ID, [OLDEST, MIDDLE])

      const result = insertNote(localStorage, USER_ID, NEWEST)

      expect(result).toEqual({ ok: true, notes: [NEWEST, MIDDLE, OLDEST] })
      expect(readNotes(localStorage, USER_ID)).toEqual([NEWEST, MIDDLE, OLDEST])
    })
  })

  describe("deleteNote", () => {
    it("removes only the matching note", () => {
      storeRaw(USER_ID, [OLDEST, MIDDLE, NEWEST])

      const result = deleteNote(localStorage, USER_ID, MIDDLE.id)

      expect(result).toEqual({ ok: true, notes: [NEWEST, OLDEST] })
      expect(readNotes(localStorage, USER_ID)).toEqual([NEWEST, OLDEST])
    })

    it("an unknown id returns ok and the stored list is unchanged", () => {
      storeRaw(USER_ID, [OLDEST])
      const before = storedRaw(USER_ID)

      const result = deleteNote(localStorage, USER_ID, NEWEST.id)

      expect(result).toEqual({ ok: true, notes: [OLDEST] })
      expect(storedRaw(USER_ID)).toBe(before)
    })
  })
})
