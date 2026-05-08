export interface RateLimitResult {
  isAllowed: boolean
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
