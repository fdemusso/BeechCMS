import type { IAutomationRunner, AutomationEventPayload } from './automations.runner.interface.js'

export class NoOpAutomationRunner implements IAutomationRunner {
  async run(_payload: AutomationEventPayload): Promise<void> {
    // intentionally empty
  }
}
