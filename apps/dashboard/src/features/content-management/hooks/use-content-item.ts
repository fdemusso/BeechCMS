import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { contentApi } from "../api/content.api"
import { CONTENT_QUERY_KEYS, FACET_QUERY_KEYS } from "../consts/content.keys"
import { DASHBOARD_QUERY_KEYS } from "@/features/dashboard"

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
    },
  })
}
