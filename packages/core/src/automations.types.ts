export type AutomationTriggerEvent = 'create' | 'update' | 'delete' | 'cron'

export interface TriggerCondition {
  field: string
  op: 'eq' | 'neq' | 'contains' | 'gt' | 'lt' | 'isempty' | 'isnotempty'
  value: unknown
}

export type AutomationAction =
  | { type: 'webhook';      url: string; method?: 'POST' | 'GET' | 'PUT'; headers?: Record<string, string>; body_template?: string }
  | { type: 'send_mail';    to: string; subject_template: string; body_template: string }
  | { type: 'edit_field';   field: string; value: unknown }
  | { type: 'create_entry'; seed_slug: string; field_map: Record<string, string> }

// ---------------------------------------------------------------------------
// Sprint 6: Context-load types
// ---------------------------------------------------------------------------

export type AutomationContextSelector =
  | { kind: 'lastone' }
  | { kind: 'firstone' }
  | { kind: 'all' }
  | { kind: 'byid'; id: string }
  | { kind: 'where'; alias: string; value: string }

export interface AutomationContextLoad {
  as: string
  seed_slug: string
  /** Default: { kind: 'lastone' } */
  selector?: AutomationContextSelector
  where?: TriggerCondition[]
  order_by?: string
  order?: 'asc' | 'desc'
  /** Default 100, max 1000 */
  limit?: number
}

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
  context: AutomationContextLoad[] | null
  created_at: number
  updated_at: number
}
