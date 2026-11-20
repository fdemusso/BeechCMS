// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { Bold, ChevronDown, ChevronUp, EyeOff, Italic, Palette, Plus, Trash2, Underline, X } from '@/components/icons'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ConditionalFormatRule, ConditionalFormatTone } from "@/lib/conditional-format"
import {
  getConditionalFormatCellClass,
  getConditionalFormatRowClass,
} from "@/lib/conditional-format"
import { cn } from "@/lib/utils"
import { FilterConditionInput } from "./filter-condition-input"
import {
  CONDITIONAL_TONE_OPTIONS,
  getConditionalToneStripClass,
  getOperatorOptions,
  MAX_CONDITIONS_PER_FILTER,
  operatorRequiresValue,
} from "../shared"
import type { FilterOperator, ToolbarFilterCondition } from "../shared"
import type { FormattableColumn } from "../toolbar-hooks/use-toolbar-filters"

interface ConditionalColorsSubmenuProps {
  readonly enabled: boolean
  readonly formattableColumns: FormattableColumn[]
  readonly conditionalFormats: ConditionalFormatRule[]
  readonly setActiveConditionalRuleId: (ruleId: string | null) => void
  readonly setIsConditionalEditorOpen: (open: boolean) => void
  readonly addConditionalFormatRule: (columnId: string) => void
  /** Closes the whole settings menu: the rule editor is a dialog, it opens on top of nothing. */
  readonly onClose: () => void
}

/** "Conditional colors" entry of the settings menu: the rule list and "Add rule". Editing happens in `ConditionalRuleDialog`. */
export function ConditionalColorsSubmenu({
  enabled,
  formattableColumns,
  conditionalFormats,
  setActiveConditionalRuleId,
  setIsConditionalEditorOpen,
  addConditionalFormatRule,
  onClose,
}: ConditionalColorsSubmenuProps) {
  const { t } = useTranslation()
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Palette className="size-4" />
        <span className="flex-1">{t("toolbar.settings.conditionalColors")}</span>
        {conditionalFormats.length > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">{conditionalFormats.length}</span>
        )}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="w-64">
          {!enabled ? (
            <DropdownMenuLabel>{t("toolbar.conditionalFormats.notAvailable")}</DropdownMenuLabel>
          ) : (
            <>
              {conditionalFormats.length === 0 ? (
                <DropdownMenuLabel>{t("toolbar.conditionalFormats.noRules")}</DropdownMenuLabel>
              ) : (
                <>
                  <DropdownMenuLabel>{t("toolbar.conditionalFormats.rules")}</DropdownMenuLabel>
                  {conditionalFormats.map((rule) => (
                    <DropdownMenuItem
                      key={rule.id}
                      onSelect={() => {
                        setActiveConditionalRuleId(rule.id)
                        setIsConditionalEditorOpen(true)
                        onClose()
                      }}
                    >
                      <span
                        aria-hidden
                        className={cn("size-2 shrink-0 rounded-full", getConditionalToneStripClass(rule.tone))}
                      />
                      <span className={cn("flex-1 truncate", !rule.enabled && "text-muted-foreground")}>
                        {rule.label || rule.group.label}
                      </span>
                      {!rule.enabled && <EyeOff className="size-3.5 shrink-0 text-muted-foreground" />}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Plus className="size-4" />
                  {t("toolbar.conditionalFormats.addRule")}
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="w-64">
                    <DropdownMenuLabel>{t("toolbar.conditionalFormats.choose.column")}</DropdownMenuLabel>
                    {formattableColumns.length === 0 ? (
                      <DropdownMenuLabel className="font-normal">
                        {t("toolbar.conditionalFormats.noColumns")}
                      </DropdownMenuLabel>
                    ) : (
                      <ScrollArea className="max-h-56">
                        {formattableColumns.map((col) => (
                          <DropdownMenuItem
                            key={col.columnId}
                            onSelect={() => {
                              addConditionalFormatRule(col.columnId)
                              onClose()
                            }}
                          >
                            <span className="flex-1 truncate">{col.label}</span>
                            <span className="text-xs text-muted-foreground">{col.type}</span>
                          </DropdownMenuItem>
                        ))}
                      </ScrollArea>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            </>
          )}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  )
}

interface ConditionalRuleDialogProps {
  readonly rule: ConditionalFormatRule | null
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
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
  readonly availableTagsByColumnId: Record<string, string[]>
}

/** Edits one conditional-color rule: name, target, conditions and style. */
export function ConditionalRuleDialog({
  rule,
  open,
  onOpenChange,
  conditionalFormats,
  updateConditionalRule,
  moveConditionalRule,
  removeConditionalRule,
  updateConditionalCondition,
  addConditionalCondition,
  removeConditionalCondition,
  updateConditionalTextStyles,
  availableTagsByColumnId,
}: ConditionalRuleDialogProps) {
  const { t } = useTranslation()
  if (!rule) return null
  const index = conditionalFormats.findIndex((r) => r.id === rule.id)
  const ops = getOperatorOptions(rule.group.type, t)
  const textStyles = rule.textStyles ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl font-bold">
            {t("toolbar.conditionalFormats.editRule")}
          </DialogTitle>
          <DialogDescription>{t("toolbar.conditionalFormats.hint")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <Field className="flex-1">
            <FieldLabel htmlFor="conditional-rule-name">{t("toolbar.conditionalFormats.ruleName")}</FieldLabel>
            <Input
              id="conditional-rule-name"
              value={rule.label ?? ""}
              onChange={(e) => updateConditionalRule(rule.id, { label: e.target.value })}
              placeholder={rule.group.label}
            />
          </Field>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => moveConditionalRule(rule.id, -1)}
            disabled={index === 0}
            aria-label={t("toolbar.conditionalFormats.moveUp")}
          >
            <ChevronUp className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => moveConditionalRule(rule.id, 1)}
            disabled={index === conditionalFormats.length - 1}
            aria-label={t("toolbar.conditionalFormats.moveDown")}
          >
            <ChevronDown className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-status-danger-foreground hover:bg-status-danger-soft hover:text-status-danger-foreground"
            onClick={() => removeConditionalRule(rule.id)}
            aria-label={t("toolbar.conditionalFormats.deleteRule")}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>

        <Field orientation="horizontal">
          <Switch
            id="conditional-rule-enabled"
            checked={rule.enabled}
            onCheckedChange={(checked) => updateConditionalRule(rule.id, { enabled: checked })}
          />
          <FieldLabel htmlFor="conditional-rule-enabled">{t("toolbar.conditionalFormats.toggleRule")}</FieldLabel>
        </Field>

        <Field>
          <FieldLabel>{t("toolbar.conditionalFormats.applyTo")}</FieldLabel>
          <ToggleGroup
            type="single"
            variant="outline"
            value={rule.target}
            onValueChange={(value) => {
              if (value === "field" || value === "element") updateConditionalRule(rule.id, { target: value })
            }}
            className="justify-start"
          >
            <ToggleGroupItem value="field">{t("toolbar.conditionalFormats.field")}</ToggleGroupItem>
            <ToggleGroupItem value="element">{t("toolbar.conditionalFormats.element")}</ToggleGroupItem>
          </ToggleGroup>
        </Field>

        <Field>
          <FieldLabel>
            {t("toolbar.conditionalFormats.condition.heading")}
            <span className="font-normal text-muted-foreground">· {rule.group.label}</span>
          </FieldLabel>
          <div className="flex flex-col gap-2">
            {rule.group.conditions.map((cond) => (
              <div key={cond.id} className="flex items-center gap-2">
                <Select
                  value={cond.op}
                  onValueChange={(v) =>
                    updateConditionalCondition(rule.id, cond.id, {
                      op: v as FilterOperator,
                      value: v === "is_empty" || v === "is_not_empty" ? null : cond.value,
                    })
                  }
                >
                  <SelectTrigger className="w-40" aria-label={t("toolbar.conditionalFormats.operator")}>
                    <SelectValue placeholder={t("toolbar.conditionalFormats.operator")} />
                  </SelectTrigger>
                  <SelectContent>
                    {ops.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {operatorRequiresValue(cond.op) ? (
                  <FilterConditionInput
                    type={rule.group.type}
                    value={cond.value}
                    onChange={(value) => updateConditionalCondition(rule.id, cond.id, { value })}
                    selectOptions={rule.group.selectOptions ?? []}
                    availableTags={availableTagsByColumnId[rule.columnId] ?? []}
                    className="h-8 flex-1"
                    textClassName="text-sm"
                  />
                ) : (
                  <div className="flex-1" />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("toolbar.conditionalFormats.removeCondition")}
                  disabled={rule.group.conditions.length <= 1}
                  onClick={() => removeConditionalCondition(rule.id, cond.id)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              disabled={rule.group.conditions.length >= MAX_CONDITIONS_PER_FILTER}
              onClick={() => addConditionalCondition(rule.id)}
            >
              <Plus className="size-4" />
              {t("toolbar.conditionalFormats.addCondition")}
            </Button>
          </div>
        </Field>

        <Field>
          <FieldLabel>{t("toolbar.conditionalFormats.style.heading")}</FieldLabel>
          <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <div
              className={cn(
                "flex min-h-12 items-center rounded-control border border-border px-3",
                rule.target === "element" && getConditionalFormatRowClass(rule.tone, textStyles)
              )}
            >
              <span
                className={
                  rule.target === "field" ? getConditionalFormatCellClass(rule.tone, textStyles) : "font-medium"
                }
              >
                {t("toolbar.conditionalFormats.default")}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Select
                value={rule.tone}
                onValueChange={(v) => updateConditionalRule(rule.id, { tone: v as ConditionalFormatTone })}
              >
                <SelectTrigger className="w-44" aria-label={t("toolbar.conditionalFormats.colorPreset")}>
                  <SelectValue placeholder={t("toolbar.conditionalFormats.colorPreset")} />
                </SelectTrigger>
                <SelectContent>
                  {CONDITIONAL_TONE_OPTIONS.map((toneOption) => (
                    <SelectItem key={toneOption.value} value={toneOption.value}>
                      {t(`toolbar.conditionalFormats.tone.${toneOption.value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ToggleGroup
                variant="outline"
                type="multiple"
                value={textStyles}
                onValueChange={(value) => updateConditionalTextStyles(rule.id, value)}
              >
                <ToggleGroupItem value="bold" aria-label={t("toolbar.conditionalFormats.bold")}>
                  <Bold className="size-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="italic" aria-label={t("toolbar.conditionalFormats.italic")}>
                  <Italic className="size-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="underline" aria-label={t("toolbar.conditionalFormats.underline")}>
                  <Underline className="size-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </Field>
      </DialogContent>
    </Dialog>
  )
}
