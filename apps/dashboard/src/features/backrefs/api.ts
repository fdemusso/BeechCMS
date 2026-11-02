// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { InferResponseType } from 'hono/client'
import { rpc } from '@/lib/rpc'

export type BackrefsResponse = InferResponseType<typeof rpc.api.content[':targetSlug'][':targetId']['backrefs']['$get']>
export type BackrefGroup = BackrefsResponse['groups'][number]
export type BackrefItem = BackrefGroup['items'][number]

export const backrefsApi = {
  /** Fetch all groups (preview, 3 items each). */
  async fetch(targetSlug: string, targetId: string): Promise<BackrefsResponse> {
    const response = await rpc.api.content[':targetSlug'][':targetId'].backrefs.$get({
      param: { targetSlug, targetId },
      query: {},
    })
    return response.json()
  },

  /** Fetch one group with full pagination. */
  async fetchGroup(
    targetSlug: string,
    targetId: string,
    sourceSlug: string,
    branchAlias: string,
    page = 1,
    limit = 20,
  ): Promise<BackrefsResponse> {
    const response = await rpc.api.content[':targetSlug'][':targetId'].backrefs.$get({
      param: { targetSlug, targetId },
      query: { group: `${sourceSlug}:${branchAlias}`, page: String(page), limit: String(limit) },
    })
    return response.json()
  },
}
