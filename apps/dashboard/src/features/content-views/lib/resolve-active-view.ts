// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ContentView } from "@beechcms/core"

/**
 * The first candidate that names a visible instance wins (session pick, then `?view=`, then
 * localStorage). With no match, the first Table instance, which the API guarantees exists.
 */
export function resolveActiveViewId(
  views: ReadonlyArray<Pick<ContentView, "id" | "type">>,
  candidates: ReadonlyArray<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    if (candidate && views.some((view) => view.id === candidate)) return candidate
  }
  return views.find((view) => view.type === "table")?.id ?? views[0]?.id ?? null
}
