// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query'
import { automationsApi } from '../api/automations.api'
import { AUTOMATION_QUERY_KEYS } from '../consts/automation.keys'

const automationsQueryOptions = (seedSlug: string) =>
  queryOptions({
    queryKey: AUTOMATION_QUERY_KEYS.list(seedSlug),
    queryFn: () => automationsApi.list(seedSlug),
    staleTime: 10_000,
  })

/** Starts (or reuses) the automations fetch ahead of the page that reads it. Rejects like the query does. */
export function prefetchAutomations(queryClient: QueryClient, seedSlug: string) {
  return queryClient.fetchQuery(automationsQueryOptions(seedSlug))
}

export function useAutomations(seedSlug: string | undefined) {
  return useQuery({ ...automationsQueryOptions(seedSlug ?? ''), enabled: Boolean(seedSlug) })
}
