// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { normalizeCellFilterValue } from "@/features/content-management"

describe("content-list helper functions", () => {
  describe("normalizeCellFilterValue", () => {
    it("normalizza numeri correttamente", () => {
      expect(normalizeCellFilterValue("number", 100)).toBe(100)
      expect(normalizeCellFilterValue("number", "42")).toBe(42)
      expect(normalizeCellFilterValue("number", "")).toBeNull()
      expect(normalizeCellFilterValue("number", null)).toBeNull()
      expect(normalizeCellFilterValue("number", "abc")).toBeNull()
    })

    it("normalizza booleani", () => {
      expect(normalizeCellFilterValue("boolean", true)).toBe(true)
      expect(normalizeCellFilterValue("boolean", false)).toBe(false)
      expect(normalizeCellFilterValue("boolean", "true")).toBeNull()
    })

    it("normalizza stringhe e selezioni trimmando gli spazi", () => {
      expect(normalizeCellFilterValue("text", "  hello  ")).toBe("hello")
      expect(normalizeCellFilterValue("text", "   ")).toBeNull()
      expect(normalizeCellFilterValue("text", null)).toBeNull()
    })

    it("normalizza date a formato YYYY-MM-DD", () => {
      expect(normalizeCellFilterValue("date", "2026-09-11T10:00:00Z")).toBe("2026-09-11")
    })

    it("normalizza tag estraendo il primo nome", () => {
      expect(normalizeCellFilterValue("tags", JSON.stringify([{ name: "react" }, { name: "ts" }]))).toBe("react")
      expect(normalizeCellFilterValue("tags", [])).toBeNull()
    })
  })
})
