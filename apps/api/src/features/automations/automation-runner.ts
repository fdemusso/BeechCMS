import type {
  IAutomationRunner,
  IAutomationRepository,
  AutomationEventPayload,
  ContentRepository,
  Seed,
  IIdGenerator,
} from '@beechcms/core'
import { evaluateConditions } from './automation-runner.utils'
import { executeAction } from './action-executors'

export interface AutomationRunnerDeps {
  automationRepository: IAutomationRepository
  contentRepository: ContentRepository
  getSeed: (slug: string) => Seed | null
  idGenerator: IIdGenerator
  env: Record<string, string | undefined>
}

export class AutomationRunner implements IAutomationRunner {
  constructor(private readonly deps: AutomationRunnerDeps) {}

  async run(payload: AutomationEventPayload): Promise<void> {
    const { seedSlug, event, entry } = payload
    const seed = this.deps.getSeed(seedSlug)
    if (!seed) return

    const automations = await this.deps.automationRepository.findActive(seedSlug, event)

    for (const automation of automations) {
      if (!evaluateConditions(automation.trigger_conditions, entry)) continue

      for (const action of automation.actions) {
        try {
          await executeAction(action, {
            entry,
            env: this.deps.env,
            repository: this.deps.contentRepository,
            getSeed: this.deps.getSeed,
            seed,
            idGenerator: this.deps.idGenerator,
          })
        } catch (error) {
          console.error('[automations] action failed', {
            automationId: automation.id,
            actionType: action.type,
            error,
          })
        }
      }
    }
  }
}
