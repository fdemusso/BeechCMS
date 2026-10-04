// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { arrayMove } from "@dnd-kit/sortable"
import type { DashboardView, Seed } from "@beechcms/core"
import type {
  ConditionalFormatRule,
  ConditionalFormatTarget,
  ConditionalFormatTextStyle,
  ConditionalFormatTone,
} from "@/lib/conditional-format"

import type { ToolbarTool, ViewSetting } from "@/features/shared"
export type { ToolbarTool }

export interface UserViewInstance {
  id: string
  label: string
  type: DashboardView
  enabledTools: ToolbarTool[]
  settings: readonly ViewSetting[]
  conditionalFormats?: ConditionalFormatRule[]
}

/** New tab order after dragging `activeId` onto `overId`; null when nothing moves. */
export function moveViewId(ids: readonly string[], activeId: string, overId: string | null): string[] | null {
  if (overId === null || activeId === overId) return null
  const fromIndex = ids.indexOf(activeId)
  const toIndex = ids.indexOf(overId)
  if (fromIndex === -1 || toIndex === -1) return null
  return arrayMove([...ids], fromIndex, toIndex)
}

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

export interface ToolbarFilterCondition {
  id: string
  op: FilterOperator
  value: string | number | boolean | null
}

export interface ToolbarFilterGroup {
  columnId: string
  label: string
  type: FilterGroupType
  conditions: ToolbarFilterCondition[]
  selectOptions?: string[]
}

export type ToolbarFiltersState = Record<string, ToolbarFilterGroup>

export const MAX_CONDITIONS_PER_FILTER = 3

export const DEFAULT_ENABLED_TOOLS: ToolbarTool[] = [
  "filter",
  "sort",
  "automation",
  "search",
  "settings",
  "create",
  "transfer",
]

export const DEFAULT_VIEW_SETTINGS: readonly ViewSetting[] = [
  "groupBy",
  "conditionalFormats",
  "columns",
  "pageSize",
  "density",
]

export const CONDITIONAL_TONE_OPTIONS: Array<{
  value: ConditionalFormatTone
  label: string
}> = [
  { value: "success", label: "Successo" },
  { value: "warning", label: "Attenzione" },
  { value: "danger", label: "Critico" },
  { value: "info", label: "Info" },
  { value: "neutral", label: "Neutro" },
]

export function normalizeConditionalTarget(value: unknown): ConditionalFormatTarget {
  return value === "field" ? "field" : "element"
}

export function normalizeTextStyles(value: unknown): ConditionalFormatTextStyle[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (style): style is ConditionalFormatTextStyle =>
      style === "bold" || style === "italic" || style === "underline"
  )
}

export function getConditionalToneStripClass(tone: ConditionalFormatTone): string {
  switch (tone) {
    case "success":
      return "bg-emerald-500/70"
    case "warning":
      return "bg-amber-500/70"
    case "danger":
      return "bg-destructive/70"
    case "info":
      return "bg-sky-500/70"
    case "neutral":
    default:
      return "bg-muted-foreground/40"
  }
}

export function generateConditionId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export { buildFilterableColumns, type FilterableColumn } from "@/lib/filter-dsl"

export function defaultOperatorForType(type: FilterGroupType): FilterOperator {
  return type === "tags" ? "contains" : "eq"
}

export function operatorRequiresValue(op: FilterOperator): boolean {
  return op !== "is_empty" && op !== "is_not_empty"
}

export function getOperatorOptions(
  type: FilterGroupType,
  t: (key: string) => string
): Array<{ value: FilterOperator; label: string }> {
  const baseOptions: Array<{ value: FilterOperator; label: string }> = [
    { value: "eq", label: t("toolbar.operators.eq") },
    { value: "is_not_empty", label: t("toolbar.operators.is_not_empty") },
    { value: "is_empty", label: t("toolbar.operators.is_empty") },
  ]

  if (type === "number" || type === "date") {
    return [
      { value: "gt", label: t("toolbar.operators.gt") },
      { value: "lt", label: t("toolbar.operators.lt") },
      { value: "gte", label: t("toolbar.operators.gte") },
      { value: "lte", label: t("toolbar.operators.lte") },
      ...baseOptions,
    ]
  }

  if (type === "tags") {
    return [
      { value: "contains", label: t("toolbar.operators.contains") },
      { value: "is_not_empty", label: t("toolbar.operators.is_not_empty") },
      { value: "is_empty", label: t("toolbar.operators.is_empty") },
    ]
  }

  if (type === "select") {
    return [
      { value: "eq", label: t("toolbar.operators.eq") },
      { value: "is_not_empty", label: t("toolbar.operators.is_not_empty") },
      { value: "is_empty", label: t("toolbar.operators.is_empty") },
    ]
  }

  if (type === "text" || type === "system") {
    return [{ value: "contains", label: t("toolbar.operators.contains") }, ...baseOptions]
  }

  return baseOptions
}

type GroupableSection = "recommended" | "other"

export interface GroupableColumn {
  columnId: string
  label: string
  section: GroupableSection
  branchType?: string
}

export function getGroupableColumns(
  seed: Seed,
  availableStatusOptions: string[] = [],
  statusLabel: string = "Stato"
): GroupableColumn[] {
  const result: GroupableColumn[] = []
  const statusSection: GroupableSection =
    availableStatusOptions.length > 0 && availableStatusOptions.length <= 8
      ? "recommended"
      : "other"
  result.push({ columnId: "status", label: statusLabel, section: statusSection })

  for (const branch of seed.branches) {
    if (branch.type === "boolean") {
      result.push({
        columnId: branch.alias,
        label: branch.label,
        section: "recommended",
        branchType: "boolean",
      })
    } else if (branch.type === "date") {
      result.push({
        columnId: branch.alias,
        label: branch.label,
        section: "recommended",
        branchType: "date",
      })
    } else if (branch.type === "text" && branch.options && branch.options.length > 0) {
      result.push({ columnId: branch.alias, label: branch.label, section: "recommended" })
    } else if (branch.type === "text") {
      result.push({ columnId: branch.alias, label: branch.label, section: "other" })
    } else if (branch.type === "number") {
      result.push({ columnId: branch.alias, label: branch.label, section: "other" })
    }
  }

  return result
}
