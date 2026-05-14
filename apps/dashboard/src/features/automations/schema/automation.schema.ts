// Mirror of apps/api/src/features/automations/automations.schema.ts
// Keep structurally identical. Changes here must be reflected there and vice versa.
// TODO Sprint 8 (Task 14): add recursive whenNodeSchema for WhenNode validation.
import { z } from 'zod'
import type { AutomationTriggerEvent, TriggerCondition } from '@beechcms/core'

export const TRIGGER_OPS = ['eq', 'neq', 'contains', 'gt', 'lt', 'isempty', 'isnotempty'] as const
export type TriggerOp = typeof TRIGGER_OPS[number]

export const TRIGGER_EVENTS: AutomationTriggerEvent[] = ['create', 'update', 'delete', 'cron']
export const ACTION_TYPES = ['set_variable', 'webhook', 'send_mail', 'edit_field', 'create_entry'] as const

export type HeaderPair = { key: string; value: string }
export type FieldMapPair = { targetAlias: string; sourceAlias: string }

// Flat action shape for RHF (all fields present, validated by type via superRefine)
export type ActionFormItem = {
  type: 'set_variable' | 'webhook' | 'send_mail' | 'edit_field' | 'create_entry'
  // set_variable fields
  name: string
  load_type: 'fruit' | 'branch'
  filters: TriggerConditionForm[]
  // webhook fields
  url: string
  method: 'POST' | 'GET' | 'PUT'
  headers: HeaderPair[]
  body_template: string
  // send_mail fields
  to: string
  subject_template: string
  // edit_field fields
  field: string
  value: string
  // create_entry / set_variable shared
  seed_slug: string
  field_map: FieldMapPair[]
}

export type TriggerConditionForm = {
  field: string
  op: TriggerCondition['op']
  value: string
}

export type ContextSelectorKind = 'lastone' | 'firstone' | 'all' | 'byid'

export type ContextLoadForm = {
  as: string
  seed_slug: string
  selector_kind: ContextSelectorKind
  byid_value: string
  order_by: string
  order: 'asc' | 'desc'
  limit: number
}

export type AutomationFormValues = {
  name: string
  trigger_event: AutomationTriggerEvent
  trigger_cron: string
  trigger_conditions: TriggerConditionForm[]
  context: ContextLoadForm[]
  actions: ActionFormItem[]
}

const actionFormItemSchema = z
  .object({
    type: z.enum(['set_variable', 'webhook', 'send_mail', 'edit_field', 'create_entry']),
    name: z.string(),
    load_type: z.enum(['fruit', 'branch']),
    filters: z.array(z.object({ field: z.string(), op: z.enum(TRIGGER_OPS), value: z.string() })),
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
    if (data.type === 'set_variable') {
      if (!data.name || !/^[a-zA-Z0-9_]+$/.test(data.name)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'automations.editor.errors.variableNameInvalid', path: ['name'] })
      }
      if (!data.seed_slug) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'automations.editor.errors.seedRequired', path: ['seed_slug'] })
      }
    }
    if (data.type === 'webhook') {
      if (!data.url) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'automations.editor.errors.urlRequired', path: ['url'] })
      } else if (!z.string().url().safeParse(data.url).success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'automations.editor.errors.urlInvalid', path: ['url'] })
      }
    }
    if (data.type === 'send_mail') {
      if (!data.to) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'automations.editor.errors.emailRequired', path: ['to'] })
      } else if (!z.string().email().safeParse(data.to).success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'automations.editor.errors.emailInvalid', path: ['to'] })
      }
      if (!data.subject_template) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'automations.editor.errors.subjectRequired', path: ['subject_template'] })
      }
      if (!data.body_template) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'automations.editor.errors.bodyRequired', path: ['body_template'] })
      }
    }
    if (data.type === 'edit_field') {
      if (!data.field) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'automations.editor.errors.fieldRequired', path: ['field'] })
      }
    }
    if (data.type === 'create_entry') {
      if (!data.seed_slug) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'automations.editor.errors.seedRequired', path: ['seed_slug'] })
      }
    }
  })

const contextLoadFormSchema = z.object({
  as: z.string().min(1),
  seed_slug: z.string().min(1),
  selector_kind: z.enum(['lastone', 'firstone', 'all', 'byid']),
  byid_value: z.string(),
  order_by: z.string(),
  order: z.enum(['asc', 'desc']),
  limit: z.number().int().min(1).max(1000),
})

export const DEFAULT_CONTEXT_LOAD: ContextLoadForm = {
  as: '',
  seed_slug: '',
  selector_kind: 'lastone',
  byid_value: '',
  order_by: '',
  order: 'desc',
  limit: 100,
}

export const automationFormSchema = z
  .object({
    name: z.string().min(1, 'automations.editor.errors.nameRequired').max(100),
    trigger_event: z.enum(['create', 'update', 'delete', 'cron']),
    trigger_cron: z.string(),
    trigger_conditions: z.array(
      z.object({
        field: z.string().min(1),
        op: z.enum(TRIGGER_OPS),
        value: z.string(),
      })
    ),
    context: z.array(contextLoadFormSchema),
    actions: z.array(actionFormItemSchema).min(1, 'automations.editor.errors.actionsMin'),
  })
  .superRefine((data, ctx) => {
    if (data.trigger_event === 'cron' && !data.trigger_cron) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'automations.editor.errors.cronRequired',
        path: ['trigger_cron'],
      })
    }
  })

export const DEFAULT_ACTION_ITEM: Omit<ActionFormItem, 'type'> = {
  name: '',
  load_type: 'fruit',
  filters: [],
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
