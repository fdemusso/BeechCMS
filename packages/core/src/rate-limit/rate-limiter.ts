// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export interface RateLimitResult {
  isAllowed: boolean
  /**
   * The number of whole seconds after which the client may retry the request.
   */
  retryAfterSeconds?: number
  /**
   * The maximum token capacity configured for this limiter.
   */
  limit?: number
  /**
   * The number of whole tokens remaining in the bucket.
   */
  remaining?: number
}

export interface IRateLimiter {
  /**
   * Checks whether the given key is within the rate limit.
   */
  checkLimit(key: string): Promise<RateLimitResult>
  /**
   * Clears cached bucket state (for testing and isolation).
   */
  reset?(): void
}
