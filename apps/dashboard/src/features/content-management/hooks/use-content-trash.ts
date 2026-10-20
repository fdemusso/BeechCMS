// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { DASHBOARD_QUERY_KEYS, BACKREF_QUERY_KEY } from "@/features/shared"
import { contentApi } from "../api/content.api"
import { trashApi, type BulkTrashResult, type RestoreResult, type TrashListResponse } from "../api/trash.api"
import { CONTENT_QUERY_KEYS, TRASH_QUERY_KEYS } from "../consts/content.keys"

/**
 * A trash mutation moves a row between the two listings, so both key spaces go stale at once;
 * the activity feed and back-refs follow the same rule the delete path already applies
 * (see `useDeleteContent`).
 */
function invalidateTrashSurfaces(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: TRASH_QUERY_KEYS.all })
  queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.all })
  queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.activity() })
  queryClient.invalidateQueries({ queryKey: [BACKREF_QUERY_KEY] })
}

export function useContentTrash(
  slug: string | undefined,
  params: { page: number; limit: number },
  options?: { enabled?: boolean }
) {
  return useQuery<TrashListResponse>({
    queryKey: TRASH_QUERY_KEYS.list(slug || "", params.page, params.limit),
    queryFn: () => {
      if (!slug) throw new Error("Slug is required")
      return trashApi.fetchTrash(slug, params)
    },
    enabled: Boolean(slug) && (options?.enabled ?? true),
    placeholderData: (previous) => previous,
    staleTime: 10 * 1000,
  })
}

export function useRestoreContent(slug: string) {
  const queryClient = useQueryClient()
  return useMutation<RestoreResult, Error, { id: string }>({
    mutationFn: ({ id }) => trashApi.restore(slug, id),
    onSuccess: () => invalidateTrashSurfaces(queryClient),
  })
}

export function usePurgeContent(slug: string) {
  const queryClient = useQueryClient()
  return useMutation<{ success: boolean }, Error, { id: string }>({
    mutationFn: ({ id }) => contentApi.delete(slug, id, { purge: true }),
    onSuccess: () => invalidateTrashSurfaces(queryClient),
  })
}

export function useBulkRestoreContent(slug: string) {
  const queryClient = useQueryClient()
  return useMutation<BulkTrashResult, Error, { ids: string[] }>({
    mutationFn: ({ ids }) => trashApi.bulkRestore(slug, ids),
    onSuccess: () => invalidateTrashSurfaces(queryClient),
  })
}

export function useBulkPurgeContent(slug: string) {
  const queryClient = useQueryClient()
  return useMutation<BulkTrashResult, Error, { ids: string[] }>({
    mutationFn: ({ ids }) => trashApi.bulkPurge(slug, ids),
    onSuccess: () => invalidateTrashSurfaces(queryClient),
  })
}
