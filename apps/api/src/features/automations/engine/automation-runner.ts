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
import { resolvePath } from './automation-runner.utils'
import { resolveAutomationContext, type ResolvedContext } from '../evaluator/context-resolver'
import type { ParsedKey } from '../evaluator/template-grammar'
import { executeAction } from '../executors/index'
import { evaluateWhen } from '../filters/when-evaluator'
import { resolveVarAccess } from '../evaluator/var-access-resolver'

export interface AutomationRunnerDeps {
  automationRepository: IAutomationRepository
  contentRepository: ContentRepository
  getSeed: (slug: string) => Seed | null
  idGenerator: IIdGenerator
  env: Record<string, string | undefined>
}

function withVariables(base: ResolvedContext, variables: Record<string, unknown>): ResolvedContext {
  return {
    triggerEntry: base.triggerEntry,
    lookup(parsed: ParsedKey, onMissing?: (field: string) => void): unknown {
      if (parsed.kind === 'simple') {
        const varVal = resolvePath(variables, parsed.path)
        if (varVal !== undefined) return varVal
      } else if (parsed.kind === 'var_access') {
        return resolveVarAccess(parsed, variables, onMissing)
      }
      return base.lookup(parsed, onMissing)
    },
  }
}

export class AutomationRunner implements IAutomationRunner {
  constructor(private readonly deps: AutomationRunnerDeps) {}

  async run(payload: AutomationEventPayload): Promise<void> {
    const { seedSlug, event, entry } = payload
    const seed = this.deps.getSeed(seedSlug)
    if (!seed) return

    const automations = await this.deps.automationRepository.findActive(seedSlug, event)

    for (const automation of automations) {
      const resolved = await resolveAutomationContext(automation, entry, [entry])

      // Evaluate conditions with the resolved context (this + batch scopes available).
      // Variables from set_variable actions are not yet available here; use inline refs
      // like {{customers:byid({{this.id}}):field}} for cross-seed conditions in v1.
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
