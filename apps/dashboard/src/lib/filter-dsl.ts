// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { extractTagNames } from "@/lib/tags-utils"

export type FilterGroupType =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "tags"
  | "select"
  | "system"

export type FilterOperator =
  | "eq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "is_empty"
  | "is_not_empty"

type FilterValue = string | number | boolean | null

export type ToolbarFilterGroup = {
  columnId: string
  label: string
  type: FilterGroupType
  conditions: Array<{
    id: string
    op: FilterOperator
    value: string | number | boolean | null
  }>
  /** Opzioni predefinite per tipo \"select\" (es. status: [\"draft\",\"published\"]). */
  selectOptions?: string[]
}

export function isToolbarFilterGroup(value: unknown): value is ToolbarFilterGroup {
  if (!value || typeof value !== "object") return false
  const v = value as Partial<ToolbarFilterGroup>
  return (
    typeof v.columnId === "string" &&
    typeof v.label === "string" &&
    typeof v.type === "string" &&
    Array.isArray(v.conditions)
  )
}

export function isEmptyValue(v: unknown) {
  if (v == null) return true
  if (typeof v === "string") return v.trim().length === 0
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === "object") return Object.keys(v).length === 0
  return false
}

export function normalizeDateToYmd(val: unknown): string | null {
  if (val == null) return null
  if (typeof val === "string") {
    const trimmed = val.trim()
    if (!trimmed) return null
    // Se è già YYYY-MM-DD, usalo.
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
    const d = new Date(trimmed)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  }
  if (typeof val === "number") {
    const d = new Date(val)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  }
  return null
}

export function matchesCondition(
  cellValue: unknown,
  group: ToolbarFilterGroup,
  op: FilterOperator,
  filterValue: FilterValue
) {
  // Lenient matching: quando dati/filtri non sono confrontabili, ritorna `true`.
  if (op === "is_empty") return isEmptyValue(cellValue)
  if (op === "is_not_empty") return !isEmptyValue(cellValue)

  switch (group.type) {
    case "tags":
      return matchesTagsConditionLenient(cellValue, op, filterValue)
    case "number":
      return matchesNumberConditionLenient(cellValue, op, filterValue)
    case "date":
      return matchesDateConditionLenient(cellValue, op, filterValue)
    case "boolean":
      return matchesBooleanConditionLenient(cellValue, op, filterValue)
    case "select":
      return matchesSelectConditionLenient(cellValue, op, filterValue)
    case "text":
    case "system":
    default:
      return matchesTextOrSystemConditionLenient(cellValue, op, filterValue)
  }
}

function matchesTagsConditionLenient(
  cellValue: unknown,
  op: FilterOperator,
  filterValue: FilterValue
) {
  const keys = extractTagNames(cellValue)

  if (op === "contains") {
    if (typeof filterValue !== "string" || !filterValue.trim()) return true
    return keys.includes(filterValue)
  }

  if (op === "eq") {
    if (typeof filterValue !== "string" || !filterValue.trim()) return true
    return keys.includes(filterValue)
  }

  return true
}

function matchesNumberConditionLenient(
  cellValue: unknown,
  op: FilterOperator,
  filterValue: FilterValue
) {
  let n: number | null = null
  if (typeof cellValue === "number") n = cellValue
  else if (typeof cellValue === "string" && cellValue.trim() !== "")
    n = Number(cellValue)
  const f = typeof filterValue === "number" ? filterValue : null
  if (n == null || f == null || Number.isNaN(n) || Number.isNaN(f)) return true

  switch (op) {
    case "eq":
      return n === f
    case "gt":
      return n > f
    case "gte":
      return n >= f
    case "lt":
      return n < f
    case "lte":
      return n <= f
    default:
      return true
  }
}

function matchesDateConditionLenient(
  cellValue: unknown,
  op: FilterOperator,
  filterValue: FilterValue
) {
  const d = normalizeDateToYmd(cellValue)
  const f = typeof filterValue === "string" ? normalizeDateToYmd(filterValue) : null
  if (!d || !f) return true

  switch (op) {
    case "eq":
      return d === f
    case "gt":
      return d > f
    case "gte":
      return d >= f
    case "lt":
      return d < f
    case "lte":
      return d <= f
    default:
      return true
  }
}

function matchesBooleanConditionLenient(
  cellValue: unknown,
  op: FilterOperator,
  filterValue: FilterValue
) {
  const b = typeof cellValue === "boolean" ? cellValue : null
  const f = typeof filterValue === "boolean" ? filterValue : null
  if (b == null || f == null) return true
  return op === "eq" ? b === f : true
}

function matchesSelectConditionLenient(
  cellValue: unknown,
  op: FilterOperator,
  filterValue: FilterValue
) {
  const s = cellValue == null ? "" : String(cellValue)

  if (op !== "eq") return true
  if (filterValue == null) return true

  const f = String(filterValue)
  if (!f.trim()) return true
  return s.trim().toLowerCase() === f.trim().toLowerCase()
}

function matchesTextOrSystemConditionLenient(
  cellValue: unknown,
  op: FilterOperator,
  filterValue: FilterValue
) {
  const s = cellValue == null ? "" : String(cellValue)

  if (op === "contains") {
    if (typeof filterValue !== "string" || !filterValue.trim()) return true
    return s.toLowerCase().includes(filterValue.toLowerCase())
  }

  if (op === "eq") {
    if (filterValue == null) return true
    const f = String(filterValue)
    if (!f.trim()) return true
    return s.trim().toLowerCase() === f.trim().toLowerCase()
  }

  return true
}

function matchesTagsConditionStrict(
  cellValue: unknown,
  op: FilterOperator,
  filterValue: FilterValue
) {
  const keys = extractTagNames(cellValue)
  if (typeof filterValue !== "string" || !filterValue.trim()) return false
  if (keys.length === 0) return false
  if (op === "contains" || op === "eq") return keys.includes(filterValue)
  return false
}

function matchesNumberConditionStrict(
  cellValue: unknown,
  op: FilterOperator,
  filterValue: FilterValue
) {
  let n: number | null = null
  if (typeof cellValue === "number") n = cellValue
  else if (typeof cellValue === "string" && cellValue.trim() !== "")
    n = Number(cellValue)
  const f = typeof filterValue === "number" ? filterValue : null
  if (n == null || f == null || Number.isNaN(n) || Number.isNaN(f)) return false

  switch (op) {
    case "eq":
      return n === f
    case "gt":
      return n > f
    case "gte":
      return n >= f
    case "lt":
      return n < f
    case "lte":
      return n <= f
    default:
      return false
  }
}

function matchesDateConditionStrict(
  cellValue: unknown,
  op: FilterOperator,
  filterValue: FilterValue
) {
  const d = normalizeDateToYmd(cellValue)
  const f = typeof filterValue === "string" ? normalizeDateToYmd(filterValue) : null
  if (!d || !f) return false

  switch (op) {
    case "eq":
      return d === f
    case "gt":
      return d > f
    case "gte":
      return d >= f
    case "lt":
      return d < f
    case "lte":
      return d <= f
    default:
      return false
  }
}

function matchesBooleanConditionStrict(
  cellValue: unknown,
  op: FilterOperator,
  filterValue: FilterValue
) {
  const b = typeof cellValue === "boolean" ? cellValue : null
  const f = typeof filterValue === "boolean" ? filterValue : null
  if (b == null || f == null) return false
  return op === "eq" ? b === f : false
}

function matchesSelectConditionStrict(
  cellValue: unknown,
  op: FilterOperator,
  filterValue: FilterValue
) {
  const s = cellValue == null ? "" : String(cellValue)
  if (op !== "eq") return false
  if (filterValue == null) return false

  const f = String(filterValue)
  if (!f.trim()) return false
  if (!s.trim()) return false

  return s.trim().toLowerCase() === f.trim().toLowerCase()
}

function matchesTextOrSystemConditionStrict(
  cellValue: unknown,
  op: FilterOperator,
  filterValue: FilterValue
) {
  const s = cellValue == null ? "" : String(cellValue)

  if (op === "contains") {
    if (typeof filterValue !== "string" || !filterValue.trim()) return false
    if (!s.trim()) return false
    return s.toLowerCase().includes(filterValue.toLowerCase())
  }

  if (op === "eq") {
    if (filterValue == null) return false
    const f = String(filterValue)
    if (!f.trim()) return false
    if (!s.trim()) return false
    return s.trim().toLowerCase() === f.trim().toLowerCase()
  }

  return false
}

/**
 * Variante "strict" del matching: pensata per usi di tipo UI feedback (es. colori condizionali).
 *
 * Differenze rispetto a `matchesCondition`:
 * - quando i dati non sono comparabili (valori null/invalidi o filtro vuoto) ⇒ **false** (non matcha),
 *   evitando evidenziazioni spurie.
 */
export function matchesConditionStrict(
  cellValue: unknown,
  group: ToolbarFilterGroup,
  op: FilterOperator,
  filterValue: FilterValue
) {
  if (op === "is_empty") return isEmptyValue(cellValue)
  if (op === "is_not_empty") return !isEmptyValue(cellValue)

  switch (group.type) {
    case "tags":
      return matchesTagsConditionStrict(cellValue, op, filterValue)
    case "number":
      return matchesNumberConditionStrict(cellValue, op, filterValue)
    case "date":
      return matchesDateConditionStrict(cellValue, op, filterValue)
    case "boolean":
      return matchesBooleanConditionStrict(cellValue, op, filterValue)
    case "select":
      return matchesSelectConditionStrict(cellValue, op, filterValue)
    case "text":
    case "system":
    default:
      return matchesTextOrSystemConditionStrict(cellValue, op, filterValue)
  }
}

export function matchesFilterGroupStrict(cellValue: unknown, filterValue: unknown) {
  if (!isToolbarFilterGroup(filterValue)) return false
  for (const cond of filterValue.conditions) {
    if (!matchesConditionStrict(cellValue, filterValue, cond.op, cond.value)) {
      return false
    }
  }
  return true
}

