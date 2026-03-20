import {
  Bold,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Italic,
  Plus,
  Trash2,
  Underline,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
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
import type { ReactNode } from "react"
import type { ConditionalFormatRule, ConditionalFormatTone } from "@/lib/conditional-format"
import {
  getConditionalFormatCellClass,
  getConditionalFormatRowClass,
} from "@/lib/conditional-format"
import { FilterConditionInput } from "./filter-condition-input"
import {
  CONDITIONAL_TONE_OPTIONS,
  getConditionalToneStripClass,
  getOperatorOptions,
  operatorRequiresValue,
} from "./shared"
import type { FilterOperator, ToolbarFilterCondition } from "./shared"
import type { FormattableColumn } from "@/hooks/use-toolbar-filters"

interface ConditionalFormatsEditorProps {
  readonly enabled: boolean
  readonly formattableColumns: FormattableColumn[]
  readonly conditionalFormats: ConditionalFormatRule[]
  readonly activeConditionalRule: ConditionalFormatRule | null
  readonly isConditionalEditorOpen: boolean
  readonly setIsConditionalEditorOpen: (open: boolean) => void
  readonly setActiveConditionalRuleId: (ruleId: string | null) => void
  readonly addConditionalFormatRule: (columnId: string) => void
  readonly updateConditionalRule: (ruleId: string, patch: Partial<ConditionalFormatRule>) => void
  readonly updateConditionalTextStyles: (ruleId: string, nextStyles: string[]) => void
  readonly removeConditionalRule: (ruleId: string) => void
  readonly moveConditionalRule: (ruleId: string, dir: -1 | 1) => void
  readonly updateConditionalCondition: (
    ruleId: string,
    conditionId: string,
    patch: Partial<Pick<ToolbarFilterCondition, "op" | "value">>
  ) => void
  readonly addConditionalCondition: (ruleId: string) => void
  readonly removeConditionalCondition: (ruleId: string, conditionId: string) => void
  readonly availableTagsByColumnId: Record<string, string[]>
}

interface ConditionalRulesEmptyStateProps {
  readonly formattableColumns: FormattableColumn[]
  readonly addConditionalFormatRule: (columnId: string) => void
}

function ConditionalRulesEmptyState({
  formattableColumns,
  addConditionalFormatRule,
}: ConditionalRulesEmptyStateProps) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-md border border-dashed">
      <div className="text-sm text-muted-foreground">Non ci sono regole</div>
      <ColumnPicker columns={formattableColumns} onSelect={addConditionalFormatRule} compact />
    </div>
  )
}

interface ConditionalRulesListProps {
  readonly conditionalFormats: ConditionalFormatRule[]
  readonly setActiveConditionalRuleId: (ruleId: string | null) => void
  readonly setIsConditionalEditorOpen: (open: boolean) => void
}

function ConditionalRulesList({
  conditionalFormats,
  setActiveConditionalRuleId,
  setIsConditionalEditorOpen,
}: ConditionalRulesListProps) {
  return (
    <div className="space-y-2">
      {conditionalFormats.map((rule, idx) => (
        <button
          key={rule.id}
          type="button"
          className="flex h-14 w-full overflow-hidden rounded-md border text-left transition-colors hover:bg-muted/40"
          onClick={() => {
            setActiveConditionalRuleId(rule.id)
            setIsConditionalEditorOpen(true)
          }}
        >
          <div className={`w-1/3 ${getConditionalToneStripClass(rule.tone)}`} />
          <div className="flex flex-1 items-center justify-between px-3">
            <span className="truncate text-sm">{rule.label || rule.group.label}</span>
            <span className="text-[10px] text-muted-foreground">#{idx + 1}</span>
          </div>
        </button>
      ))}
    </div>
  )
}

interface ConditionalRuleEditorProps {
  readonly activeConditionalRule: ConditionalFormatRule
  readonly conditionalFormats: ConditionalFormatRule[]
  readonly updateConditionalRule: (ruleId: string, patch: Partial<ConditionalFormatRule>) => void
  readonly moveConditionalRule: (ruleId: string, dir: -1 | 1) => void
  readonly removeConditionalRule: (ruleId: string) => void
  readonly updateConditionalCondition: (
    ruleId: string,
    conditionId: string,
    patch: Partial<Pick<ToolbarFilterCondition, "op" | "value">>
  ) => void
  readonly addConditionalCondition: (ruleId: string) => void
  readonly removeConditionalCondition: (ruleId: string, conditionId: string) => void
  readonly updateConditionalTextStyles: (ruleId: string, nextStyles: string[]) => void
  readonly setIsConditionalEditorOpen: (open: boolean) => void
  readonly availableTagsByColumnId: Record<string, string[]>
}

function ConditionalRuleEditor({
  activeConditionalRule,
  conditionalFormats,
  updateConditionalRule,
  moveConditionalRule,
  removeConditionalRule,
  updateConditionalCondition,
  addConditionalCondition,
  removeConditionalCondition,
  updateConditionalTextStyles,
  setIsConditionalEditorOpen,
  availableTagsByColumnId,
}: ConditionalRuleEditorProps) {
  return (
    <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setIsConditionalEditorOpen(false)}
        >
          Elenco regole
        </Button>
        <span className="text-[11px] text-muted-foreground">Modifica regola</span>
      </div>
      <div className="flex items-center gap-2">
        <Toggle
          pressed={activeConditionalRule.enabled}
          onPressedChange={(pressed) =>
            updateConditionalRule(activeConditionalRule.id, {
              enabled: pressed,
            })
          }
          variant="outline"
          size="sm"
          aria-label="Attiva/disattiva regola"
          className="h-7 w-7 px-0"
        >
          {activeConditionalRule.enabled ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </Toggle>
        <Input
          value={activeConditionalRule.label ?? ""}
          onChange={(e) =>
            updateConditionalRule(activeConditionalRule.id, {
              label: e.target.value,
            })
          }
          className="h-7 text-xs"
          placeholder="Nome regola"
        />
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="h-7 w-7"
            onClick={() => moveConditionalRule(activeConditionalRule.id, -1)}
            disabled={conditionalFormats.findIndex((r) => r.id === activeConditionalRule.id) === 0}
            aria-label="Sposta su"
          >
            <ChevronUp className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="h-7 w-7"
            onClick={() => moveConditionalRule(activeConditionalRule.id, 1)}
            disabled={
              conditionalFormats.findIndex((r) => r.id === activeConditionalRule.id) ===
              conditionalFormats.length - 1
            }
            aria-label="Sposta giù"
          >
            <ChevronDown className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => removeConditionalRule(activeConditionalRule.id)}
            aria-label="Elimina regola"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium">Applica a</div>
        <div className="inline-flex rounded-md border p-0.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={
              activeConditionalRule.target === "cell"
                ? "h-7 px-3 text-xs bg-black text-white hover:bg-black/90 hover:text-white"
                : "h-7 px-3 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            }
            onClick={() => updateConditionalRule(activeConditionalRule.id, { target: "cell" })}
          >
            Cella
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={
              activeConditionalRule.target === "row"
                ? "h-7 px-3 text-xs bg-black text-white hover:bg-black/90 hover:text-white"
                : "h-7 px-3 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            }
            onClick={() => updateConditionalRule(activeConditionalRule.id, { target: "row" })}
          >
            Riga
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium">usa colore se</div>
        <div className="h-8 rounded-md border bg-muted/20 px-2 text-xs flex items-center">
          <span className="truncate">{activeConditionalRule.group.label}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {activeConditionalRule.group.conditions.map((cond) => {
          const ops = getOperatorOptions(activeConditionalRule.group.type)
          const showValueInput = operatorRequiresValue(cond.op)

          return (
            <div key={cond.id} className="flex items-center gap-2">
              <Select
                value={cond.op}
                onValueChange={(v) =>
                  updateConditionalCondition(activeConditionalRule.id, cond.id, {
                    op: v as FilterOperator,
                    value: v === "is_empty" || v === "is_not_empty" ? null : cond.value,
                  })
                }
              >
                <SelectTrigger size="sm" className="h-8 w-36 text-xs">
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
                  type={activeConditionalRule.group.type}
                  value={cond.value}
                  onChange={(value) =>
                    updateConditionalCondition(activeConditionalRule.id, cond.id, { value })
                  }
                  selectOptions={activeConditionalRule.group.selectOptions ?? []}
                  availableTags={availableTagsByColumnId[activeConditionalRule.columnId] ?? []}
                  className="h-8 flex-1"
                  textClassName="text-xs"
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
                onClick={() => removeConditionalCondition(activeConditionalRule.id, cond.id)}
              >
                <X className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="h-8 w-8"
                aria-label="Aggiungi condizione"
                onClick={() => addConditionalCondition(activeConditionalRule.id)}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          )
        })}
      </div>

      <div className="space-y-1 pt-1">
        <div className="text-xs font-medium">stile di formattazione</div>
        <div className="rounded-md border border-dashed p-2">
          <div
            className={`flex min-h-12 items-center rounded-md border px-3 ${
              activeConditionalRule.target === "row"
                ? getConditionalFormatRowClass(
                    activeConditionalRule.tone,
                    activeConditionalRule.textStyles ?? []
                  )
                : ""
            }`}
          >
            <span
              className={
                activeConditionalRule.target === "cell"
                  ? getConditionalFormatCellClass(
                      activeConditionalRule.tone,
                      activeConditionalRule.textStyles ?? []
                    )
                  : "font-medium"
              }
            >
              Predefinito
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <Select
              value={activeConditionalRule.tone}
              onValueChange={(v) =>
                updateConditionalRule(activeConditionalRule.id, {
                  tone: v as ConditionalFormatTone,
                })
              }
            >
              <SelectTrigger size="sm" className="h-8 w-40 text-xs">
                <SelectValue placeholder="Preset colore" />
              </SelectTrigger>
              <SelectContent>
                {CONDITIONAL_TONE_OPTIONS.map((toneOption) => (
                  <SelectItem key={toneOption.value} value={toneOption.value}>
                    {toneOption.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ToggleGroup
              variant="outline"
              type="multiple"
              value={activeConditionalRule.textStyles ?? []}
              onValueChange={(value) => updateConditionalTextStyles(activeConditionalRule.id, value)}
            >
              <ToggleGroupItem value="bold" aria-label="Grassetto">
                <Bold className="size-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="italic" aria-label="Corsivo">
                <Italic className="size-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="underline" aria-label="Sottolineato">
                <Underline className="size-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ConditionalFormatsEditor({
  enabled,
  formattableColumns,
  conditionalFormats,
  activeConditionalRule,
  isConditionalEditorOpen,
  setIsConditionalEditorOpen,
  setActiveConditionalRuleId,
  addConditionalFormatRule,
  updateConditionalRule,
  updateConditionalTextStyles,
  removeConditionalRule,
  moveConditionalRule,
  updateConditionalCondition,
  addConditionalCondition,
  removeConditionalCondition,
  availableTagsByColumnId,
}: ConditionalFormatsEditorProps) {
  if (!enabled) {
    return <div className="text-sm text-muted-foreground">Configurazione non disponibile</div>
  }

  let content: ReactNode
  if (isConditionalEditorOpen) {
    if (activeConditionalRule) {
      content = (
        <ConditionalRuleEditor
          activeConditionalRule={activeConditionalRule}
          conditionalFormats={conditionalFormats}
          updateConditionalRule={updateConditionalRule}
          moveConditionalRule={moveConditionalRule}
          removeConditionalRule={removeConditionalRule}
          updateConditionalCondition={updateConditionalCondition}
          addConditionalCondition={addConditionalCondition}
          removeConditionalCondition={removeConditionalCondition}
          updateConditionalTextStyles={updateConditionalTextStyles}
          setIsConditionalEditorOpen={setIsConditionalEditorOpen}
          availableTagsByColumnId={availableTagsByColumnId}
        />
      )
    } else {
      content = (
        <div className="px-0 py-6 text-center text-sm text-muted-foreground">
          Seleziona una regola dall'elenco.
        </div>
      )
    }
  } else if (conditionalFormats.length === 0) {
    content = (
      <ConditionalRulesEmptyState
        formattableColumns={formattableColumns}
        addConditionalFormatRule={addConditionalFormatRule}
      />
    )
  } else {
    content = (
      <ConditionalRulesList
        conditionalFormats={conditionalFormats}
        setActiveConditionalRuleId={setActiveConditionalRuleId}
        setIsConditionalEditorOpen={setIsConditionalEditorOpen}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <DropdownMenuLabel className="px-0 py-0 text-sm font-semibold text-foreground">
          Regole dei colori condizionali
        </DropdownMenuLabel>
        <ColumnPicker columns={formattableColumns} onSelect={addConditionalFormatRule} />
      </div>

      <div className="text-[11px] text-muted-foreground">
        Le regole si applicano dall’alto verso il basso.
      </div>

      <DropdownMenuSeparator />
      {content}
    </div>
  )
}

interface ColumnPickerProps {
  readonly columns: FormattableColumn[]
  readonly onSelect: (columnId: string) => void
  readonly compact?: boolean
}

function ColumnPicker({ columns, onSelect, compact = false }: ColumnPickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={compact ? "h-8" : "h-8 w-8 px-0"}
          aria-label="Aggiungi regola"
        >
          <Plus className="size-4" />
          {compact ? "Aggiungi" : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-2">
        <DropdownMenuLabel className="px-0 pb-2 pt-0 text-xs font-medium text-muted-foreground">
          Scegli colonna
        </DropdownMenuLabel>
        <div className="max-h-56 overflow-y-auto">
          {columns.length === 0 ? (
            <div className="py-2 text-center text-xs text-muted-foreground">
              Nessuna colonna disponibile
            </div>
          ) : (
            <div className="flex flex-col gap-1 py-1">
              {columns.map((col) => (
                <Button
                  key={col.columnId}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 justify-between px-2 text-xs"
                  onClick={() => onSelect(col.columnId)}
                >
                  <span className="truncate">{col.label}</span>
                  <span className="text-[10px] text-muted-foreground uppercase">{col.type}</span>
                </Button>
              ))}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
