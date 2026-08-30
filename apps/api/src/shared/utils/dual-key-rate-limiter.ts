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
  blockedBy?: 'ip' | 'account' | 'both'
}

/**
 * Normalizes account identifiers (e.g. emails) by trimming whitespace and converting to lowercase.
 */
export function normalizeAccountKey(rawKey: string): string {
  return rawKey.trim().toLowerCase()
}

/**
 * Coordinates atomic evaluation of IP and Account rate limiters.
 * If either bucket violates its limit, access is rejected (HTTP 429).
 */
export async function checkDualKeyRateLimit(
  options: DualKeyRateLimitOptions
): Promise<DualKeyRateLimitResult> {
  const normalizedAccount = normalizeAccountKey(options.accountKey)

  const [ipResult, accountResult] = await Promise.all([
    options.ipLimiter.checkLimit(options.clientIp),
    options.accountLimiter.checkLimit(normalizedAccount),
  ])

  if (!ipResult.isAllowed || !accountResult.isAllowed) {
    const ipRetry = ipResult.retryAfterSeconds ?? 0
    const accountRetry = accountResult.retryAfterSeconds ?? 0
    const retryAfterSeconds = Math.max(ipRetry, accountRetry, 1)

    let blockedBy: 'ip' | 'account' | 'both' = 'both'
    if (!ipResult.isAllowed && accountResult.isAllowed) {
      blockedBy = 'ip'
    } else if (ipResult.isAllowed && !accountResult.isAllowed) {
      blockedBy = 'account'
    }

    return {
      isAllowed: false,
      retryAfterSeconds,
      blockedBy,
    }
  }

  return { isAllowed: true }
}
