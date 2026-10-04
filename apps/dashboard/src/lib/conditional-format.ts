// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ContentEntry } from "@/lib/dynamic-columns"
import { getEntryValueForColumn, matchesFilterGroupStrict, type ToolbarFilterGroup } from "@/lib/filter-dsl"

export type ConditionalFormatTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"

export type ConditionalFormatTarget = "element" | "field"
export type ConditionalFormatTextStyle = "bold" | "italic" | "underline"

export interface ConditionalFormatRule {
  id: string
  enabled: boolean
  /** Priorità crescente: 0 vince su 10. */
  priority: number
  label?: string
  /** Colonna su cui valutare la condizione, e campo evidenziato quando target è "field". */
  columnId: string
  /** Condizioni AND, identiche ai filtri toolbar. */
  group: ToolbarFilterGroup
  tone: ConditionalFormatTone
  target: ConditionalFormatTarget
  textStyles?: ConditionalFormatTextStyle[]
}

/** What a matching rule assigns. Same meaning on a table row, a gallery card and a kanban card. */
export interface ElementStyle {
  readonly tone: ConditionalFormatTone
  readonly textStyles: readonly ConditionalFormatTextStyle[]
}

/** Evaluated conditional formatting of one Element (table row, gallery card, kanban card). */
export interface ElementFormat {
  /** Winning `element` rule, or null when none matches. */
  readonly element: ElementStyle | null
  /** Winning `field` rule per column id (branch alias or system column). A missing key means no match. */
  readonly fields: Readonly<Record<string, ElementStyle>>
}

/** The harness Element contract: entry in, semantic format out. */
export type ElementFormatter = (entry: ContentEntry) => ElementFormat

export const NO_ELEMENT_FORMAT: ElementFormat = Object.freeze({
  element: null,
  fields: Object.freeze({}),
})

export const NO_ELEMENT_FORMATTER: ElementFormatter = () => NO_ELEMENT_FORMAT

function getTextStylesClass(
  textStyles: readonly ConditionalFormatTextStyle[] = []
): string {
  const classes: string[] = []
  if (textStyles.includes("bold")) classes.push("font-bold")
  if (textStyles.includes("italic")) classes.push("italic")
  if (textStyles.includes("underline")) classes.push("underline")
  return classes.join(" ")
}

function parseTagsValue(rawValue: string): unknown {
  try {
    return JSON.parse(rawValue) as unknown
  } catch {
    return null
  }
}

/**
 * Compiles the instance's conditional-format rules into a pure evaluator. Enabled rules only, sorted
 * by ascending priority (ties keep input order), split into `element` rules and `field` rules grouped
 * by column id. With no enabled rule, the compiled function always returns `NO_ELEMENT_FORMAT`.
 */
export function compileElementFormatter(rules: readonly ConditionalFormatRule[]): ElementFormatter {
  const enabledRules = rules
    .filter((rule) => rule.enabled)
    .slice()
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))

  const elementRules = enabledRules.filter((rule) => rule.target === "element")

  const fieldRulesByColumnId = new Map<string, ConditionalFormatRule[]>()
  for (const rule of enabledRules) {
    if (rule.target !== "field") continue
    const columnRules = fieldRulesByColumnId.get(rule.columnId) ?? []
    columnRules.push(rule)
    fieldRulesByColumnId.set(rule.columnId, columnRules)
  }

  if (elementRules.length === 0 && fieldRulesByColumnId.size === 0) {
    return NO_ELEMENT_FORMATTER
  }

  return (entry: ContentEntry): ElementFormat => {
    const valueByColumnId = new Map<string, unknown>()
    const resolveValue = (rule: ConditionalFormatRule): unknown => {
      if (valueByColumnId.has(rule.columnId)) return valueByColumnId.get(rule.columnId)
      const rawValue = getEntryValueForColumn(entry, rule.columnId)
      const value =
        rule.group.type === "tags" && typeof rawValue === "string" ? parseTagsValue(rawValue) : rawValue
      valueByColumnId.set(rule.columnId, value)
      return value
    }

    let element: ElementStyle | null = null
    for (const rule of elementRules) {
      if (matchesFilterGroupStrict(resolveValue(rule), rule.group)) {
        element = { tone: rule.tone, textStyles: rule.textStyles ?? [] }
        break
      }
    }

    const fields: Record<string, ElementStyle> = {}
    for (const [columnId, columnRules] of fieldRulesByColumnId) {
      for (const rule of columnRules) {
        if (matchesFilterGroupStrict(resolveValue(rule), rule.group)) {
          fields[columnId] = { tone: rule.tone, textStyles: rule.textStyles ?? [] }
          break
        }
      }
    }

    return { element, fields }
  }
}

export function getConditionalFormatRowClass(
  tone: ConditionalFormatTone,
  textStyles: readonly ConditionalFormatTextStyle[] = []
): string {
  // Evita border su <tr> (poco affidabile nelle tabelle HTML).
  // Usiamo una tinta di sfondo più percepibile e robusta.
  const styleClass = getTextStylesClass(textStyles)
  switch (tone) {
    case "success":
      return `bg-emerald-500/12 hover:bg-emerald-500/16 ${styleClass}`.trim()
    case "warning":
      return `bg-amber-500/12 hover:bg-amber-500/16 ${styleClass}`.trim()
    case "danger":
      return `bg-destructive/12 hover:bg-destructive/16 ${styleClass}`.trim()
    case "info":
      return `bg-sky-500/12 hover:bg-sky-500/16 ${styleClass}`.trim()
    case "neutral":
    default:
      return `bg-muted/35 hover:bg-muted/45 ${styleClass}`.trim()
  }
}

export function getConditionalFormatCellClass(
  tone: ConditionalFormatTone,
  textStyles: readonly ConditionalFormatTextStyle[] = []
): string {
  // Enfasi sul valore, senza cambiare layout.
  const styleClass = getTextStylesClass(textStyles)
  const forceBadgeInheritClass =
    "[&_[data-slot=badge]]:!text-inherit [&_[data-slot=badge]]:!bg-transparent [&_[data-slot=badge]]:!border-current"
  switch (tone) {
    case "success":
      return `font-medium text-emerald-700 dark:text-emerald-300 ${styleClass} ${forceBadgeInheritClass}`.trim()
    case "warning":
      return `font-medium text-amber-800 dark:text-amber-200 ${styleClass} ${forceBadgeInheritClass}`.trim()
    case "danger":
      return `font-medium text-destructive ${styleClass} ${forceBadgeInheritClass}`.trim()
    case "info":
      return `font-medium text-sky-800 dark:text-sky-200 ${styleClass} ${forceBadgeInheritClass}`.trim()
    case "neutral":
    default:
      return `font-medium ${styleClass} ${forceBadgeInheritClass}`.trim()
  }
}

/**
 * Card surface for Gallery/Kanban: an opaque tint layered over the card's own `bg-card`, never a
 * background colour that replaces it. The border colour carries the tone; the card owns its hover.
 */
export function getConditionalFormatCardClass(
  tone: ConditionalFormatTone,
  textStyles: readonly ConditionalFormatTextStyle[] = []
): string {
  const styleClass = getTextStylesClass(textStyles)
  switch (tone) {
    case "success":
      return `border-emerald-500/50 bg-linear-to-b from-emerald-500/12 to-emerald-500/12 ${styleClass}`.trim()
    case "warning":
      return `border-amber-500/50 bg-linear-to-b from-amber-500/12 to-amber-500/12 ${styleClass}`.trim()
    case "danger":
      return `border-destructive/50 bg-linear-to-b from-destructive/12 to-destructive/12 ${styleClass}`.trim()
    case "info":
      return `border-sky-500/50 bg-linear-to-b from-sky-500/12 to-sky-500/12 ${styleClass}`.trim()
    case "neutral":
    default:
      return `border-muted-foreground/30 bg-linear-to-b from-muted/50 to-muted/50 ${styleClass}`.trim()
  }
}
