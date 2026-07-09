// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { IRateLimiter, RateLimitResult } from '@beechcms/core'

export class CloudflareRateLimiter implements IRateLimiter {
  constructor(
    private readonly binding: RateLimit,
    private readonly options: { failClosed?: boolean } = {}
  ) {}

  async checkLimit(key: string): Promise<RateLimitResult> {
    try {
      const res = await this.binding.limit({ key })
      return {
        isAllowed: res.success,
        retryAfterSeconds: (res as any).retryAfterSeconds ?? (res as any).retryAfter,
      }
    } catch (error) {
      console.warn(`Rate limiter binding error for key "${key}":`, error)
      return { isAllowed: !this.options.failClosed }
    }
  }
}

