// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { DASHBOARD_ICON_NAMES } from "@beechcms/core"
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

  it("resolves the common names agents pick to their own icon, not the folder fallback", () => {
    const folder = resolveIcon("Folder")

    for (const name of ["Car", "ClipboardList", "Warehouse"]) {
      expect(resolveIcon(name)).not.toBe(folder)
    }
  })

  it("falls back to the exact Folder icon for a name outside the registry", () => {
    const folder = resolveIcon("Folder")

    expect(resolveIcon("ListChecks")).toBe(folder)
    expect(resolveIcon(undefined)).toBe(folder)
  })
})

describe("ICON_NAMES parity with @beechcms/core", () => {
  // The control plane validates dashboard.icon against DASHBOARD_ICON_NAMES, so the picker and the
  // renderer must offer exactly that list. A kit export that was renamed upstream resolves to
  // undefined and silently turns the name into a folder, which this guards.
  it("offers exactly the names core lists", () => {
    expect([...ICON_NAMES].sort()).toEqual([...DASHBOARD_ICON_NAMES].sort())
  })

  it("resolves every core name to its own component, never the Folder fallback", () => {
    const folder = resolveIcon("Folder")
    const unresolved = DASHBOARD_ICON_NAMES.filter(name => name !== "Folder" && resolveIcon(name) === folder)

    expect(unresolved).toEqual([])
  })
})
