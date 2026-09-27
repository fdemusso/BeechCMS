// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// @vitest-environment node

import { describe, expect, it } from "vitest"
import { addContentLanguage, contentLanguageName, removeContentLanguage } from "./content-languages"

describe("addContentLanguage", () => {
  it("rejects invalid codes, duplicates and a full list with a typed error", () => {
    const full = Array.from({ length: 50 }, (_, i) => `l${i}`)
    const cases: Array<{ locales: string[]; input: string; error: string }> = [
      { locales: [], input: "EN", error: "invalid" },
      { locales: [], input: "en_US", error: "invalid" },
      { locales: [], input: "", error: "invalid" },
      { locales: ["it"], input: "it", error: "duplicate" },
      { locales: full, input: "en", error: "limit" },
    ]

    for (const { locales, input, error } of cases) {
      const result = addContentLanguage(locales, input)
      expect(result).toEqual({ ok: false, error })
    }
  })

  it("appends a trimmed valid code", () => {
    const result = addContentLanguage(["it"], " pt-BR ")

    expect(result).toEqual({ ok: true, locales: ["it", "pt-BR"] })
  })
})

describe("removeContentLanguage", () => {
  it("removes a non-default language", () => {
    const result = removeContentLanguage(["it", "en"], "it", "en")

    expect(result).toEqual(["it"])
  })

  it("keeps the default language", () => {
    const result = removeContentLanguage(["it", "en"], "it", "it")

    expect(result).toEqual(["it", "en"])
  })
})

describe("contentLanguageName", () => {
  it("names a language in the UI language", () => {
    const result = contentLanguageName("en", "en")

    expect(result).toBe("English")
  })

  it("falls back to the code when the UI language is not a valid tag", () => {
    const result = contentLanguageName("fr", "!!")

    expect(result).toBe("fr")
  })
})
