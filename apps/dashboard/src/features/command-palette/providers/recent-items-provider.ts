// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { TFunction } from "i18next"
import { collectStableItems } from "../lib/stable-items"
import type { PaletteItem, PaletteProvider } from "../types"
import type { RecentItemsState } from "../use-recent-items"

export const RECENT_PROVIDER_ID = "recent"

const RECENT_ROW_PREFIX = `${RECENT_PROVIDER_ID}:`

/** Row id of the recent copy of the stable row `sourceId`: `recent:<sourceId>`. */
export function toRecentRowId(sourceId: string): string {
  return `${RECENT_ROW_PREFIX}${sourceId}`
}

/** The stable id behind a recent row id; null for any other id. */
export function recentSourceId(rowId: string): string | null {
  if (!rowId.startsWith(RECENT_ROW_PREFIX)) return null
  return rowId.slice(RECENT_ROW_PREFIX.length) || null
}

/**
 * The id to record when `item` is performed: its stable id (unwrapped from a recent row), or null when that id is
 * not in `stable` or the row only opens a sub-page.
 */
export function recentIdToRecord(item: PaletteItem, stable: ReadonlyMap<string, PaletteItem>): string | null {
  const sourceId = recentSourceId(item.id) ?? item.id
  if (item.perform.kind === "page") return null
  return stable.has(sourceId) ? sourceId : null
}

/** The rows the user performed most recently, newest first, on the idle root only; each one resolves against `sources`. */
export function createRecentItemsProvider(deps: {
  t: TFunction
  recent: RecentItemsState
  /** Every other local provider; their stable rows are what stored ids resolve against. */
  sources: readonly PaletteProvider[]
}): PaletteProvider {
  const { t, recent, sources } = deps

  return {
    id: RECENT_PROVIDER_ID,
    pages: ["root"],
    getItems: ({ page, query, prefix, permissions }) => {
      if (page !== "root" || query !== "" || prefix) return []
      if (recent.status === "unavailable") return []

      const stable = collectStableItems(sources, { permissions })
      const section = t("commandPalette.recentSection")
      const items: PaletteItem[] = []

      for (const sourceId of recent.ids) {
        const source = stable.get(sourceId)
        if (!source) continue
        const { score: _score, ...row } = source
        items.push({
          ...row,
          id: toRecentRowId(sourceId),
          section,
          description: source.description ?? source.section,
        })
      }
      return items
    },
  }
}
