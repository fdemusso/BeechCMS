// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { PaletteStorage } from "./palette-storage"

/** Few enough that the section stays a shortcut under the context actions. */
export const RECENT_ITEMS_MAX = 5

const KEY_PREFIX = "beech:palette-recent:v1:"

/** One storage key per user: another account on the same browser never reads these ids. */
export function recentItemsKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`
}

/** The user's recent ids, newest first, at most RECENT_ITEMS_MAX, without duplicates. Never throws. */
export function readRecentIds(storage: PaletteStorage, userId: string): string[] {
  try {
    const raw = storage.getItem(recentItemsKey(userId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const ids = parsed.filter((entry): entry is string => typeof entry === "string" && entry !== "")
    return [...new Set(ids)].slice(0, RECENT_ITEMS_MAX)
  } catch {
    return []
  }
}

/** Read-modify-write: `id` first, any earlier copy removed, capped. null when the write fails (storage unchanged). Never throws. */
export function recordRecentId(storage: PaletteStorage, userId: string, id: string): string[] | null {
  const ids = [id, ...readRecentIds(storage, userId).filter((stored) => stored !== id)].slice(0, RECENT_ITEMS_MAX)
  try {
    storage.setItem(recentItemsKey(userId), JSON.stringify(ids))
    return ids
  } catch {
    return null
  }
}
