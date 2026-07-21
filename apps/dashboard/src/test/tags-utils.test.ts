// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// @vitest-environment node

import { describe, it, expect } from "vitest"

import { parseTagsValue, extractTagNames, extractTagChips } from "@/lib/tags-utils"

describe("tags-utils", () => {
  it("parseTagsValue fa parse JSON string quando valido", () => {
    expect(parseTagsValue('{"react":"#fff"}')).toEqual({ react: "#fff" })
  })

  it("parseTagsValue ritorna valore originale su JSON non valido", () => {
    expect(parseTagsValue("{bad")).toBe("{bad")
  })

  it("extractTagNames estrae nomi da array/stringhe e oggetti", () => {
    expect(extractTagNames('[" react ", "cms"]')).toEqual(["react", "cms"])
    expect(extractTagNames({ react: "#fff", cms: "#000" })).toEqual(["react", "cms"])
    expect(extractTagNames(null)).toEqual([])
  })

  it("extractTagChips preserva array di oggetti {label,color} senza perdite (#230)", () => {
    const value = '[{"label":"Urgent","color":"#ff0000"},{"label":"VIP","color":"#00ff00"}]'
    expect(extractTagChips(value)).toEqual([
      { label: "Urgent", color: "#ff0000" },
      { label: "VIP", color: "#00ff00" },
    ])
  })

  it("extractTagChips scarta solo entry array non normalizzabili", () => {
    const value = '[{"label":"Urgent"}, {"foo":"bar"}, "cms", 42]'
    expect(extractTagChips(value)).toEqual([{ label: "Urgent", color: undefined }, { label: "cms" }])
  })

  it("extractTagChips non è vulnerabile a lookup su prototipi", () => {
    // Simuliamo un input da parsing JSON che ha chiavi built-in come "constructor" e "toString" se passate come array (anche se JSON non porta prototype, ma i tool interni non devono prelevare function reference o rompere)
    const malformed = [{ label: "Safe" }, { constructor: "Exploit" }, { toString: "Hacked" }]
    expect(extractTagChips(malformed)).toEqual([{ label: "Safe", color: undefined }])
  })
})
