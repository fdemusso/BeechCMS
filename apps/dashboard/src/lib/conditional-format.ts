// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ToolbarFilterGroup } from "@/lib/filter-dsl"

export type ConditionalFormatTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"

export type ConditionalFormatTarget = "cell" | "row"
export type ConditionalFormatTextStyle = "bold" | "italic" | "underline"

export interface ConditionalFormatRule {
  id: string
  enabled: boolean
  /** Priorità crescente: 0 vince su 10. */
  priority: number
  label?: string
  /** Colonna su cui valutare la condizione e (se target include cell) colonna da evidenziare. */
  columnId: string
  /** Condizioni AND, identiche ai filtri toolbar. */
  group: ToolbarFilterGroup
  tone: ConditionalFormatTone
  target: ConditionalFormatTarget
  textStyles?: ConditionalFormatTextStyle[]
}

function getTextStylesClass(
  textStyles: ConditionalFormatTextStyle[] = []
): string {
  const classes: string[] = []
  if (textStyles.includes("bold")) classes.push("font-bold")
  if (textStyles.includes("italic")) classes.push("italic")
  if (textStyles.includes("underline")) classes.push("underline")
  return classes.join(" ")
}

export function getConditionalFormatRowClass(
  tone: ConditionalFormatTone,
  textStyles: ConditionalFormatTextStyle[] = []
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
  textStyles: ConditionalFormatTextStyle[] = []
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

