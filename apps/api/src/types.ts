/// <reference types="@cloudflare/workers-types" />
import type { Seed } from '@beech/core'

export interface Env {
  DB: D1Database
  JWT_SECRET: string
  JWT_ISSUER?: string
  JWT_AUDIENCE?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_ENDPOINT?: string
  R2_BUCKET_NAME?: string
  LOGIN_RATE_LIMITER?: RateLimit
  REFRESH_RATE_LIMITER?: RateLimit
  PUBLIC_READ_RATE_LIMITER?: RateLimit
  PUBLIC_WRITE_RATE_LIMITER?: RateLimit
  CORS_ORIGINS?: string
  PUBLIC_READ_API_KEY?: string
  PUBLIC_WRITE_API_KEY?: string
  PUBLIC_PUBLISHED_ONLY?: string
  PUBLIC_IDEMPOTENCY_TTL_SECONDS?: string
  MEDIA_BASE_URL?: string
  RESEND_API_KEY?: string
  APP_URL?: string
  EMAIL_FROM?: string
  FORGOT_PASSWORD_RATE_LIMITER?: RateLimit
  RESET_PASSWORD_RATE_LIMITER?: RateLimit
  ENV?: string
}

export interface Variables {
  jwtPayload: { sub: string; email?: string }
  getSeed: (slug: string) => Seed | null
  seedRegistry: Record<string, Seed>
}
