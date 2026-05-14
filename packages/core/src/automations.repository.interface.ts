import type { Automation, AutomationAction, TriggerCondition, AutomationTriggerEvent } from './automations.types.js'

export interface CreateAutomationInput {
  seed_slug: string
  name: string
  trigger_event: AutomationTriggerEvent
  trigger_cron: string | null
  trigger_conditions: TriggerCondition[] | null
  actions: AutomationAction[]
}

export type UpdateAutomationInput = Partial<CreateAutomationInput>

export interface IAutomationRepository {
  list(seedSlug: string): Promise<Automation[]>
  findById(id: string): Promise<Automation | null>
  create(input: CreateAutomationInput): Promise<string>
  update(id: string, input: UpdateAutomationInput): Promise<void>
  toggle(id: string, enabled: boolean): Promise<void>
  delete(id: string): Promise<void>
  findActive(seedSlug: string, event: AutomationTriggerEvent): Promise<Automation[]>
}
