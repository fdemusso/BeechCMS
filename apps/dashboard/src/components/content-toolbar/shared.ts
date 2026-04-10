import type { Seed } from "@beech/core"
import type {
  ConditionalFormatRule,
  ConditionalFormatTarget,
  ConditionalFormatTextStyle,
  ConditionalFormatTone,
} from "@/lib/conditional-format"

export type ViewType = "table" | "gallery" | "grid" | "kanban" | "chart"
export type ToolbarTool =
  | "filter"
  | "sort"
  | "automation"
  | "search"
  | "settings"
  | "create"

export interface UserViewInstance {
  id: string
  label: string
  type: ViewType
  enabledTools: ToolbarTool[]
  conditionalFormats?: ConditionalFormatRule[]
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

export const DEFAULT_ENABLED_TOOLS: ToolbarTool[] = [
  "filter",
  "sort",
  "automation",
  "search",
  "settings",
  "create",
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
  return value === "cell" ? "cell" : "row"
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

export function operatorRequiresValue(op: FilterOperator): boolean {
  return op !== "is_empty" && op !== "is_not_empty"
}

export function getOperatorOptions(
  type: FilterGroupType
): Array<{ value: FilterOperator; label: string }> {
  const baseOptions: Array<{ value: FilterOperator; label: string }> = [
    { value: "eq", label: "Uguale a" },
    { value: "is_not_empty", label: "È pieno" },
    { value: "is_empty", label: "Non è pieno" },
  ]

  if (type === "number" || type === "date") {
    return [
      { value: "gt", label: "Maggiore di" },
      { value: "lt", label: "Minore di" },
      { value: "gte", label: "Maggiore o uguale" },
      { value: "lte", label: "Minore o uguale" },
      ...baseOptions,
    ]
  }

  if (type === "tags") {
    return [
      { value: "contains", label: "Contiene" },
      { value: "is_not_empty", label: "È pieno" },
      { value: "is_empty", label: "Non è pieno" },
    ]
  }

  if (type === "select") {
    return [
      { value: "eq", label: "Uguale a" },
      { value: "is_not_empty", label: "È pieno" },
      { value: "is_empty", label: "Non è pieno" },
    ]
  }

  if (type === "text" || type === "system") {
    return [{ value: "contains", label: "Contiene" }, ...baseOptions]
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
  availableStatusOptions: string[] = []
): GroupableColumn[] {
  const result: GroupableColumn[] = []
  const statusSection: GroupableSection =
    availableStatusOptions.length > 0 && availableStatusOptions.length <= 8
      ? "recommended"
      : "other"
  result.push({ columnId: "status", label: "Stato", section: statusSection })

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
