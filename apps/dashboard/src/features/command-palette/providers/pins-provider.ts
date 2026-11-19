// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { TFunction } from "i18next"
import { PinOff } from "@/components/icons"
import { collectStableItems } from "../lib/stable-items"
import type { PaletteItem, PaletteProvider } from "../types"
import type { PalettePinsState } from "../use-palette-pins"

const PIN_PROVIDER_ID = "pin"

const PIN_ROW_PREFIX = `${PIN_PROVIDER_ID}:`

/** Row id of the pinned copy of the stable row `sourceId`: `pin:<sourceId>`. */
export function toPinRowId(sourceId: string): string {
  return `${PIN_ROW_PREFIX}${sourceId}`
}

/** The stable id behind a pinned row id; null for any other id ("pin:" alone included). */
export function pinSourceId(rowId: string): string | null {
  if (!rowId.startsWith(PIN_ROW_PREFIX)) return null
  return rowId.slice(PIN_ROW_PREFIX.length) || null
}

/** The user's pins in stored order, on the idle root only; each one resolves against `sources`. */
export function createPinsProvider(deps: {
  t: TFunction
  pins: PalettePinsState
  /** Every other local provider; their stable rows are what pinned ids resolve against. */
  sources: readonly PaletteProvider[]
  /** false until every source's data has loaded: unresolved pins are then omitted, not shown as unavailable. */
  catalogueReady: boolean
  unpin: (id: string, label: string) => void
}): PaletteProvider {
  const { t, pins, sources, catalogueReady, unpin } = deps

  return {
    id: PIN_PROVIDER_ID,
    pages: ["root"],
    getItems: ({ page, query, prefix, permissions }) => {
      if (page !== "root" || query !== "" || prefix) return []
      if (pins.status === "unavailable") return []

      const stable = collectStableItems(sources, { permissions })
      const section = t("commandPalette.pins.section")
      const items: PaletteItem[] = []

      for (const id of pins.ids) {
        const source = stable.get(id)
        if (source) {
          const { score: _score, ...row } = source
          items.push({
            ...row,
            id: toPinRowId(id),
            section,
            description: source.description ?? source.section,
          })
        } else if (catalogueReady) {
          items.push({
            id: toPinRowId(id),
            section,
            label: t("commandPalette.pins.unavailableLabel"),
            description: t("commandPalette.pins.unavailableHint", { id }),
            icon: PinOff,
            perform: { kind: "run", run: () => unpin(id, id), keepOpen: true },
          })
        }
      }
      return items
    },
  }
}
