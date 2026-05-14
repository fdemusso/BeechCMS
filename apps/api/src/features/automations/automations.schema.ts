// Mirror: apps/dashboard/src/features/automations/schema/automation.schema.ts — keep structurally identical.
// TODO Sprint 8 (Task 14): add recursive whenNodeSchema for WhenNode validation.
import { z } from 'zod'

const triggerConditionSchema = z.object({
  field: z.string().min(1),
  op: z.enum(['eq', 'neq', 'contains', 'gt', 'lt', 'isempty', 'isnotempty']),
  value: z.unknown(),
})

const automationContextSelectorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('lastone') }),
  z.object({ kind: z.literal('firstone') }),
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('byid'), id: z.string().min(1) }),
  z.object({ kind: z.literal('where'), alias: z.string().min(1), value: z.string() }),
])

const automationContextLoadSchema = z.object({
  as: z.string().min(1).regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/, 'as must be a valid identifier'),
  seed_slug: z.string().min(1),
  selector: automationContextSelectorSchema.optional(),
  where: z.array(triggerConditionSchema).optional(),
  order_by: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
})

const webhookActionSchema = z.object({
  type: z.literal('webhook'),
  url: z.string().url(),
  method: z.enum(['POST', 'GET', 'PUT']).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body_template: z.string().optional(),
})

const sendMailActionSchema = z.object({
  type: z.literal('send_mail'),
  to: z.string().email(),
  subject_template: z.string().min(1),
  body_template: z.string().min(1),
})

const editFieldActionSchema = z.object({
  type: z.literal('edit_field'),
  field: z.string().min(1),
  value: z.unknown(),
})

const createEntryActionSchema = z.object({
  type: z.literal('create_entry'),
  seed_slug: z.string().min(1),
  field_map: z.record(z.string(), z.string()),
})

export const automationActionSchema = z.discriminatedUnion('type', [
  webhookActionSchema,
  sendMailActionSchema,
  editFieldActionSchema,
  createEntryActionSchema,
])

const createAutomationBaseSchema = z.object({
  seed_slug: z.string().min(1),
  name: z.string().min(1).max(100),
  trigger_event: z.enum(['create', 'update', 'delete', 'cron']),
  trigger_cron: z.string().nullable().optional(),
  trigger_conditions: z.array(triggerConditionSchema).nullable().optional(),
  actions: z.array(automationActionSchema).min(1, 'At least one action is required'),
  context: z.array(automationContextLoadSchema).nullable().optional(),
})

export const createAutomationSchema = createAutomationBaseSchema.refine(
  (data) => data.trigger_event !== 'cron' || !!data.trigger_cron,
  { message: 'trigger_cron is required when trigger_event is cron', path: ['trigger_cron'] },
)

// Partial drops the cron-required refinement — patching only `name` should not require `trigger_cron`
export const updateAutomationSchema = createAutomationBaseSchema.partial()

export const toggleAutomationSchema = z.object({
  enabled: z.boolean(),
})

export type CreateAutomationBody = z.infer<typeof createAutomationSchema>
export type UpdateAutomationBody = z.infer<typeof updateAutomationSchema>
