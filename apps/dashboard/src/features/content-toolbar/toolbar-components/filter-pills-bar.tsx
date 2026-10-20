// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Plus, Trash2, X } from 'reicon-react'
import { Button } from "@/components/ui/button"
import { Pill } from "@/components/ui/pill"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FilterConditionInput } from "./filter-condition-input"
import type {
  ToolbarFilterCondition,
  ToolbarFilterGroup,
  ToolbarFiltersState,
} from "../shared"
import { getOperatorOptions, operatorRequiresValue, MAX_CONDITIONS_PER_FILTER } from "../shared"

interface FilterPillsBarProps {
  readonly filters: ToolbarFiltersState
  readonly openPillId: string | null
  readonly onOpenPillChange: (value: string | null) => void
  readonly addConditionToColumn: (columnId: string) => void
  readonly removeColumnFilters: (columnId: string) => void
  readonly updateCondition: (
    columnId: string,
    conditionId: string,
    patch: Partial<Pick<ToolbarFilterCondition, "op" | "value">>
  ) => void
  readonly removeCondition: (columnId: string, conditionId: string) => void
  readonly availableTagsByColumnId: Record<string, string[]>
  readonly children?: ReactNode
}

export function FilterPillsBar({
  filters,
  openPillId,
  onOpenPillChange,
  addConditionToColumn,
  removeColumnFilters,
  updateCondition,
  removeCondition,
  availableTagsByColumnId,
  children,
}: FilterPillsBarProps) {
  return (
    <div className="mb-2 flex min-h-9 flex-wrap items-center gap-2">
      {Object.entries(filters).map(([columnId, group]) => (
        <FilterPill
          key={columnId}
          group={group}
          isOpen={openPillId === columnId}
          onOpenChange={(isOpen) => onOpenPillChange(isOpen ? columnId : null)}
          addConditionToColumn={addConditionToColumn}
          removeColumnFilters={removeColumnFilters}
          updateCondition={updateCondition}
          removeCondition={removeCondition}
          availableTagsByColumnId={availableTagsByColumnId}
        />
      ))}
      {children}
    </div>
  )
}

interface FilterPillProps {
  readonly group: ToolbarFilterGroup
  readonly isOpen: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly addConditionToColumn: (columnId: string) => void
  readonly removeColumnFilters: (columnId: string) => void
  readonly updateCondition: (
    columnId: string,
    conditionId: string,
    patch: Partial<Pick<ToolbarFilterCondition, "op" | "value">>
  ) => void
  readonly removeCondition: (columnId: string, conditionId: string) => void
  readonly availableTagsByColumnId: Record<string, string[]>
}

function FilterPill({
  group,
  isOpen,
  onOpenChange,
  addConditionToColumn,
  removeColumnFilters,
  updateCondition,
  removeCondition,
  availableTagsByColumnId,
}: FilterPillProps) {
  const { t } = useTranslation()
  return (
    <DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Pill
          label={group.label}
          trailing={group.conditions.length}
          aria-label={t("toolbar.filter.ariaLabel", { label: group.label })}
          action={{
            icon: <Trash2 className="size-3.5" />,
            label: t("toolbar.filter.removeColumn"),
            tone: "destructive",
            onClick: () => removeColumnFilters(group.columnId),
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[420px] p-2">
        <div className="mb-2 flex items-center gap-2">
          <DropdownMenuLabel className="px-0 py-0 text-xs font-medium text-muted-foreground">
            {t("toolbar.filter.filtersOn", { label: group.label })}
          </DropdownMenuLabel>
        </div>

        <div className="space-y-2">
          {group.conditions.map((cond) => {
            const ops = getOperatorOptions(group.type, t)
            const showValueInput = operatorRequiresValue(cond.op)
            return (
              <div key={cond.id} className="flex items-center gap-2">
                <Select
                  value={cond.op}
                  onValueChange={(v) =>
                    updateCondition(group.columnId, cond.id, {
                      op: v as ToolbarFilterCondition["op"],
                      value: v === "is_empty" || v === "is_not_empty" ? null : cond.value,
                    })
                  }
                >
                  <SelectTrigger size="sm" className="h-8 w-40 !rounded-lg text-xs">
                    <SelectValue placeholder={t("toolbar.filter.operator")} />
                  </SelectTrigger>
                  <SelectContent>
                    {ops.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {showValueInput ? (
                  <FilterConditionInput
                    type={group.type}
                    value={cond.value}
                    onChange={(value) => updateCondition(group.columnId, cond.id, { value })}
                    selectOptions={group.selectOptions}
                    availableTags={availableTagsByColumnId[group.columnId] ?? []}
                    className="h-8 flex-1"
                    textClassName="text-sm"
                  />
                ) : (
                  <div className="h-8 flex-1" />
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="h-8 w-8"
                  aria-label={t("toolbar.filter.removeCondition")}
                  onClick={() => removeCondition(group.columnId, cond.id)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            )
          })}

          <DropdownMenuSeparator />
          <div className="flex justify-center gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-36 justify-center"
              disabled={group.conditions.length >= MAX_CONDITIONS_PER_FILTER}
              onClick={() => addConditionToColumn(group.columnId)}
            >
              <Plus className="size-4" />
              {t("toolbar.filter.addFilter")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-36 justify-center border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => removeColumnFilters(group.columnId)}
            >
              <Trash2 className="size-4" />
              {t("toolbar.filter.removeAll")}
            </Button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
