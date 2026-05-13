import * as React from "react"
import type { ConditionalFormatRule, ConditionalFormatTextStyle } from "@/lib/conditional-format"
import type { FilterOperator, ToolbarFilterCondition } from "@/features/content-toolbar/shared"
import {
  generateConditionId,
  normalizeConditionalTarget,
  normalizeTextStyles,
} from "@/features/content-toolbar/shared"
import type { FormattableColumn } from "./use-toolbar-filters"

interface UseConditionalFormatsOptions {
  viewId?: string
  conditionalFormatsInput?: ConditionalFormatRule[]
  formattableColumns: FormattableColumn[]
  onConditionalFormatsChange?: (viewId: string, next: ConditionalFormatRule[]) => void
}

export function useConditionalFormats({
  viewId,
  conditionalFormatsInput,
  formattableColumns,
  onConditionalFormatsChange,
}: UseConditionalFormatsOptions) {
  const [activeConditionalRuleId, setActiveConditionalRuleId] = React.useState<string | null>(null)
  const [isConditionalEditorOpen, setIsConditionalEditorOpen] = React.useState(false)

  const normalizeConditionalFormats = React.useCallback(
    (rules: ConditionalFormatRule[]) =>
      rules
        .map((rule) => ({
          ...rule,
          target: normalizeConditionalTarget(rule.target),
          textStyles: normalizeTextStyles(rule.textStyles),
        }))
        .slice()
        .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0)),
    []
  )

  const conditionalFormats = React.useMemo(
    () => normalizeConditionalFormats(conditionalFormatsInput ?? []),
    [conditionalFormatsInput, normalizeConditionalFormats]
  )

  React.useEffect(() => {
    if (conditionalFormats.length === 0) {
      setActiveConditionalRuleId(null)
      setIsConditionalEditorOpen(false)
      return
    }
    if (
      !activeConditionalRuleId ||
      !conditionalFormats.some((rule) => rule.id === activeConditionalRuleId)
    ) {
      setActiveConditionalRuleId(conditionalFormats[0].id)
    }
  }, [activeConditionalRuleId, conditionalFormats])

  const activeConditionalRule = React.useMemo(() => {
    if (!activeConditionalRuleId) return conditionalFormats[0] ?? null
    return (
      conditionalFormats.find((rule) => rule.id === activeConditionalRuleId) ??
      conditionalFormats[0] ??
      null
    )
  }, [activeConditionalRuleId, conditionalFormats])

  const commitConditionalFormats = React.useCallback(
    (next: ConditionalFormatRule[]) => {
      if (!viewId || !onConditionalFormatsChange) return
      onConditionalFormatsChange(viewId, next)
    },
    [onConditionalFormatsChange, viewId]
  )

  const addConditionalFormatRule = React.useCallback(
    (columnId: string) => {
      const col = formattableColumns.find((c) => c.columnId === columnId)
      if (!col) return
      const id = generateConditionId()
      const defaultOp: FilterOperator = col.type === "tags" ? "contains" : "eq"
      const nextRule: ConditionalFormatRule = {
        id,
        enabled: true,
        priority: conditionalFormats.length,
        label: col.label,
        columnId,
        group: {
          columnId,
          label: col.label,
          type: col.type,
          selectOptions: col.selectOptions,
          conditions: [{ id: generateConditionId(), op: defaultOp, value: null }],
        },
        tone: "warning",
        target: "row",
        textStyles: [],
      }
      commitConditionalFormats([...conditionalFormats, nextRule])
      setActiveConditionalRuleId(id)
      setIsConditionalEditorOpen(true)
    },
    [commitConditionalFormats, conditionalFormats, formattableColumns]
  )

  const updateConditionalRule = React.useCallback(
    (ruleId: string, patch: Partial<ConditionalFormatRule>) => {
      const next = conditionalFormats.map((r) => (r.id === ruleId ? { ...r, ...patch } : r))
      commitConditionalFormats(next)
    },
    [commitConditionalFormats, conditionalFormats]
  )

  const updateConditionalTextStyles = React.useCallback(
    (ruleId: string, nextStyles: string[]) => {
      updateConditionalRule(ruleId, {
        textStyles: nextStyles.filter(
          (style): style is ConditionalFormatTextStyle =>
            style === "bold" || style === "italic" || style === "underline"
        ),
      })
    },
    [updateConditionalRule]
  )

  const removeConditionalRule = React.useCallback(
    (ruleId: string) => {
      const next = conditionalFormats
        .filter((r) => r.id !== ruleId)
        .map((r, i) => ({ ...r, priority: i }))
      commitConditionalFormats(next)
    },
    [commitConditionalFormats, conditionalFormats]
  )

  const moveConditionalRule = React.useCallback(
    (ruleId: string, dir: -1 | 1) => {
      const idx = conditionalFormats.findIndex((r) => r.id === ruleId)
      if (idx < 0) return
      const nextIdx = idx + dir
      if (nextIdx < 0 || nextIdx >= conditionalFormats.length) return
      const next = conditionalFormats.slice()
      const [rule] = next.splice(idx, 1)
      next.splice(nextIdx, 0, rule)
      commitConditionalFormats(next.map((r, i) => ({ ...r, priority: i })))
    },
    [commitConditionalFormats, conditionalFormats]
  )

  const updateConditionalCondition = React.useCallback(
    (
      ruleId: string,
      conditionId: string,
      patch: Partial<Pick<ToolbarFilterCondition, "op" | "value">>
    ) => {
      const next = conditionalFormats.map((r) => {
        if (r.id !== ruleId) return r
        const nextConditions = r.group.conditions.map((c) =>
          c.id === conditionId ? { ...c, ...patch } : c
        )
        return { ...r, group: { ...r.group, conditions: nextConditions } }
      })
      commitConditionalFormats(next)
    },
    [commitConditionalFormats, conditionalFormats]
  )

  const addConditionalCondition = React.useCallback(
    (ruleId: string) => {
      const rule = conditionalFormats.find((r) => r.id === ruleId)
      if (!rule) return
      const defaultOp: FilterOperator = rule.group.type === "tags" ? "contains" : "eq"
      const next = conditionalFormats.map((r) =>
        r.id === ruleId
          ? {
              ...r,
              group: {
                ...r.group,
                conditions: [
                  ...r.group.conditions,
                  { id: generateConditionId(), op: defaultOp, value: null },
                ],
              },
            }
          : r
      )
      commitConditionalFormats(next)
    },
    [commitConditionalFormats, conditionalFormats]
  )

  const removeConditionalCondition = React.useCallback(
    (ruleId: string, conditionId: string) => {
      const next = conditionalFormats
        .map((r) => {
          if (r.id !== ruleId) return r
          const nextConditions = r.group.conditions.filter((c) => c.id !== conditionId)
          return { ...r, group: { ...r.group, conditions: nextConditions } }
        })
        .filter((r) => r.group.conditions.length > 0)
        .map((r, i) => ({ ...r, priority: i }))
      commitConditionalFormats(next)
    },
    [commitConditionalFormats, conditionalFormats]
  )

  return {
    conditionalFormats,
    activeConditionalRule,
    activeConditionalRuleId,
    isConditionalEditorOpen,
    setActiveConditionalRuleId,
    setIsConditionalEditorOpen,
    addConditionalFormatRule,
    updateConditionalRule,
    updateConditionalTextStyles,
    removeConditionalRule,
    moveConditionalRule,
    updateConditionalCondition,
    addConditionalCondition,
    removeConditionalCondition,
  }
}
