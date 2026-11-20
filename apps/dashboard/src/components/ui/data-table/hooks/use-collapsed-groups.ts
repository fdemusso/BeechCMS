// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"

/** Closed ids kept per key. Ids of groups that no longer exist are harmless but must not pile up forever. */
const MAX_STORED_GROUPS = 200

function read(storageKey: string | undefined): string[] {
  if (!storageKey) return []
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]")
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []
  } catch {
    return []
  }
}

function write(storageKey: string | undefined, closed: string[]) {
  if (!storageKey) return
  try {
    if (closed.length === 0) localStorage.removeItem(storageKey)
    else localStorage.setItem(storageKey, JSON.stringify(closed.slice(-MAX_STORED_GROUPS)))
  } catch {
    // Private window / blocked storage: the state just lasts for the session.
  }
}

/**
 * Which groups the user closed. Stores the CLOSED ids, not the open ones: a group that did not exist when the state
 * was saved (new data, a filter) therefore starts open, like every group does by default.
 * With a `storageKey` the choice survives a reload and is shared by every mount of the same key.
 */
export function useCollapsedGroups(storageKey: string | undefined) {
  const [state, setState] = React.useState(() => ({ storageKey, closed: read(storageKey) }))

  // Another key (another view, another grouped field) is another state: read it before painting.
  let current = state
  if (state.storageKey !== storageKey) {
    current = { storageKey, closed: read(storageKey) }
    setState(current)
  }

  // The storage write is a side effect, so it stays out of the state updater (React may run updaters twice).
  const toggle = React.useCallback(
    (groupId: string) => {
      const closed = current.closed.includes(groupId) ? current.closed.filter((id) => id !== groupId) : [...current.closed, groupId]
      write(current.storageKey, closed)
      setState({ storageKey: current.storageKey, closed })
    },
    [current]
  )

  return { closed: current.closed, toggle }
}
