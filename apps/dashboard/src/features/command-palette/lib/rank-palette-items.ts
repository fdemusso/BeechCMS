// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { defaultFilter } from "cmdk"
import type { ResolvedPaletteItem } from "../types"

/** cmdk's score for a full match. Computed rows use it: the whole query is their subject. */
export const EXACT_MATCH_SCORE = 1

/**
 * Orders `items` by relevance to `query` with cmdk's own scorer, so matching quality is the one the palette always had.
 * An item's own `score` replaces the lexical one. A blank query keeps input order; otherwise non-matches are dropped and ties keep input order.
 */
export function rankPaletteItems(
  items: readonly ResolvedPaletteItem[],
  query: string,
): ResolvedPaletteItem[] {
  const needle = query.trim()
  if (!needle) return [...items]

  return items
    .map((item, index) => ({
      item,
      index,
      score: item.score ?? defaultFilter(item.label, needle, [...(item.keywords ?? []), item.section]),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item)
}
