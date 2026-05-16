// Mirror of apps/api/src/features/automations/automations.schema.ts
// Keep structurally identical. Changes here must be reflected there and vice versa.
import { z } from 'zod'
import type { AutomationTriggerEvent, TriggerCondition } from '@beechcms/core'
import { AUTOMATION_RESERVED_WORDS } from '@beechcms/core'

export { AUTOMATION_RESERVED_WORDS }

export const TRIGGER_OPS = ['eq', 'neq', 'contains', 'gt', 'lt', 'isempty', 'isnotempty'] as const
export type TriggerOp = typeof TRIGGER_OPS[number]

export const WHEN_OPS = [
  'eq', 'neq',
  'gt', 'gte', 'lt', 'lte',
  'contains', 'startswith', 'endswith',
  'in', 'notin',
  'isempty', 'isnotempty',
  'matches',
] as const
export type WhenOp = typeof WHEN_OPS[number]

export const TRIGGER_EVENTS: AutomationTriggerEvent[] = ['create', 'update', 'delete', 'cron']

export type TriggerForm = {
  event: AutomationTriggerEvent | ''
  cron: string
}
export const ACTION_TYPES = ['set_variable', 'webhook', 'send_mail', 'edit_field', 'create_entry'] as const

export type HeaderPair = { key: string; value: string }
export type FieldMapPair = { targetAlias: string; sourceAlias: string }

// Flat action shape for RHF (all fields present, validated by type via superRefine)
export type ActionFormItem = {
  type: 'set_variable' | 'webhook' | 'send_mail' | 'edit_field' | 'create_entry'
  // set_variable fields
  name: string
  fixed_id: string
  column: string
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

// ---------------------------------------------------------------------------
// WhenNode form types (Task 15)
// Flat representation to keep RHF-compatible; converted to WhenNode for the API.
// ---------------------------------------------------------------------------

export type WhenPredicateForm = {
  kind: 'predicate'
  left_kind: 'ref' | 'literal'
  left_ref: string     // e.g. "this.status", "orders:all:sum:total"
  left_literal: string
  op: WhenOp
  right_kind: 'ref' | 'literal'
  right_ref: string
  right_literal: string
}

export type WhenGroupForm = {
  kind: 'group'
  op: 'AND' | 'OR'
  negate: boolean
  children: WhenNodeForm[]
}

export type WhenNodeForm = WhenPredicateForm | WhenGroupForm

export type AutomationFormValues = {
  name: string
  triggers: TriggerForm[]
  trigger_conditions: WhenGroupForm
  actions: ActionFormItem[]
}

const actionFormItemSchema = z
  .object({
    type: z.enum(['set_variable', 'webhook', 'send_mail', 'edit_field', 'create_entry']),
    name: z.string(),
    fixed_id: z.string(),
    column: z.string(),
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
      if (!data.name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(data.name)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'automations.editor.errors.variableNameInvalid', path: ['name'] })
      }
      if (data.name && AUTOMATION_RESERVED_WORDS.has(data.name)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'automations.editor.errors.variableNameReserved', path: ['name'] })
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

export const automationFormSchema = z
  .object({
    name: z.string().min(1, 'automations.editor.errors.nameRequired').max(100),
    triggers: z
      .array(z.object({
        event: z.union([z.literal(''), z.enum(['create', 'update', 'delete', 'cron'])]),
        cron: z.string(),
      }))
      .min(1, 'automations.editor.errors.triggersMin'),
    trigger_conditions: z.object({
      kind: z.literal('group'),
      op: z.enum(['AND', 'OR']),
      negate: z.boolean(),
      children: z.array(z.any()),
    }),
    actions: z.array(actionFormItemSchema).min(1, 'automations.editor.errors.actionsMin'),
  })
  .superRefine((data, ctx) => {
    data.triggers.forEach((t, i) => {
      if (!t.event) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'automations.editor.errors.triggerEventRequired', path: ['triggers', i, 'event'] })
      }
      if (t.event === 'cron' && !t.cron) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'automations.editor.errors.cronRequired', path: ['triggers', i, 'cron'] })
      }
    })
  })

export const DEFAULT_ACTION_ITEM: Omit<ActionFormItem, 'type'> = {
  name: '',
  fixed_id: '',
  column: '',
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

export const DEFAULT_TRIGGER_FORM: TriggerForm = {
  event: '',
  cron: '',
}

export const DEFAULT_WHEN_GROUP: WhenGroupForm = {
  kind: 'group',
  op: 'AND',
  negate: false,
  children: [],
}

export const DEFAULT_WHEN_PREDICATE: WhenPredicateForm = {
  kind: 'predicate',
  left_kind: 'ref',
  left_ref: '',
  left_literal: '',
  op: 'eq',
  right_kind: 'literal',
  right_ref: '',
  right_literal: '',
}
