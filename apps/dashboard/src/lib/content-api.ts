// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { api } from "./api"
import type { ContentEntry } from "./dynamic-columns"
import type { FilterGroup, SeedViewConfig } from "@beechcms/core"

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
 * Content API Helper Functions
 * Funzioni wrapper per le chiamate API CRUD a /api/content/:slug
 */

/**
 * Recupera la lista di tutte le entry per uno specifico slug.
 * TODO: Passare a fetch paginato (page, limit) quando si implementa server-side pagination.
 */
export async function fetchContentList(slug: string): Promise<ContentEntry[]> {
  const response = await api.get<ContentEntry[]>(`/content/${slug}`)
  return response.data
}

export async function fetchContentListServer(
  slug: string,
  params: ContentListQueryParams
): Promise<ContentListWithMeta> {
  const response = await api.get<ContentListWithMeta>(`/content/${slug}`, {
    params: {
      ...params,
      filters:
        params.filters != null ? JSON.stringify(params.filters) : undefined,
    },
  })
  return response.data
}

export async function fetchContentFacets(slug: string): Promise<ContentFacets> {
  const response = await api.get<ContentFacets>(`/content/${slug}/facets`)
  return response.data
}

/**
 * Recupera i dettagli di una singola entry.
 */
export async function fetchContentById(
  slug: string,
  id: string
): Promise<ContentEntry> {
  const response = await api.get<ContentEntry>(`/content/${slug}/${id}`)
  return response.data
}

/**
 * Crea una nuova entry.
 * Restituisce l'ID della entry creata.
 */
export async function createContent(
  slug: string,
  data: Record<string, unknown>
): Promise<{ id: string }> {
  const response = await api.post<{ id: string }>(`/content/${slug}`, data)
  return response.data
}

/**
 * Aggiorna una entry esistente.
 */
export async function updateContent(
  slug: string,
  id: string,
  data: Record<string, unknown>
): Promise<{ success: boolean }> {
  const response = await api.put<{ success: boolean }>(
    `/content/${slug}/${id}`,
    data
  )
  return response.data
}

/**
 * Elimina una entry.
 */
export async function deleteContent(
  slug: string,
  id: string
): Promise<{ success: boolean }> {
  const response = await api.delete<{ success: boolean }>(
    `/content/${slug}/${id}`
  )
  return response.data
}

export async function moveKanbanCard(slug: string, id: string, body: import('@beechcms/core').KanbanMoveBody): Promise<{ success: boolean }> {
  const res = await api.patch<{ success: boolean }>(`/content/${slug}/${id}/kanban-move`, body)
  return res.data
}

export async function updateKanbanPosition(
  slug: string,
  id: string,
  body: { position: string; axisBranchId: string }
): Promise<{ success: boolean }> {
  const res = await api.patch<{ success: boolean }>(`/content/${slug}/${id}/kanban-position`, body)
  return res.data
}

export interface KanbanColumnQueryParams {
  filters?: FilterGroup[]
  kanbanAxis: string
  limit: number
  offset: number
  search?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}

export async function fetchKanbanColumn(slug: string, params: KanbanColumnQueryParams): Promise<ContentListWithMeta> {
  const res = await api.get<ContentListWithMeta>(`/content/${slug}`, {
    params: {
      kanbanAxis: params.kanbanAxis,
      limit: params.limit,
      offset: params.offset,
      search: params.search,
      sortBy: params.sortBy,
      sortDir: params.sortDir,
      filters: params.filters ? JSON.stringify(params.filters) : undefined,
    },
  })
  return res.data
}

export async function fetchSeedViewConfig(slug: string): Promise<SeedViewConfig> {
  const res = await api.get<SeedViewConfig>(`/content/${slug}/view-config`)
  return res.data
}

export async function updateSeedViewConfig(slug: string, config: SeedViewConfig): Promise<{ ok: boolean }> {
  const res = await api.put<{ ok: boolean }>(`/content/${slug}/view-config`, config)
  return res.data
}

