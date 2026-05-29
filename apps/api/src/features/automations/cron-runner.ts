// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type {
  Automation,
  ContentRepository,
  FilterGroup,
  IAutomationRepository,
  IIdGenerator,
  Seed,
} from '@beechcms/core'
import { cronMatches } from './cron-runner.utils'
import { executeAction } from './action-executors'
import { resolveAutomationContext, deriveEntryContext } from './context-resolver'
import { extractPushdownFilters } from './when-pushdown'
import { evaluateWhen } from './when-evaluator'

export interface CronRunnerDeps {
  automationRepository: IAutomationRepository
  contentRepository: ContentRepository
  getSeed: (slug: string) => Seed | null
  env: Record<string, string | undefined>
  idGenerator: IIdGenerator
}

// These actions mutate individual entries and must run once per entry.
// All other actions (send_mail, webhook) run once per automation with a batch context.
const PER_ENTRY_ACTIONS = new Set(['edit_field', 'create_entry'])

export async function runCronAutomations(
  deps: CronRunnerDeps,
  scheduledTime: number,
): Promise<void> {
  console.log(`[cron] Starting runCronAutomations at scheduledTime: ${new Date(scheduledTime).toISOString()}`)

  let automations: Automation[]
  try {
    automations = await deps.automationRepository.findActive('*', 'cron')
  } catch (err) {
    console.error('[cron] Failed to fetch automations — is migration 0029_automations.sql applied?', err)
    return
  }

  console.log(`[cron] Found ${automations.length} active cron automation(s)`)

  for (const automation of automations) {
    const cronTrigger = automation.triggers.find((t) => t.event === 'cron')
    if (!cronMatches(cronTrigger?.cron ?? null, scheduledTime)) {
      console.log(`[cron] Skipping "${automation.name}": cron expression "${cronTrigger?.cron}" does not match.`)
      continue
    }

    const seed = deps.getSeed(automation.seed_slug)
    if (!seed) {
      console.warn('[cron] unknown seed', { automationId: automation.id, seedSlug: automation.seed_slug })
      continue
    }

    let entries: Array<Record<string, unknown>> = []
    try {
      entries = await fetchMatchingEntries(deps.contentRepository, seed, automation)
      console.log(`[cron] Fetched ${entries.length} matching entries for automation "${automation.name}"`)
    } catch (err) {
      console.error('[cron] fetch entries failed', { automationId: automation.id, err })
      continue
    }

    if (entries.length === 0) continue

    // Build the base ResolvedContext once per automation (shared seed-query cache).
    // triggerEntry = first entry; batchEntries = full SQL-filtered list.
    const batchResolved = await resolveAutomationContext(
      automation,
      entries[0] ?? null,
      entries,
    )

    const variables: Record<string, unknown> = {}
    const baseCtx = {
      env: deps.env,
      repository: deps.contentRepository,
      getSeed: deps.getSeed,
      seed,
      idGenerator: deps.idGenerator,
      variables,
    }

    for (const action of automation.actions) {
      if (PER_ENTRY_ACTIONS.has(action.type)) {
        for (const entry of entries) {
          // Per-entry: derive a lightweight context whose `this` is the current entry.
          // Seed-query cache is reused from batchResolved.
          const entryResolved = deriveEntryContext(batchResolved, entry)
          // In-memory per-entry condition check (Task 13)
          if (!evaluateWhen(automation.trigger_conditions, entryResolved)) continue
          try {
            await executeAction(action, { ...baseCtx, entry, context: entryResolved })
          } catch (err) {
            console.error('[cron] entry action failed', {
              automationId: automation.id,
              entryId: entry['id'],
              actionType: action.type,
              err,
            })
          }
        }
      } else {
        // Batch actions run once per automation with the shared batch context.
        try {
          await executeAction(action, { ...baseCtx, entry: entries[0] ?? {}, context: batchResolved })
        } catch (err) {
          console.error('[cron] batch action failed', {
            automationId: automation.id,
            actionType: action.type,
            err,
          })
        }
      }
    }
  }
}

async function fetchMatchingEntries(
  repository: ContentRepository,
  seed: Seed,
  automation: Automation,
): Promise<Array<Record<string, unknown>>> {
  // Task 12: push down only safe predicates to SQL (this.<field> = literal, AND group only).
  // OR branches, cross-seed refs, and gte/lte/etc. ops are evaluated in-memory by evaluateWhen().
  const filters: FilterGroup[] = automation.trigger_conditions
    ? extractPushdownFilters(automation.trigger_conditions, seed)
    : []
  const result = await repository.findMany(seed, {
    filters,
    status: null,
    pagination: { limit: 1000, offset: 0 },
  })
  return result.items
}
