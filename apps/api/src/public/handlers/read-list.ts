// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Seed, ContentRepository } from '@beechcms/core'
import { cleanStr } from '../../shared/utils/query-utils'
import { toFlatPublicEntry } from '../query/entry-projection'
import { expandRelations } from '../relations/relation-include'
import { resolveRelationSubqueries } from '../relations/relation-subquery'
import { buildPublicListMeta } from '../query/response-builder'
import { parsePublicFilter, parsePublicPagination, parseLatestCount, toEngineFilters } from '../query/query-builder'
import { selectLocaleOf, type PublicLanguage } from '../localization/public-language'

type ReadListInput = {
  seed: Seed
  seedSlug: string
  repository: ContentRepository
  query: Record<string, string | undefined>
  publishedOnly: boolean
  getSeed: (slug: string) => Seed | null
  language?: PublicLanguage
}

export async function readListEntries(input: ReadListInput) {
  const { seed, seedSlug, repository, query, publishedOnly, getSeed, language } = input

  const parsedFilter = parsePublicFilter(query.filter)
  const allMode = cleanStr(query.all)?.toLowerCase() === 'true'
  const latestMode = cleanStr(query.latest) !== null
  const latestCount = latestMode ? parseLatestCount(query.latest ?? '') : null
  const pagination = allMode ? { page: 1, limit: 100 } : parsePublicPagination(query)
  const offset = (pagination.page - 1) * pagination.limit
  const search = cleanStr(query.search) ?? ''
  const locale = selectLocaleOf(language)
  const resolved = await resolveRelationSubqueries(parsedFilter, seed, repository, getSeed, publishedOnly, locale)
  if (resolved.empty) {
    const emptyMeta = latestMode
      ? { total: 0, returned: 0, seed: seedSlug }
      : buildPublicListMeta({ total: 0, page: pagination.page, limit: pagination.limit, returned: 0, seed: seedSlug })
    return { data: [], meta: emptyMeta }
  }
  const engineFilters = toEngineFilters(seed, resolved.filter)
  const sortBy = cleanStr(query.orderBy) ?? 'created_at'
  const sortDir = (cleanStr(query.orderDir) ?? 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC'

  const { items, total } = await repository.findMany(seed, {
    filters: engineFilters,
    filterLogic: resolved.filter?.logic,
    search: search || undefined,
    status: publishedOnly ? 'published' : null,
    pagination: {
      limit: latestMode ? (latestCount ?? 10) : pagination.limit,
      offset: latestMode ? 0 : offset,
    },
    orderBy: latestMode ? { column: 'created_at', dir: 'DESC' } : { column: sortBy, dir: sortDir },
    ...(locale ? { locale } : {}),
  })

  const data = items.map(item => toFlatPublicEntry(item, seed, query.fields, language))
  await expandRelations(data, query.include, seed, repository, getSeed, items, language)

  if (latestMode) {
    return { data, meta: { total, returned: data.length, seed: seedSlug } }
  }

  return {
    data,
    meta: buildPublicListMeta({ total, page: pagination.page, limit: pagination.limit, returned: data.length, seed: seedSlug }),
  }
}
