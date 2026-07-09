// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export interface RateLimitResult {
  isAllowed: boolean
  /**
   * The number of seconds after which the client may retry the request.
   * Note: This field is optional and may not be supported by all implementations
   * (e.g. Cloudflare Rate Limit binding does not return retry-after information).
   */
  retryAfterSeconds?: number
}

export interface IRateLimiter {
  /**
   * Checks whether the given key is within the rate limit.
   * The key should combine the client IP address and an endpoint-specific prefix
   * to prevent one endpoint's limit from being shared with another.
   */
  checkLimit(key: string): Promise<RateLimitResult>
}
