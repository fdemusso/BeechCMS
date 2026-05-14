import type {
  Automation,
  BranchType,
  ContentRepository,
  FilterGroup,
  FilterOperator,
  FilterType,
  IAutomationRepository,
  IAutomationRunner,
  Seed,
  TriggerCondition,
} from '@beechcms/core'
import { cronMatches } from './cron-runner.utils'

export interface CronRunnerDeps {
  automationRepository: IAutomationRepository
  runner: IAutomationRunner
  contentRepository: ContentRepository
  getSeed: (slug: string) => Seed | null
}

export async function runCronAutomations(
  deps: CronRunnerDeps,
  scheduledTime: number,
): Promise<void> {
  const automations = await deps.automationRepository.findActive('*', 'cron')

  for (const automation of automations) {
    if (!cronMatches(automation.trigger_cron, scheduledTime)) continue

    const seed = deps.getSeed(automation.seed_slug)
    if (!seed) {
      console.warn('[cron] unknown seed', { automationId: automation.id, seedSlug: automation.seed_slug })
      continue
    }

    let entries: Array<Record<string, unknown>> = []
    try {
      entries = await fetchMatchingEntries(deps.contentRepository, seed, automation)
    } catch (err) {
      console.error('[cron] fetch entries failed', { automationId: automation.id, err })
      continue
    }

    for (const entry of entries) {
      try {
        await deps.runner.run({
          seedSlug: automation.seed_slug,
          event: 'cron',
          entry,
        })
      } catch (err) {
        console.error('[cron] entry processing failed', {
          automationId: automation.id,
          entryId: entry['id'],
          err,
        })
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
