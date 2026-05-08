import type { IRateLimiter, RateLimitResult } from '@beechcms/core'

export class NoOpRateLimiter implements IRateLimiter {
  async checkLimit(_key: string): Promise<RateLimitResult> {
    return { isAllowed: true }
  }
}
