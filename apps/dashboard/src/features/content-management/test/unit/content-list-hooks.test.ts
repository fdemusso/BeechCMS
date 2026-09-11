// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import {
  normalizeCellFilterValue,
  getEntryValueForColumn,
} from "@/features/content-management"
import type { ContentEntry } from "@/lib/dynamic-columns"

describe("content-list helper functions", () => {
  describe("getEntryValueForColumn", () => {
    const sampleEntry: ContentEntry = {
      id: "entry-123",
      schema_slug: "posts",
      slug: "sample-slug",
      status: "published",
      created_at: Date.parse("2026-01-01T00:00:00Z"),
      updated_at: Date.parse("2026-01-02T00:00:00Z"),
      data: {
        title: "Hello World",
        views: 42,
      },
    }

    it("recupera id, slug e status dai campi di primo livello", () => {
      expect(getEntryValueForColumn(sampleEntry, "id")).toBe("entry-123")
      expect(getEntryValueForColumn(sampleEntry, "slug")).toBe("sample-slug")
      expect(getEntryValueForColumn(sampleEntry, "status")).toBe("published")
    })

    it("recupera i valori personalizzati dal record data", () => {
      expect(getEntryValueForColumn(sampleEntry, "title")).toBe("Hello World")
      expect(getEntryValueForColumn(sampleEntry, "views")).toBe(42)
      expect(getEntryValueForColumn(sampleEntry, "non_existent")).toBeUndefined()
    })
  })

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
