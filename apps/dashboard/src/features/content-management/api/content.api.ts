// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { InferResponseType } from "hono/client"
import { rpc } from "@/lib/rpc"
import { toListQuery, toListWithMeta, type ContentListQueryParams, type ContentListWithMeta } from "@/lib/content-api"
import type { ContentEntry } from "@/lib/dynamic-columns"

export type { ContentListQueryParams, ContentListWithMeta }

export type BulkMultiRelMode = "replace" | "add" | "remove"

interface BulkMultiRelValue {
  mode: BulkMultiRelMode
  value: string[]
}

export type BulkFieldValue = unknown | BulkMultiRelValue

export interface BulkUpdateBody {
  ids: string[]
  fields: Record<string, BulkFieldValue>
}

export type BulkUpdateResult = InferResponseType<(typeof rpc.api.content)[":slug"]["bulk"]["$patch"]>

export type ContentFacets = InferResponseType<(typeof rpc.api.content)[":slug"]["facets"]["$get"]>

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
    const response = await rpc.api.content[":slug"].$get({
      param: { slug },
      query: toListQuery({
        ...params,
        filters: params.filters == null ? undefined : JSON.stringify(params.filters),
      }),
    })
    return toListWithMeta(await response.json())
  },

  /**
   * Fetch available facets (statuses, tags) for a specific schema
   */
  fetchFacets: async (slug: string): Promise<ContentFacets> => {
    const response = await rpc.api.content[":slug"].facets.$get({ param: { slug } })
    return response.json()
  },

  /**
   * Fetch single content entry by ID
   */
  fetchById: async (slug: string, id: string): Promise<ContentEntry> => {
    const response = await rpc.api.content[":slug"][":id"].$get({ param: { slug, id } })
    return response.json()
  },

  /**
   * Create new content entry
   */
  create: async (
    slug: string,
    data: Record<string, unknown>
  ): Promise<{ id: string }> => {
    const response = await rpc.api.content[":slug"].$post({ param: { slug }, json: data })
    return response.json()
  },

  /**
   * Update existing content entry.
   * `ifMatch`, when given, is sent as `If-Match` so the API's optimistic-concurrency guard
   * (`resolveIfMatch`) can detect a concurrent edit and reject with `content-update-conflict`.
   */
  update: async (
    slug: string,
    id: string,
    data: Record<string, unknown>,
    ifMatch?: string
  ): Promise<{ success: boolean }> => {
    const response = await rpc.api.content[":slug"][":id"].$put(
      { param: { slug, id }, json: data },
      { headers: ifMatch !== undefined ? { "If-Match": ifMatch } : undefined },
    )
    return response.json()
  },

  /**
   * Delete a content entry.
   * Moves the entry to the Trash; `options.purge` erases an entry that is already in the Trash
   * (row + junction + drafts + R2 + ledger event).
   */
  delete: async (
    slug: string,
    id: string,
    options?: { purge?: boolean }
  ): Promise<{ success: boolean; softDeleted?: boolean }> => {
    const response = await rpc.api.content[":slug"][":id"].$delete({
      param: { slug, id },
      query: options?.purge ? { purge: "true" } : {},
    })
    return response.json()
  },

  fetchDraft: async (slug: string, id: string): Promise<Record<string, unknown>> => {
    const response = await rpc.api.content[":slug"][":id"].draft.$get({ param: { slug, id } })
    const body = await response.json()
    return body.data
  },

  saveDraft: async (
    slug: string,
    id: string,
    data: Record<string, unknown>
  ): Promise<{ success: boolean }> => {
    const response = await rpc.api.content[":slug"][":id"].draft.$put({ param: { slug, id }, json: data })
    return response.json()
  },

  publishDraft: async (slug: string, id: string): Promise<{ success: boolean }> => {
    const response = await rpc.api.content[":slug"][":id"].draft.publish.$post({ param: { slug, id } })
    return response.json()
  },

  discardDraft: async (slug: string, id: string): Promise<{ success: boolean }> => {
    const response = await rpc.api.content[":slug"][":id"].draft.$delete({ param: { slug, id } })
    return response.json()
  },

  bulkUpdate: async (slug: string, body: BulkUpdateBody): Promise<BulkUpdateResult> => {
    const response = await rpc.api.content[":slug"].bulk.$patch({ param: { slug }, json: body })
    return response.json()
  },

}
