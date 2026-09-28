// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { IRateLimiter, RateLimitResult } from '@beechcms/core'

export interface CloudflareRateLimiterOptions {
  failClosed?: boolean
  fallbackLimiter?: IRateLimiter
}

export class CloudflareRateLimiter implements IRateLimiter {
  constructor(
    private readonly binding: RateLimit,
    private readonly options: CloudflareRateLimiterOptions = {}
  ) {}

  async checkLimit(key: string): Promise<RateLimitResult> {
    let localResult: RateLimitResult | undefined
    if (this.options.fallbackLimiter) {
      localResult = await this.options.fallbackLimiter.checkLimit(key)
      if (!localResult.isAllowed) {
        return localResult
      }
    }

    try {
      const res = await this.binding.limit({ key })
      if (!res.success) {
        const retryAfterSeconds =
          (res as any).retryAfterSeconds ?? (res as any).retryAfter ?? localResult?.retryAfterSeconds ?? 1
        return {
          isAllowed: false,
          retryAfterSeconds,
          limit: localResult?.limit,
          remaining: 0,
        }
      }
      return {
        isAllowed: true,
        limit: localResult?.limit,
        remaining: localResult?.remaining,
      }
    } catch (error) {
      console.warn(`Rate limiter binding error for key "${key}":`, error)
      if (this.options.failClosed) {
        return { isAllowed: false, retryAfterSeconds: localResult?.retryAfterSeconds ?? 1 }
      }
      return localResult ?? { isAllowed: true }
    }
  }

  reset(): void {
    this.options.fallbackLimiter?.reset?.()
  }
}

