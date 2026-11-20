// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from "vitest"
import { de, enUS, es, fr, it as italian } from "date-fns/locale"
import { dateFnsLocaleFor } from "./date-locale"

describe("dateFnsLocaleFor", () => {
  it.each([
    ["en", enUS],
    ["it", italian],
    ["es", es],
    ["de", de],
    ["fr", fr],
  ])("gives the date-fns locale of %s", (language, locale) => {
    expect(dateFnsLocaleFor(language)).toBe(locale)
  })

  it("uses the base language of a regional tag", () => {
    expect(dateFnsLocaleFor("de-AT")).toBe(de)
  })

  it("falls back to English for a language the dashboard does not have, or none", () => {
    expect(dateFnsLocaleFor("pt-BR")).toBe(enUS)
    expect(dateFnsLocaleFor(undefined)).toBe(enUS)
  })
})
