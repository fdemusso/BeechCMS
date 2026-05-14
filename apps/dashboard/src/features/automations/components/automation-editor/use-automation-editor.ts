import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { zodResolver } from '@hookform/resolvers/zod'
import type { Automation, AutomationAction } from '@beechcms/core'
import { useAuth } from '@/lib/auth-context'
import { useCreateAutomation } from '../../hooks/use-create-automation'
import { useUpdateAutomation } from '../../hooks/use-update-automation'
import {
  automationFormSchema,
  DEFAULT_ACTION_ITEM,
  type AutomationFormValues,
  type ActionFormItem,
  type FieldMapPair,
} from '../../schema/automation.schema'

function actionToFormItem(action: AutomationAction): ActionFormItem {
  const base = { ...DEFAULT_ACTION_ITEM }
  switch (action.type) {
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
  return {
    seed_slug: seedSlug,
    name: values.name,
    trigger_event: values.trigger_event,
    trigger_cron: values.trigger_event === 'cron' ? values.trigger_cron || null : null,
    trigger_conditions:
      values.trigger_event !== 'cron' && values.trigger_conditions.length > 0
        ? values.trigger_conditions.map((c) => ({ field: c.field, op: c.op, value: c.value }))
        : null,
    actions: values.actions.map((a) => {
      switch (a.type) {
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
          trigger_event: automation.trigger_event,
          trigger_cron: automation.trigger_cron ?? '',
          trigger_conditions: (automation.trigger_conditions ?? []).map((c) => ({
            field: c.field,
            op: c.op,
            value: String(c.value ?? ''),
          })),
          actions: automation.actions.map(actionToFormItem),
        }
      : {
          name: defaultName,
          trigger_event: undefined as any,
          trigger_cron: '',
          trigger_conditions: [],
          actions: [],
        },
  })

  function resetForm() {
    if (automation) {
      form.reset({
        name: automation.name,
        trigger_event: automation.trigger_event,
        trigger_cron: automation.trigger_cron ?? '',
        trigger_conditions: (automation.trigger_conditions ?? []).map((c) => ({
          field: c.field,
          op: c.op,
          value: String(c.value ?? ''),
        })),
        actions: automation.actions.map(actionToFormItem),
      })
    } else {
      form.reset({
        name: defaultName,
        trigger_event: undefined as any,
        trigger_cron: '',
        trigger_conditions: [],
        actions: [],
      })
    }
  }

  // Re-hydrate when automation prop changes or dialog opens
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
