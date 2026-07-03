// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed } from '../engine/types.js'

export interface IContentScanRepository {
  /**
   * Scans across all registered seeds to identify media keys that are currently referenced
   * by any content entry. Used for orphaned media detection and storage analytics.
   */
  getReferencedMediaKeys(seeds: Seed[]): Promise<Set<string>>
}
