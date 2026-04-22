import * as React from "react"
import { resolvePolicies } from "@beech/core"
import type { Seed } from "@beech/core"
import type {
  FilterGroupType,
  FilterOperator,
  ToolbarFilterCondition,
  ToolbarFiltersState,
} from "@/components/content-toolbar/shared"
import { generateConditionId } from "@/components/content-toolbar/shared"

interface FilterableColumn {
  columnId: string
  label: string
  type: FilterGroupType
  selectOptions?: string[]
}

type FormattableType = "select" | "number" | "date" | "boolean" | "tags"

export interface FormattableColumn {
  columnId: string
  label: string
  type: FormattableType
  selectOptions?: string[]
}

interface UseToolbarFiltersOptions {
  seed: Seed
  filters: ToolbarFiltersState
  onFiltersChange?: (state: ToolbarFiltersState) => void
  availableStatusOptions?: string[]
}

export function useToolbarFilters({
  seed,
  filters,
  onFiltersChange,
  availableStatusOptions = [],
}: UseToolbarFiltersOptions) {
  const filterableColumns = React.useMemo<FilterableColumn[]>(() => {
    const columns: FilterableColumn[] = [
      { columnId: "slug", label: "Slug", type: "system" },
      {
        columnId: "status",
        label: "Stato",
        type: "select",
        selectOptions: availableStatusOptions,
      },
    ]

    for (const branch of seed.branches) {
      if (!resolvePolicies(branch).filter) continue
      const alias = branch.alias
      if (branch.type === "number") {
        columns.push({ columnId: alias, label: branch.label, type: "number" })
      } else if (branch.type === "date") {
        columns.push({ columnId: alias, label: branch.label, type: "date" })
      } else if (branch.type === "boolean") {
        columns.push({ columnId: alias, label: branch.label, type: "boolean" })
      } else if (branch.type === "json" && alias.toLowerCase().includes("tag")) {
        columns.push({ columnId: alias, label: branch.label, type: "tags" })
      } else {
        columns.push({ columnId: alias, label: branch.label, type: "text" })
      }
    }

    return columns
  }, [availableStatusOptions, seed.branches])

  const formattableColumns = React.useMemo<FormattableColumn[]>(() => {
    const allowed = new Set<FormattableType>(["select", "number", "date", "boolean", "tags"])
    return filterableColumns.filter((c): c is FormattableColumn => allowed.has(c.type as FormattableType))
  }, [filterableColumns])

  const addConditionToColumn = React.useCallback(
    (columnId: string) => {
      const col = filterableColumns.find((c) => c.columnId === columnId)
      if (!col || !onFiltersChange) return

      const existing = filters[columnId]
      const defaultOp: FilterOperator = col.type === "tags" ? "contains" : "eq"
      const nextCondition: ToolbarFilterCondition = {
        id: generateConditionId(),
        op: defaultOp,
        value: null,
      }

      const nextState: ToolbarFiltersState = {
        ...filters,
        [columnId]: existing
          ? {
              ...existing,
              conditions: [...existing.conditions, nextCondition],
            }
          : {
              columnId,
              label: col.label,
              type: col.type,
              selectOptions: col.selectOptions,
              conditions: [nextCondition],
            },
      }
      onFiltersChange(nextState)
    },
    [filterableColumns, filters, onFiltersChange]
  )

  const removeColumnFilters = React.useCallback(
    (columnId: string) => {
      if (!onFiltersChange || !filters[columnId]) return
      const next = { ...filters }
      delete next[columnId]
      onFiltersChange(next)
    },
    [filters, onFiltersChange]
  )

  const updateCondition = React.useCallback(
    (
      columnId: string,
      conditionId: string,
      patch: Partial<Pick<ToolbarFilterCondition, "op" | "value">>
    ) => {
      if (!onFiltersChange) return
      const group = filters[columnId]
      if (!group) return

      const nextConditions = group.conditions.map((c) =>
        c.id === conditionId ? { ...c, ...patch } : c
      )
      onFiltersChange({
        ...filters,
        [columnId]: { ...group, conditions: nextConditions },
      })
    },
    [filters, onFiltersChange]
  )

  const removeCondition = React.useCallback(
    (columnId: string, conditionId: string) => {
      if (!onFiltersChange) return
      const group = filters[columnId]
      if (!group) return
      const nextConditions = group.conditions.filter((c) => c.id !== conditionId)

      if (nextConditions.length === 0) {
        const next = { ...filters }
        delete next[columnId]
        onFiltersChange(next)
        return
      }

      onFiltersChange({
        ...filters,
        [columnId]: { ...group, conditions: nextConditions },
      })
    },
    [filters, onFiltersChange]
  )

  return {
    filterableColumns,
    formattableColumns,
    addConditionToColumn,
    removeColumnFilters,
    updateCondition,
    removeCondition,
  }
}
