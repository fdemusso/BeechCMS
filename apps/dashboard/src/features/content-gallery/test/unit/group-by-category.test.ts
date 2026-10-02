// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"

import type { GalleryCardDisplayModel } from "@/features/content-gallery/gallery-card-display"
import { groupByCategory } from "@/features/content-gallery/group-by-category"

function model(entryId: string, category: string): GalleryCardDisplayModel {
  return { entryId, category } as GalleryCardDisplayModel
}

describe("groupByCategory", () => {
  it("restituisce un array vuoto senza card", () => {
    expect(groupByCategory([])).toEqual([])
  })

  it("raggruppa le card con la stessa categoria", () => {
    const groups = groupByCategory([model("1", "Matrimonio"), model("2", "Battesimo"), model("3", "Matrimonio")])
    expect(groups.map((g) => [g.label, g.models.map((m) => m.entryId)])).toEqual([
      ["Battesimo", ["2"]],
      ["Matrimonio", ["1", "3"]],
    ])
  })

  it("ignora maiuscole e spazi ai bordi, usando la prima forma incontrata come etichetta", () => {
    const groups = groupByCategory([model("1", "Matrimonio"), model("2", "  matrimonio "), model("3", "MATRIMONIO")])
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe("Matrimonio")
    expect(groups[0].models).toHaveLength(3)
  })

  it("ordina alfabeticamente e mette 'senza categoria' in coda", () => {
    const groups = groupByCategory([model("1", ""), model("2", "Zebra"), model("3", "   "), model("4", "Àncora")])
    expect(groups.map((g) => g.label)).toEqual(["Àncora", "Zebra", null])
    expect(groups[2].key).toBeNull()
    expect(groups[2].models.map((m) => m.entryId)).toEqual(["1", "3"])
  })
})
