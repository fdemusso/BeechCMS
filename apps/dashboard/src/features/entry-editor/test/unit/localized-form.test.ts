// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from "vitest"
import type { Branch, LocaleConfig } from "@beechcms/core"
import {
  buildLocalizedPatch,
  findInvalidLocalizedJson,
  foldFieldErrors,
  isBlankEditorValue,
  localeCompletion,
  localeValue,
  localizedFieldStates,
  markTouched,
  projectLocale,
  withLocaleValue,
} from "../../lib/localized-form"

const CONFIG: LocaleConfig = { locales: ["it", "en"], defaultLocale: "it" }
const TITLE: Branch = { id: "br_01", alias: "title", label: "Title", type: "text", localized: true }
const BODY: Branch = { id: "br_02", alias: "body", label: "Body", type: "richtext", localized: true }
const META: Branch = { id: "br_03", alias: "meta", label: "Meta", type: "json", localized: true }
const SKU: Branch = { id: "br_04", alias: "sku", label: "SKU", type: "text" }
const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] }
const IMAGE_DOC = { type: "doc", content: [{ type: "image", attrs: { src: "https://cdn.example/x.png" } }] }

describe("localeValue", () => {
  it("reads a legacy plain string as the default-locale value", () => {
    const value = localeValue(TITLE, "Scarpa", "it", CONFIG)

    expect(value).toBe("Scarpa")
  })

  it("reads a legacy plain string as undefined for a non-default locale", () => {
    const value = localeValue(TITLE, "Scarpa", "en", CONFIG)

    expect(value).toBeUndefined()
  })

  it("reads a json object without a registered key as the default locale's value", () => {
    const value = localeValue(META, { url: "u", alt: "a" }, "it", CONFIG)

    expect(value).toEqual({ url: "u", alt: "a" })
  })
})

describe("withLocaleValue", () => {
  it("keeps unregistered stored locales when writing a registered one", () => {
    // Regression guard: removing a language must never drop its translations (brief §2).
    const result = withLocaleValue(TITLE, { fr: "Chaussure", it: "Scarpa" }, "en", "Shoe", CONFIG)

    expect(result).toEqual({ fr: "Chaussure", it: "Scarpa", en: "Shoe" })
  })
})

describe("projectLocale", () => {
  it("replaces only localized aliases with their locale value, leaving other fields unchanged", () => {
    const formData = { title: { it: "Scarpa", en: "Shoe" }, sku: "S-1" }

    const view = projectLocale([TITLE, SKU], formData, "en", CONFIG)

    expect(view).toEqual({ title: "Shoe", sku: "S-1" })
  })
})

describe("markTouched", () => {
  it("returns the same object when the locale is already recorded", () => {
    const touched = { title: ["en"] }

    const result = markTouched(touched, "title", "en")

    expect(result).toBe(touched)
  })

  it("adds the locale when not already recorded", () => {
    const result = markTouched({}, "title", "en")

    expect(result).toEqual({ title: ["en"] })
  })
})

describe("isBlankEditorValue", () => {
  it("treats every value the editor itself produces for an empty field as blank", () => {
    const blankCases: Array<{ branch: Branch; value: unknown }> = [
      { branch: TITLE, value: "" },
      { branch: TITLE, value: "   " },
      { branch: TITLE, value: null },
      { branch: TITLE, value: undefined },
      { branch: BODY, value: EMPTY_DOC },
      { branch: META, value: "{}" },
      { branch: META, value: "  " },
      { branch: META, value: {} },
    ]

    for (const { branch, value } of blankCases) {
      expect(isBlankEditorValue(branch, value)).toBe(true)
    }
  })

  it("treats an image-only doc and other non-empty content as not blank", () => {
    // IMAGE_DOC in particular: it is content, and treating it as blank would clear an image-only translation.
    const nonBlankCases: Array<{ branch: Branch; value: unknown }> = [
      { branch: BODY, value: IMAGE_DOC },
      { branch: TITLE, value: "x" },
      { branch: META, value: '{"a":1}' },
      { branch: META, value: [] },
    ]

    for (const { branch, value } of nonBlankCases) {
      expect(isBlankEditorValue(branch, value)).toBe(false)
    }
  })
})

describe("buildLocalizedPatch", () => {
  it("omits a localized branch with no touched locale", () => {
    // Regression guard for carried-in (a)/(b): a top-level null clears every locale, and an untouched empty
    // doc would be stored as a translation.
    const formData = { body: EMPTY_DOC }

    const patch = buildLocalizedPatch([BODY], formData, {}, CONFIG)

    expect(patch).not.toHaveProperty("body")
  })

  it("sends only touched locales", () => {
    const formData = { title: { it: "Scarpa", en: "Shoe" } }

    const patch = buildLocalizedPatch([TITLE], formData, { title: ["en"] }, CONFIG)

    expect(patch).toEqual({ title: { en: "Shoe" } })
  })

  it("turns a touched blank value into null", () => {
    const formData = { title: { en: "  " }, body: { en: EMPTY_DOC } }

    const patch = buildLocalizedPatch([TITLE, BODY], formData, { title: ["en"], body: ["en"] }, CONFIG)

    expect(patch).toEqual({ title: { en: null }, body: { en: null } })
  })

  it("parses json text for a touched translation", () => {
    const formData = { meta: { en: '{"a":1}' } }

    const patch = buildLocalizedPatch([META], formData, { meta: ["en"] }, CONFIG)

    expect(patch).toEqual({ meta: { en: { a: 1 } } })
  })

  it("ignores an unregistered touched locale", () => {
    const formData = { title: { fr: "Chaussure" } }

    const patch = buildLocalizedPatch([TITLE], formData, { title: ["fr"] }, CONFIG)

    expect(patch).toEqual({})
  })
})

describe("findInvalidLocalizedJson", () => {
  it("finds a touched translation holding text that is not valid JSON", () => {
    const formData = { meta: { en: "{bad" } }

    const result = findInvalidLocalizedJson([META], formData, { meta: ["en"] }, CONFIG)

    expect(result).toEqual({ label: "Meta", locale: "en" })
  })

  it("ignores invalid JSON in an untouched translation", () => {
    const formData = { meta: { en: "{bad" } }

    const result = findInvalidLocalizedJson([META], formData, {}, CONFIG)

    expect(result).toBeNull()
  })
})

describe("localeCompletion", () => {
  it("counts, per locale, how many localized branches hold a non-blank value", () => {
    const formData = { title: { it: "Scarpa", en: "Shoe" }, body: { it: IMAGE_DOC }, meta: {} }

    const completion = localeCompletion([TITLE, BODY, META, SKU], formData, CONFIG)

    expect(completion).toEqual({
      it: { filled: 2, total: 3 },
      en: { filled: 1, total: 3 },
    })
  })
})

describe("localizedFieldStates", () => {
  it("marks a field missing in the active locale with a copy-from-default source when the default has a value", () => {
    const formData = { title: { it: "Scarpa" } }

    const states = localizedFieldStates([TITLE], formData, "en", CONFIG)

    expect(states.title).toEqual({ isMissing: true, copyFromLocale: "it" })
  })

  it("marks a field missing in the default locale with no copy source", () => {
    const formData = { title: { en: "Shoe" } }

    const states = localizedFieldStates([TITLE], formData, "it", CONFIG)

    expect(states.title).toEqual({ isMissing: true, copyFromLocale: null })
  })

  it("marks a field not missing when it holds no value in any locale", () => {
    const states = localizedFieldStates([TITLE], {}, "en", CONFIG)

    expect(states.title).toEqual({ isMissing: false, copyFromLocale: null })
  })
})

describe("foldFieldErrors", () => {
  it("maps a locale-suffixed error to its field, prefixed by the upper-cased locale", () => {
    const errors = [
      { field: "title.en", message: "Too long" },
      { field: "sku", message: "Required" },
    ]

    const mapped = foldFieldErrors(errors, [TITLE, SKU])

    expect(mapped).toEqual({ title: "EN: Too long", sku: "Required" })
  })

  it("keeps a non-locale suffix verbatim", () => {
    const errors = [{ field: "title.xx_bad", message: "Invalid" }]

    const mapped = foldFieldErrors(errors, [TITLE])

    expect(mapped).toEqual({ "title.xx_bad": "Invalid" })
  })
})
