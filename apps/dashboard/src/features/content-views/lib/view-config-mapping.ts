// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { VisibilityState } from "@tanstack/react-table"
import {
  findBranchById,
  MAX_VIEW_CONDITIONS,
  VIEW_SYSTEM_COLUMNS,
  viewColumnRefSchema,
  type ContentViewConfig,
  type DashboardView,
  type KanbanCardConfig,
  type KanbanViewConfig,
  type Seed,
  type ViewColumnRef,
  type ViewConditionalFormat,
  type ViewFilter,
} from "@beechcms/core"
import { buildFilterableColumns, type FilterableColumn, type ToolbarFilterGroup } from "@/lib/filter-dsl"
import type { ConditionalFormatRule } from "@/lib/conditional-format"
import { DEFAULT_DATE_GROUP_PRECISION, type DateGroupPrecision } from "@/lib/dynamic-columns"
import type { TableDensity } from "@/lib/density"

/** Alias-keyed state the toolbar hooks hold for one view instance. */
export interface ViewToolbarState {
  filters: Record<string, ToolbarFilterGroup>
  sort: { id: string; desc: boolean } | null
  groupBy: string | null
  dateGroupPrecision: DateGroupPrecision
  /** undefined → the table's built-in default hidden set. */
  columnVisibility: VisibilityState | undefined
  density: TableDensity | undefined
  pageSize: number | undefined
  conditionalFormats: ConditionalFormatRule[]
  kanban: KanbanViewConfig | undefined
  card: KanbanCardConfig | undefined
}

// Limits mirrored from contentViewConfigSchema. A value past them would make the whole PATCH 422.
const MAX_FILTERS = 50
const MAX_FORMATS = 50
const MAX_HIDDEN_COLUMNS = 200
const MAX_STRING_VALUE = 500
const MAX_RULE_ID = 64
const MAX_RULE_LABEL = 60
const MAX_PRIORITY = 1000

/** Matches the `?status=` prefilter: hydration runs before facets load, so options cannot come from data. */
const HYDRATION_STATUS_OPTIONS = ["draft", "published"]
/** Never persisted: VIEW_SYSTEM_COLUMNS has no `id`, and the toolbar cannot show it. */
const ALWAYS_HIDDEN_COLUMN = "id"

const SYSTEM_COLUMNS = new Set<string>(VIEW_SYSTEM_COLUMNS)
const DATE_SYSTEM_COLUMNS = new Set<string>(["created_at", "updated_at"])

export function columnIdToRef(seed: Seed, columnId: string): ViewColumnRef | null {
  const ref = SYSTEM_COLUMNS.has(columnId)
    ? columnId
    : seed.branches.find((branch) => branch.alias === columnId)?.id
  return ref !== undefined && viewColumnRefSchema.safeParse(ref).success ? (ref as ViewColumnRef) : null
}

export function refToColumnId(seed: Seed, ref: string): string | null {
  if (SYSTEM_COLUMNS.has(ref)) return ref
  return findBranchById(seed, ref)?.alias ?? null
}

function isDateRef(seed: Seed, ref: string): boolean {
  return DATE_SYSTEM_COLUMNS.has(ref) || findBranchById(seed, ref)?.type === "date"
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function toViewConditions(conditions: ToolbarFilterGroup["conditions"]): ViewFilter["conditions"] {
  return conditions.slice(0, MAX_VIEW_CONDITIONS).map(({ op, value }) => ({
    op,
    value: typeof value === "string" ? value.slice(0, MAX_STRING_VALUE) : value,
  }))
}

/**
 * Condition ids are derived from position, so hydrating the same config twice yields the same
 * ids and React keys stay stable across remounts.
 */
function toToolbarGroup(
  column: FilterableColumn,
  conditions: ViewFilter["conditions"],
  idPrefix: string
): ToolbarFilterGroup {
  return {
    columnId: column.columnId,
    label: column.label,
    type: column.type,
    selectOptions: column.selectOptions,
    conditions: conditions.map((condition, index) => ({ id: `${idPrefix}:${index}`, ...condition })),
  }
}

/** Persisted (Branch-ID) config → alias-keyed toolbar state. Unknown refs are dropped. */
export function toViewToolbarState(config: ContentViewConfig, seed: Seed): ViewToolbarState {
  const columns = new Map(buildFilterableColumns(seed, HYDRATION_STATUS_OPTIONS).map((c) => [c.columnId, c]))
  const columnFor = (ref: string): FilterableColumn | undefined => {
    const columnId = refToColumnId(seed, ref)
    return columnId === null ? undefined : columns.get(columnId)
  }

  const filters: Record<string, ToolbarFilterGroup> = {}
  for (const filter of config.filters) {
    const column = columnFor(filter.columnRef)
    if (column) filters[column.columnId] = toToolbarGroup(column, filter.conditions, filter.columnRef)
  }

  const sortId = config.sort ? refToColumnId(seed, config.sort.columnRef) : null
  const groupBy = config.groupBy ? refToColumnId(seed, config.groupBy.columnRef) : null

  const hidden = config.appearance.hiddenColumns
  const columnVisibility: VisibilityState | undefined =
    hidden === undefined
      ? undefined
      : Object.fromEntries([
          [ALWAYS_HIDDEN_COLUMN, false],
          ...hidden.flatMap((ref) => {
            const columnId = refToColumnId(seed, ref)
            return columnId === null ? [] : [[columnId, false] as const]
          }),
        ])

  const conditionalFormats = config.conditionalFormats.flatMap((rule): ConditionalFormatRule[] => {
    const column = columnFor(rule.columnRef)
    if (!column) return []
    return [{
      id: rule.id,
      enabled: rule.enabled,
      priority: rule.priority,
      label: rule.label,
      columnId: column.columnId,
      group: toToolbarGroup(column, rule.conditions, rule.id),
      tone: rule.tone,
      target: rule.target,
      textStyles: rule.textStyles,
    }]
  })

  return {
    filters,
    sort: config.sort && sortId !== null ? { id: sortId, desc: config.sort.desc } : null,
    groupBy,
    dateGroupPrecision: config.groupBy?.datePrecision ?? DEFAULT_DATE_GROUP_PRECISION,
    columnVisibility,
    density: config.appearance.density,
    pageSize: config.appearance.pageSize,
    conditionalFormats,
    kanban: config.kanban,
    card: config.card,
  }
}

/** Alias-keyed toolbar state → persisted (Branch-ID) config. Unresolvable refs and empty groups are dropped. */
export function toContentViewConfig(state: ViewToolbarState, seed: Seed, type: DashboardView): ContentViewConfig {
  const filters: ViewFilter[] = Object.values(state.filters)
    .flatMap((group): ViewFilter[] => {
      const columnRef = columnIdToRef(seed, group.columnId)
      const conditions = toViewConditions(group.conditions)
      return columnRef !== null && conditions.length > 0 ? [{ columnRef, conditions }] : []
    })
    .slice(0, MAX_FILTERS)

  const sortRef = state.sort ? columnIdToRef(seed, state.sort.id) : null
  const groupRef = state.groupBy !== null ? columnIdToRef(seed, state.groupBy) : null

  const hiddenColumns =
    state.columnVisibility === undefined
      ? undefined
      : [
          ...new Set(
            Object.entries(state.columnVisibility).flatMap(([columnId, visible]) => {
              if (visible !== false || columnId === ALWAYS_HIDDEN_COLUMN) return []
              const ref = columnIdToRef(seed, columnId)
              return ref === null ? [] : [ref]
            })
          ),
        ].slice(0, MAX_HIDDEN_COLUMNS)

  const conditionalFormats = state.conditionalFormats
    .flatMap((rule): ViewConditionalFormat[] => {
      const columnRef = columnIdToRef(seed, rule.columnId)
      const conditions = toViewConditions(rule.group.conditions)
      if (columnRef === null || conditions.length === 0) return []
      return [{
        id: rule.id.slice(0, MAX_RULE_ID),
        enabled: rule.enabled,
        priority: clampInt(rule.priority, 0, MAX_PRIORITY),
        ...(rule.label ? { label: rule.label.slice(0, MAX_RULE_LABEL) } : {}),
        columnRef,
        conditions,
        tone: rule.tone,
        target: rule.target,
        textStyles: rule.textStyles ?? [],
      }]
    })
    .slice(0, MAX_FORMATS)

  const config: ContentViewConfig = {
    filters,
    sort: state.sort && sortRef !== null ? { columnRef: sortRef, desc: state.sort.desc } : null,
    groupBy:
      groupRef === null
        ? null
        : isDateRef(seed, groupRef)
          ? { columnRef: groupRef, datePrecision: state.dateGroupPrecision }
          : { columnRef: groupRef },
    appearance: {
      ...(state.density !== undefined ? { density: state.density } : {}),
      ...(hiddenColumns !== undefined ? { hiddenColumns } : {}),
      ...(state.pageSize !== undefined ? { pageSize: clampInt(state.pageSize, 1, 100) } : {}),
    },
    conditionalFormats,
  }
  if (type === "kanban") {
    if (state.kanban) config.kanban = state.kanban
    if (state.card) config.card = state.card
  }
  return config
}
