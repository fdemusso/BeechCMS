// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type {
  IAutomationRunner,
  IAutomationRepository,
  AutomationEventPayload,
  ContentRepository,
  Seed,
  IIdGenerator,
} from '@beechcms/core'
import { resolveAutomationContext, withVariables } from '../evaluator/context-resolver'
import { executeAction } from '../executors/index'
import { evaluateWhen } from '../filters/when-evaluator'

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
      const resolved = await resolveAutomationContext(automation, entry, [entry], {
        repository: this.deps.contentRepository,
        getSeed: this.deps.getSeed,
      })

      // Evaluate conditions with the resolved context (this, batch and seed-scoped refs).
      // Variables from set_variable actions are not yet available here; seed-scoped refs
      // need a literal selector, e.g. {{customers:byid(c_42):field}} (no nested {{...}}).
      if (!evaluateWhen(automation.trigger_conditions, resolved)) continue

      const variables: Record<string, unknown> = {}

      for (const action of automation.actions) {
        try {
          await executeAction(action, {
            entry,
            env: this.deps.env,
            repository: this.deps.contentRepository,
            getSeed: this.deps.getSeed,
            seed,
            idGenerator: this.deps.idGenerator,
            context: withVariables(resolved, variables),
            variables,
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
