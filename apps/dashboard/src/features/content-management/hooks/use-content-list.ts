// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useCallback, useEffect } from "react"
import { queryOptions, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import type { SortingState } from "@tanstack/react-table"
import { isLocalizedBranch } from "@beechcms/core"
import { schemaQueryOptions, useLocalizeEntryData, useSchema } from "@/features/shared"
import { contentApi, type ContentListQueryParams, type ContentListWithMeta } from "../api/content.api"
import { CONTENT_QUERY_KEYS } from "../consts/content.keys"
import { primeRelationLabels } from "../lib/prime-relation-labels"

export const CONTENT_LIST_STALE_TIME = 10 * 1000 // 10 seconds

interface ContentListParamsInput {
  readonly pageIndex: number
  readonly pageSize: number
  readonly search?: string
  readonly sorting: SortingState
  readonly filters: unknown
}

/**
 * The request params of one list page. The cache key carries them, so everything that has to hit the same cache
 * entry (the hook, a route prefetch) must build them here.
 */
export function buildContentListParams({ pageIndex, pageSize, search, sorting, filters }: ContentListParamsInput): ContentListQueryParams {
  return {
    page: pageIndex + 1,
    limit: pageSize,
    search: search?.trim() || undefined,
    sortBy: sorting[0]?.id,
    sortDir: sorting[0]?.desc ? "desc" : "asc",
    filters,
  }
}

const contentListQueryOptions = (slug: string, params: ContentListQueryParams) =>
  queryOptions({
    queryKey: CONTENT_QUERY_KEYS.list(slug, params),
    queryFn: async ({ client }) => {
      const response = await contentApi.fetchList(slug, params)
      // Primed here, before any row renders: a cell that mounts with the data and subscribes to its own detail query
      // before a component effect could prime it would fetch that entry (the N+1).
      const seeds = client.getQueryData(schemaQueryOptions().queryKey)
      if (seeds) primeRelationLabels(client, seeds, slug, response)
      return response
    },
    staleTime: CONTENT_LIST_STALE_TIME,
  })

/** Starts (or reuses) a list fetch ahead of the page that reads it. Rejects like the query does. */
export function prefetchContentList(queryClient: QueryClient, slug: string, params: ContentListQueryParams) {
  return queryClient.fetchQuery(contentListQueryOptions(slug, params))
}

/**
 * Hook for fetching paginated content entries.
 * TanStack Query handles caching and deduplication.
 *
 * N+1 mitigation: after a successful list fetch, relation labels embedded in
 * the response's `relations` field are used to prime per-entry detail caches
 * so that RelationDisplay components in the list view resolve synchronously
 * without firing additional network requests.
 */
export function useContentList(slug: string | undefined, params: ContentListQueryParams) {
  const queryClient = useQueryClient()
  const { data: seeds } = useSchema()
  const localize = useLocalizeEntryData()
  const seed = seeds?.find((s) => s.slug === slug)

  // Table rows and gallery/kanban cards render these items: resolve them once, here. The query
  // cache keeps the raw dictionaries; only this observer's view is flat.
  const select = useCallback(
    (response: ContentListWithMeta): ContentListWithMeta =>
      seed?.branches.some(isLocalizedBranch)
        ? { ...response, items: response.items.map((entry) => ({ ...entry, data: localize(seed, entry.data) })) }
        : response,
    [localize, seed],
  )

  const query = useQuery({
    ...contentListQueryOptions(slug ?? "", params),
    enabled: Boolean(slug),
    // Keep previous data while fetching new data to avoid flickering
    placeholderData: (previous) => previous,
    select,
  })

  // Fallback for a response that landed before the schema was cached (the queryFn primes it first, see below).
  useEffect(() => {
    if (query.data && seeds && slug) primeRelationLabels(queryClient, seeds, slug, query.data)
  }, [query.data, seeds, slug, queryClient])

  return query
}
