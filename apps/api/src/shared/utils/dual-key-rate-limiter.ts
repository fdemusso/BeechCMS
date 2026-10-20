// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { IRateLimiter, RateLimitResult } from '@beechcms/core'

export interface DualKeyRateLimitOptions {
  ipLimiter: IRateLimiter
  accountLimiter: IRateLimiter
  clientIp: string
  accountKey: string
}

export interface DualKeyRateLimitResult {
  isAllowed: boolean
  retryAfterSeconds?: number
  blockedBy?: 'ip' | 'account'
}

/**
 * Normalizes account identifiers (e.g. emails) by trimming whitespace and converting to lowercase.
 */
export function normalizeAccountKey(rawKey: string): string {
  return rawKey.trim().toLowerCase()
}

/**
 * Coordinates sequential evaluation of IP and Account rate limiters.
 * Checks the IP limiter first and short-circuits before touching the account limiter when the
 * IP is already blocked. The account limiter is local, keyed by attacker-controlled input (email,
 * client_id) and has no shared binding, so consulting it unconditionally let a flood of requests
 * from a single already-throttled IP force account bucket eviction and reset a victim's limit
 * (#458). Requests from a throttled IP can no longer create or touch account buckets.
 */
export async function checkDualKeyRateLimit(
  options: DualKeyRateLimitOptions
): Promise<DualKeyRateLimitResult> {
  const normalizedAccount = normalizeAccountKey(options.accountKey)

  const ipResult = await options.ipLimiter.checkLimit(options.clientIp)
  if (!ipResult.isAllowed) {
    return {
      isAllowed: false,
      retryAfterSeconds: Math.max(ipResult.retryAfterSeconds ?? 0, 1),
      blockedBy: 'ip',
    }
  }

  const accountResult = await options.accountLimiter.checkLimit(normalizedAccount)
  if (!accountResult.isAllowed) {
    return {
      isAllowed: false,
      retryAfterSeconds: Math.max(accountResult.retryAfterSeconds ?? 0, 1),
      blockedBy: 'account',
    }
  }

  return { isAllowed: true }
}
