// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from "vitest"
import { resolveActiveViewId } from "../../lib/resolve-active-view"

const GALLERY_ID = "8a6d2c41-0e7b-4f3a-b1c2-6d9e8f7a5b43"
const TABLE_ID = "3f0b6a52-5c1e-4c8e-9a51-2f7f1c9b8d10"
const UNKNOWN_ID = "c1d2e3f4-5678-49ab-9000-1234567890ab"

const views = [
  { id: GALLERY_ID, type: "gallery" as const },
  { id: TABLE_ID, type: "table" as const },
]

describe("resolveActiveViewId", () => {
  it("the first candidate that names a visible view wins over later candidates", () => {
    const result = resolveActiveViewId(views, [TABLE_ID, GALLERY_ID])

    expect(result).toBe(TABLE_ID)
  })

  it("a candidate that names no visible view is skipped", () => {
    const result = resolveActiveViewId(views, [UNKNOWN_ID, "gallery", GALLERY_ID])

    expect(result).toBe(GALLERY_ID)
  })

  it("falls back to the first Table instance when no candidate matches, even behind a Gallery", () => {
    const result = resolveActiveViewId(views, [UNKNOWN_ID])

    expect(result).toBe(TABLE_ID)
  })

  it("returns null for an empty view list", () => {
    const result = resolveActiveViewId([], [TABLE_ID])

    expect(result).toBeNull()
  })
})
