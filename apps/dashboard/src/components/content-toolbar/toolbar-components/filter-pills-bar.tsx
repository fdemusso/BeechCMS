import { ListTree, Plus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { getOperatorOptions, operatorRequiresValue } from "../shared"

interface FilterPillsBarProps {
  readonly filters: ToolbarFiltersState
  readonly openPillId: string | null
  readonly onOpenPillChange: (value: string | null) => void
  readonly groupBy: string | null
  readonly activeGroupLabel: string
  readonly onGroupByChange?: (columnId: string | null) => void
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

export function FilterPillsBar({
  filters,
  openPillId,
  onOpenPillChange,
  groupBy,
  activeGroupLabel,
  onGroupByChange,
  addConditionToColumn,
  removeColumnFilters,
  updateCondition,
  removeCondition,
  availableTagsByColumnId,
}: FilterPillsBarProps) {
  return (
    <div className="mb-2 flex min-h-9 flex-wrap items-center gap-2">
      {groupBy && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-full px-3 text-xs"
          onClick={() => onGroupByChange?.(null)}
        >
          <ListTree className="size-3.5" />
          Raggruppato per: {activeGroupLabel}
          <X className="size-3.5 opacity-70" />
        </Button>
      )}

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
  return (
    <DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className="h-8 rounded-full px-3 text-xs"
          aria-label={`Filtro ${group.label}`}
        >
          <span className="truncate">{group.label}</span>
          <span className="opacity-70">{group.conditions.length}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[420px] p-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <DropdownMenuLabel className="px-0 py-0 text-xs font-medium text-muted-foreground">
            Filtri su "{group.label}"
          </DropdownMenuLabel>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="h-7 w-7"
            aria-label="Rimuovi colonna dai filtri"
            onClick={() => removeColumnFilters(group.columnId)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>

        <div className="space-y-2">
          {group.conditions.map((cond) => {
            const ops = getOperatorOptions(group.type)
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
                  <SelectTrigger size="sm" className="h-8 w-40 text-xs">
                    <SelectValue placeholder="Operatore" />
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
                  aria-label="Rimuovi condizione"
                  onClick={() => removeCondition(group.columnId, cond.id)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            )
          })}

          <DropdownMenuSeparator />
          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => addConditionToColumn(group.columnId)}
            >
              <Plus className="size-4" />
              Aggiungi filtro
            </Button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
