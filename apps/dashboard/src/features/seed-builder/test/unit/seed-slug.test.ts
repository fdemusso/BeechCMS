// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { SLUG_RE } from "@beechcms/core"
import { slugifyLabel, uniqueSlug } from "@/features/seed-builder/lib/seed-slug"

describe("slugifyLabel", () => {
  it("lowercases and joins words with underscores", () => {
    expect(slugifyLabel("Blog Post")).toBe("blog_post")
  })

  it("strips accents", () => {
    expect(slugifyLabel("Città e Perché")).toBe("citta_e_perche")
  })

  it("collapses symbols and trims the edges", () => {
    expect(slugifyLabel("  --Eventi & Prenotazioni!  ")).toBe("eventi_prenotazioni")
  })

  it("drops apostrophes instead of splitting the word", () => {
    expect(slugifyLabel("L'evento dell’anno")).toBe("levento_dellanno")
  })

  it("writes out letters that have no accent to strip", () => {
    expect(slugifyLabel("Straße Ærø Łódź")).toBe("strasse_aero_lodz")
  })

  it("returns an empty string when nothing usable remains", () => {
    expect(slugifyLabel("???")).toBe("")
  })

  it("never exceeds the derived length and never ends with an underscore", () => {
    const slug = slugifyLabel("a".repeat(39) + " bbbbbb")
    expect(slug.length).toBeLessThanOrEqual(40)
    expect(slug.endsWith("_")).toBe(false)
  })

  it("always produces a valid seed slug", () => {
    expect(SLUG_RE.test(slugifyLabel("Niño Ünïcode 2026"))).toBe(true)
  })
})

describe("uniqueSlug", () => {
  it("returns the base when it is free, and an empty base unchanged", () => {
    expect(uniqueSlug("eventi", new Set(["persone"]))).toBe("eventi")
    expect(uniqueSlug("", new Set(["a"]))).toBe("")
  })

  it("appends the first free numeric suffix", () => {
    expect(uniqueSlug("eventi", new Set(["eventi"]))).toBe("eventi_2")
    expect(uniqueSlug("eventi", new Set(["eventi", "eventi_2", "eventi_3"]))).toBe("eventi_4")
  })

  it("trims a long base so the suffixed slug stays within the derived length", () => {
    const base = "a".repeat(40)
    const result = uniqueSlug(base, new Set([base]))
    expect(result.length).toBeLessThanOrEqual(40)
    expect(result.endsWith("_2")).toBe(true)
    expect(result).not.toBe(base)
  })
})
