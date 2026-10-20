// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { formatNumber } from "@/components/fields/display/number-format"

describe("formatNumber", () => {
  it("formatta correttamente in currency", () => {
    const result = formatNumber(42.5, { format: "currency", currency: "EUR" })
    expect(result).toMatch(/42,50\s*€/)
  })

  it("formatta correttamente in percentage", () => {
    // se il numero è > 1, formatNumber divide per 100 per l'Intl formatter
    const result = formatNumber(50, { format: "percentage" })
    expect(result).toBe("50%")
  })

  it("formatta in notazione compact", () => {
    const result = formatNumber(1500000, { format: "compact" })
    // Use a larger number (1.5M) to force the 'M'/'mln' suffix in all environments
    expect(result).toMatch(/1,5\s*(M|mln|Ml)/)
  })

  it("applica decimals esatti", () => {
    const result = formatNumber(3.14159, { decimals: 3 })
    expect(result).toBe("3,142")
  })

  it("applica suffix o prefix testuale personalizzato (se non currency o percentage)", () => {
    const resultPrefix = formatNumber(42, { prefix: "USD" })
    expect(resultPrefix).toBe("USD 42")
    
    const resultSuffix = formatNumber(42, { suffix: "kg" })
    expect(resultSuffix).toBe("42 kg")
  })

  it("retrocompatibilità senza options fissa a max 2 decimali", () => {
    const result = formatNumber(1.23456)
    expect(result).toBe("1,23")
  })

  it("applica l'opzione grouping correttamente", () => {
    const resultNoGroup = formatNumber(1000000, { grouping: false })
    expect(resultNoGroup).toBe("1000000")

    const resultGroup = formatNumber(1000000, { grouping: true })
    // La localizzazione "it-IT" usa il punto spaziatore o standard per le migliaia.
    // L'Intl standard spesso utilizza "1.000.000" in IT.
    expect(resultGroup).toMatch(/1(\.| )000(\.| )000/)
  })
})
