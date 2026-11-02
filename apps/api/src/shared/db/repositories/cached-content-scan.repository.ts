// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { IClock, IContentScanRepository, Seed } from '@beechcms/core'

/** How long storage reports may reuse one scan of every content table. */
export const CONTENT_SCAN_TTL_MS = 60_000

interface CachedScan {
  signature: string
  expiresAt: number
  keys: Promise<Set<string>>
}

/**
 * Read-through cache for the full content scan behind the storage and media reports (#840).
 * Concurrent callers share one in-flight scan. `fresh` bypasses the cache, and its result
 * replaces the cached one.
 */
export class CachedContentScanRepository implements IContentScanRepository {
  private cached: CachedScan | undefined

  constructor(
    private readonly inner: IContentScanRepository,
    private readonly clock: IClock,
    private readonly ttlMs: number = CONTENT_SCAN_TTL_MS,
  ) {}

  getReferencedMediaKeys(seeds: Seed[], options?: { fresh?: boolean }): Promise<Set<string>> {
    const now = this.clock.now()
    // A schema change alters which columns are scanned, so it must not reuse an older scan.
    const signature = JSON.stringify(seeds.map(seed => [seed.slug, seed.allowDrafts ?? false, seed.branches.map(branch => `${branch.alias}:${branch.type}`)]))

    if (!options?.fresh && this.cached && this.cached.signature === signature && now < this.cached.expiresAt) {
      return this.cached.keys
    }

    const entry: CachedScan = { signature, expiresAt: now + this.ttlMs, keys: this.inner.getReferencedMediaKeys(seeds) }
    this.cached = entry
    // A failed scan must not be served again.
    entry.keys.catch(() => {
      if (this.cached === entry) this.cached = undefined
    })
    return entry.keys
  }
}
