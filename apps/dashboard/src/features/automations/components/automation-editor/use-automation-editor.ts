// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { zodResolver } from '@hookform/resolvers/zod'
import type { Automation, AutomationAction, AutomationTrigger, WhenNode, WhenPredicate, WhenGroup, TriggerCondition } from '@beechcms/core'
import { useAuth } from '@/lib/auth-context'
import { useCreateAutomation } from '../../hooks/use-create-automation'
import { useUpdateAutomation } from '../../hooks/use-update-automation'
import {
  automationFormSchema,
  DEFAULT_ACTION_ITEM,
  DEFAULT_TRIGGER_FORM,
  DEFAULT_WHEN_GROUP,
  DEFAULT_WHEN_PREDICATE,
  type AutomationFormValues,
  type ActionFormItem,
  type FieldMapPair,
  type TriggerForm,
  type WhenGroupForm,
  type WhenNodeForm,
  type WhenPredicateForm,
  type WhenOp,
} from '../../schema/automation.schema'

// ---------------------------------------------------------------------------
// Triggers ↔ form conversion helpers
// ---------------------------------------------------------------------------

function triggersToForm(triggers: AutomationTrigger[]): TriggerForm[] {
  if (!triggers || triggers.length === 0) return [{ ...DEFAULT_TRIGGER_FORM }]
  return triggers.map((t) => ({ event: t.event, cron: t.cron ?? '' }))
}

// ---------------------------------------------------------------------------
// WhenNode ↔ form conversion helpers
// ---------------------------------------------------------------------------

function whenPredicateToForm(p: WhenPredicate): WhenPredicateForm {
  return {
    ...DEFAULT_WHEN_PREDICATE,
    left_kind: p.left.kind,
    left_ref: p.left.kind === 'ref' ? p.left.key : '',
    left_literal: p.left.kind === 'literal' ? String(p.left.value ?? '') : '',
    op: p.op as WhenOp,
    right_kind: p.right?.kind ?? 'literal',
    right_ref: p.right?.kind === 'ref' ? p.right.key : '',
    right_literal: p.right?.kind === 'literal' ? String(p.right.value ?? '') : '',
  }
}

function whenGroupToForm(g: WhenGroup): WhenGroupForm {
  return {
    kind: 'group',
    op: g.op,
    negate: g.negate ?? false,
    children: g.children.map(whenNodeToForm),
  }
}

function whenNodeToForm(n: WhenNode): WhenNodeForm {
  if (n.kind === 'predicate') return whenPredicateToForm(n)
  return whenGroupToForm(n)
}

function triggerConditionsToWhenGroupForm(
  conditions: WhenNode | TriggerCondition[] | null,
): WhenGroupForm {
  if (!conditions) return { ...DEFAULT_WHEN_GROUP }

  if (Array.isArray(conditions)) {
    if (conditions.length === 0) return { ...DEFAULT_WHEN_GROUP }
    return {
      kind: 'group',
      op: 'AND',
      negate: false,
      children: conditions.map((c): WhenPredicateForm => ({
        ...DEFAULT_WHEN_PREDICATE,
        left_kind: 'ref',
        left_ref: `this.${c.field}`,
        op: c.op as WhenOp,
        right_kind: 'literal',
        right_literal: String(c.value ?? ''),
      })),
    }
  }

  if (conditions.kind === 'predicate') {
    return { kind: 'group', op: 'AND', negate: false, children: [whenNodeToForm(conditions)] }
  }

  return whenGroupToForm(conditions)
}

function whenPredicateFormToNode(p: WhenPredicateForm): WhenPredicate {
  const noRight = p.op === 'isempty' || p.op === 'isnotempty'
  return {
    kind: 'predicate',
    left: p.left_kind === 'ref'
      ? { kind: 'ref', key: p.left_ref }
      : { kind: 'literal', value: p.left_literal },
    op: p.op,
    right: noRight
      ? undefined
      : p.right_kind === 'ref'
        ? { kind: 'ref', key: p.right_ref }
        : { kind: 'literal', value: p.right_literal },
  }
}

function whenGroupFormToNode(g: WhenGroupForm): WhenGroup {
  return {
    kind: 'group',
    op: g.op,
    negate: g.negate || undefined,
    children: g.children.map(whenNodeFormToNode),
  }
}

function whenNodeFormToNode(n: WhenNodeForm): WhenNode {
  if (n.kind === 'predicate') return whenPredicateFormToNode(n)
  return whenGroupFormToNode(n)
}

// ---------------------------------------------------------------------------
// Action form conversion
// ---------------------------------------------------------------------------

function actionToFormItem(action: AutomationAction): ActionFormItem {
  const base = { ...DEFAULT_ACTION_ITEM }
  switch (action.type) {
    case 'set_variable': {
      const fixedId = action.fixed_id ?? ''
      const seedSlug = action.seed_slug ?? ''
      const filters = fixedId
        ? []
        : (action.filters ?? [])
            .filter((f) => !(f.field === 'id' && f.op === 'eq'))
            .map((f) => ({ field: f.field, op: f.op, value: String(f.value ?? '') }))
      return {
        ...base,
        type: 'set_variable',
        name: action.name,
        seed_slug: seedSlug,
        fixed_id: fixedId,
        column: action.column ?? '',
        filters,
      }
    }
    case 'webhook':
      return {
        ...base,
        type: 'webhook',
        url: action.url,
        method: action.method ?? 'POST',
        headers: Object.entries(action.headers ?? {}).map(([key, value]) => ({ key, value })),
        body_template: action.body_template ?? '',
      }
    case 'send_mail':
      return {
        ...base,
        type: 'send_mail',
        to: action.to,
        subject_template: action.subject_template,
        body_template: action.body_template,
      }
    case 'edit_field':
      return {
        ...base,
        type: 'edit_field',
        field: action.field,
        value: String(action.value ?? ''),
      }
    case 'create_entry':
      return {
        ...base,
        type: 'create_entry',
        seed_slug: action.seed_slug,
        field_map: Object.entries(action.field_map).map(
          ([targetAlias, sourceAlias]): FieldMapPair => ({ targetAlias, sourceAlias })
        ),
      }
  }
}

function formToApiPayload(values: AutomationFormValues, seedSlug: string) {
  const whenGroup = whenGroupFormToNode(values.trigger_conditions)
  const hasConditions = values.trigger_conditions.children.length > 0

  return {
    seed_slug: seedSlug,
    name: values.name,
    triggers: values.triggers
      .filter((t) => !!t.event)
      .map((t) => ({
        event: t.event as AutomationTrigger['event'],
        ...(t.event === 'cron' ? { cron: t.cron || null } : {}),
      })),
    trigger_conditions: hasConditions ? whenGroup : null,
    actions: values.actions.map((a) => {
      switch (a.type) {
        case 'set_variable':
          return {
            type: 'set_variable' as const,
            name: a.name,
            ...(a.seed_slug ? { seed_slug: a.seed_slug } : {}),
            ...(a.fixed_id ? { fixed_id: a.fixed_id } : {}),
            ...(a.column ? { column: a.column } : {}),
            filters: a.filters.map((f) => ({ field: f.field, op: f.op, value: f.value })),
          }
        case 'webhook':
          return {
            type: 'webhook' as const,
            url: a.url,
            method: a.method,
            headers:
              a.headers.length > 0
                ? Object.fromEntries(a.headers.map((h) => [h.key, h.value]))
                : undefined,
            body_template: a.body_template || undefined,
          }
        case 'send_mail':
          return { type: 'send_mail' as const, to: a.to, subject_template: a.subject_template, body_template: a.body_template }
        case 'edit_field':
          return { type: 'edit_field' as const, field: a.field, value: a.value }
        case 'create_entry':
          return {
            type: 'create_entry' as const,
            seed_slug: a.seed_slug,
            field_map: Object.fromEntries(a.field_map.map((fm) => [fm.targetAlias, fm.sourceAlias])),
          }
      }
    }),
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseAutomationEditorOptions {
  seedSlug: string
  seedDisplayName: string
  automation?: Automation
  open: boolean
  onSuccess: () => void
}

export function useAutomationEditor({
  seedSlug,
  seedDisplayName: _,
  automation,
  open,
  onSuccess,
}: UseAutomationEditorOptions) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const isEdit = Boolean(automation)

  const createMutation = useCreateAutomation(seedSlug)
  const updateMutation = useUpdateAutomation(seedSlug)

  const defaultName = t('automations.editor.defaultName', { name: user?.name ?? user?.email ?? 'Admin' })

  const form = useForm<AutomationFormValues>({
    resolver: zodResolver(automationFormSchema),
    mode: 'onChange',
    defaultValues: automation
      ? {
          name: automation.name,
          triggers: triggersToForm(automation.triggers),
          trigger_conditions: triggerConditionsToWhenGroupForm(automation.trigger_conditions),
          actions: automation.actions.map(actionToFormItem),
        }
      : {
          name: defaultName,
          triggers: [{ ...DEFAULT_TRIGGER_FORM }],
          trigger_conditions: { ...DEFAULT_WHEN_GROUP },
          actions: [],
        },
  })

  function resetForm() {
    if (automation) {
      form.reset({
        name: automation.name,
        triggers: triggersToForm(automation.triggers),
        trigger_conditions: triggerConditionsToWhenGroupForm(automation.trigger_conditions),
        actions: automation.actions.map(actionToFormItem),
      })
    } else {
      form.reset({
        name: defaultName,
        triggers: [{ ...DEFAULT_TRIGGER_FORM }],
        trigger_conditions: { ...DEFAULT_WHEN_GROUP },
        actions: [],
      })
    }
  }

  useEffect(() => {
    if (open) {
      resetForm()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automation?.id, open])

  const isPending = createMutation.isPending || updateMutation.isPending

  async function onSubmit(values: AutomationFormValues) {
    const payload = formToApiPayload(values, seedSlug)
    if (isEdit && automation) {
      await updateMutation.mutateAsync({ id: automation.id, body: payload })
    } else {
      await createMutation.mutateAsync(payload as any)
    }
    onSuccess()
  }

  return { form, isEdit, isPending, resetForm, onSubmit: form.handleSubmit(onSubmit) }
}
