// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Seed, ContentRepository, IdempotencyRepository, BeechBucket, MediaRepository, SystemStatsRepository, IHashProvider, ITokenService, IUserRepository, ISessionRepository, IPasswordResetTokenRepository, IActivityLogger, IActivityLogRepository, INotificationRepository, INotificationService, IWidgetRepository, ISearchRepository, IAnalyticsRepository, IContentScanRepository, ISeedRegistry, IClock, IIdGenerator, IAutomationRunner, IAutomationRepository, IScheduler, BackrefMap, ISiteSettingsRepository, IDemoDataRepository, JwtClaims, ISeedLayoutRepository, ISeedRepository, ISchemaMutator, IDashboardLayoutRepository, IQueueService, IKanbanPositionRepository } from '@beechcms/core'
import type { IRateLimiterRegistry } from './middleware/rate-limit.middleware'
import type { ISetupChecklistRepository } from './shared/d1-setup-checklist.repository'

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
  QUEUE?: Queue
  QSTASH_TOKEN?: string
  QSTASH_URL?: string
  /** Public base URL the worker is reachable at, used by QStash to call back the webhook (e.g. an ngrok tunnel in dev). Falls back to APP_URL. */
  QSTASH_CALLBACK_URL?: string
  QSTASH_CURRENT_SIGNING_KEY?: string
  QSTASH_NEXT_SIGNING_KEY?: string
}

export interface Variables {
  jwtPayload: JwtClaims
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
  queue: IQueueService
  backrefMap: BackrefMap
  siteSettingsRepository: ISiteSettingsRepository
  demoDataRepository: IDemoDataRepository
  setupChecklistRepository: ISetupChecklistRepository
  seedLayoutRepository: ISeedLayoutRepository
  seedRepository: ISeedRepository
  schemaMutator: ISchemaMutator
  dashboardLayoutRepository: IDashboardLayoutRepository
  kanbanPositionRepository: IKanbanPositionRepository
}

export type AppEnv = { Bindings: Env; Variables: Variables }
