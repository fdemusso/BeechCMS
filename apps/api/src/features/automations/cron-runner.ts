import type {
  Automation,
  BranchType,
  ContentRepository,
  FilterGroup,
  FilterOperator,
  FilterType,
  IAutomationRepository,
  IIdGenerator,
  Seed,
  TriggerCondition,
} from '@beechcms/core'
import { cronMatches } from './cron-runner.utils'
import { executeAction } from './action-executors'

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
          try {
            await executeAction(action, { ...baseCtx, entry })
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
        // Batch actions run once per automation. Template context uses the first
        // entry's fields plus {{_count}} = total number of matching entries.
        const batchEntry = { ...entries[0], _count: entries.length }
        try {
          await executeAction(action, { ...baseCtx, entry: batchEntry })
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

const SYSTEM_COLUMNS = new Set(['id', 'slug', 'status', 'created_at', 'updated_at'])

function mapBranchTypeToFilterType(type: BranchType): FilterType {
  switch (type) {
    case 'number': return 'number'
    case 'boolean': return 'boolean'
    case 'date': return 'date'
    case 'tags': return 'tags'
    case 'json': return 'json'
    default: return 'text'
  }
}

function mapOp(op: TriggerCondition['op']): FilterOperator {
  switch (op) {
    case 'isempty': return 'is_empty'
    case 'isnotempty': return 'is_not_empty'
    default: return op
  }
}

function conditionToFilterGroup(c: TriggerCondition, seed: Seed): FilterGroup {
  const branch = seed.branches.find((b) => b.alias === c.field)
  const type: FilterType = branch
    ? mapBranchTypeToFilterType(branch.type)
    : SYSTEM_COLUMNS.has(c.field) ? 'system' : 'text'

  return {
    column: c.field,
    type,
    conditions: [{ op: mapOp(c.op), value: c.value as string | number | boolean | null }],
  }
}

async function fetchMatchingEntries(
  repository: ContentRepository,
  seed: Seed,
  automation: Automation,
): Promise<Array<Record<string, unknown>>> {
  const filters = (automation.trigger_conditions ?? []).map((c) => conditionToFilterGroup(c, seed))
  const result = await repository.findMany(seed, {
    filters,
    status: null,
    pagination: { limit: 1000, offset: 0 },
  })
  return result.items
}
