// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useQuery } from '@tanstack/react-query'
import { backrefsApi } from '../api'

export const BACKREF_QUERY_KEY = 'backrefs' as const

export function useBackrefs(targetSlug: string, targetId: string) {
  return useQuery({
    queryKey: [BACKREF_QUERY_KEY, targetSlug, targetId],
    queryFn: () => backrefsApi.fetch(targetSlug, targetId),
    enabled: Boolean(targetSlug && targetId),
    staleTime: 60 * 1000,
  })
}

export function useBackrefsGroup(
  targetSlug: string,
  targetId: string,
  sourceSlug: string,
  branchAlias: string,
  page: number,
  limit = 20,
) {
  return useQuery({
    queryKey: [BACKREF_QUERY_KEY, targetSlug, targetId, sourceSlug, branchAlias, page],
    queryFn: () =>
      backrefsApi.fetchGroup(targetSlug, targetId, sourceSlug, branchAlias, page, limit),
    enabled: Boolean(targetSlug && targetId && sourceSlug && branchAlias),
    staleTime: 60 * 1000,
  })
}
