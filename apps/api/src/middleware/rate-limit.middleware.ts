// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { createMiddleware } from 'hono/factory'
import type { IRateLimiter } from '@beechcms/core'
import { TokenBucketRateLimiter } from '@beechcms/core'
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
  const isProd = env.ENV === 'production'

  const getLimiter = (
    bindingName: string,
    binding?: RateLimit,
    options?: { failClosed?: boolean }
  ): IRateLimiter => {
    if (isProd && !binding) {
      throw new Error(`Missing rate limiter binding: ${bindingName} is required in production environment.`)
    }
    return !isDev && binding ? new CloudflareRateLimiter(binding, options) : NO_OP
  }

  const limiters: Record<RateLimiterName, IRateLimiter> = {
    login: getLimiter('LOGIN_RATE_LIMITER', env.LOGIN_RATE_LIMITER, { failClosed: true }),
    tokenRefresh: getLimiter('REFRESH_RATE_LIMITER', env.REFRESH_RATE_LIMITER, { failClosed: true }),
    forgotPassword: getLimiter('FORGOT_PASSWORD_RATE_LIMITER', env.FORGOT_PASSWORD_RATE_LIMITER, { failClosed: true }),
    resetPassword: getLimiter('RESET_PASSWORD_RATE_LIMITER', env.RESET_PASSWORD_RATE_LIMITER, { failClosed: true }),
    publicApiRead: getLimiter('PUBLIC_READ_RATE_LIMITER', env.PUBLIC_READ_RATE_LIMITER, { failClosed: false }),
    publicApiWrite: getLimiter('PUBLIC_WRITE_RATE_LIMITER', env.PUBLIC_WRITE_RATE_LIMITER, { failClosed: false }),
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
