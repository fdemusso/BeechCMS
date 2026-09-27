// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// @vitest-environment node

import { describe, expect, it } from "vitest"
import type { LocaleConfig, Seed } from "@beechcms/core"
import { relationLabelValue } from "./relation-label"

const LOCALIZED_SEED: Pick<Seed, "branches"> = {
  branches: [{ id: "br_01", alias: "name", label: "Name", type: "text", localized: true }],
}

const PLAIN_SEED: Pick<Seed, "branches"> = {
  branches: [{ id: "br_01", alias: "name", label: "Name", type: "text" }],
}

const CONFIG: LocaleConfig = { locales: ["it", "en"], defaultLocale: "it" }

describe("relationLabelValue", () => {
  it("resolves a localized branch to the default locale and leaves every other case untouched", () => {
    const cases: Array<{
      targetSeed: Pick<Seed, "branches"> | undefined
      data: Record<string, unknown> | undefined
      config: LocaleConfig | undefined
      expected: unknown
    }> = [
      { targetSeed: LOCALIZED_SEED, data: { name: { it: "Rosso", en: "Red" } }, config: CONFIG, expected: "Rosso" },
      { targetSeed: LOCALIZED_SEED, data: { name: { it: "Rosso", en: "Red" } }, config: undefined, expected: { it: "Rosso", en: "Red" } },
      { targetSeed: PLAIN_SEED, data: { name: "Rosso" }, config: CONFIG, expected: "Rosso" },
      // Primed by the list's `relations` map: already a resolved string, not a dictionary.
      { targetSeed: LOCALIZED_SEED, data: { name: "Rosso" }, config: CONFIG, expected: "Rosso" },
      { targetSeed: LOCALIZED_SEED, data: { other: "x" }, config: CONFIG, expected: undefined },
    ]

    for (const { targetSeed, data, config, expected } of cases) {
      expect(relationLabelValue(targetSeed, data, "name", config)).toEqual(expected)
    }
  })
})
