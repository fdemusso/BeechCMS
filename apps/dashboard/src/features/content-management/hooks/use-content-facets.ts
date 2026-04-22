import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { contentApi } from "../api/content.api"
import { FACET_QUERY_KEYS, CONTENT_QUERY_KEYS } from "../consts/content.keys"

/**
 * Hook for fetching schema facets (statuses, tags).
 * Stale time is set to 5 minutes as these don't change frequently.
 */
export function useContentFacets(slug: string | undefined) {
  return useQuery({
    queryKey: FACET_QUERY_KEYS.bySlug(slug || ""),
    queryFn: () => {
      if (!slug) throw new Error("Slug is required")
      return contentApi.fetchFacets(slug)
    },
    enabled: Boolean(slug),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  })
}

/**
 * Hook for deleting content entries.
 * Automatically invalidates content lists on success.
 */
export function useDeleteContent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ slug, id }: { slug: string; id: string }) =>
      contentApi.delete(slug, id),
    onSuccess: () => {
      // Invalidate all content lists to trigger a refetch
      queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.all })
    },
  })
}
