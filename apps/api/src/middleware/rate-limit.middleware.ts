// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { createMiddleware } from 'hono/factory'
import type { IRateLimiter } from '@beechcms/core'
import { TokenBucketRateLimiter } from '@beechcms/core'
import type { AppEnv, Env } from '../types'

export type RateLimiterName =
  | 'login'
  | 'loginAccount'
  | 'tokenRefresh'
  | 'forgotPassword'
  | 'forgotPasswordAccount'
  | 'resetPassword'
  | 'publicApiRead'
  | 'publicApiWrite'

export interface IRateLimiterRegistry {
  getLimiter(name: RateLimiterName): IRateLimiter
  resetAll?(): void
}

export function buildDefaultRegistry(_env?: Env): IRateLimiterRegistry {
  const limiters: Record<RateLimiterName, IRateLimiter> = {
    login: new TokenBucketRateLimiter({ capacity: 10, refillRatePerSecond: 0.2 }), // IP burst: 10, 1 token/5s
    loginAccount: new TokenBucketRateLimiter({ capacity: 5, refillRatePerSecond: 0.1 }), // Account burst: 5, 1 token/10s
    tokenRefresh: new TokenBucketRateLimiter({ capacity: 20, refillRatePerSecond: 0.5 }), // Refresh burst: 20, 1 token/2s
    forgotPassword: new TokenBucketRateLimiter({ capacity: 5, refillRatePerSecond: 0.05 }), // IP burst: 5, 1 token/20s
    forgotPasswordAccount: new TokenBucketRateLimiter({ capacity: 3, refillRatePerSecond: 0.02 }), // Account burst: 3, 1 token/50s
    resetPassword: new TokenBucketRateLimiter({ capacity: 5, refillRatePerSecond: 0.1 }), // IP burst: 5, 1 token/10s
    publicApiRead: new TokenBucketRateLimiter({ capacity: 60, refillRatePerSecond: 1 }), // Read burst: 60, 1 token/1s
    publicApiWrite: new TokenBucketRateLimiter({ capacity: 10, refillRatePerSecond: 0.2 }), // Write burst: 10, 1 token/5s
  }

  return {
    getLimiter: (name) => limiters[name],
    resetAll: () => {
      for (const limiter of Object.values(limiters)) {
        limiter.reset?.()
      }
    },
  }
}

export const rateLimiterMiddleware = (overrides?: { registry?: IRateLimiterRegistry }) => {
  return createMiddleware<AppEnv>(async (context, next) => {
    const registry = overrides?.registry ?? buildDefaultRegistry(context.env)
    context.set('rateLimiters', registry)
    await next()
  })
}
