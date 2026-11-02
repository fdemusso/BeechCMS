// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed } from '../engine/types.js'

export interface IContentScanRepository {
  /**
   * Scans across all registered seeds to identify media keys that are currently referenced
   * by any content entry, live or draft. Used for orphaned media detection and storage analytics.
   *
   * A caching implementation may answer from a recent scan; `fresh` forces a new one and is
   * required before any destructive decision (deleting a file).
   */
  getReferencedMediaKeys(seeds: Seed[], options?: { fresh?: boolean }): Promise<Set<string>>
}
