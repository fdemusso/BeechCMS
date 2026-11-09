// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, describe, expect, it } from "vitest"
import i18n from "./i18n"

describe("document language", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en")
  })

  it("follows the language of the dashboard, so a screen reader pronounces the page in it", async () => {
    await i18n.changeLanguage("it")
    expect(document.documentElement.lang).toBe("it")

    await i18n.changeLanguage("en")
    expect(document.documentElement.lang).toBe("en")
  })
})
