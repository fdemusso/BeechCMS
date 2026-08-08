// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from 'react-i18next'
import { useFormContext } from 'react-hook-form'
import { Plus, Trash2, X, Layers } from 'reicon-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { Branch } from '@beechcms/core'
import type { AutomationFormValues, WhenGroupForm, WhenNodeForm, WhenPredicateForm, WhenOp } from '../../schema/automation.schema'
import { DEFAULT_WHEN_PREDICATE } from '../../schema/automation.schema'
import { getWhenOpsForBranch } from './automation-ops'
import { AutomationValueInput } from './automation-value-input'

// ---------------------------------------------------------------------------
// Predicate editor — one flat row per predicate
// ---------------------------------------------------------------------------

interface WhenPredicateEditorProps {
  pred: WhenPredicateForm
  onChange: (pred: WhenPredicateForm) => void
  onRemove: () => void
  onWrap?: () => void
  seedBranches: Branch[]
}

function WhenPredicateEditor({ pred, onChange, onRemove, onWrap, seedBranches }: WhenPredicateEditorProps) {
  const { t } = useTranslation()
  const noRight = pred.op === 'isempty' || pred.op === 'isnotempty'

  // Derive the branch for the selected left_ref (e.g. "this.title" → branch with alias "title")
  const selectedBranch: Branch | undefined = pred.left_kind === 'ref' && pred.left_ref.startsWith('this.')
    ? seedBranches.find((b) => b.alias === pred.left_ref.slice(5))
    : undefined

  const allowedOps = getWhenOpsForBranch(selectedBranch)

  function handleFieldChange(newRef: string) {
    const newBranch = newRef.startsWith('this.')
      ? seedBranches.find((b) => b.alias === newRef.slice(5))
      : undefined
    const ops = getWhenOpsForBranch(newBranch)
    const op = ops.includes(pred.op) ? pred.op : ops[0]
    onChange({ ...pred, left_ref: newRef, op, right_literal: '' })
  }

  function handleOpChange(op: WhenOp) {
    onChange({ ...pred, op, right_literal: '' })
  }

  return (
    <div className="flex items-start gap-1.5">
      {/* Fields — flex-wrap among themselves, shrink to give space to actions */}
      <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
        {/* Left operand */}
        {pred.left_kind === 'ref' ? (
          <Select
            value={pred.left_ref}
            onValueChange={handleFieldChange}
          >
            <SelectTrigger size="sm" className="h-7 text-xs flex-1 min-w-[80px]">
              <SelectValue placeholder={t('automations.when.fieldPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {seedBranches.map((b) => (
                <SelectItem key={b.alias} value={`this.${b.alias}`}>
                  {b.label}
                </SelectItem>
              ))}
              <SelectItem value="_custom">{t('automations.when.customRef')}</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <AutomationValueInput
            branch={undefined}
            value={pred.left_literal}
            onChange={(v) => onChange({ ...pred, left_literal: v })}
          />
        )}

        {/* Op selector — filtered by branch type */}
        <Select
          value={pred.op}
          onValueChange={(v) => handleOpChange(v as WhenOp)}
        >
          <SelectTrigger size="sm" className="h-7 text-xs w-28 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allowedOps.map((op) => (
              <SelectItem key={op} value={op}>{t(`automations.when.ops.${op}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Right operand — hidden for isempty/isnotempty, type-aware otherwise */}
        {!noRight && (
          pred.right_kind === 'ref' ? (
            <AutomationValueInput
              branch={undefined}
              value={pred.right_ref}
              onChange={(v) => onChange({ ...pred, right_ref: v })}
            />
          ) : (
            <AutomationValueInput
              branch={selectedBranch}
              value={pred.right_literal}
              onChange={(v) => onChange({ ...pred, right_literal: v })}
            />
          )
        )}
      </div>

      {/* Actions — always together, never wrap */}
      <div className="flex items-center gap-0.5 shrink-0">
        {onWrap && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground/50 hover:text-muted-foreground"
                onClick={onWrap}
              >
                <Layers className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {t('automations.when.wrapGroup')}
            </TooltipContent>
          </Tooltip>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-destructive/60 hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Group editor — recursive
// ---------------------------------------------------------------------------

interface WhenGroupEditorProps {
  group: WhenGroupForm
  onChange: (group: WhenGroupForm) => void
  onRemove?: () => void
  onWrap?: () => void
  seedBranches: Branch[]
  depth?: number
}

function WhenGroupEditor({ group, onChange, onRemove, onWrap, seedBranches, depth = 0 }: WhenGroupEditorProps) {
  const { t } = useTranslation()
  const maxDepth = 3
  const isRoot = depth === 0
  const canNestDeeper = depth < maxDepth

  function updateChild(index: number, node: WhenNodeForm) {
    const children = [...group.children]
    children[index] = node
    onChange({ ...group, children })
  }

  function removeChild(index: number) {
    onChange({ ...group, children: group.children.filter((_, i) => i !== index) })
  }

  function addPredicate() {
    onChange({ ...group, children: [...group.children, { ...DEFAULT_WHEN_PREDICATE }] })
  }

  function toggleOp() {
    onChange({ ...group, op: group.op === 'AND' ? 'OR' : 'AND' })
  }

  function toggleNegate() {
    onChange({ ...group, negate: !group.negate })
  }

  // Wraps children[index] into a new OR group with an empty predicate alongside it.
  // The user immediately sees: GRUPPO(OR) [ original_child | new_empty_predicate ]
  // allowing them to define the alternative without recreating the original.
  function wrapChild(index: number) {
    if (!canNestDeeper) return
    const child = group.children[index]
    const wrapped: WhenGroupForm = {
      kind: 'group',
      op: 'OR',
      negate: false,
      children: [child, { ...DEFAULT_WHEN_PREDICATE }],
    }
    const children = [...group.children]
    children[index] = wrapped
    onChange({ ...group, children })
  }

  return (
    <div className={`${!isRoot ? 'ml-4 pl-3 border-l border-dashed border-border/60' : ''} flex flex-col gap-1.5`}>
      {/* Group header — op toggle + negate + wrap + remove */}
      {(!isRoot || group.children.length > 1) && (
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={toggleOp}
          >
            {group.op === 'AND' ? t('automations.when.and') : t('automations.when.or')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`h-6 px-2 text-xs ${group.negate ? 'text-destructive' : 'text-muted-foreground'}`}
            onClick={toggleNegate}
          >
            {t('automations.when.not')}
          </Button>

          {!isRoot && (
            <div className="ml-auto flex items-center gap-1">
              {onWrap && canNestDeeper && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0 text-muted-foreground/50 hover:text-muted-foreground"
                      onClick={onWrap}
                    >
                      <Layers className="size-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {t('automations.when.wrapGroup')}
                  </TooltipContent>
                </Tooltip>
              )}
              {onRemove && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0 text-destructive/60 hover:text-destructive"
                  onClick={onRemove}
                  title={t('automations.when.removeGroup')}
                >
                  <X className="size-3" />
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Children */}
      {group.children.map((child, idx) => {
        const nodeKey = child.kind === 'predicate'
          ? `${child.kind}-${child.left_ref}-${child.op}-${child.right_literal}-${child.right_ref}`
          : `${child.kind}-${child.op}-${child.negate}-${child.children.length}`
        return (
          <div key={nodeKey}>
          {child.kind === 'predicate' ? (
            <WhenPredicateEditor
              pred={child}
              onChange={(updated) => updateChild(idx, updated)}
              onRemove={() => removeChild(idx)}
              onWrap={canNestDeeper ? () => wrapChild(idx) : undefined}
              seedBranches={seedBranches}
            />
          ) : (
            <WhenGroupEditor
              group={child}
              onChange={(updated) => updateChild(idx, updated)}
              onRemove={() => removeChild(idx)}
              onWrap={canNestDeeper ? () => wrapChild(idx) : undefined}
              seedBranches={seedBranches}
              depth={depth + 1}
            />
          )}
        </div>
        )
      })}

      {/* Add condition */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-muted-foreground self-start"
        onClick={addPredicate}
      >
        <Plus className="size-3 mr-1" />
        {t('automations.when.addCondition')}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

interface TriggerConditionsProps {
  seedBranches: Branch[]
  disabled?: boolean
}

export function TriggerConditions({ seedBranches }: TriggerConditionsProps) {
  const { watch, setValue } = useFormContext<AutomationFormValues>()
  const group = watch('trigger_conditions')

  return (
    <div className="mt-2">
      <WhenGroupEditor
        group={group}
        onChange={(newGroup) => setValue('trigger_conditions', newGroup, { shouldValidate: true })}
        seedBranches={seedBranches}
      />
    </div>
  )
}
