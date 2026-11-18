// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { TFunction } from "i18next"
import { Keyboard } from "@/components/icons"
import { MOD_KEY_LABEL } from "@/lib/platform"
import type { PaletteItem, PalettePrefix, PaletteProvider } from "../types"
import { MOD_KEY, PALETTE_SHORTCUTS, PREFIX_LABEL_KEYS } from "../lib/palette-shortcuts"

const closePalette = () => {}

/** The keyboard reference page: global keys, palette keys and every prefix. Enter on a row closes the palette. */
export function createShortcutsProvider(deps: { t: TFunction }): PaletteProvider {
  const { t } = deps

  const shortcutRows = (): PaletteItem[] =>
    PALETTE_SHORTCUTS.map(({ id, group, labelKey, keys }) => ({
      id: `shortcuts:${id}`,
      section: t(group === "global" ? "commandPalette.shortcuts.global" : "commandPalette.shortcuts.palette"),
      label: t(labelKey),
      icon: Keyboard,
      shortcut: keys.map((key) => (key === MOD_KEY ? MOD_KEY_LABEL : key)),
      perform: { kind: "run", run: closePalette },
    }))

  const prefixRows = (): PaletteItem[] =>
    (Object.keys(PREFIX_LABEL_KEYS) as PalettePrefix[]).map((prefix) => ({
      id: `shortcuts:prefix:${prefix}`,
      section: t("commandPalette.shortcuts.prefixes"),
      label: t(PREFIX_LABEL_KEYS[prefix]),
      icon: Keyboard,
      shortcut: [prefix],
      perform: { kind: "run", run: closePalette },
    }))

  return {
    id: "shortcuts",
    pages: ["shortcuts"],
    getItems: () => [...shortcutRows(), ...prefixRows()],
  }
}
