import { describe, it, expect } from "vitest"
import { formatNumber } from "@/features/fields/display/number-format"

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
})
