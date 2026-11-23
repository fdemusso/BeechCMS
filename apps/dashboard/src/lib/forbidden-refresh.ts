// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Query, QueryClient, QueryKey } from "@tanstack/react-query"
import { isApiError } from "./http/api-error"

/** A refresh that still ends in 403 is a real denial: do not start another one inside this window. */
const REFRESH_COOLDOWN_MS = 30_000

function sameKey(left: QueryKey, right: QueryKey): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function isForbidden(error: unknown): boolean {
  return isApiError(error) && error.status === 403
}

/**
 * A 403 on any query means the caller's permissions may have changed since the schema and the profile
 * were cached (their staleTime is minutes). Re-reads those once, then retries the queries that were
 * refused, so a fresh grant shows without a reload.
 *
 * @param permissionKeys Queries that carry the caller's authority. Their own 403 never starts a refresh.
 * @param now Injected time source for the cooldown.
 */
export function watchForbidden(client: QueryClient, permissionKeys: ReadonlyArray<QueryKey>, now: () => number = Date.now): void {
  let refreshing = false
  let lastRefreshAt = Number.NEGATIVE_INFINITY

  async function refresh(): Promise<void> {
    try {
      await Promise.all(permissionKeys.map((queryKey) => client.invalidateQueries({ queryKey, exact: true })))
      await client.invalidateQueries({
        predicate: (query: Query) => query.state.status === "error" && isForbidden(query.state.error),
      })
    } finally {
      refreshing = false
    }
  }

  client.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "error" || !isForbidden(event.action.error)) return
    if (permissionKeys.some((queryKey) => sameKey(queryKey, event.query.queryKey))) return
    if (refreshing || now() - lastRefreshAt < REFRESH_COOLDOWN_MS) return
    refreshing = true
    lastRefreshAt = now()
    void refresh()
  })
}
