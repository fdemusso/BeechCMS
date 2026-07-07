// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { contentApi } from "../api/content.api"
import { CONTENT_QUERY_KEYS, FACET_QUERY_KEYS } from "../consts/content.keys"
import { DASHBOARD_QUERY_KEYS, GLOBAL_DRAFTS_QUERY_KEY } from "@/features/shared"
import { BACKREF_QUERY_KEY } from "@/features/shared"

/**
 * Hook for fetching a single content entry.
 */
export function useContentEntry(slug: string | undefined, id: string | undefined) {
  return useQuery({
    queryKey: CONTENT_QUERY_KEYS.detail(slug || "", id || ""),
    queryFn: () => {
      if (!slug || !id) throw new Error("Slug and ID are required")
      return contentApi.fetchById(slug, id)
    },
    enabled: Boolean(slug && id),
    staleTime: 10 * 1000, // 10 seconds
  })
}

export function useDraftEntry(slug: string | undefined, id: string | undefined) {
  return useQuery({
    queryKey: CONTENT_QUERY_KEYS.draft(slug || "", id || ""),
    queryFn: () => {
      if (!slug || !id) throw new Error("Slug and ID are required")
      return contentApi.fetchDraft(slug, id)
    },
    enabled: Boolean(slug && id),
    staleTime: 10 * 1000,
    retry: false,
  })
}

export function useSaveDraft() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ slug, id, data }: { slug: string; id: string; data: Record<string, unknown> }) =>
      contentApi.saveDraft(slug, id, data),
    onSuccess: (_, { slug, id }) => {
      queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.draft(slug, id) })
      queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.detail(slug, id) })
      queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.all })
    },
  })
}

export function usePublishDraft() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ slug, id }: { slug: string; id: string }) =>
      contentApi.publishDraft(slug, id),
    onSuccess: (_, { slug, id }) => {
      queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.all })
      queryClient.invalidateQueries({ queryKey: FACET_QUERY_KEYS.all })
      queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.draft(slug, id) })
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.activity() })
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.stats() })
      queryClient.invalidateQueries({ queryKey: GLOBAL_DRAFTS_QUERY_KEY })
    },
  })
}

export function useDiscardDraft() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ slug, id }: { slug: string; id: string }) =>
      contentApi.discardDraft(slug, id),
    onSuccess: (_, { slug, id }) => {
      queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.draft(slug, id) })
      queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.detail(slug, id) })
      queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.all })
      queryClient.invalidateQueries({ queryKey: GLOBAL_DRAFTS_QUERY_KEY })
    },
  })
}

/**
 * Hook for creating or updating content entries.
 * Automatically invalidates content lists on success.
 */
export function useSaveContent() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ 
      slug, 
      id, 
      data 
    }: { 
      slug: string; 
      id?: string; 
      data: Record<string, unknown> 
    }) => {
      if (id) {
        return contentApi.update(slug, id, data)
      }
      return contentApi.create(slug, data)
    },
    onSuccess: (_, variables) => {
      // Invalidate all content lists for this slug
      queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.all })
      
      // Invalidate facets (statuses, tags) which might have changed
      queryClient.invalidateQueries({ queryKey: FACET_QUERY_KEYS.all })
      
      // Invalidate the specific detail query if it was an update
      if (variables.id) {
        queryClient.invalidateQueries({ 
          queryKey: CONTENT_QUERY_KEYS.detail(variables.slug, variables.id) 
        })
      }
      
      // Invalidate recent-activity so the dashboard feed reflects the change immediately
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.activity() })

      // Invalidate stats as status change might affect counts
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.stats() })

      // Invalidate back-refs — saved entry may point to new/different targets
      queryClient.invalidateQueries({ queryKey: [BACKREF_QUERY_KEY] })
    },
  })
}
