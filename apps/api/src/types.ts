// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * @module Types
 * Hono app-level type contracts: Cloudflare Worker bindings (`Env`),
 * per-request context values injected by middleware (`Variables`), and
 * the combined `AppEnv` used to type every Hono app/router in the API.
 */

/// <reference types="@cloudflare/workers-types" />
import type { Seed, ContentRepository, IdempotencyRepository, BeechBucket, MediaRepository, SystemStatsRepository, IHashProvider, ITokenService, IUserRepository, ISessionRepository, IPasswordResetTokenRepository, IActivityLogger, IActivityLogRepository, INotificationRepository, INotificationService, IWidgetRepository, ISearchRepository, IAnalyticsRepository, IContentScanRepository, ISeedRegistry, IClock, IIdGenerator, IAutomationRunner, IAutomationRepository, IScheduler, BackrefMap, ISiteSettingsRepository, IDemoDataRepository, JwtClaims, ISeedLayoutRepository, ISeedRepository, ISchemaMutator, IDashboardLayoutRepository, IQueueService, IKanbanPositionRepository, IPrivacyService, ActorContext, IAntivirusProvider, ITimeTrapTokenRepository } from '@beechcms/core'
import type { IRateLimiterRegistry } from './middleware/rate-limit.middleware'
import type { ISetupChecklistRepository } from './shared/db/repositories/d1-setup-checklist.repository'

/**
 * Cloudflare Worker bindings and environment variables, as declared in `wrangler.toml`.
 * Populated by the Workers runtime; optional fields are unset in some environments (e.g. local dev, tests).
 */
export interface Env {
  /** D1 database binding, the source of truth for all content and system tables. */
  DB: D1Database
  /** Secret used to sign and verify JWTs. */
  JWT_SECRET: string
  /** Expected `iss` claim on issued/verified JWTs. */
  JWT_ISSUER?: string
  /** Expected `aud` claim on issued/verified JWTs. */
  JWT_AUDIENCE?: string
  /** Native Cloudflare R2 bucket binding for media storage. */
  MEDIA_BUCKET?: R2Bucket
  /** R2-compatible access key ID for media storage. */
  R2_ACCESS_KEY_ID?: string
  /** R2-compatible secret access key for media storage. */
  R2_SECRET_ACCESS_KEY?: string
  /** R2-compatible S3 API endpoint. */
  R2_ENDPOINT?: string
  /** R2 bucket name used for media uploads. */
  R2_BUCKET_NAME?: string
  /** Rate limiter binding for the login endpoint. */
  LOGIN_RATE_LIMITER?: RateLimit
  /** Rate limiter binding for the token refresh endpoint. */
  REFRESH_RATE_LIMITER?: RateLimit
  /** Rate limiter binding for public (API-key) read endpoints. */
  PUBLIC_READ_RATE_LIMITER?: RateLimit
  /** Rate limiter binding for public (API-key) write endpoints. */
  PUBLIC_WRITE_RATE_LIMITER?: RateLimit
  /** Comma-separated list of allowed CORS origins. */
  CORS_ORIGINS?: string
  /** API key required for public read-only requests. */
  PUBLIC_READ_API_KEY?: string
  /** API key required for public write requests. */
  PUBLIC_WRITE_API_KEY?: string
  /** When set, restricts the public API to `published` status entries only. */
  PUBLIC_PUBLISHED_ONLY?: string
  /** TTL, in seconds, for public API idempotency keys. */
  PUBLIC_IDEMPOTENCY_TTL_SECONDS?: string
  /** Base URL used to build public media asset URLs. */
  MEDIA_BASE_URL?: string
  /** CDN URL prepended to media asset URLs when serving through a CDN. */
  MEDIA_CDN_URL?: string
  /** Maximum accepted upload size, in bytes. */
  MAX_UPLOAD_BYTES?: string
  /** API key for the Resend transactional email provider. */
  RESEND_API_KEY?: string
  /** Generic email provider API key, used when `EMAIL_PROVIDER` is not Resend/SMTP-specific. */
  EMAIL_API_KEY?: string
  /** Public base URL of the dashboard app, used in outbound email links. */
  APP_URL?: string
  /** Default `From` address for outbound email. */
  EMAIL_FROM?: string
  /** Selects the email transport (e.g. `resend`, `smtp`). */
  EMAIL_PROVIDER?: string
  /** SMTP host, used when `EMAIL_PROVIDER` is SMTP. */
  SMTP_HOST?: string
  /** SMTP port, used when `EMAIL_PROVIDER` is SMTP. */
  SMTP_PORT?: string
  /** URL of a webhook-capture service used in dev/testing to inspect outbound webhook calls. */
  WEBHOOK_TESTER_URL?: string
  /** Rate limiter binding for the forgot-password endpoint. */
  FORGOT_PASSWORD_RATE_LIMITER?: RateLimit
  /** Rate limiter binding for the reset-password endpoint. */
  RESET_PASSWORD_RATE_LIMITER?: RateLimit
  /** Deployment environment name (e.g. `development`, `production`). */
  ENV?: string
  /** Default date format string used for display/formatting purposes. */
  DATE_FORMAT?: string
  /** Static assets binding, serving the dashboard SPA in production. */
  ASSETS?: Fetcher
  /** Cloudflare Queue binding for async job dispatch. */
  QUEUE?: Queue
  /** Auth token for the QStash scheduling/delivery service. */
  QSTASH_TOKEN?: string
  /** Base URL of the QStash API. */
  QSTASH_URL?: string
  /** Public base URL the worker is reachable at, used by QStash to call back the webhook (e.g. an ngrok tunnel in dev). Falls back to APP_URL. */
  QSTASH_CALLBACK_URL?: string
  /** Current QStash signing key, used to verify inbound webhook signatures. */
  QSTASH_CURRENT_SIGNING_KEY?: string
  /** Next QStash signing key, accepted during key rotation. */
  QSTASH_NEXT_SIGNING_KEY?: string
  /** Master key used for Application-Level Encryption (ALE). */
  PRIVACY_MASTER_KEY?: string
  /** API key for VirusTotal file/hash scanning. */
  VIRUSTOTAL_API_KEY?: string
  /** Secret used to sign and verify public form time-trap tokens. */
  PUBLIC_TIME_TRAP_SECRET?: string
  /** Comma-separated list of allowed origins for public submissions. */
  ALLOWED_ORIGINS?: string
}

/**
 * Per-request context values (`c.get(...)` / `c.set(...)`), injected by middleware
 * before route handlers run. Every entry here must be set by some middleware on the request path.
 */
export interface Variables {
  /** Caller/actor context (public vs authenticated user vs system). */
  actor?: ActorContext
  /** Decoded JWT claims of the authenticated user. */
  jwtPayload: JwtClaims
  /** Application-level privacy and encryption service. */
  privacyService: IPrivacyService
  /** Looks up a Seed definition by slug from the loaded schema. */
  getSeed: (slug: string) => Seed | null
  /** Registry of all loaded Seed definitions. */
  seedRegistry: ISeedRegistry
  /** Repository for reading/writing content entries. */
  repository: ContentRepository
  /** Repository for idempotency key storage (dedupes retried writes). */
  idempotencyRepository: IdempotencyRepository
  /** Media storage bucket abstraction (R2-backed). */
  bucket: BeechBucket
  /** Repository for media asset metadata. */
  mediaRepository: MediaRepository
  /** Repository for aggregate system/dashboard statistics. */
  systemStatsRepository: SystemStatsRepository
  /** Password hashing provider. */
  hashProvider: IHashProvider
  /** Issues and verifies auth tokens (JWT access/refresh). */
  tokenService: ITokenService
  /** Repository for user accounts. */
  userRepository: IUserRepository
  /** Repository for auth sessions. */
  sessionRepository: ISessionRepository
  /** Repository for password reset tokens. */
  passwordResetTokenRepository: IPasswordResetTokenRepository
  /** Registry of configured rate limiters, keyed by route/binding. */
  rateLimiters: IRateLimiterRegistry
  /** Records activity log entries for auditing. */
  activityLogger: IActivityLogger
  /** Repository for reading activity log entries. */
  activityLogRepository: IActivityLogRepository
  /** Repository for user notifications. */
  notificationRepository: INotificationRepository
  /** Dispatches notifications (in-app, email, etc). */
  notificationService: INotificationService
  /** Repository for dashboard widget configuration. */
  widgetRepository: IWidgetRepository
  /** Repository backing full-text/content search. */
  searchRepository: ISearchRepository
  /** Repository for analytics event storage/queries. */
  analyticsRepository: IAnalyticsRepository
  /** Repository for content scan results (e.g. broken links, validation issues). */
  contentScanRepository: IContentScanRepository
  /** Clock abstraction, used instead of `Date.now()` for testability. */
  clock: IClock
  /** Generates unique IDs for new records. */
  idGenerator: IIdGenerator
  /** Repository for automation (workflow) definitions. */
  automationRepository: IAutomationRepository
  /** Executes automation runs. */
  automationRunner: IAutomationRunner
  /** Schedules deferred/delayed jobs. */
  scheduler: IScheduler
  /** Enqueues async jobs onto the Queue binding. */
  queue: IQueueService
  /** Map of reverse relation references, used to resolve backrefs between content types. */
  backrefMap: BackrefMap
  /** Repository for global site settings. */
  siteSettingsRepository: ISiteSettingsRepository
  /** Repository for demo/seed data generation. */
  demoDataRepository: IDemoDataRepository
  /** Repository tracking onboarding/setup checklist completion. */
  setupChecklistRepository: ISetupChecklistRepository
  /** Repository for per-seed layout configuration (form/list layouts). */
  seedLayoutRepository: ISeedLayoutRepository
  /** Repository for Seed (content type) definitions themselves. */
  seedRepository: ISeedRepository
  /** Applies schema mutations (create/alter/drop) to the database. */
  schemaMutator: ISchemaMutator
  /** Repository for dashboard layout configuration. */
  dashboardLayoutRepository: IDashboardLayoutRepository
  /** Repository for Kanban card position/ordering state. */
  kanbanPositionRepository: IKanbanPositionRepository
  /** Antivirus scanning provider. */
  antivirusProvider: IAntivirusProvider
  /** Repository for single-use time-trap token deduplication. */
  timeTrapTokenRepository: ITimeTrapTokenRepository
}

/** Combined Hono generic type (`Bindings` + `Variables`) used to type every app/router in the API. */
export type AppEnv = { Bindings: Env; Variables: Variables }
