// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ColumnFiltersState } from "@tanstack/react-table"
import type { FilterCondition, FilterGroup, FilterOperator, FilterType } from "@beechcms/core"

function normalizeCondition(
  op: FilterOperator,
  value: unknown,
  type: FilterType
): FilterCondition | null {
  if (op === "is_empty" || op === "is_not_empty") {
    return { op, value: null }
  }

  if (op === "contains") {
    if (typeof value !== "string" || value.trim().length === 0) return null
    return { op, value: value.trim() }
  }

  if (op === "eq" || op === "neq") {
    if (type === "boolean") {
      if (typeof value === "boolean") return { op, value }
      if (value === "true") return { op, value: true }
      if (value === "false") return { op, value: false }
      return null
    }
    if (type === "number") {
      if (typeof value === "number" && !Number.isNaN(value)) return { op, value }
      if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
        return { op, value: Number(value) }
      }
      return null
    }
    if (value === null || value === undefined || value === "") return null
    return { op, value: value as string | number | boolean }
  }

  if (op === "gt" || op === "gte" || op === "lt" || op === "lte") {
    if (type === "number") {
      if (typeof value === "number" && !Number.isNaN(value)) return { op, value }
      if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
        return { op, value: Number(value) }
      }
      return null
    }
    if (typeof value === "string" && value.trim().length > 0) {
      return { op, value: value.trim() }
    }
    return null
  }

  if (op === "in" || op === "not_in") {
    if (!Array.isArray(value) || value.length === 0) return null
    return { op, value }
  }

  if (op === "has_tag" || op === "has_any_tag" || op === "has_all_tags") {
    if (value === null || value === undefined || value === "") return null
    if (Array.isArray(value) && value.length === 0) return null
    return { op, value: value as string | string[] }
  }

  if (value !== null && value !== undefined && value !== "") {
    return { op, value: value as string | number | boolean }
  }

  return null
}

function parseGroupCandidate(
  columnIdFallback: string,
  candidate: unknown
): FilterGroup | null {
  if (!candidate || typeof candidate !== "object") return null
  const record = candidate as Record<string, unknown>
  const column = (typeof record.columnId === "string"
    ? record.columnId
    : typeof record.column === "string"
    ? record.column
    : columnIdFallback)
  const type = (typeof record.type === "string" ? record.type : "text") as FilterType
  const rawConditions = Array.isArray(record.conditions) ? record.conditions : []
  const conditions: FilterCondition[] = []
  for (const raw of rawConditions) {
    if (!raw || typeof raw !== "object") continue
    const cond = raw as { op?: string; value?: unknown }
    if (typeof cond.op !== "string") continue
    const normalized = normalizeCondition(cond.op as FilterOperator, cond.value, type)
    if (normalized) conditions.push(normalized)
  }
  if (conditions.length === 0) return null
  return { column, type, conditions }
}

export function toActiveFilters(
  columnFilters?: ColumnFiltersState,
  toolbarFilters?: Record<string, unknown>
): FilterGroup[] {
  if (columnFilters && columnFilters.length > 0) {
    const groups: FilterGroup[] = []
    for (const cf of columnFilters) {
      const parsed = parseGroupCandidate(cf.id, cf.value)
      if (parsed) {
        groups.push(parsed)
      } else if (typeof cf.value !== "object" && cf.value !== undefined && cf.value !== null && cf.value !== "") {
        groups.push({
          column: cf.id,
          type: "text",
          conditions: [{ op: "eq", value: cf.value as string | number | boolean }],
        })
      }
    }
    if (groups.length > 0) return groups
  }

  if (toolbarFilters && typeof toolbarFilters === "object") {
    const groups: FilterGroup[] = []
    for (const [columnId, val] of Object.entries(toolbarFilters)) {
      const parsed = parseGroupCandidate(columnId, val)
      if (parsed) groups.push(parsed)
    }
    return groups
  }

  return []
}
