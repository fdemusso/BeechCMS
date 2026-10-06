// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { createMiddleware } from 'hono/factory'
import type { IRateLimiter } from '@beechcms/core'
import { TokenBucketRateLimiter } from '@beechcms/core'
import type { AppEnv, Env } from '../types'
import { CloudflareRateLimiter } from '../rate-limit/cloudflare-rate-limiter'

export type RateLimiterName =
  | 'login'
  | 'loginAccount'
  | 'tokenRefresh'
  | 'forgotPassword'
  | 'forgotPasswordAccount'
  | 'resetPassword'
  | 'acceptInvitation'
  | 'publicApiRead'
  | 'publicApiWrite'
  | 'oauthToken'
  | 'oauthTokenAccount'

export interface IRateLimiterRegistry {
  getLimiter(name: RateLimiterName): IRateLimiter
  resetAll?(): void
}

export function buildDefaultRegistry(env?: Env): IRateLimiterRegistry {
  const localLimiters: Record<RateLimiterName, IRateLimiter> = {
    login: new TokenBucketRateLimiter({ capacity: 10, refillRatePerSecond: 0.2 }), // IP burst: 10, 1 token/5s
    loginAccount: new TokenBucketRateLimiter({ capacity: 5, refillRatePerSecond: 0.1 }), // Account burst: 5, 1 token/10s
    tokenRefresh: new TokenBucketRateLimiter({ capacity: 20, refillRatePerSecond: 0.5 }), // Refresh burst: 20, 1 token/2s
    forgotPassword: new TokenBucketRateLimiter({ capacity: 5, refillRatePerSecond: 0.05 }), // IP burst: 5, 1 token/20s
    forgotPasswordAccount: new TokenBucketRateLimiter({ capacity: 3, refillRatePerSecond: 0.02 }), // Account burst: 3, 1 token/50s
    resetPassword: new TokenBucketRateLimiter({ capacity: 5, refillRatePerSecond: 0.1 }), // IP burst: 5, 1 token/10s
    acceptInvitation: new TokenBucketRateLimiter({ capacity: 10, refillRatePerSecond: 0.2 }), // IP burst: 10, 1 token/5s
    publicApiRead: new TokenBucketRateLimiter({ capacity: 60, refillRatePerSecond: 1 }), // Read burst: 60, 1 token/1s
    publicApiWrite: new TokenBucketRateLimiter({ capacity: 10, refillRatePerSecond: 0.2 }), // Write burst: 10, 1 token/5s
    oauthToken: new TokenBucketRateLimiter({ capacity: 20, refillRatePerSecond: 0.5 }), // IP burst: 20, 1 token/2s
    oauthTokenAccount: new TokenBucketRateLimiter({ capacity: 10, refillRatePerSecond: 0.2 }), // Per-credential burst: 10, 1 token/5s
  }

  const wrapWithBinding = (
    binding?: RateLimit,
    fallback?: IRateLimiter,
    options: { failClosed?: boolean; periodSeconds?: number; limiterName?: string } = {}
  ): IRateLimiter => {
    if (!binding) return fallback!
    return new CloudflareRateLimiter(binding, {
      failClosed: options.failClosed ?? false,
      periodSeconds: options.periodSeconds ?? 60,
      limiterName: options.limiterName,
      fallbackLimiter: fallback,
    })
  }

  const limiters: Record<RateLimiterName, IRateLimiter> = {
    login: wrapWithBinding(env?.LOGIN_RATE_LIMITER, localLimiters.login, { failClosed: true, periodSeconds: 60, limiterName: 'login' }),
    loginAccount: localLimiters.loginAccount,
    tokenRefresh: wrapWithBinding(env?.REFRESH_RATE_LIMITER, localLimiters.tokenRefresh, { failClosed: true, periodSeconds: 60, limiterName: 'tokenRefresh' }),
    forgotPassword: wrapWithBinding(env?.FORGOT_PASSWORD_RATE_LIMITER, localLimiters.forgotPassword, { failClosed: true, periodSeconds: 60, limiterName: 'forgotPassword' }),
    forgotPasswordAccount: localLimiters.forgotPasswordAccount,
    resetPassword: wrapWithBinding(env?.RESET_PASSWORD_RATE_LIMITER, localLimiters.resetPassword, { failClosed: true, periodSeconds: 60, limiterName: 'resetPassword' }),
    acceptInvitation: localLimiters.acceptInvitation,
    publicApiRead: wrapWithBinding(env?.PUBLIC_READ_RATE_LIMITER, localLimiters.publicApiRead, { failClosed: false, periodSeconds: 60, limiterName: 'publicApiRead' }),
    publicApiWrite: wrapWithBinding(env?.PUBLIC_WRITE_RATE_LIMITER, localLimiters.publicApiWrite, { failClosed: false, periodSeconds: 60, limiterName: 'publicApiWrite' }),
    oauthToken: localLimiters.oauthToken,
    oauthTokenAccount: localLimiters.oauthTokenAccount,
  }

  return {
    getLimiter: (name) => limiters[name],
    resetAll: () => {
      for (const limiter of Object.values(limiters)) {
        limiter.reset?.()
      }
      for (const limiter of Object.values(localLimiters)) {
        limiter.reset?.()
      }
    },
  }
}

export const rateLimiterMiddleware = (overrides?: { registry?: IRateLimiterRegistry }) => {
  let instanceRegistry: IRateLimiterRegistry | null = overrides?.registry ?? null

  return createMiddleware<AppEnv>(async (context, next) => {
    if (!instanceRegistry) {
      instanceRegistry = buildDefaultRegistry(context.env)
    }
    context.set('rateLimiters', instanceRegistry)
    await next()
  })
}
