export type AutomationTriggerEvent = 'create' | 'update' | 'delete' | 'cron'

export interface TriggerCondition {
  field: string
  op: 'eq' | 'neq' | 'contains' | 'gt' | 'lt' | 'isempty' | 'isnotempty'
  value: unknown
}

export interface SetVariableAction {
  type: 'set_variable'
  name: string
  seed_slug: string
  load_type: 'fruit' | 'branch'
  filters: TriggerCondition[]
  order_by?: string
  order?: 'asc' | 'desc'
}

export type AutomationAction =
  | { type: 'webhook';      url: string; method?: 'POST' | 'GET' | 'PUT'; headers?: Record<string, string>; body_template?: string }
  | { type: 'send_mail';    to: string; subject_template: string; body_template: string }
  | { type: 'edit_field';   field: string; value: unknown }
  | { type: 'create_entry'; seed_slug: string; field_map: Record<string, string> }
  | SetVariableAction

// ---------------------------------------------------------------------------
// TODO Sprint 8 (Tasks 10-16): WhenNode recursive condition groups
//
// export type WhenOperand = { kind: 'literal'; value: unknown } | { kind: 'ref'; key: string }
// export interface WhenPredicate { kind: 'predicate'; left: WhenOperand; op: string; right?: WhenOperand }
// export interface WhenGroup { kind: 'group'; op: 'AND' | 'OR'; children: WhenNode[]; negate?: boolean }
// export type WhenNode = WhenPredicate | WhenGroup
//
// When implemented, trigger_conditions becomes: WhenNode | TriggerCondition[] | null
// ---------------------------------------------------------------------------

export interface Automation {
  id: string
  seed_slug: string
  name: string
  enabled: boolean
  trigger_event: AutomationTriggerEvent
  trigger_cron: string | null
  trigger_conditions: TriggerCondition[] | null
  actions: AutomationAction[]
  created_at: number
  updated_at: number
}
