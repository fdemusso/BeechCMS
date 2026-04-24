import { describe, expect, it, vi } from "vitest"

import {
  CONDITIONAL_TONE_OPTIONS,
  DEFAULT_ENABLED_TOOLS,
  generateConditionId,
  getConditionalToneStripClass,
  getGroupableColumns,
  getOperatorOptions,
  normalizeConditionalTarget,
  normalizeTextStyles,
  operatorRequiresValue,
} from "@/components/content-toolbar/shared"

describe("content-toolbar/shared", () => {
  it("espone default tools e toni attesi", () => {
    expect(DEFAULT_ENABLED_TOOLS).toEqual([
      "filter",
      "sort",
      "automation",
      "search",
      "settings",
      "create",
    ])
    expect(CONDITIONAL_TONE_OPTIONS.map((t) => t.value)).toEqual([
      "success",
      "warning",
      "danger",
      "info",
      "neutral",
    ])
  })

  it("normalizza target e text styles", () => {
    expect(normalizeConditionalTarget("cell")).toBe("cell")
    expect(normalizeConditionalTarget("row")).toBe("row")
    expect(normalizeConditionalTarget("other")).toBe("row")
    expect(normalizeTextStyles(["bold", "x", "italic", "underline"])).toEqual([
      "bold",
      "italic",
      "underline",
    ])
    expect(normalizeTextStyles("bad")).toEqual([])
  })

  it("ritorna classi tone-strip corrette", () => {
    expect(getConditionalToneStripClass("success")).toContain("emerald")
    expect(getConditionalToneStripClass("warning")).toContain("amber")
    expect(getConditionalToneStripClass("danger")).toContain("destructive")
    expect(getConditionalToneStripClass("info")).toContain("sky")
    expect(getConditionalToneStripClass("neutral")).toContain("muted")
  })

  it("genera id condizione stabile nel formato", () => {
    vi.spyOn(Date, "now").mockReturnValue(123)
    vi.spyOn(Math, "random").mockReturnValue(0.5)
    const id = generateConditionId()
    expect(id.startsWith("123_")).toBe(true)
    const [ts, rand] = id.split("_")
    expect(ts).toBe("123")
    expect(Boolean(rand)).toBe(true)
    vi.restoreAllMocks()
  })

  it("gestisce operatori e require-value", () => {
    expect(operatorRequiresValue("eq")).toBe(true)
    expect(operatorRequiresValue("is_empty")).toBe(false)
    expect(operatorRequiresValue("is_not_empty")).toBe(false)

    const t = (key: string) => key
    expect(getOperatorOptions("number", t).map((o) => o.value)).toEqual([
      "gt",
      "lt",
      "gte",
      "lte",
      "eq",
      "is_not_empty",
      "is_empty",
    ])
    expect(getOperatorOptions("date", t)[0].value).toBe("gt")
    expect(getOperatorOptions("tags", t).map((o) => o.value)).toEqual([
      "contains",
      "is_not_empty",
      "is_empty",
    ])
    expect(getOperatorOptions("select", t).map((o) => o.value)).toEqual([
      "eq",
      "is_not_empty",
      "is_empty",
    ])
    expect(getOperatorOptions("text", t)[0].value).toBe("contains")
    expect(getOperatorOptions("system", t)[0].value).toBe("contains")
  })

  it("calcola groupable columns per branch/section", () => {
    const seed = {
      branches: [
        { alias: "isLive", label: "Live", type: "boolean" },
        { alias: "publishedAt", label: "Data", type: "date" },
        { alias: "category", label: "Categoria", type: "text", options: ["a"] },
        { alias: "title", label: "Titolo", type: "text" },
        { alias: "views", label: "Visualizzazioni", type: "number" },
        { alias: "meta", label: "Meta", type: "json" },
      ],
    } as any

    const withFewStatus = getGroupableColumns(seed, ["draft", "published"])
    expect(withFewStatus[0]).toEqual({
      columnId: "status",
      label: "Stato",
      section: "recommended",
    })
    expect(withFewStatus.some((c) => c.columnId === "isLive" && c.section === "recommended")).toBe(
      true
    )
    expect(withFewStatus.some((c) => c.columnId === "publishedAt" && c.branchType === "date")).toBe(
      true
    )
    expect(withFewStatus.some((c) => c.columnId === "category" && c.section === "recommended")).toBe(
      true
    )
    expect(withFewStatus.some((c) => c.columnId === "title" && c.section === "other")).toBe(true)
    expect(withFewStatus.some((c) => c.columnId === "views" && c.section === "other")).toBe(true)

    const withManyStatus = getGroupableColumns(seed, Array.from({ length: 9 }, (_, i) => `s${i}`))
    expect(withManyStatus[0].section).toBe("other")
  })
})
