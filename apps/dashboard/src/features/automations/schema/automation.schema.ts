// Mirror of apps/api/src/features/automations/automations.schema.ts
// Keep structurally identical. Changes here must be reflected there and vice versa.
import { z } from 'zod'
import type { AutomationTriggerEvent, TriggerCondition } from '@beechcms/core'

export const TRIGGER_OPS = ['eq', 'neq', 'contains', 'gt', 'lt', 'isempty', 'isnotempty'] as const
export type TriggerOp = typeof TRIGGER_OPS[number]

export const TRIGGER_EVENTS: AutomationTriggerEvent[] = ['create', 'update', 'delete', 'cron']
export const ACTION_TYPES = ['webhook', 'send_mail', 'edit_field', 'create_entry'] as const

export type HeaderPair = { key: string; value: string }
export type FieldMapPair = { targetAlias: string; sourceAlias: string }

// Flat action shape for RHF (all fields present, validated by type via superRefine)
export type ActionFormItem = {
  type: 'webhook' | 'send_mail' | 'edit_field' | 'create_entry'
  url: string
  method: 'POST' | 'GET' | 'PUT'
  headers: HeaderPair[]
  body_template: string
  to: string
  subject_template: string
  field: string
  value: string
  seed_slug: string
  field_map: FieldMapPair[]
}

export type TriggerConditionForm = {
  field: string
  op: TriggerCondition['op']
  value: string
}

export type AutomationFormValues = {
  name: string
  trigger_event: AutomationTriggerEvent
  trigger_cron: string
  trigger_conditions: TriggerConditionForm[]
  actions: ActionFormItem[]
}

const actionFormItemSchema = z
  .object({
    type: z.enum(['webhook', 'send_mail', 'edit_field', 'create_entry']),
    url: z.string(),
    method: z.enum(['POST', 'GET', 'PUT']),
    headers: z.array(z.object({ key: z.string(), value: z.string() })),
    body_template: z.string(),
    to: z.string(),
    subject_template: z.string(),
    field: z.string(),
    value: z.string(),
    seed_slug: z.string(),
    field_map: z.array(z.object({ targetAlias: z.string(), sourceAlias: z.string() })),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'webhook') {
      if (!data.url) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'URL è obbligatorio', path: ['url'] })
      } else if (!z.string().url().safeParse(data.url).success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'URL non valido', path: ['url'] })
      }
    }
    if (data.type === 'send_mail') {
      if (!data.to) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Email obbligatoria', path: ['to'] })
      } else if (!z.string().email().safeParse(data.to).success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Email non valida', path: ['to'] })
      }
      if (!data.subject_template) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Oggetto obbligatorio', path: ['subject_template'] })
      }
      if (!data.body_template) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Corpo obbligatorio', path: ['body_template'] })
      }
    }
    if (data.type === 'edit_field') {
      if (!data.field) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Campo obbligatorio', path: ['field'] })
      }
    }
    if (data.type === 'create_entry') {
      if (!data.seed_slug) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Seed obbligatorio', path: ['seed_slug'] })
      }
    }
  })

export const automationFormSchema = z
  .object({
    name: z.string().min(1, 'Nome obbligatorio').max(100),
    trigger_event: z.enum(['create', 'update', 'delete', 'cron']),
    trigger_cron: z.string(),
    trigger_conditions: z.array(
      z.object({
        field: z.string().min(1),
        op: z.enum(TRIGGER_OPS),
        value: z.string(),
      })
    ),
    actions: z.array(actionFormItemSchema).min(1, 'Almeno un\'azione richiesta'),
  })
  .superRefine((data, ctx) => {
    if (data.trigger_event === 'cron' && !data.trigger_cron) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Espressione cron obbligatoria',
        path: ['trigger_cron'],
      })
    }
  })

export const DEFAULT_ACTION_ITEM: Omit<ActionFormItem, 'type'> = {
  url: '',
  method: 'POST',
  headers: [],
  body_template: '',
  to: '',
  subject_template: '',
  field: '',
  value: '',
  seed_slug: '',
  field_map: [],
}
