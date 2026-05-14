import type {
  Automation,
  ContentRepository,
  IAutomationRepository,
  IIdGenerator,
  Seed,
  TriggerCondition,
} from '@beechcms/core'
import { cronMatches } from './cron-runner.utils'
import { executeAction } from './action-executors'
import { resolveAutomationContext, deriveEntryContext } from './context-resolver'
import { conditionToFilterGroup } from './filter-translation'
import { evaluateConditions } from './automation-runner.utils'

// TODO Sprint 8 (Task 12): replace conditionToFilterGroup mapping with
// extractPushdownFilters(node, seed) so only safe WhenNode predicates go to SQL.
// TODO Sprint 8 (Task 13): replace evaluateConditions with evaluateWhen().

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

  const resolverDeps = {
    contentRepository: deps.contentRepository,
    getSeed: deps.getSeed,
  }

  for (const automation of automations) {
    if (!cronMatches(automation.trigger_cron, scheduledTime)) {
      console.log(`[cron] Skipping "${automation.name}": cron expression "${automation.trigger_cron}" does not match.`)
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
    // triggerEntry = first entry; batchEntries = full list.
    const batchResolved = await resolveAutomationContext(
      resolverDeps,
      automation,
      entries[0] ?? null,
      entries,
    )

    const baseCtx = {
      env: deps.env,
      repository: deps.contentRepository,
      getSeed: deps.getSeed,
      seed,
      idGenerator: deps.idGenerator,
    }

    for (const action of automation.actions) {
      if (PER_ENTRY_ACTIONS.has(action.type)) {
        for (const entry of entries) {
          // Per-entry: derive a lightweight context whose `this` is the current entry.
          // Seed-query cache is reused from batchResolved.
          const entryResolved = deriveEntryContext(batchResolved, entry)
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
  const filters = (automation.trigger_conditions ?? []).map((c: TriggerCondition) => conditionToFilterGroup(c, seed))
  const result = await repository.findMany(seed, {
    filters,
    status: null,
    pagination: { limit: 1000, offset: 0 },
  })
  return result.items
}
