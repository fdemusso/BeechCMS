import type { Seed, ContentRepository } from '@beechcms/core'
import { cleanStr } from '../shared/query-utils'
import { toFlatPublicEntry } from './entry-projection'
import { buildPublicListMeta } from './response-builder'
import { parsePublicFilter, parsePublicPagination, parseLatestCount, toEngineFilters } from './query-builder'

type ReadListInput = {
  seed: Seed
  seedSlug: string
  repository: ContentRepository
  query: Record<string, string | undefined>
  publishedOnly: boolean
}

export async function readListEntries(input: ReadListInput) {
  const { seed, seedSlug, repository, query, publishedOnly } = input

  const parsedFilter = parsePublicFilter(query.filter)
  const allMode = cleanStr(query.all)?.toLowerCase() === 'true'
  const latestMode = cleanStr(query.latest) !== null
  const latestCount = latestMode ? parseLatestCount(query.latest ?? '') : null
  const pagination = allMode ? { page: 1, limit: 100 } : parsePublicPagination(query)
  const offset = (pagination.page - 1) * pagination.limit
  const search = cleanStr(query.search) ?? ''
  const engineFilters = toEngineFilters(seed, parsedFilter)
  const sortBy = cleanStr(query.orderBy) ?? 'created_at'
  const sortDir = (cleanStr(query.orderDir) ?? 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC'

  const { items, total } = await repository.findMany(seed, {
    filters: engineFilters,
    search: search || undefined,
    status: publishedOnly ? 'published' : null,
    pagination: {
      limit: latestMode ? (latestCount ?? 10) : pagination.limit,
      offset: latestMode ? 0 : offset,
    },
    orderBy: latestMode ? { column: 'created_at', dir: 'DESC' } : { column: sortBy, dir: sortDir },
  })

  const data = items.map(item => toFlatPublicEntry(item, seed, query.fields))

  if (latestMode) {
    return { data, meta: { total, returned: data.length, seed: seedSlug } }
  }

  return {
    data,
    meta: buildPublicListMeta({ total, page: pagination.page, limit: pagination.limit, returned: data.length, seed: seedSlug }),
  }
}
