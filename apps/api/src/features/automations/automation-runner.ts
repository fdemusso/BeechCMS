import type {
  IAutomationRunner,
  IAutomationRepository,
  AutomationEventPayload,
  ContentRepository,
  Seed,
  IIdGenerator,
} from '@beechcms/core'
import { evaluateConditions } from './automation-runner.utils'
import { resolveAutomationContext } from './context-resolver'
import { executeAction } from './action-executors'

// TODO Sprint 8 (Task 13): replace evaluateConditions with evaluateWhen() once
// recursive WhenNode groups are implemented.

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

      const resolverDeps = {
        contentRepository: this.deps.contentRepository,
        getSeed: this.deps.getSeed,
      }
      const resolved = await resolveAutomationContext(resolverDeps, automation, entry, [entry])

      for (const action of automation.actions) {
        try {
          await executeAction(action, {
            entry,
            env: this.deps.env,
            repository: this.deps.contentRepository,
            getSeed: this.deps.getSeed,
            seed,
            idGenerator: this.deps.idGenerator,
            context: resolved,
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
