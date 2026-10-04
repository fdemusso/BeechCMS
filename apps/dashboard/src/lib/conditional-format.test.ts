// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// @vitest-environment node

import { describe, it, expect } from "vitest"

import {
  compileElementFormatter,
  getConditionalFormatCardClass,
  getConditionalFormatCellClass,
  getConditionalFormatRowClass,
  NO_ELEMENT_FORMAT,
} from "@/lib/conditional-format"

import type {
  ConditionalFormatRule,
  ConditionalFormatTone,
  ConditionalFormatTextStyle,
} from "@/lib/conditional-format"
import type { ContentEntry } from "@/lib/dynamic-columns"

const tones: Array<ConditionalFormatTone> = ["neutral", "info", "success", "warning", "danger"]

const styles: ConditionalFormatTextStyle[] = ["bold", "italic", "underline"]

describe("conditional-format - getConditionalFormatRowClass", () => {
  it("neutral: include bg-muted/35 + text style", () => {
    const className = getConditionalFormatRowClass("neutral", ["bold", "underline"])
    expect(className).toContain("bg-muted/35")
    expect(className).toContain("font-bold")
    expect(className).toContain("underline")
  })

  it("tutti i tone: includono le rispettive classi di sfondo", () => {
    const expected: Record<ConditionalFormatTone, string> = {
      neutral: "bg-muted/35",
      info: "bg-sky-500/12",
      success: "bg-emerald-500/12",
      warning: "bg-amber-500/12",
      danger: "bg-destructive/12",
    }

    for (const tone of tones) {
      const className = getConditionalFormatRowClass(tone, ["bold"])
      expect(className).toContain(expected[tone])
      expect(className).toContain("hover:") // robusto: ogni tone ha hover bg-...
      expect(className).toContain("font-bold")
    }
  })

  it("textStyles vuoto: non aggiunge classi di stile", () => {
    const className = getConditionalFormatRowClass("success", [])
    expect(className).toContain("bg-emerald-500/12")
    expect(className).not.toContain("font-bold")
    expect(className).not.toContain("italic")
    expect(className).not.toContain("underline")
  })
})

describe("conditional-format - getConditionalFormatCellClass", () => {
  it("success/info/warning/danger/neutral: includono i frammenti attesi", () => {
    const cases: Record<ConditionalFormatTone, string[]> = {
      neutral: ["font-medium", "[&_[data-slot=badge]]:!text-inherit"],
      info: ["font-medium", "text-sky-800", "dark:text-sky-200"],
      success: ["font-medium", "text-emerald-700", "dark:text-emerald-300"],
      warning: ["font-medium", "text-amber-800", "dark:text-amber-200"],
      danger: ["font-medium", "text-destructive"],
    }

    for (const tone of tones) {
      const className = getConditionalFormatCellClass(tone, styles)
      for (const needle of cases[tone]) {
        expect(className).toContain(needle)
      }
      // stili testo: bold/italic/underline devono comparire nel caso in cui siano presenti
      expect(className).toContain("font-bold")
      expect(className).toContain("italic")
      expect(className).toContain("underline")
    }
  })

  it("textStyles non presenti: non include font-bold/italic/underline", () => {
    const className = getConditionalFormatCellClass("neutral", [])
    expect(className).toContain("font-medium")
    expect(className).not.toContain("font-bold")
    expect(className).not.toContain("italic")
    expect(className).not.toContain("underline")
  })
})

const BASE_ENTRY: ContentEntry = {
  id: "11111111-1111-4111-8111-111111111111",
  schema_slug: "posts",
  slug: "canonical-post",
  status: "published",
  created_at: 0,
  updated_at: 0,
  data: { title: "Canonical Post", view_count: 10, tags: '["react"]' },
}

function makeEntry(overrides: Partial<ContentEntry> = {}): ContentEntry {
  return { ...BASE_ENTRY, ...overrides, data: { ...BASE_ENTRY.data, ...overrides.data } }
}

function makeRule(overrides: Partial<ConditionalFormatRule> = {}): ConditionalFormatRule {
  return {
    id: "r1",
    enabled: true,
    priority: 0,
    columnId: "status",
    group: {
      columnId: "status",
      label: "Status",
      type: "select",
      conditions: [{ id: "c1", op: "eq", value: "published" }],
    },
    tone: "warning",
    target: "element",
    ...overrides,
  }
}

describe("compileElementFormatter", () => {
  it("returns the NO_ELEMENT_FORMAT reference for any entry when no rule is enabled", () => {
    const formatter = compileElementFormatter([makeRule({ enabled: false })])

    expect(formatter(makeEntry())).toBe(NO_ELEMENT_FORMAT)
  })

  it("the first matching element rule by ascending priority wins, ignoring a disabled higher-priority rule", () => {
    const rules = [
      makeRule({ id: "r-high", priority: 0, enabled: false, tone: "danger" }),
      makeRule({ id: "r-mid", priority: 1, tone: "warning" }),
      makeRule({ id: "r-low", priority: 2, tone: "info" }),
    ]
    const formatter = compileElementFormatter(rules)

    expect(formatter(makeEntry()).element?.tone).toBe("warning")
  })

  it("resolves equal priorities by input order", () => {
    const rules = [
      makeRule({ id: "first", priority: 1, tone: "info" }),
      makeRule({ id: "second", priority: 1, tone: "danger" }),
    ]
    const formatter = compileElementFormatter(rules)

    expect(formatter(makeEntry()).element?.tone).toBe("info")
  })

  it("resolves field rules per column and leaves element null when no element rule matches", () => {
    const rule = makeRule({
      id: "f1",
      target: "field",
      columnId: "view_count",
      group: {
        columnId: "view_count",
        label: "Views",
        type: "number",
        conditions: [{ id: "c1", op: "gt", value: 5 }],
      },
      tone: "success",
    })
    const formatter = compileElementFormatter([rule])

    const format = formatter(makeEntry())

    expect(format.element).toBeNull()
    expect(format.fields.view_count).toEqual({ tone: "success", textStyles: [] })
  })

  it("applies an element rule and a field rule on the same column independently", () => {
    const elementRule = makeRule({ id: "e1", target: "element", columnId: "status", tone: "warning" })
    const fieldRule = makeRule({ id: "f1", target: "field", columnId: "status", tone: "info" })
    const formatter = compileElementFormatter([elementRule, fieldRule])

    const format = formatter(makeEntry())

    expect(format.element?.tone).toBe("warning")
    expect(format.fields.status?.tone).toBe("info")
  })

  it("a status rule reads the entry's top-level status, not data.status", () => {
    const rule = makeRule()
    const formatter = compileElementFormatter([rule])
    const entry = makeEntry({ status: "published", data: { status: "draft" } })

    expect(formatter(entry).element?.tone).toBe("warning")
  })

  it("parses a tags JSON string value, and treats an unparsable string as null without throwing", () => {
    const tagsRule = makeRule({
      columnId: "tags",
      group: {
        columnId: "tags",
        label: "Tags",
        type: "tags",
        conditions: [{ id: "c1", op: "contains", value: "react" }],
      },
    })
    const matchingFormatter = compileElementFormatter([tagsRule])
    expect(matchingFormatter(makeEntry({ data: { tags: '["react"]' } })).element).not.toBeNull()

    const brokenFormatter = compileElementFormatter([tagsRule])
    const brokenEntry = makeEntry({ data: { tags: "not-json" } })
    expect(() => brokenFormatter(brokenEntry)).not.toThrow()
    expect(brokenFormatter(brokenEntry).element).toBeNull()
  })

  it("yields a style with an empty textStyles array when the rule has no textStyles", () => {
    const rule = makeRule({ textStyles: undefined })
    const formatter = compileElementFormatter([rule])

    expect(formatter(makeEntry()).element?.textStyles).toEqual([])
  })
})

describe("getConditionalFormatCardClass", () => {
  it("carries the border and tint of each tone, plus the text-style classes", () => {
    const expected: Record<ConditionalFormatTone, { border: string; tint: string }> = {
      success: { border: "border-emerald-500/50", tint: "from-emerald-500/12" },
      warning: { border: "border-amber-500/50", tint: "from-amber-500/12" },
      danger: { border: "border-destructive/50", tint: "from-destructive/12" },
      info: { border: "border-sky-500/50", tint: "from-sky-500/12" },
      neutral: { border: "border-muted-foreground/30", tint: "from-muted/50" },
    }

    for (const tone of tones) {
      const className = getConditionalFormatCardClass(tone, ["bold", "italic"])
      expect(className).toContain(expected[tone].border)
      expect(className).toContain(expected[tone].tint)
      expect(className).toContain("font-bold")
      expect(className).toContain("italic")
    }
  })

  it("contains no hover: class and no plain bg-<colour> utility, so bg-card is never overridden", () => {
    for (const tone of tones) {
      const className = getConditionalFormatCardClass(tone, [])
      expect(className).not.toContain("hover:")
      expect(className.match(/bg-[\w-]+/g)).toEqual(["bg-linear-to-b"])
    }
  })
})

