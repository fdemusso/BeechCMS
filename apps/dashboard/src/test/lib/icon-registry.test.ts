// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { resolveIcon, ICON_NAMES } from "@/lib/icon-registry"

describe("resolveIcon", () => {
  it("returns a component for known names", () => {
    for (const name of ["Folder", "Newspaper", "Users"]) {
      expect(ICON_NAMES.includes(name)).toBe(true)
      expect(["function", "object"]).toContain(typeof resolveIcon(name))
    }
  })

  it("returns a valid component for unknown names, not undefined", () => {
    expect(resolveIcon("not-a-real-icon")).toBeDefined()
    expect(resolveIcon(undefined)).toBeDefined()
    expect(resolveIcon("")).toBeDefined()
  })

  it("rejects inherited Object.prototype keys instead of leaking them", () => {
    // Pre-fix, resolveIcon("constructor") returned the Object constructor
    // and resolveIcon("__proto__") returned Object.prototype — neither is
    // a valid React component, so rendering it throws "invalid element type".
    for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
      const resolved = resolveIcon(name)
      expect(resolved).not.toBe(Object)
      expect(resolved).not.toBe(Object.prototype)
      expect(resolved).not.toBe((Object.prototype as Record<string, unknown>)[name])
      expect(["function", "object"]).toContain(typeof resolved)
    }
  })
})
