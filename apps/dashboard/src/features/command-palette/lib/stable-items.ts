// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { PaletteItem, PaletteProvider, PaletteStableContext } from "../types"

/**
 * The stable rows of `providers`, by id. The first row with a given id wins; a provider that throws contributes
 * nothing. Rows are returned unresolved: `collectPaletteItems` resolves `requires` where they are listed.
 */
export function collectStableItems(
  providers: readonly PaletteProvider[],
  context: PaletteStableContext,
): ReadonlyMap<string, PaletteItem> {
  const stable = new Map<string, PaletteItem>()

  for (const provider of providers) {
    if (!provider.getStableItems) continue

    let items: readonly PaletteItem[]
    try {
      items = provider.getStableItems(context)
    } catch (error) {
      console.error(`[command-palette] provider "${provider.id}" failed`, error)
      continue
    }

    for (const item of items) {
      if (!stable.has(item.id)) stable.set(item.id, item)
    }
  }

  return stable
}
