import type { AutomationAction, ContentRepository, Seed } from '@beechcms/core'
import { conditionToFilterGroup } from '../filter-translation'
import { interpolate } from '../automation-runner.utils'

type SetVariableAction = Extract<AutomationAction, { type: 'set_variable' }>

export async function executeSetVariable(
  action: SetVariableAction,
  ctx: {
    entry: Record<string, unknown>
    variables: Record<string, unknown>
    repository: ContentRepository
    getSeed: (slug: string) => Seed | null
  },
): Promise<void> {
  const targetSeed = ctx.getSeed(action.seed_slug)
  if (!targetSeed) {
    console.warn(
      `[set_variable] Seed "${action.seed_slug}" not found. Variable "${action.name}" set to null/empty.`,
    )
    ctx.variables[action.name] =
      action.load_type === 'fruit' ? null : { count: 0, sum: {}, avg: {}, pluck: {} }
    return
  }

  const unifiedScope = { this: ctx.entry, ...ctx.variables } as Record<string, unknown>

  const resolvedFilters = action.filters.map((f) => {
    const resolvedValue =
      typeof f.value === 'string' ? interpolate(f.value, unifiedScope) : f.value
    return conditionToFilterGroup({ ...f, value: resolvedValue } as typeof f, targetSeed)
  })

  const limit = action.load_type === 'fruit' ? 1 : 1000
  const orderDir = (action.order === 'asc' ? 'ASC' : 'DESC') as 'ASC' | 'DESC'

  const result = await ctx.repository.findMany(targetSeed, {
    filters: resolvedFilters,
    status: null,
    pagination: { limit, offset: 0 },
    orderBy: action.order_by ? { column: action.order_by, dir: orderDir } : undefined,
  })

  if (action.load_type === 'fruit') {
    ctx.variables[action.name] = result.items[0] ?? null
    return
  }

  const items = result.items
  const sum: Record<string, number> = {}
  const avg: Record<string, number> = {}
  const pluck: Record<string, string> = {}

  for (const branch of targetSeed.branches) {
    if (branch.type === 'number') {
      const total = items.reduce((acc, r) => {
        const v = Number(r[branch.alias])
        return Number.isNaN(v) ? acc : acc + v
      }, 0)
      sum[branch.alias] = total
      avg[branch.alias] = items.length > 0 ? total / items.length : 0
    } else {
      pluck[branch.alias] = items
        .slice(0, 100)
        .map((r) => String(r[branch.alias] ?? ''))
        .join(', ')
    }
  }

  ctx.variables[action.name] = { count: items.length, sum, avg, pluck }
}
