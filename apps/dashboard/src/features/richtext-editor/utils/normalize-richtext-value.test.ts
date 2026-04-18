import { describe, it, expect } from "vitest"
import { normalizeRichtextValue } from "./normalize-richtext-value"

describe("normalizeRichtextValue", () => {
  it("estrae doc da envelope schemaVersion 1", () => {
    const inner = { type: "doc" as const, content: [{ type: "paragraph" as const }] }
    const out = normalizeRichtextValue({ schemaVersion: 1, doc: inner })
    expect(out).toEqual(inner)
  })

  it("accetta doc legacy senza envelope", () => {
    const doc = {
      type: "doc" as const,
      content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "x" }] }],
    }
    expect(normalizeRichtextValue(doc)).toEqual(doc)
  })

  it("restituisce stringa HTML legacy", () => {
    expect(normalizeRichtextValue("<p>a</p>")).toBe("<p>a</p>")
  })
})
