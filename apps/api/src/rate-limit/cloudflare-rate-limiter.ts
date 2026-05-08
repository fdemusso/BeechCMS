/// <reference types="@cloudflare/workers-types" />
import type { IRateLimiter, RateLimitResult } from '@beechcms/core'

export class CloudflareRateLimiter implements IRateLimiter {
  constructor(private readonly binding: RateLimit) {}

  async checkLimit(key: string): Promise<RateLimitResult> {
    const { success } = await this.binding.limit({ key })
    return { isAllowed: success }
  }
}
