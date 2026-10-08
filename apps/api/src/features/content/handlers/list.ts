// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Context } from 'hono'
import { parsePositiveInt, parseQueryFilters, cleanStr, toEngineFilters } from '../../../shared/utils/query-utils'
import { applyVisibility, toEntryEnvelope } from '../../../shared/policies/apply-policies'
import { publicProblem } from '../../../public/errors/problem-details'
import { CONTENT_ERRORS } from '../constants'
import { AppEnv } from '../../../types'
import { resolveKanbanConfig, type FilterGroup, type ActorContext, type LocaleConfig, type Seed } from '@beechcms/core'
import { loadLocaleConfig } from '../../../shared/localization/locale-config'
import { loadDisplayLocaleConfig, resolveDisplayName } from '../../../shared/localization/display-name'

/**
 * Builds a compact `relations` map for the list response.
 * For each relation branch in the seed, collects non-null referenced ids from
 * the page items, then fires ONE batched query per target seed to retrieve
 * only the label column. This is O(R) extra queries per page (R = # relation
 * branches) instead of O(N*R) per-row fetches.
 *
 * Shape: { [branchAlias]: { [targetId]: labelString } }
 */
async function buildRelationsMap(
  context: Context<AppEnv>,
  seed: Seed,
  entries: Record<string, unknown>[],
  localeConfig: LocaleConfig | undefined,
  actor: ActorContext,
): Promise<Record<string, Record<string, string>>> {
  const relationBranches = seed.branches.filter(
    (b: { type: string }) => b.type === 'relation'
  ) as Array<{ alias: string; targetSeed?: string }>

  if (relationBranches.length === 0) return {}

  const relations: Record<string, Record<string, string>> = {}
  const repository = context.get('repository')
  const seedRegistry = context.get('seedRegistry')
  const targetSeeds = relationBranches
    .map((branch) => (branch.targetSeed ? seedRegistry.get(branch.targetSeed) : undefined))
    .filter((target): target is Seed => target !== null && target !== undefined)
  // Reuse the list's config when it was loaded; otherwise read settings only if a target's label is localized.
  const labelConfig = localeConfig ?? await loadDisplayLocaleConfig(context.get('siteSettingsRepository'), targetSeeds)

  for (const branch of relationBranches) {
    const targetSlug = branch.targetSeed
    if (!targetSlug) continue

    const targetSeedDef = seedRegistry.get(targetSlug)
    if (!targetSeedDef) continue

    const labelAlias = targetSeedDef.displayNameAlias ?? 'title'

    // Collect unique non-empty ids referenced by this branch (scalar or multi-relation array)
    const ids = Array.from(
      new Set(
        entries.flatMap((entry) => {
          const value = (entry.data as Record<string, unknown>)[branch.alias]
          const values = Array.isArray(value) ? value : [value]
          return values.filter((id): id is string => typeof id === 'string' && id !== '')
        })
      )
    )

    if (ids.length === 0) continue

    try {
      const { items } = await repository.findMany(targetSeedDef, {
        filters: [
          {
            column: 'id',
            type: 'system' as const,
            conditions: [{ op: 'in' as const, value: ids }],
          },
        ],
        fields: ['id', labelAlias],
        pagination: { limit: ids.length, offset: 0 },
      })

      const map: Record<string, string> = {}
      for (const item of items) {
        const row = item as Record<string, unknown>
        const id = row.id as string
        // The label obeys the target's visibility policy: a concealed field falls back to the id.
        const visible = applyVisibility(row, targetSeedDef, actor)
        const label = resolveDisplayName(targetSeedDef, visible[labelAlias], labelConfig)
        map[id] = label != null && label !== '' ? String(label) : id
      }

      relations[branch.alias] = map
    } catch (error) {
      // Non-fatal only when the target seed table doesn't exist yet; real DB errors surface as 500.
      if (!(error instanceof Error && /no such table/i.test(error.message))) throw error
    }
  }

  return relations
}

export async function listHandler(context: Context<AppEnv>) {
  const slug = context.req.param('slug')
  if (!slug) {
    return publicProblem(context, {
      type: 'content-invalid-slug',
      title: 'Bad Request',
      status: 400,
      detail: CONTENT_ERRORS.INVALID_SLUG
    })
  }

  const seed = context.get('getSeed')(slug)
  if (!seed) {
    return publicProblem(context, {
      type: 'content-seed-not-found',
      title: 'Not Found',
      status: 404,
      detail: CONTENT_ERRORS.SEED_NOT_FOUND
    })
  }

  try {
    const query = context.req.query()
    const search = cleanStr(query.search) ?? ''
    const sortBy = cleanStr(query.sortBy) ?? ''
    const sortDirRaw = cleanStr(query.sortDir)?.toLowerCase() ?? 'asc'
    const rawFilters = parseQueryFilters(query.filters)
    const engineFilters = toEngineFilters(rawFilters)

    // Note: repository doesn't yet support has_pending_draft filter/column natively
    // in findMany without SQL manipulation. We'll stick to basic findMany for now
    // and might need to enhance the repository if this feature is critical for v1 of this refactor.
    // The legacy code was doing a lot of SQL injection here.

    const page = parsePositiveInt(query.page, 1)
    const limit = Math.min(parsePositiveInt(query.limit, 25), 100)
    const offset = (page - 1) * limit

    const orderBy = sortBy
      ? { column: sortBy, dir: (sortDirRaw === 'desc' ? 'DESC' : 'ASC') as 'ASC' | 'DESC' }
      : undefined

    const kanbanAxis = cleanStr(query.kanbanAxis)
    let kanbanOrder: { seedSlug: string; axisBranchId: string } | undefined
    if (kanbanAxis) {
      const compat = resolveKanbanConfig(seed)
      if (!compat.compatible || !compat.candidates.some(c => c.branchId === kanbanAxis)) {
        return publicProblem(context, {
          type: 'content-invalid-kanban-axis',
          title: 'Bad Request',
          status: 400,
          detail: 'kanbanAxis is not a valid candidate for this seed',
        })
      }
      kanbanOrder = { seedSlug: slug, axisBranchId: kanbanAxis }
    }

    // When fetching for kanban columns, filters arrive in engine FilterGroup[] format
    // (from kanbanColumnFilter), not the dashboard QueryFilterGroup format.
    let allFilters: FilterGroup[] = engineFilters
    if (kanbanOrder) {
      const rawFilters = cleanStr(query.filters)
      if (rawFilters) {
        try {
          const parsed: unknown = JSON.parse(rawFilters)
          if (Array.isArray(parsed)) {
            allFilters = parsed.filter(
              (g): g is FilterGroup =>
                g !== null && typeof g === 'object' &&
                typeof (g as Record<string, unknown>).column === 'string' &&
                Array.isArray((g as Record<string, unknown>).conditions),
            )
          }
        } catch { /* invalid json — use empty */ }
      } else {
        allFilters = []
      }
    }

    // Sort and filter compare the value the dashboard shows (default locale), not the stored JSON text.
    const localeConfig = await loadLocaleConfig(context.get('siteSettingsRepository'), seed)

    const repository = context.get('repository')
    const { items, total } = await repository.findMany(seed, {
      filters: allFilters,
      orderBy: kanbanOrder ? undefined : orderBy,
      search: search || undefined,
      pagination: { limit, offset },
      kanbanOrder,
      locale: localeConfig ? { code: localeConfig.defaultLocale, config: localeConfig } : undefined,
    })

    const jwtPayload = context.get('jwtPayload')
    const actor: ActorContext = context.get('actor') ?? {
      type: 'authenticated',
      userId: jwtPayload?.sub,
      role: jwtPayload?.role,
    }

    const entries = await Promise.all(items.map(async (item) => {
      // Check for pending draft if allowed
      let hasPendingDraft = false
      if (seed.allowDrafts) {
        hasPendingDraft = await repository.hasDraft(seed, item.id)
      }

      return {
        ...toEntryEnvelope(item, seed, actor),
        has_pending_draft: hasPendingDraft,
      }
    }))

    // If no query params (except slug), return array directly (legacy compatibility)
    const hasQueryParams = Boolean(search) || Boolean(sortBy) || Boolean(query.filters) || Boolean(kanbanAxis) || query.page !== undefined || query.limit !== undefined
    if (!hasQueryParams) {
      return context.json(entries)
    }

    // Build compact relation labels map for N+1 mitigation
    const relations = await buildRelationsMap(context, seed, entries, localeConfig, actor)

    return context.json({ items: entries, total, page, limit, relations })
  } catch (error) {
    console.error('Content list error:', error)
    return publicProblem(context, {
      type: 'content-database-error',
      title: 'Internal Server Error',
      status: 500,
      detail: CONTENT_ERRORS.DATABASE_ERROR
    })
  }
}
