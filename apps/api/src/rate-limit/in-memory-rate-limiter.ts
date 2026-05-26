// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { IRateLimiter, RateLimitResult } from '@beechcms/core'

export class InMemoryRateLimiter implements IRateLimiter {
  private readonly hitCounts = new Map<string, number>()

  constructor(private readonly maxAllowedHits: number) {}

  async checkLimit(key: string): Promise<RateLimitResult> {
    const currentHits = (this.hitCounts.get(key) ?? 0) + 1
    this.hitCounts.set(key, currentHits)
    return { isAllowed: currentHits <= this.maxAllowedHits }
  }
}
