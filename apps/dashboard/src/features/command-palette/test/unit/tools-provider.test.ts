// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import type { TFunction } from "i18next"
import { createToolsProvider } from "../../providers/tools-provider"
import type { PalettePermissions, PaletteQueryContext } from "../../types"

const t = ((key: string) => key) as unknown as TFunction

const NO_PERMISSIONS: PalettePermissions = {
  can: () => false,
  canAnywhere: () => false,
  canGlobally: () => false,
}

const ROOT_CONTEXT: PaletteQueryContext = { page: "root", query: "", permissions: NO_PERMISSIONS }

describe("createToolsProvider", () => {
  it("keeps the theme row as tools:theme and runs toggleTheme on it", () => {
    // Regression guard: the id is a pin key (roadmap 9); renaming it orphans stored pins.
    const toggleTheme = vi.fn()
    const provider = createToolsProvider({ t, theme: "light", toggleTheme })

    const themeRow = provider.getItems(ROOT_CONTEXT).find((item) => item.id === "tools:theme")
    if (themeRow?.perform.kind !== "run") throw new Error("tools:theme is not a run row")
    themeRow.perform.run()

    expect(toggleTheme).toHaveBeenCalledTimes(1)
  })

  it("lists a keyboard shortcuts row that opens the shortcuts page", () => {
    const provider = createToolsProvider({ t, theme: "light", toggleTheme: vi.fn() })

    const shortcutsRow = provider.getItems(ROOT_CONTEXT).find((item) => item.id === "tools:shortcuts")

    expect(shortcutsRow?.label).toBe("commandPalette.shortcuts.title")
    expect(shortcutsRow?.perform).toEqual({ kind: "page", page: "shortcuts" })
  })

  it("answers the > prefix", () => {
    const provider = createToolsProvider({ t, theme: "light", toggleTheme: vi.fn() })

    expect(provider.prefix).toBe(">")
  })
})
