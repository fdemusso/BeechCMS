// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, describe, expect, it } from "vitest"
import i18n from "./i18n"

describe("document language", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en")
  })

  it.each(["it", "es", "de", "fr", "en"])("follows the language of the dashboard (%s), so a screen reader pronounces the page in it", async (language) => {
    await i18n.changeLanguage(language)

    expect(document.documentElement.lang).toBe(language)
  })

  it("uses the base language of a regional tag", async () => {
    await i18n.changeLanguage("de-AT")

    expect(document.documentElement.lang).toBe("de")
  })
})
