// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { api } from "@/lib/api"
import type { ContentEntry } from "@/lib/dynamic-columns"

/** Mirrors the API's `MAX_BULK_SIZE` (apps/api/src/features/content/handlers/trash.ts). */
export const MAX_TRASH_BULK_SIZE = 500

export interface TrashListParams {
  page: number
  limit: number
}

export interface TrashListResponse {
  items: ContentEntry[]
  total: number
  page: number
  limit: number
}

export interface BulkTrashFailedItem {
  id: string
  problem: { status: number; type: string; detail: string }
}

export interface BulkTrashResult {
  succeeded: string[]
  failed: BulkTrashFailedItem[]
}

export interface RestoreResult {
  success: boolean
  /** The slug the entry actually ended up with — auto-renamed when the original was reassigned. */
  slug: string | null
}

/**
 * Trash API within the Content Management Slice.
 * Every route is protected and gated: read ⇒ `content:read`, restore ⇒ `content:update`,
 * purge ⇒ `content:delete`.
 */
export const trashApi = {
  fetchTrash: async (slug: string, params: TrashListParams): Promise<TrashListResponse> => {
    const response = await api.get<TrashListResponse>(`/content/${slug}/trash`, { params })
    return response.data
  },

  restore: async (slug: string, id: string): Promise<RestoreResult> => {
    const response = await api.post<RestoreResult>(`/content/${slug}/${id}/restore`)
    return response.data
  },

  bulkRestore: async (slug: string, ids: string[]): Promise<BulkTrashResult> => {
    const response = await api.post<BulkTrashResult>(`/content/${slug}/trash/bulk-restore`, { ids })
    return response.data
  },

  bulkPurge: async (slug: string, ids: string[]): Promise<BulkTrashResult> => {
    const response = await api.post<BulkTrashResult>(`/content/${slug}/trash/bulk-purge`, { ids })
    return response.data
  },
}
