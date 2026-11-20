// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { EXACT_MATCH_SCORE, rankPaletteItems } from "../../lib/rank-palette-items"
import type { ResolvedPaletteItem } from "../../types"

function rowOf(id: string, label: string, overrides: Partial<ResolvedPaletteItem> = {}): ResolvedPaletteItem {
  return {
    id,
    section: "Section",
    label,
    icon: () => null,
    perform: { kind: "navigate", to: "/" },
    disabledReason: null,
    ...overrides,
  }
}

describe("rankPaletteItems", () => {
  it("a blank query returns every item in input order", () => {
    const items = [rowOf("a", "Dashboard"), rowOf("b", "Analytics")]

    const result = rankPaletteItems(items, "   ")

    expect(result.map((item) => item.id)).toEqual(["a", "b"])
  })

  it("items the query does not match are dropped", () => {
    const items = [rowOf("a", "Dashboard"), rowOf("b", "Analytics")]

    const result = rankPaletteItems(items, "dash")

    expect(result.map((item) => item.id)).toEqual(["a"])
  })

  it("a keyword match ranks the item even when the label does not contain the query", () => {
    const items = [rowOf("a", "Change theme", { keywords: ["dark mode"] })]

    const result = rankPaletteItems(items, "dark")

    expect(result.map((item) => item.id)).toEqual(["a"])
  })

  it("an exact label match ranks above a partial match", () => {
    const items = [rowOf("partial", "Go to Posts archive"), rowOf("exact", "Posts")]

    const result = rankPaletteItems(items, "posts")

    expect(result.map((item) => item.id)).toEqual(["exact", "partial"])
  })

  it("equal scores keep input order", () => {
    const items = [rowOf("first", "Posts"), rowOf("second", "Posts")]

    const result = rankPaletteItems(items, "posts")

    expect(result.map((item) => item.id)).toEqual(["first", "second"])
  })

  it("an item with a score override is kept although its label does not match the query", () => {
    const items = [rowOf("calc", "2025-5 = 2020", { score: EXACT_MATCH_SCORE }), rowOf("other", "Analytics")]

    const result = rankPaletteItems(items, "zzz")

    expect(result.map((item) => item.id)).toEqual(["calc"])
  })

  it("a computed row at EXACT_MATCH_SCORE ranks above a lexical row whose label equals the query", () => {
    // The "2025-5" coexistence rule: the computed row wins the tie by coming first in input order.
    const items = [
      rowOf("calc", "2025-5 = 2020", { score: EXACT_MATCH_SCORE }),
      rowOf("lexical", "2025-5"),
    ]

    const result = rankPaletteItems(items, "2025-5")

    expect(result.map((item) => item.id)).toEqual(["calc", "lexical"])
  })

  it("an item with a score override keeps its input position on a blank query", () => {
    const items = [rowOf("a", "Dashboard"), rowOf("calc", "Result", { score: EXACT_MATCH_SCORE }), rowOf("b", "Analytics")]

    const result = rankPaletteItems(items, "")

    expect(result.map((item) => item.id)).toEqual(["a", "calc", "b"])
  })

  it("a disabled item that matches is kept", () => {
    const items = [rowOf("a", "New content", { disabledReason: "Requires the content:create permission" })]

    const result = rankPaletteItems(items, "new")

    expect(result.map((item) => item.id)).toEqual(["a"])
  })
})
