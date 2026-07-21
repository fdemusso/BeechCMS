// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// @vitest-environment node

import { describe, it, expect } from "vitest"

import {
  isEmptyValue,
  isToolbarFilterGroup,
  matchesCondition,
  matchesConditionStrict,
  matchesFilterGroupStrict,
  normalizeDateToYmd,
} from "@/lib/filter-dsl"

import type { ToolbarFilterGroup, FilterOperator } from "@/lib/filter-dsl"

const mkGroup = (group: Partial<ToolbarFilterGroup> & Pick<ToolbarFilterGroup, "type">) =>
  ({
    columnId: group.columnId ?? "col",
    label: group.label ?? "Label",
    type: group.type,
    conditions: group.conditions ?? [],
    selectOptions: group.selectOptions,
  }) as ToolbarFilterGroup

describe("filter-dsl - isToolbarFilterGroup", () => {
  it("ritorna false su valori non validi", () => {
    expect(isToolbarFilterGroup(null)).toBe(false)
    expect(isToolbarFilterGroup(123)).toBe(false)
    expect(isToolbarFilterGroup({})).toBe(false)
  })

  it("ritorna true su struttura corretta", () => {
    const group = mkGroup({
      type: "tags",
      columnId: "images",
      label: "Images",
      conditions: [{ id: "c1", op: "contains", value: "react" }],
    })

    expect(isToolbarFilterGroup(group)).toBe(true)
  })
})

describe("filter-dsl - isEmptyValue", () => {
  it("valuta empty/null/whitespace", () => {
    expect(isEmptyValue(null)).toBe(true)
    expect(isEmptyValue(undefined)).toBe(true)
    expect(isEmptyValue("")).toBe(true)
    expect(isEmptyValue("   ")).toBe(true)
  })

  it("valuta array/oggetti vuoti", () => {
    expect(isEmptyValue([])).toBe(true)
    expect(isEmptyValue({})).toBe(true)
  })

  it("valuta valori non vuoti", () => {
    expect(isEmptyValue(" a ")).toBe(false)
    expect(isEmptyValue([1])).toBe(false)
    expect(isEmptyValue({ a: 1 })).toBe(false)
  })
})

describe("filter-dsl - normalizeDateToYmd", () => {
  it("restituisce null per input null/undefined/vuoti", () => {
    expect(normalizeDateToYmd(null)).toBeNull()
    expect(normalizeDateToYmd(undefined)).toBeNull()
    expect(normalizeDateToYmd("   ")).toBeNull()
  })

  it("mantiene YYYY-MM-DD", () => {
    expect(normalizeDateToYmd("2026-01-02")).toBe("2026-01-02")
  })

  it("normalizza ISO/date parseable", () => {
    expect(normalizeDateToYmd("2026-01-02T10:00:00.000Z")).toBe("2026-01-02")
  })

  it("restituisce null per input non parseable", () => {
    expect(normalizeDateToYmd("not-a-date")).toBeNull()
  })

  it("normalizza numero (timestamp ms)", () => {
    const ms = new Date("2026-01-03T00:00:00.000Z").getTime()
    expect(normalizeDateToYmd(ms)).toBe("2026-01-03")
  })
})

describe("filter-dsl - matchesCondition (lenient)", () => {
  const tagsGroup = mkGroup({
    type: "tags",
    conditions: [{ id: "c1", op: "contains", value: "react" }],
  })

  it("tags: contains/eq su keys estratte", () => {
    const cell = '{"react":"#111111","cms":"#222222"}'
    expect(matchesCondition(cell, tagsGroup, "contains", "react")).toBe(true)
    expect(matchesCondition(cell, tagsGroup, "eq", "react")).toBe(true)
    expect(matchesCondition(cell, tagsGroup, "contains", "angular")).toBe(false)
  })

  it("tags: filtro vuoto -> sempre true (lenient)", () => {
    const cell = '{"react":"#111111"}'
    expect(matchesCondition(cell, tagsGroup, "contains", "")).toBe(true)
    expect(matchesCondition(cell, tagsGroup, "eq", "   ")).toBe(true)
  })

  it("number: gestisce string/number e valori incompatibili -> true", () => {
    const numberGroup = mkGroup({ type: "number" })
    expect(matchesCondition("5", numberGroup, "eq", 5)).toBe(true)
    expect(matchesCondition(10, numberGroup, "gt", 9)).toBe(true)
    // Valori non comparabili -> true
    expect(matchesCondition(null, numberGroup, "eq", 5)).toBe(true)
  })

  it("date: normalizza e confronta (o ritorna true se non comparabili)", () => {
    const dateGroup = mkGroup({ type: "date" })
    expect(matchesCondition("2026-01-03", dateGroup, "gte", "2026-01-02")).toBe(true)
    expect(matchesCondition("2026-01-01", dateGroup, "lte", "2026-01-02")).toBe(true)
    expect(matchesCondition("not-a-date", dateGroup, "eq", "2026-01-02")).toBe(true)
  })

  it("boolean: eq su boolean, oppure true se non comparabili", () => {
    const boolGroup = mkGroup({ type: "boolean" })
    expect(matchesCondition(true, boolGroup, "eq", false)).toBe(false)
    expect(matchesCondition(true, boolGroup, "eq", null)).toBe(true)
  })

  it("select: eq case-insensitive; op != eq -> true", () => {
    const selectGroup = mkGroup({ type: "select" })
    expect(matchesCondition("Draft", selectGroup, "eq", "draft")).toBe(true)
    expect(matchesCondition("whatever", selectGroup, "gt" as FilterOperator, "anything")).toBe(true)
  })

  it("text/system: contains/eq case-insensitive", () => {
    const textGroup = mkGroup({ type: "text" })
    expect(matchesCondition("Hello World", textGroup, "contains", "world")).toBe(true)
    expect(matchesCondition("Hello World", textGroup, "eq", "hello world")).toBe(true)
    expect(matchesCondition("Hello World", textGroup, "eq", "other")).toBe(false)
  })
})

describe("filter-dsl - matchesConditionStrict (strict)", () => {
  it("is_empty/is_not_empty: usa isEmptyValue", () => {
    const group = mkGroup({ type: "text" })
    expect(matchesConditionStrict(null, group, "is_empty", null)).toBe(true)
    expect(matchesConditionStrict(null, group, "is_not_empty", null)).toBe(false)
  })

  it("tags strict: filtro vuoto -> false; match/non-match sulle keys", () => {
    const group = mkGroup({ type: "tags" })
    const cell = '{"react":"#111111","cms":"#222222"}'
    expect(matchesConditionStrict(cell, group, "contains", "react")).toBe(true)
    expect(matchesConditionStrict(cell, group, "contains", "angular")).toBe(false)
    expect(matchesConditionStrict(cell, group, "contains", "")).toBe(false)
  })

  it("number strict: valori non comparabili -> false", () => {
    const group = mkGroup({ type: "number" })
    expect(matchesConditionStrict("5", group, "eq", 5)).toBe(true)
    expect(matchesConditionStrict(null, group, "eq", 5)).toBe(false)
    expect(matchesConditionStrict("5", group, "eq", null)).toBe(false)
  })

  it("date strict: input non normalizzabile -> false", () => {
    const group = mkGroup({ type: "date" })
    expect(matchesConditionStrict("2026-01-03", group, "gte", "2026-01-02")).toBe(true)
    expect(matchesConditionStrict("not-a-date", group, "eq", "2026-01-02")).toBe(false)
  })

  it("boolean strict: eq solo su boolean", () => {
    const group = mkGroup({ type: "boolean" })
    expect(matchesConditionStrict(true, group, "eq", false)).toBe(false)
    expect(matchesConditionStrict(true, group, "eq", null)).toBe(false)
  })

  it("select strict: richiede entrambi non vuoti e uguali ignorando case", () => {
    const group = mkGroup({ type: "select" })
    expect(matchesConditionStrict("Draft", group, "eq", "draft")).toBe(true)
    expect(matchesConditionStrict("", group, "eq", "draft")).toBe(false)
    expect(matchesConditionStrict("Draft", group, "eq", "")).toBe(false)
  })

  it("text strict: contains/eq richiedono stringhe valide e non vuote", () => {
    const group = mkGroup({ type: "text" })
    expect(matchesConditionStrict("Hello World", group, "contains", "world")).toBe(true)
    expect(matchesConditionStrict("Hello World", group, "eq", "hello world")).toBe(true)
    expect(matchesConditionStrict(null, group, "contains", "world")).toBe(false)
  })
})

describe("filter-dsl - matchesFilterGroupStrict", () => {
  it("matchesFilterGroupStrict: invalid filterValue -> false", () => {
    expect(matchesFilterGroupStrict("anything", null)).toBe(false)
    expect(matchesFilterGroupStrict("anything", 123)).toBe(false)
  })

  it("matchesFilterGroupStrict: AND + strict matching", () => {
    const group = mkGroup({
      type: "select",
      conditions: [{ id: "c1", op: "eq", value: "draft" }],
    })
    expect(matchesFilterGroupStrict("Draft", group)).toBe(true)
    expect(matchesFilterGroupStrict("", group)).toBe(false)
  })
})

