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
  const limiters: Record<RateLimiterName, IRateLimiter> = {
    login: env.LOGIN_RATE_LIMITER ? new CloudflareRateLimiter(env.LOGIN_RATE_LIMITER) : NO_OP,
    tokenRefresh: env.REFRESH_RATE_LIMITER ? new CloudflareRateLimiter(env.REFRESH_RATE_LIMITER) : NO_OP,
    forgotPassword: env.FORGOT_PASSWORD_RATE_LIMITER ? new CloudflareRateLimiter(env.FORGOT_PASSWORD_RATE_LIMITER) : NO_OP,
    resetPassword: env.RESET_PASSWORD_RATE_LIMITER ? new CloudflareRateLimiter(env.RESET_PASSWORD_RATE_LIMITER) : NO_OP,
    publicApiRead: env.PUBLIC_READ_RATE_LIMITER ? new CloudflareRateLimiter(env.PUBLIC_READ_RATE_LIMITER) : NO_OP,
    publicApiWrite: env.PUBLIC_WRITE_RATE_LIMITER ? new CloudflareRateLimiter(env.PUBLIC_WRITE_RATE_LIMITER) : NO_OP,
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
