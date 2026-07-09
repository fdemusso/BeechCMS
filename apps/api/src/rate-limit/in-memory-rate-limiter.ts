// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { IRateLimiter, RateLimitResult } from '@beechcms/core'

export class InMemoryRateLimiter implements IRateLimiter {
  private readonly hitCounts = new Map<string, { hits: number; resetTime: number }>()

  constructor(
    private readonly maxAllowedHits: number,
    private readonly windowSeconds: number = 60
  ) {}

  async checkLimit(key: string): Promise<RateLimitResult> {
    const now = Date.now()

    for (const [k, record] of this.hitCounts.entries()) {
      if (now >= record.resetTime) {
        this.hitCounts.delete(k)
      }
    }

    let record = this.hitCounts.get(key)
    if (!record) {
      record = { hits: 0, resetTime: now + this.windowSeconds * 1000 }
    }

    record.hits++
    this.hitCounts.set(key, record)

    const isAllowed = record.hits <= this.maxAllowedHits
    const retryAfterSeconds = isAllowed
      ? undefined
      : Math.max(0, Math.ceil((record.resetTime - now) / 1000))

    return { isAllowed, retryAfterSeconds }
  }
}
