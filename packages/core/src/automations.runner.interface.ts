import type { AutomationTriggerEvent } from './automations.types.js'

export interface AutomationEventPayload {
  seedSlug: string
  event: AutomationTriggerEvent
  entry: Record<string, unknown>
}

export interface IAutomationRunner {
  run(payload: AutomationEventPayload): Promise<void>
}
