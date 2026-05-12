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
