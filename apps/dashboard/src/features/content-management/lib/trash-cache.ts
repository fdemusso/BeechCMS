// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { QueryClient } from "@tanstack/react-query"
import { DASHBOARD_QUERY_KEYS, BACKREF_QUERY_KEY } from "@/features/shared"
import type { ContentListWithMeta } from "../api/content.api"
import { CONTENT_QUERY_KEYS, TRASH_QUERY_KEYS } from "../consts/content.keys"

/** Snapshot of every cached list page of one seed, taken before an optimistic removal. */
export type ContentListSnapshot = Array<[queryKey: readonly unknown[], data: ContentListWithMeta | undefined]>

/** Invalidates content lists, Trash, activity feed and back-refs — a delete or restore moves a row between them. */
export function invalidateTrashSurfaces(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: TRASH_QUERY_KEYS.all })
  queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.all })
  queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.activity() })
  queryClient.invalidateQueries({ queryKey: [BACKREF_QUERY_KEY] })
}

/**
 * Cancels in-flight list fetches for `slug`, snapshots every cached page under
 * `[...CONTENT_QUERY_KEYS.lists(), slug]`, then removes the entry `id` from each page.
 * `total` drops by 1 only on a page that actually contained the id. Pages without the id are left as is.
 */
export async function removeEntryFromCachedLists(
  queryClient: QueryClient,
  slug: string,
  id: string,
): Promise<ContentListSnapshot> {
  const listsPrefix = [...CONTENT_QUERY_KEYS.lists(), slug]

  // A refetch landing after the removal would put the row back.
  await queryClient.cancelQueries({ queryKey: listsPrefix })

  const snapshot = queryClient.getQueriesData<ContentListWithMeta>({ queryKey: listsPrefix })

  queryClient.setQueriesData<ContentListWithMeta>({ queryKey: listsPrefix }, (page) => {
    if (!page?.items.some((entry) => entry.id === id)) return page
    return { ...page, items: page.items.filter((entry) => entry.id !== id), total: page.total - 1 }
  })

  return snapshot
}

/** Writes every snapshotted page back exactly as it was. */
export function restoreCachedLists(queryClient: QueryClient, snapshot: ContentListSnapshot): void {
  for (const [queryKey, data] of snapshot) {
    queryClient.setQueryData(queryKey, data)
  }
}
