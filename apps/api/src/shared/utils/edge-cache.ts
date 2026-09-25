// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Context } from 'hono'

export type EdgeCache = {
  cache: Cache
  executionCtx: { waitUntil: (p: Promise<unknown>) => void }
} | null

export function resolveEdgeCache(c: Context): EdgeCache {
  try {
    const cache = caches.default
    let executionCtx: { waitUntil?: (p: Promise<unknown>) => void } | undefined
    try {
      executionCtx = c.executionCtx
    } catch {
      return null
    }

    if (!executionCtx?.waitUntil) return null
    return { cache, executionCtx: executionCtx as { waitUntil: (p: Promise<unknown>) => void } }
  } catch {
    return null
  }
}
