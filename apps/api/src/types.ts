// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Seed, ContentRepository, IdempotencyRepository, BeechBucket, MediaRepository, SystemStatsRepository, IHashProvider, ITokenService, IUserRepository, ISessionRepository, IPasswordResetTokenRepository, IActivityLogger, IActivityLogRepository, INotificationRepository, INotificationService, IWidgetRepository, ISearchRepository, IAnalyticsRepository, IContentScanRepository, ISeedRegistry, IClock, IIdGenerator, IAutomationRunner, IAutomationRepository, IScheduler, BackrefMap } from '@beechcms/core'
import type { IRateLimiterRegistry } from './middleware/rate-limit.middleware'

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
  MEDIA_CDN_URL?: string
  MAX_UPLOAD_BYTES?: string
  RESEND_API_KEY?: string
  EMAIL_API_KEY?: string
  APP_URL?: string
  EMAIL_FROM?: string
  EMAIL_PROVIDER?: string
  SMTP_HOST?: string
  SMTP_PORT?: string
  WEBHOOK_TESTER_URL?: string
  FORGOT_PASSWORD_RATE_LIMITER?: RateLimit
  RESET_PASSWORD_RATE_LIMITER?: RateLimit
  ENV?: string
  DATE_FORMAT?: string
  ASSETS?: Fetcher
}

export interface Variables {
  jwtPayload: { sub: string; email?: string; name?: string | null }
  getSeed: (slug: string) => Seed | null
  seedRegistry: ISeedRegistry
  repository: ContentRepository
  idempotencyRepository: IdempotencyRepository
  bucket: BeechBucket
  mediaRepository: MediaRepository
  systemStatsRepository: SystemStatsRepository
  hashProvider: IHashProvider
  tokenService: ITokenService
  userRepository: IUserRepository
  sessionRepository: ISessionRepository
  passwordResetTokenRepository: IPasswordResetTokenRepository
  rateLimiters: IRateLimiterRegistry
  activityLogger: IActivityLogger
  activityLogRepository: IActivityLogRepository
  notificationRepository: INotificationRepository
  notificationService: INotificationService
  widgetRepository: IWidgetRepository
  searchRepository: ISearchRepository
  analyticsRepository: IAnalyticsRepository
  contentScanRepository: IContentScanRepository
  clock: IClock
  idGenerator: IIdGenerator
  automationRepository: IAutomationRepository
  automationRunner: IAutomationRunner
  scheduler: IScheduler
  backrefMap: BackrefMap
}

export type AppEnv = { Bindings: Env; Variables: Variables }
