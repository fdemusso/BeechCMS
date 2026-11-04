// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Persistenza locale (per seed) della vista attiva in /admin/content/:slug.
 * Il valore memorizzato è un instance id. Non gestisce la pulizia se il seed
 * viene poi eliminato: la entry resta orfana in localStorage, inoffensiva,
 * finché non viene sovrascritta.
 */
const ACTIVE_VIEW_STORAGE_PREFIX = "beech_content_view_"

export function getStoredActiveView(slug: string | undefined): string | null {
  if (!slug) return null
  return localStorage.getItem(`${ACTIVE_VIEW_STORAGE_PREFIX}${slug}`)
}

export function setStoredActiveView(slug: string | undefined, viewId: string): void {
  if (!slug) return
  localStorage.setItem(`${ACTIVE_VIEW_STORAGE_PREFIX}${slug}`, viewId)
}
