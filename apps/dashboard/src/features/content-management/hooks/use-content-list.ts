// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useQuery } from "@tanstack/react-query"
import { contentApi, type ContentListQueryParams } from "../api/content.api"
import { CONTENT_QUERY_KEYS } from "../consts/content.keys"

/**
 * Hook for fetching paginated content entries.
 * TanStack Query handles caching and deduplication.
 */
export function useContentList(slug: string | undefined, params: ContentListQueryParams) {
  return useQuery({
    queryKey: CONTENT_QUERY_KEYS.list(slug || "", params),
    queryFn: () => {
      if (!slug) throw new Error("Slug is required")
      return contentApi.fetchList(slug, params)
    },
    enabled: Boolean(slug),
    // Keep previous data while fetching new data to avoid flickering
    placeholderData: (previous) => previous,
    staleTime: 10 * 1000, // 10 seconds
  })
}
