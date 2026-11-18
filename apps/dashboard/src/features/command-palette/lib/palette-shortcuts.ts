// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { PalettePrefix } from "../types"

/** One key combination the dashboard reacts to. Display data only: nothing here binds a key. */
export interface PaletteShortcut {
  /** Stable; the row id is `shortcuts:<id>`. */
  readonly id: string
  readonly group: "global" | "palette"
  /** Locale key of the description. */
  readonly labelKey: string
  /** Key caps in order; the literal "Mod" stands for the platform modifier (⌘ or Ctrl). */
  readonly keys: readonly string[]
}

export const MOD_KEY = "Mod"

export const PALETTE_SHORTCUTS: readonly PaletteShortcut[] = [
  { id: "toggle-palette", group: "global", keys: [MOD_KEY, "K"], labelKey: "commandPalette.shortcuts.togglePalette" },
  { id: "quick-create", group: "global", keys: ["Alt", "N"], labelKey: "commandPalette.shortcuts.quickCreate" },
  { id: "toggle-sidebar", group: "global", keys: [MOD_KEY, "B"], labelKey: "commandPalette.shortcuts.toggleSidebar" },
  { id: "run", group: "palette", keys: ["↵"], labelKey: "commandPalette.shortcuts.run" },
  { id: "first-action", group: "palette", keys: [MOD_KEY, "↵"], labelKey: "commandPalette.shortcuts.firstAction" },
  { id: "row-actions", group: "palette", keys: ["⇧", "↵"], labelKey: "commandPalette.shortcuts.rowActions" },
  { id: "back", group: "palette", keys: ["⌫"], labelKey: "commandPalette.shortcuts.back" },
  { id: "close", group: "palette", keys: ["Esc"], labelKey: "commandPalette.shortcuts.close" },
]

/** One description per routing prefix, in display order. `Record` makes tsc reject a prefix without one. */
export const PREFIX_LABEL_KEYS: Readonly<Record<PalettePrefix, string>> = {
  ">": "commandPalette.shortcuts.prefixSystem",
  "=": "commandPalette.shortcuts.prefixCalculator",
  "#": "commandPalette.shortcuts.prefixNotes",
  "/": "commandPalette.shortcuts.prefixContent",
}
