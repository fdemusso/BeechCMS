// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { api } from '@/lib/api'

export interface BackrefItem {
  id: string
  displayName: string | null
  status: string
  updated_at: number | null
}

export interface BackrefGroup {
  sourceSlug: string
  sourceLabel: string
  branchAlias: string
  branchLabel: string
  relationship: 'single' | 'multi'
  restricts: boolean
  total: number
  items: BackrefItem[]
}

export interface BackrefsResponse {
  groups: BackrefGroup[]
}

export const backrefsApi = {
  /** Fetch all groups (preview, 3 items each). */
  fetch(targetSlug: string, targetId: string): Promise<BackrefsResponse> {
    return api
      .get<BackrefsResponse>(`/content/${targetSlug}/${targetId}/backrefs`)
      .then(r => r.data)
  },

  /** Fetch one group with full pagination. */
  fetchGroup(
    targetSlug: string,
    targetId: string,
    sourceSlug: string,
    branchAlias: string,
    page = 1,
    limit = 20,
  ): Promise<BackrefsResponse> {
    return api
      .get<BackrefsResponse>(`/content/${targetSlug}/${targetId}/backrefs`, {
        params: { group: `${sourceSlug}:${branchAlias}`, page, limit },
      })
      .then(r => r.data)
  },
}
