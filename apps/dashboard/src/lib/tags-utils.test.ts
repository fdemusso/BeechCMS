// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { CANONICAL_SEEDS } from "@beechcms/testing"

import { parseTagsValue, extractTagNames, resolveTagChips } from "@/lib/tags-utils"

const posts = CANONICAL_SEEDS.find((seed) => seed.slug === "posts")!
const priority = posts.branches.find((branch) => branch.alias === "priority")!
const freeTags = posts.branches.find((branch) => branch.alias === "tags")!

describe("parseTagsValue", () => {
  it("fa parse JSON string quando valido", () => {
    const result = parseTagsValue('["a","b"]')

    expect(result).toEqual(["a", "b"])
  })

  it("ritorna valore originale su JSON non valido", () => {
    const result = parseTagsValue("{bad")

    expect(result).toBe("{bad")
  })
})

describe("extractTagNames", () => {
  it("restituisce le stringhe di un array (o di un array JSON-encoded) verbatim e in ordine, senza trim", () => {
    const fromArray = extractTagNames([" react ", "cms"])
    const fromEncoded = extractTagNames('[" react ", "cms"]')

    expect(fromArray).toEqual([" react ", "cms"])
    expect(fromEncoded).toEqual([" react ", "cms"])
  })

  it("restituisce [] per mappa oggetto, numero, null e stringa non-JSON", () => {
    const inputs: unknown[] = [{ react: "#fff" }, 42, null, "not json"]

    const results = inputs.map((input) => extractTagNames(input))

    expect(results).toEqual([[], [], [], []])
  })

  it("scarta elementi non stringa e stringhe vuote", () => {
    const result = extractTagNames(["a", 1, null, "", { label: "x" }, "b"])

    expect(result).toEqual(["a", "b"])
  })
})

describe("resolveTagChips", () => {
  it("dà tono option e il colore dichiarato a un valore di priority", () => {
    const chips = resolveTagChips(["high"], priority)

    expect(chips).toEqual([{ label: "high", color: "#ef4444", tone: "option" }])
  })

  it("dà tono obsolete senza colore a un valore fuori elenco, anche a \"High\" (confronto esatto)", () => {
    const chips = resolveTagChips(["gone", "High"], priority)

    expect(chips).toEqual([
      { label: "gone", tone: "obsolete" },
      { label: "High", tone: "obsolete" },
    ])
  })

  it("dà tono free senza colore a ogni valore di posts.tags", () => {
    const chips = resolveTagChips(["react", "cms"], freeTags)

    expect(chips).toEqual([
      { label: "react", tone: "free" },
      { label: "cms", tone: "free" },
    ])
  })

  it("riordinare le opzioni non cambia il colore risolto di un valore", () => {
    const options = priority.options!

    const original = resolveTagChips(["high"], { options })
    const reordered = resolveTagChips(["high"], { options: [...options].reverse() })

    expect(reordered).toEqual(original)
  })
})
