// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from "vitest"
import { retentionRemainingDays } from "@/features/content-management/lib/retention"

const DAY = 86_400
const NOW = 1_700_000_000

describe("retentionRemainingDays", () => {
  it("returns the correct remaining-days figure for each retention scenario", () => {
    const cases: {
      name: string
      deletedAt: number | null | undefined
      retentionDays: number | undefined
      expected: number | null
    }[] = [
      { name: "no retentionDays declared", deletedAt: NOW, retentionDays: undefined, expected: null },
      { name: "no deletedAt on the row", deletedAt: undefined, retentionDays: 30, expected: null },
      { name: "retentionDays is zero or negative", deletedAt: NOW, retentionDays: 0, expected: null },
      { name: "half the window elapsed", deletedAt: NOW - 15 * DAY, retentionDays: 30, expected: 15 },
      { name: "exactly at expiry", deletedAt: NOW - 30 * DAY, retentionDays: 30, expected: 0 },
      { name: "past expiry", deletedAt: NOW - 40 * DAY, retentionDays: 30, expected: 0 },
    ]

    for (const { deletedAt, retentionDays, expected } of cases) {
      expect(retentionRemainingDays(deletedAt, retentionDays, NOW)).toBe(expected)
    }
  })
})
