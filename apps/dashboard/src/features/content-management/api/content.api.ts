import { api } from "@/lib/api"
import type { ContentEntry } from "@/lib/dynamic-columns"

export interface ContentFacets {
  statuses: string[]
  tagsByColumnId: Record<string, string[]>
}

export interface ContentListQueryParams {
  page?: number
  limit?: number
  search?: string
  sortBy?: string
  sortDir?: "asc" | "desc"
  filters?: unknown
}

export interface ContentListWithMeta {
  items: ContentEntry[]
  total: number
  page: number
  limit: number
}

/**
 * Content API within the Content Management Slice
 */
export const contentApi = {
  /**
   * Fetch paginated content list with server-side filters/sorting
   */
  fetchList: async (
    slug: string,
    params: ContentListQueryParams
  ): Promise<ContentListWithMeta> => {
    const response = await api.get<ContentListWithMeta>(`/content/${slug}`, {
      params: {
        ...params,
        filters: params.filters != null ? JSON.stringify(params.filters) : undefined,
      },
    })
    return response.data
  },

  /**
   * Fetch available facets (statuses, tags) for a specific schema
   */
  fetchFacets: async (slug: string): Promise<ContentFacets> => {
    const response = await api.get<ContentFacets>(`/content/${slug}/facets`)
    return response.data
  },

  /**
   * Fetch single content entry by ID
   */
  fetchById: async (slug: string, id: string): Promise<ContentEntry> => {
    const response = await api.get<ContentEntry>(`/content/${slug}/${id}`)
    return response.data
  },

  /**
   * Create new content entry
   */
  create: async (
    slug: string,
    data: Record<string, unknown>
  ): Promise<{ id: string }> => {
    const response = await api.post<{ id: string }>(`/content/${slug}`, data)
    return response.data
  },

  /**
   * Update existing content entry
   */
  update: async (
    slug: string,
    id: string,
    data: Record<string, unknown>
  ): Promise<{ success: boolean }> => {
    const response = await api.put<{ success: boolean }>(`/content/${slug}/${id}`, data)
    return response.data
  },

  /**
   * Delete content entry
   */
  delete: async (slug: string, id: string): Promise<{ success: boolean }> => {
    const response = await api.delete<{ success: boolean }>(`/content/${slug}/${id}`)
    return response.data
  },

  fetchDraft: async (slug: string, id: string): Promise<Record<string, unknown>> => {
    const response = await api.get<{ data: Record<string, unknown> }>(`/content/${slug}/${id}/draft`)
    return response.data.data
  },

  saveDraft: async (
    slug: string,
    id: string,
    data: Record<string, unknown>
  ): Promise<{ success: boolean }> => {
    const response = await api.put<{ success: boolean }>(`/content/${slug}/${id}/draft`, data)
    return response.data
  },

  publishDraft: async (slug: string, id: string): Promise<{ success: boolean }> => {
    const response = await api.post<{ success: boolean }>(`/content/${slug}/${id}/draft/publish`)
    return response.data
  },

  discardDraft: async (slug: string, id: string): Promise<{ success: boolean }> => {
    const response = await api.delete<{ success: boolean }>(`/content/${slug}/${id}/draft`)
    return response.data
  },
}
