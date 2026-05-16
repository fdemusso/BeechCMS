// Mirror: apps/dashboard/src/features/automations/schema/automation.schema.ts — keep structurally identical.
import { z } from 'zod'
import type { WhenNode } from '@beechcms/core'

// ---------------------------------------------------------------------------
// Trigger conditions — recursive WhenNode schema (Task 14)
// ---------------------------------------------------------------------------

const whenOperandSchema = z.union([
  z.object({ kind: z.literal('literal'), value: z.unknown() }),
  z.object({ kind: z.literal('ref'), key: z.string().min(1) }),
])

const whenPredicateSchema = z.object({
  kind: z.literal('predicate'),
  left: whenOperandSchema,
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'startswith', 'endswith', 'in', 'notin', 'isempty', 'isnotempty', 'matches']),
  right: whenOperandSchema.optional(),
})

const whenNodeSchema: z.ZodType<WhenNode> = z.lazy(() =>
  z.union([
    whenPredicateSchema,
    z.object({
      kind: z.literal('group'),
      op: z.enum(['AND', 'OR']),
      children: z.array(whenNodeSchema).min(1),
      negate: z.boolean().optional(),
    }).refine(
      (g) => depthOf(g) <= 10,
      { message: 'WhenNode nesting exceeds maximum depth of 10' },
    ),
  ]),
)

function depthOf(node: unknown, d = 0): number {
  if (d > 10) return d
  if (typeof node !== 'object' || !node) return d
  const n = node as Record<string, unknown>
  if (n['kind'] === 'group' && Array.isArray(n['children'])) {
    return Math.max(...(n['children'] as unknown[]).map((c) => depthOf(c, d + 1)))
  }
  return d
}

// Legacy flat conditions — accepted for backward compatibility
const triggerConditionSchema = z.object({
  field: z.string().min(1),
  op: z.enum(['eq', 'neq', 'contains', 'gt', 'lt', 'isempty', 'isnotempty']),
  value: z.unknown(),
})

const triggerConditionsSchema = z.union([
  whenNodeSchema,
  z.array(triggerConditionSchema),
]).nullable().optional()

// ---------------------------------------------------------------------------
// Action schemas
// ---------------------------------------------------------------------------

const setVariableActionSchema = z.object({
  type: z.literal('set_variable'),
  name: z.string().min(1).regex(/^[a-zA-Z0-9_]+$/),
  seed_slug: z.string().min(1),
  load_type: z.enum(['fruit', 'branch']),
  filters: z.array(triggerConditionSchema).default([]),
  order_by: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
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
  setVariableActionSchema,
  webhookActionSchema,
  sendMailActionSchema,
  editFieldActionSchema,
  createEntryActionSchema,
])

// ---------------------------------------------------------------------------
// Triggers schema
// ---------------------------------------------------------------------------

const automationTriggerSchema = z.object({
  event: z.enum(['create', 'update', 'delete', 'cron']),
  cron: z.string().nullable().optional(),
})

const triggersSchema = z
  .array(automationTriggerSchema)
  .min(1, 'At least one trigger is required')
  .refine(
    (triggers) => triggers.filter((t) => t.event === 'cron').length <= 1,
    { message: 'Only one cron trigger is allowed per automation' },
  )
  .refine(
    (triggers) => {
      const events = triggers.map((t) => t.event)
      return new Set(events).size === events.length
    },
    { message: 'Duplicate trigger events are not allowed' },
  )
  .refine(
    (triggers) => triggers.every((t) => t.event !== 'cron' || !!t.cron),
    { message: 'cron expression is required for cron triggers', path: ['cron'] },
  )

// ---------------------------------------------------------------------------
// Automation create/update schemas
// ---------------------------------------------------------------------------

const createAutomationBaseSchema = z.object({
  seed_slug: z.string().min(1),
  name: z.string().min(1).max(100),
  triggers: triggersSchema,
  trigger_conditions: triggerConditionsSchema,
  actions: z.array(automationActionSchema).min(1, 'At least one action is required'),
})

export const createAutomationSchema = createAutomationBaseSchema

export const updateAutomationSchema = createAutomationBaseSchema.partial()

export const toggleAutomationSchema = z.object({
  enabled: z.boolean(),
})

export type CreateAutomationBody = z.infer<typeof createAutomationSchema>
export type UpdateAutomationBody = z.infer<typeof updateAutomationSchema>
