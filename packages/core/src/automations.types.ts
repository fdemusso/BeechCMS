// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export type AutomationTriggerEvent = 'create' | 'update' | 'delete' | 'cron'

export interface AutomationTrigger {
  event: AutomationTriggerEvent
  cron?: string | null
}

export interface TriggerCondition {
  field: string
  op: 'eq' | 'neq' | 'contains' | 'gt' | 'lt' | 'isempty' | 'isnotempty'
  value: unknown
}

// ---------------------------------------------------------------------------
// WhenNode — recursive condition groups (Sprint 8 Task 10)
// ---------------------------------------------------------------------------

export type WhenOperand =
  | { kind: 'literal'; value: unknown }
  | { kind: 'ref'; key: string }  // template grammar key, e.g. "this.total"

export type WhenOp =
  | 'eq' | 'neq'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'startswith' | 'endswith'
  | 'in' | 'notin'
  | 'isempty' | 'isnotempty'
  | 'matches'

export interface WhenPredicate {
  kind: 'predicate'
  left: WhenOperand
  op: WhenOp
  right?: WhenOperand
}

export interface WhenGroup {
  kind: 'group'
  op: 'AND' | 'OR'
  children: WhenNode[]
  negate?: boolean
}

export type WhenNode = WhenPredicate | WhenGroup

export interface SetVariableAction {
  type: 'set_variable'
  name: string
  seed_slug?: string
  fixed_id?: string
  column?: string
  filters?: TriggerCondition[]
  order_by?: string
  order?: 'asc' | 'desc'
}

export type AutomationAction =
  | { type: 'webhook';      url: string; method?: 'POST' | 'GET' | 'PUT'; headers?: Record<string, string>; body_template?: string }
  | { type: 'send_mail';    to: string; subject_template: string; body_template: string }
  | { type: 'edit_field';   field: string; value: unknown }
  | { type: 'create_entry'; seed_slug: string; field_map: Record<string, string> }
  | SetVariableAction

export interface Automation {
  id: string
  seed_slug: string
  name: string
  enabled: boolean
  triggers: AutomationTrigger[]
  trigger_conditions: WhenNode | null
  actions: AutomationAction[]
  created_at: number
  updated_at: number
}
