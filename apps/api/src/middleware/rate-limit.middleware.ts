// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { createMiddleware } from 'hono/factory'
import type { IRateLimiter } from '@beechcms/core'
import type { AppEnv, Env } from '../types'
import { CloudflareRateLimiter } from '../rate-limit/cloudflare-rate-limiter'
import { NoOpRateLimiter } from '../rate-limit/no-op-rate-limiter'

export type RateLimiterName =
  | 'login'
  | 'tokenRefresh'
  | 'forgotPassword'
  | 'resetPassword'
  | 'publicApiRead'
  | 'publicApiWrite'

export interface IRateLimiterRegistry {
  getLimiter(name: RateLimiterName): IRateLimiter
}

const NO_OP = new NoOpRateLimiter()

function buildDefaultRegistry(env: Env): IRateLimiterRegistry {
  // WORKAROUND: Cloudflare's local wrangler/workerd simulator crashes on Windows
  // when executing RateLimit bindings (.limit()). We bypass rate limiting in local
  // development (env.ENV === 'development') but keep it enabled in Vitest tests.
  const isDev = env.ENV === 'development' && !(typeof (globalThis as any).process !== 'undefined' && (globalThis as any).process.env?.VITEST)

  const limiters: Record<RateLimiterName, IRateLimiter> = {
    login: !isDev && env.LOGIN_RATE_LIMITER ? new CloudflareRateLimiter(env.LOGIN_RATE_LIMITER) : NO_OP,
    tokenRefresh: !isDev && env.REFRESH_RATE_LIMITER ? new CloudflareRateLimiter(env.REFRESH_RATE_LIMITER) : NO_OP,
    forgotPassword: !isDev && env.FORGOT_PASSWORD_RATE_LIMITER ? new CloudflareRateLimiter(env.FORGOT_PASSWORD_RATE_LIMITER) : NO_OP,
    resetPassword: !isDev && env.RESET_PASSWORD_RATE_LIMITER ? new CloudflareRateLimiter(env.RESET_PASSWORD_RATE_LIMITER) : NO_OP,
    publicApiRead: !isDev && env.PUBLIC_READ_RATE_LIMITER ? new CloudflareRateLimiter(env.PUBLIC_READ_RATE_LIMITER) : NO_OP,
    publicApiWrite: !isDev && env.PUBLIC_WRITE_RATE_LIMITER ? new CloudflareRateLimiter(env.PUBLIC_WRITE_RATE_LIMITER) : NO_OP,
  }

  return { getLimiter: (name) => limiters[name] }
}

export const rateLimiterMiddleware = (overrides?: { registry?: IRateLimiterRegistry }) => {
  return createMiddleware<AppEnv>(async (context, next) => {
    const registry = overrides?.registry ?? buildDefaultRegistry(context.env)
    context.set('rateLimiters', registry)
    await next()
  })
}
