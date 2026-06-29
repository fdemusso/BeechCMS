// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Context } from 'hono'
import { parsePositiveInt, parseQueryFilters, cleanStr, toEngineFilters } from '../../../shared/utils/query-utils'
import { applyVisibility } from '../../../shared/policies/apply-policies'
import { publicProblem } from '../../../public/problem-details'
import { CONTENT_ERRORS } from '../constants'
import { AppEnv } from '../../../types'
import { resolveKanbanConfig, type FilterGroup } from '@beechcms/core'

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
  seed: Parameters<typeof applyVisibility>[1],
  entries: Record<string, unknown>[]
): Promise<Record<string, Record<string, string>>> {
  const relationBranches = seed.branches.filter(
    (b: { type: string }) => b.type === 'relation'
  ) as Array<{ alias: string; targetSeed?: string }>

  if (relationBranches.length === 0) return {}

  const relations: Record<string, Record<string, string>> = {}
  const repository = context.get('repository')
  const seedRegistry = context.get('seedRegistry')

  for (const branch of relationBranches) {
    const targetSlug = branch.targetSeed
    if (!targetSlug) continue

    const targetSeedDef = seedRegistry.get(targetSlug)
    if (!targetSeedDef) continue

    const labelAlias = targetSeedDef.displayNameAlias ?? 'title'

    // Collect unique non-null ids referenced by this branch
    const ids = Array.from(
      new Set(
        entries
          .map((entry) => {
            const data = entry.data as Record<string, unknown>
            return typeof data[branch.alias] === 'string' && data[branch.alias]
              ? (data[branch.alias] as string)
              : null
          })
          .filter((id): id is string => id !== null)
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
        const id = (item as Record<string, unknown>).id as string
        const data = (item as Record<string, unknown>).data as Record<string, unknown>
        const label = data[labelAlias]
        map[id] = label != null && label !== '' ? String(label) : id
      }

      relations[branch.alias] = map
    } catch {
      // Non-fatal: if the target seed table doesn't exist yet, skip
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

    const repository = context.get('repository')
    const { items, total } = await repository.findMany(seed, {
      filters: allFilters,
      orderBy: kanbanOrder ? undefined : orderBy,
      search: search || undefined,
      pagination: { limit, offset },
      kanbanOrder,
    })

    const entries = await Promise.all(items.map(async (item) => {
      // Check for pending draft if allowed
      let hasPendingDraft = false
      if (seed.allowDrafts) {
        hasPendingDraft = await repository.hasDraft(seed, item.id)
      }

      return {
        ...item,
        has_pending_draft: hasPendingDraft,
        data: applyVisibility(item, seed) // Repository returns "pure" data including system fields
      }
    }))

    // If no query params (except slug), return array directly (legacy compatibility)
    const hasQueryParams = Boolean(search) || Boolean(sortBy) || Boolean(query.filters) || Boolean(kanbanAxis) || query.page !== undefined || query.limit !== undefined
    if (!hasQueryParams) {
      return context.json(entries)
    }

    // Build compact relation labels map for N+1 mitigation
    const relations = await buildRelationsMap(context, seed, entries)

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
