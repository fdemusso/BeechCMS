// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import type { Seed } from "@beechcms/core"
import type {
  FilterOperator,
  ToolbarFilterCondition,
  ToolbarFiltersState,
} from "@/features/content-toolbar/shared"
import {
  generateConditionId,
  buildFilterableColumns,
  type FilterableColumn,
} from "@/features/content-toolbar/shared"

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
  const filterableColumns = React.useMemo<FilterableColumn[]>(
    () => buildFilterableColumns(seed, availableStatusOptions),
    [seed, availableStatusOptions]
  )

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
