// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSchema } from "@/features/shared"
import { contentApi, type ContentListQueryParams } from "../api/content.api"
import { CONTENT_QUERY_KEYS } from "../consts/content.keys"
import type { ContentEntry } from "@/lib/dynamic-columns"

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

  const query = useQuery({
    queryKey: CONTENT_QUERY_KEYS.list(slug || "", params),
    queryFn: async () => {
      if (!slug) throw new Error("Slug is required")
      return contentApi.fetchList(slug, params)
    },
    enabled: Boolean(slug),
    // Keep previous data while fetching new data to avoid flickering
    placeholderData: (previous) => previous,
    staleTime: 10 * 1000, // 10 seconds
  })

  // Prime the TanStack Query cache with relation labels from the list response.
  // This avoids N+1 per-row fetchById calls in RelationDisplay on the list view.
  useEffect(() => {
    const response = query.data
    if (!response?.relations || !seeds || !slug) return

    const currentSeed = seeds.find((s) => s.slug === slug)
    if (!currentSeed) return

    for (const [alias, idLabelMap] of Object.entries(response.relations)) {
      const branch = currentSeed.branches.find((b) => b.alias === alias)
      if (!branch || branch.type !== "relation") continue
      const targetSlug = (branch as { targetSeed?: string }).targetSeed
      if (!targetSlug) continue

      const targetSeed = seeds.find((s) => s.slug === targetSlug)
      const labelAlias = targetSeed?.displayNameAlias ?? "title"

      for (const [id, label] of Object.entries(idLabelMap)) {
        const cacheKey = CONTENT_QUERY_KEYS.detail(targetSlug, id)
        // Only prime if not already in cache to avoid overwriting fresh data
        const existing = queryClient.getQueryData<ContentEntry>(cacheKey)
        if (!existing) {
          queryClient.setQueryData<ContentEntry>(cacheKey, {
            id,
            schema_slug: targetSlug,
            slug: null,
            status: "published",
            data: { [labelAlias]: label },
            created_at: null,
            updated_at: null,
          })
        }
      }
    }
  }, [query.data, seeds, slug, queryClient])

  return query
}
