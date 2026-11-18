// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import type { TFunction } from "i18next"
import { MOD_KEY_LABEL } from "@/lib/platform"
import { PALETTE_PREFIXES } from "../../lib/parse-palette-query"
import { createShortcutsProvider } from "../../providers/shortcuts-provider"
import type { PaletteItem, PalettePermissions, PaletteQueryContext } from "../../types"

const t = ((key: string) => key) as unknown as TFunction

const NO_PERMISSIONS: PalettePermissions = {
  can: () => false,
  canAnywhere: () => false,
  canGlobally: () => false,
}

const SHORTCUTS_CONTEXT: PaletteQueryContext = { page: "shortcuts", query: "", permissions: NO_PERMISSIONS }

function listRows(): readonly PaletteItem[] {
  return createShortcutsProvider({ t }).getItems(SHORTCUTS_CONTEXT)
}

describe("createShortcutsProvider", () => {
  it("serves only the shortcuts page", () => {
    const provider = createShortcutsProvider({ t })

    expect(provider.pages).toEqual(["shortcuts"])
    expect(provider.prefix).toBeUndefined()
  })

  it("lists the global keys, then the palette keys, then the prefixes, each under its own section", () => {
    const rows = listRows()

    const sectionOrder = [...new Set(rows.map((row) => row.section))]

    expect(sectionOrder).toEqual([
      "commandPalette.shortcuts.global",
      "commandPalette.shortcuts.palette",
      "commandPalette.shortcuts.prefixes",
    ])
    expect(rows.filter((row) => row.section === "commandPalette.shortcuts.global").map((row) => row.id)).toEqual([
      "shortcuts:toggle-palette",
      "shortcuts:quick-create",
      "shortcuts:toggle-sidebar",
    ])
  })

  it("has one row for every routing prefix", () => {
    // Regression guard: a new prefix must be documented on this page.
    const rows = listRows()

    const prefixRowIds = rows.filter((row) => row.id.startsWith("shortcuts:prefix:")).map((row) => row.id)

    expect(prefixRowIds.sort()).toEqual(Object.keys(PALETTE_PREFIXES).map((prefix) => `shortcuts:prefix:${prefix}`).sort())
  })

  it("renders Mod as the platform modifier label and never as the literal Mod", () => {
    const rows = listRows()

    const allKeys = rows.flatMap((row) => row.shortcut ?? [])

    expect(allKeys).not.toContain("Mod")
    expect(rows.find((row) => row.id === "shortcuts:toggle-palette")?.shortcut).toEqual([MOD_KEY_LABEL, "K"])
  })

  it("gives every row a run perform and no requirement, so Enter only closes the palette", () => {
    const rows = listRows()

    expect(rows.every((row) => row.perform.kind === "run")).toBe(true)
    expect(rows.every((row) => row.requires === undefined && row.actions === undefined)).toBe(true)
  })
})
