// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, afterEach, vi, type MockInstance } from "vitest"
import { probePaletteStorage } from "../../lib/palette-storage"

// happy-dom's localStorage is a proxy: vi.restoreAllMocks() leaves an instance spy in place, so it is restored by hand.
let refusedWrites: MockInstance | undefined

describe("probePaletteStorage", () => {
  afterEach(() => refusedWrites?.mockRestore())

  it("returns localStorage and leaves no probe key behind", () => {
    const storage = probePaletteStorage()

    expect(storage).toBe(localStorage)
    expect(localStorage.length).toBe(0)
  })

  it("returns null when setItem throws", () => {
    refusedWrites = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError")
    })

    const storage = probePaletteStorage()

    expect(storage).toBeNull()
  })
})
