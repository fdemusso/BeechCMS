// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, afterEach, type MockInstance } from "vitest"
import { CANONICAL_USERS } from "@beechcms/testing"
import {
  readRecentIds,
  recentItemsKey,
  recordRecentId,
  RECENT_ITEMS_MAX,
} from "../../lib/recent-items-storage"

const USER_ID = CANONICAL_USERS.editor.id
const OTHER_USER_ID = CANONICAL_USERS.admin.id

function storeRaw(userId: string, value: unknown) {
  localStorage.setItem(recentItemsKey(userId), typeof value === "string" ? value : JSON.stringify(value))
}

function storedRaw(userId: string) {
  return localStorage.getItem(recentItemsKey(userId))
}

function idsAtCap(): string[] {
  return Array.from({ length: RECENT_ITEMS_MAX }, (_, index) => `nav:/page-${index}`)
}

// happy-dom's localStorage is a proxy: vi.restoreAllMocks() leaves an instance spy in place and a Storage.prototype
// spy is bypassed once the store has been used, so the spy is restored by hand.
let refusedWrites: MockInstance | undefined

function refuseWrites() {
  refusedWrites = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
    throw new DOMException("Quota exceeded", "QuotaExceededError")
  })
}

describe("recent items storage", () => {
  afterEach(() => refusedWrites?.mockRestore())

  describe("readRecentIds", () => {
    it("a missing key yields an empty list", () => {
      const ids = readRecentIds(localStorage, USER_ID)

      expect(ids).toEqual([])
    })

    it.each([
      ["corrupt JSON", "{not json"],
      ["a non-array value", { id: "nav:/" }],
    ])("%s yields an empty list without throwing", (_name, stored) => {
      storeRaw(USER_ID, stored)

      const ids = readRecentIds(localStorage, USER_ID)

      expect(ids).toEqual([])
    })

    it("non-string and empty entries are dropped, duplicates keep their first position, and the list is capped", () => {
      storeRaw(USER_ID, ["nav:/a", 7, "", null, "nav:/b", "nav:/a", "nav:/c", "nav:/d", "nav:/e", "nav:/f"])

      const ids = readRecentIds(localStorage, USER_ID)

      expect(ids).toEqual(["nav:/a", "nav:/b", "nav:/c", "nav:/d", "nav:/e"])
    })
  })

  describe("recordRecentId", () => {
    it("puts the id first under the user key and leaves another user key untouched", () => {
      storeRaw(OTHER_USER_ID, ["nav:/other"])
      storeRaw(USER_ID, ["nav:/old"])

      const recorded = recordRecentId(localStorage, USER_ID, "nav:/new")

      expect(recorded).toEqual(["nav:/new", "nav:/old"])
      expect(storedRaw(USER_ID)).toBe(JSON.stringify(["nav:/new", "nav:/old"]))
      expect(storedRaw(OTHER_USER_ID)).toBe(JSON.stringify(["nav:/other"]))
    })

    it("an id already stored moves to the front without a duplicate", () => {
      storeRaw(USER_ID, ["nav:/a", "nav:/b", "nav:/c"])

      const recorded = recordRecentId(localStorage, USER_ID, "nav:/c")

      expect(recorded).toEqual(["nav:/c", "nav:/a", "nav:/b"])
      expect(readRecentIds(localStorage, USER_ID)).toEqual(["nav:/c", "nav:/a", "nav:/b"])
    })

    it("at RECENT_ITEMS_MAX the oldest id is dropped", () => {
      const atCap = idsAtCap()
      storeRaw(USER_ID, atCap)

      const recorded = recordRecentId(localStorage, USER_ID, "nav:/fresh")

      expect(recorded).toEqual(["nav:/fresh", ...atCap.slice(0, RECENT_ITEMS_MAX - 1)])
      expect(readRecentIds(localStorage, USER_ID)).toEqual(recorded)
    })

    it("a throwing setItem returns null and the stored list is unchanged", () => {
      storeRaw(USER_ID, ["nav:/old"])
      refuseWrites()

      const recorded = recordRecentId(localStorage, USER_ID, "nav:/new")

      expect(recorded).toBeNull()
      expect(storedRaw(USER_ID)).toBe(JSON.stringify(["nav:/old"]))
    })

    it("works from storage, not from a stale list: an id written by another tab between two records survives", () => {
      recordRecentId(localStorage, USER_ID, "nav:/first")
      // Another tab writes between the two records.
      storeRaw(USER_ID, ["nav:/other-tab", "nav:/first"])

      const recorded = recordRecentId(localStorage, USER_ID, "nav:/second")

      expect(recorded).toEqual(["nav:/second", "nav:/other-tab", "nav:/first"])
    })
  })
})
