// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, afterEach } from "vitest"
import { Settings } from "@/components/icons"
import { collectStableItems } from "../../lib/stable-items"
import type { PaletteItem, PalettePermissions, PaletteProvider } from "../../types"

const NO_PERMISSIONS: PalettePermissions = {
  can: () => false,
  canAnywhere: () => false,
  canGlobally: () => false,
}

function row(id: string, overrides: Partial<PaletteItem> = {}): PaletteItem {
  return { id, section: "Section", label: id, icon: Settings, perform: { kind: "navigate", to: "/" }, ...overrides }
}

function provider(id: string, getStableItems?: PaletteProvider["getStableItems"]): PaletteProvider {
  return { id, pages: ["root"], getItems: () => [], getStableItems }
}

describe("collectStableItems", () => {
  afterEach(() => vi.restoreAllMocks())

  it("returns the rows of providers declaring getStableItems, by id, and skips the others", () => {
    const providers = [
      provider("a", () => [row("a:one"), row("a:two")]),
      provider("computed"),
      provider("b", () => [row("b:one")]),
    ]

    const stable = collectStableItems(providers, { permissions: NO_PERMISSIONS })

    expect([...stable.keys()]).toEqual(["a:one", "a:two", "b:one"])
    expect(stable.get("b:one")?.label).toBe("b:one")
  })

  it("the first row with a given id wins", () => {
    const providers = [
      provider("a", () => [row("shared:id", { label: "first" })]),
      provider("b", () => [row("shared:id", { label: "second" })]),
    ]

    const stable = collectStableItems(providers, { permissions: NO_PERMISSIONS })

    expect(stable.size).toBe(1)
    expect(stable.get("shared:id")?.label).toBe("first")
  })

  it("a throwing provider contributes nothing and the others still do", () => {
    const failure = vi.spyOn(console, "error").mockImplementation(() => {})
    const providers = [
      provider("broken", () => {
        throw new Error("boom")
      }),
      provider("ok", () => [row("ok:one")]),
    ]

    const stable = collectStableItems(providers, { permissions: NO_PERMISSIONS })

    expect([...stable.keys()]).toEqual(["ok:one"])
    expect(failure).toHaveBeenCalledWith('[command-palette] provider "broken" failed', expect.any(Error))
  })

  it("passes the caller permissions to every provider", () => {
    const getStableItems = vi.fn(() => [])
    const providers = [provider("a", getStableItems), provider("b", getStableItems)]

    collectStableItems(providers, { permissions: NO_PERMISSIONS })

    expect(getStableItems).toHaveBeenCalledTimes(2)
    expect(getStableItems).toHaveBeenNthCalledWith(1, { permissions: NO_PERMISSIONS })
    expect(getStableItems).toHaveBeenNthCalledWith(2, { permissions: NO_PERMISSIONS })
  })
})
