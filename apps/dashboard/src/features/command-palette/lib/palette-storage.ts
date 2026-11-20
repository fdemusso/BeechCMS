// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

const PROBE_KEY = "beech:palette:probe"

/** The subset of Web Storage the palette's browser-only stores use; `window.localStorage` in production. */
export type PaletteStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

/** `localStorage` when a probe write and remove succeed; null when storage is missing, blocked or full. */
export function probePaletteStorage(): PaletteStorage | null {
  try {
    const storage = window.localStorage
    storage.setItem(PROBE_KEY, "1")
    storage.removeItem(PROBE_KEY)
    return storage
  } catch {
    return null
  }
}
