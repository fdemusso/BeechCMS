// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { TFunction } from "i18next"
import { PALETTE_PIN_ID_MAX_LENGTH } from "@beechcms/core"
import { Pin, PinOff } from "@/components/icons"
import { pinSourceId } from "../providers/pins-provider"
import { recentSourceId } from "../providers/recent-items-provider"
import type { PaletteItem, PaletteRowAction, ResolvedPaletteItem } from "../types"
import type { PalettePinsState } from "../use-palette-pins"

export const PIN_ACTION_ID = "pin"
export const UNPIN_ACTION_ID = "unpin"

/**
 * `items` with a trailing Pin or Unpin action on every row whose stable id is in `stable`: a source row, its recent
 * copy or its pinned copy. Rows are unchanged when the pins are unavailable or saving, or when the id is not
 * pinnable. Returns a new array and never mutates `items`.
 */
export function withPinActions(
  items: readonly ResolvedPaletteItem[],
  deps: {
    t: TFunction
    pins: PalettePinsState
    stable: ReadonlyMap<string, PaletteItem>
    pin: (id: string, label: string) => void
    unpin: (id: string, label: string) => void
  },
): ResolvedPaletteItem[] {
  const { t, pins, stable, pin, unpin } = deps
  if (pins.status === "unavailable" || pins.saving) return [...items]

  return items.map((item) => {
    const sourceId = pinSourceId(item.id) ?? recentSourceId(item.id) ?? item.id
    const source = stable.get(sourceId)
    if (!source || sourceId.length > PALETTE_PIN_ID_MAX_LENGTH) return item

    const action: PaletteRowAction = pins.ids.includes(sourceId)
      ? {
          id: UNPIN_ACTION_ID,
          label: t("commandPalette.pins.unpin"),
          icon: PinOff,
          perform: { kind: "run", run: () => unpin(sourceId, source.label), keepOpen: true },
        }
      : {
          id: PIN_ACTION_ID,
          label: t("commandPalette.pins.pin"),
          icon: Pin,
          perform: { kind: "run", run: () => pin(sourceId, source.label), keepOpen: true },
        }
    return { ...item, actions: [...(item.actions ?? []), action] }
  })
}
