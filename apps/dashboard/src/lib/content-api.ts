// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { InferResponseType } from "hono/client"
import type { FilterGroup, KanbanMoveBody } from "@beechcms/core"
import { rpc } from "./rpc"
import type { ContentEntry } from "./dynamic-columns"

export interface ContentListQueryParams {
  page?: number
  limit?: number
  search?: string
  sortBy?: string
  sortDir?: "asc" | "desc"
  filters?: unknown
}

/**
 * The list answers a bare array when the request carries no query parameter (legacy contract) and
 * this envelope otherwise. `relations` is the compact label map the dashboard uses to prime the
 * TanStack Query cache so RelationDisplay can resolve synchronously without per-row requests:
 * `{ [branchAlias]: { [targetId]: labelString } }`. `relationAvatars` has the same shape for the
 * relations that configure an `avatarSource`: the target's avatar URL, only for entries that have one.
 */
export type ContentListResponse = InferResponseType<(typeof rpc.api.content)[":slug"]["$get"]>

export type ContentListWithMeta = Omit<Extract<ContentListResponse, { items: unknown }>, "items"> & {
  items: ContentEntry[]
}

/** `page`, `limit`, ... as the query string carries them: `hc` takes strings only, undefined and null are dropped. */
export function toListQuery(params: object): Record<string, string> {
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(params) as [string, string | number | null | undefined][]) {
    if (value !== undefined && value !== null) query[key] = String(value)
  }
  return query
}

/** Always the envelope: a bare array (a request with no query parameter) is wrapped as one page. */
export function toListWithMeta(response: ContentListResponse): ContentListWithMeta {
  if (!Array.isArray(response)) return response
  return { items: response, total: response.length, page: 1, limit: response.length, relations: {}, relationAvatars: {} }
}

export async function moveKanbanCard(slug: string, id: string, body: KanbanMoveBody): Promise<{ success: boolean }> {
  const response = await rpc.api.content[":slug"][":id"]["kanban-move"].$patch({ param: { slug, id }, json: body })
  return response.json()
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
  const response = await rpc.api.content[":slug"].$get({
    param: { slug },
    query: toListQuery({
      kanbanAxis: params.kanbanAxis,
      limit: params.limit,
      offset: params.offset,
      search: params.search,
      sortBy: params.sortBy,
      sortDir: params.sortDir,
      filters: params.filters ? JSON.stringify(params.filters) : undefined,
    }),
  })
  return toListWithMeta(await response.json())
}
