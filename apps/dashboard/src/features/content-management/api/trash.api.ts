// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { InferResponseType } from "hono/client"
import { rpc } from "@/lib/rpc"

export interface TrashListParams {
  page: number
  limit: number
}

/** `retentionDays` is the effective retention for this seed (seed override, else global setting); 0 = never purged. */
export type TrashListResponse = InferResponseType<(typeof rpc.api.content)[":slug"]["trash"]["$get"]>

/**
 * A row of the Trash list. Not a `ContentEntry`: the Trash envelope carries the system columns and
 * `data`, with no `schema_slug` and no `has_pending_draft`.
 */
export type TrashEntry = TrashListResponse["items"][number]

export type BulkTrashResult = InferResponseType<(typeof rpc.api.content)[":slug"]["trash"]["bulk-restore"]["$post"]>

/** `slug` is the one the entry actually ended up with, auto-renamed when the original was reassigned. */
export type RestoreResult = InferResponseType<(typeof rpc.api.content)[":slug"][":id"]["restore"]["$post"]>

/**
 * Trash API within the Content Management Slice.
 * Every route is protected and gated: read ⇒ `content:read`, restore ⇒ `content:update`,
 * purge ⇒ `content:delete`.
 */
export const trashApi = {
  fetchTrash: async (slug: string, params: TrashListParams): Promise<TrashListResponse> => {
    const response = await rpc.api.content[":slug"].trash.$get({
      param: { slug },
      query: { page: String(params.page), limit: String(params.limit) },
    })
    return response.json()
  },

  restore: async (slug: string, id: string): Promise<RestoreResult> => {
    const response = await rpc.api.content[":slug"][":id"].restore.$post({ param: { slug, id } })
    return response.json()
  },

  bulkRestore: async (slug: string, ids: string[]): Promise<BulkTrashResult> => {
    const response = await rpc.api.content[":slug"].trash["bulk-restore"].$post({ param: { slug }, json: { ids } })
    return response.json()
  },

  bulkPurge: async (slug: string, ids: string[]): Promise<BulkTrashResult> => {
    const response = await rpc.api.content[":slug"].trash["bulk-purge"].$post({ param: { slug }, json: { ids } })
    return response.json()
  },
}
