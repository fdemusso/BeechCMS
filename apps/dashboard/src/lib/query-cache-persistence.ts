// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { QueryClient, QueryKey } from "@tanstack/react-query"
import { queryClient } from "./query-client"

const STORAGE_KEY = "beech_query_cache_v1"
const WRITE_DEBOUNCE_MS = 300

interface PersistedEntry {
  readonly queryKey: QueryKey
  readonly data: unknown
  readonly updatedAt: number
}

interface PersistedCache {
  readonly user: string
  readonly entries: ReadonlyArray<PersistedEntry>
}

type CacheStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

function browserStorage(): CacheStorage | null {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    // Storage blocked (privacy mode, sandboxed frame): run without persistence.
    return null
  }
}

function sameKey(left: QueryKey, right: QueryKey): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/**
 * Keeps a few slow-changing queries (the schema, the caller's profile) across reloads of the same tab, so the page
 * after a reload starts from them and revalidates in the background instead of waiting on the network first.
 *
 * - Only the allow-listed keys; per tab (sessionStorage), gone when the tab closes.
 * - Tied to the signed-in user: written only once the user is known, dropped when another user signs in, and wiped
 *   when the session ends (`clear`).
 * - Restored with its original `updatedAt`, so the query's own staleTime decides whether it is refetched.
 */
export function createQueryCachePersistence(client: QueryClient, storage: CacheStorage | null = browserStorage()) {
  let keys: ReadonlyArray<QueryKey> = []
  let restoredUser: string | null = null
  let currentUser: string | null = null

  function read(): PersistedCache | null {
    try {
      const raw = storage?.getItem(STORAGE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as PersistedCache
      return typeof parsed.user === "string" && Array.isArray(parsed.entries) ? parsed : null
    } catch {
      return null
    }
  }

  function clear(): void {
    currentUser = null
    restoredUser = null
    try {
      storage?.removeItem(STORAGE_KEY)
    } catch {
      // Nothing to clean if the storage refuses.
    }
  }

  /** Writes the current state of every allow-listed query that holds data. No-op until the user is known. */
  function persistNow(): void {
    if (!storage || currentUser === null) return
    const entries: PersistedEntry[] = []
    for (const queryKey of keys) {
      const state = client.getQueryState(queryKey)
      if (state?.status === "success") {
        entries.push({ queryKey, data: state.data, updatedAt: state.dataUpdatedAt })
      }
    }
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify({ user: currentUser, entries } satisfies PersistedCache))
    } catch {
      // Quota or blocked storage: the cache just is not persisted.
    }
  }

  function restore(): void {
    const saved = read()
    if (!saved) return
    restoredUser = saved.user
    for (const entry of saved.entries) {
      if (!keys.some((key) => sameKey(key, entry.queryKey))) continue
      client.setQueryData(entry.queryKey, entry.data, { updatedAt: entry.updatedAt })
    }
  }

  return {
    /** Restores what a previous load of this tab saved, then keeps saving changes (debounced). Call before the first render. */
    start(allowed: ReadonlyArray<QueryKey>): void {
      keys = allowed
      restore()
      let timer: ReturnType<typeof setTimeout> | undefined
      client.getQueryCache().subscribe((event) => {
        if (event.type !== "updated" || !keys.some((key) => sameKey(key, event.query.queryKey))) return
        clearTimeout(timer)
        timer = setTimeout(persistNow, WRITE_DEBOUNCE_MS)
      })
    },

    /** The session's user is now known: what was restored for someone else is dropped, saving starts. */
    bindUser(user: string): void {
      if (restoredUser !== null && restoredUser !== user) {
        for (const queryKey of keys) client.removeQueries({ queryKey, exact: true })
        clear()
      }
      currentUser = user
      restoredUser = user
      persistNow()
    },

    /** The session ended (logout, refresh failed): nothing of it may outlive it. */
    clear,
    persistNow,
  }
}

export const queryCachePersistence = createQueryCachePersistence(queryClient)
