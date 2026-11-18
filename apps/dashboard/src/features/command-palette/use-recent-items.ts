// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { probePaletteStorage } from "./lib/palette-storage"
import { readRecentIds, recordRecentId } from "./lib/recent-items-storage"

/** Ids together with the user they were read for. */
interface OwnedIds {
  readonly userId: string | undefined
  readonly ids: readonly string[]
}

const NO_IDS: readonly string[] = []

export type RecentItemsState =
  | { readonly status: "ready"; readonly ids: readonly string[] }
  | { readonly status: "unavailable" }

export interface RecentItemsApi {
  readonly state: RecentItemsState
  /** Records `id` as the most recent. A failed write is dropped silently: recents may be lost without harm (brief §4). */
  readonly record: (id: string) => void
}

/** Browser-only recent ids of `userId`, re-read from storage each time `open` turns true. */
export function useRecentItems(userId: string | undefined, open: boolean): RecentItemsApi {
  const [storage] = React.useState(probePaletteStorage)
  const [owned, setOwned] = React.useState<OwnedIds>({ userId: undefined, ids: NO_IDS })
  // Ids of another user are never exposed, even for the render before the effect re-reads storage.
  const ids = owned.userId === userId ? owned.ids : NO_IDS

  React.useEffect(() => {
    if (open && storage && userId) setOwned({ userId, ids: readRecentIds(storage, userId) })
  }, [open, storage, userId])

  const state = React.useMemo<RecentItemsState>(
    () => (storage && userId ? { status: "ready", ids } : { status: "unavailable" }),
    [storage, userId, ids],
  )

  const record = React.useCallback(
    (id: string) => {
      if (!storage || !userId) return
      const recorded = recordRecentId(storage, userId, id)
      if (recorded) setOwned({ userId, ids: recorded })
    },
    [storage, userId],
  )

  return React.useMemo(() => ({ state, record }), [state, record])
}
