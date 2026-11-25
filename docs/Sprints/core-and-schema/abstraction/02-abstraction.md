You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

Do NOT explore the codebase further. All relevant context is provided in this prompt.
Read it fully before writing any code.

Phase 1 is already complete. The following interfaces and files now exist and are in production.
Phase 2 builds on top of them.

### Stack

- API: Hono on Cloudflare Workers, D1 (SQLite), R2, Cloudflare RateLimit bindings
- Dashboard: React + TanStack Query + axios, in-memory token store
- Shared package: @beechcms/core (pure TypeScript, zero HTTP/cloud dependencies)
- Monorepo: Turborepo

==========================================================================
SECTION 1 — WHAT PHASE 1 DELIVERED (already in production, do not rewrite)
==========================================================================

The following files and interfaces were created or modified in Phase 1.
They are ready to use. Never rewrite or duplicate them.

packages/core/src/auth/hash-provider.ts
  IHashProvider { hash(plaintextPassword): Promise<string>; verify(plaintext, hash): Promise<boolean> }
  Exported from packages/core/src/index.ts

packages/core/src/auth/token-service.ts
  JwtClaims, IssueTokenOptions, ITokenService { issue, verify }
  Exported from packages/core/src/index.ts

packages/core/src/auth/user.repository.ts
  UserRecord, IUserRepository
  Methods: countAll, findById, findByEmail, create, updateProfile, updatePasswordHash,
           updateAvatarUrl, updateNotificationPreferences, emailBelongsToAnotherUser
  Injected as c.get("userRepository") via repositoryMiddleware

packages/core/src/auth/session.repository.ts
  RefreshTokenRecord, ISessionRepository
  Methods: saveRefreshToken, findActiveByHash, revokeByHash, revokeAllForUser,
           listActiveForUser, revokeById
  Injected as c.get("sessionRepository") via repositoryMiddleware

packages/core/src/auth/password-reset-token.repository.ts
  PasswordResetTokenRecord, IPasswordResetTokenRepository
  Methods: invalidatePending, create, findValidByHashWithEmail, markUsed
  Injected as c.get("passwordResetTokenRepository") via repositoryMiddleware

packages/core/src/rate-limit/rate-limiter.ts
  RateLimitResult { isAllowed: boolean; retryAfterSeconds?: number }
  IRateLimiter { checkLimit(key: string): Promise<RateLimitResult> }
  IRateLimiterRegistry { getLimiter(name: RateLimiterName): IRateLimiter }
  RateLimiterName: "login" | "tokenRefresh" | "forgotPassword" | "resetPassword" | "publicApiRead" | "publicApiWrite"
  Exported from packages/core/src/index.ts

apps/api/src/auth/bcrypt-hash-provider.ts        -- BcryptHashProvider implements IHashProvider
apps/api/src/auth/in-memory-hash-provider.ts     -- InMemoryHashProvider implements IHashProvider (test only)
apps/api/src/auth/jose-token-service.ts          -- JoseTokenService implements ITokenService
apps/api/src/auth/static-token-service.ts        -- StaticTokenService implements ITokenService (test only)
apps/api/src/rate-limit/cloudflare-rate-limiter.ts  -- CloudflareRateLimiter implements IRateLimiter
apps/api/src/rate-limit/no-op-rate-limiter.ts       -- NoOpRateLimiter implements IRateLimiter (dev)
apps/api/src/rate-limit/in-memory-rate-limiter.ts   -- InMemoryRateLimiter implements IRateLimiter (test)
apps/api/src/middleware/auth-providers.middleware.ts -- injects hashProvider, tokenService
apps/api/src/middleware/rate-limit.middleware.ts     -- injects rateLimiters registry
apps/api/src/shared/d1-user.repository.ts        -- D1UserRepository implements IUserRepository
apps/api/src/shared/d1-session.repository.ts     -- D1SessionRepository implements ISessionRepository
apps/api/src/shared/d1-password-reset-token.repository.ts -- D1PasswordResetTokenRepository

All Phase 1 auth handlers no longer contain inline SQL or direct crypto imports.
sha256hex is imported from @beechcms/core/policies everywhere it is needed.

==========================================================================
SECTION 2 — INTERFACES ALREADY IN PRODUCTION (pre-Phase 1)
==========================================================================

ContentRepository (packages/core/src/content.repository.ts):
  findById, findMany, create, update, delete, existsSlug, hasDraft,
  saveDraft, getDraft, publishDraft, deleteDraft
  Injected as c.get("repository") via repositoryMiddleware

MediaRepository (packages/core/src/media.repository.ts):
  trackUpload, getByKey, untrack, list, count
  Injected as c.get("mediaRepository") via repositoryMiddleware

IdempotencyRepository (packages/core/src/idempotency.repository.ts):
  lookup, store, cleanup
  Injected as c.get("idempotencyRepository") via repositoryMiddleware

SystemStatsRepository:
  incrementStorage, decrementStorage, setStorage, getStorageUsage
  Injected via repositoryMiddleware

BeechBucket (packages/core/src/storage.ts):
  put, get, delete, head, getUrl, getTotalSize, list
  Injected as c.get("bucket") via storageMiddleware

EmailProvider (apps/api/src/features/email/email.provider.ts):
  send(email: OutboundEmail): Promise<void>
  Consumed internally by email.service.ts only. Never inject via middleware.

sha256hex (packages/core/src/policies.ts):
  sha256hex(input: string): Promise<string>
  Import directly from @beechcms/core wherever needed.

==========================================================================
SECTION 3 — CURRENT STATE OF THE TWO PROBLEM FILES (Phase 2 targets)
==========================================================================

apps/api/src/shared/activity-logger.ts  (CURRENT PROBLEM — to be replaced)
  Exports a free function: logActivity(c: Context, params: {...}): void
  The function reads c.env.DB and c.executionCtx directly.
  It executes an INSERT INTO activity_logs inline.
  It is called from:
    - apps/api/src/features/content/handlers/create.ts
    - apps/api/src/features/content/handlers/update.ts
    - apps/api/src/features/content/handlers/delete.ts
    - apps/api/src/upload.ts
  It cannot be tested without a full Hono Context and a real D1 instance.
  The actor (userId, email) is extracted from c.get("jwtPayload") inside the function,
  coupling it further to Hono internals.

apps/api/src/shared/notification-service.ts  (CURRENT PROBLEM — to be replaced)
  Exports a free function: createNotification(c: Context, params: {...}): void
  Same shape as logActivity: reads c.env.DB directly and runs an INSERT inline.
  Called from:
    - apps/api/src/public/public-add.ts (notifies admin on new public form submission)
    - possibly other public handlers

apps/api/src/features/notifications/notifications.handler.ts  (CURRENT PROBLEM — to be refactored)
  A Hono app with 5 route handlers, each containing raw SQL:
    GET  /notifications       -- SELECT with ETag generation
    PATCH /notifications/:id/read    -- UPDATE SET isread = 1
    PATCH /notifications/:id/unread  -- UPDATE SET isread = 0
    DELETE /notifications/:id        -- DELETE
    POST /notifications/mark-all-read -- UPDATE SET isread = 1 (all)
  All queries use c.env.DB directly. No repository. Not testable in isolation.

apps/api/src/features/settings/settings.handler.ts  (PARTIAL PROBLEM)
  After Phase 1, user and session SQL has been moved to repositories.
  However, it still contains direct SELECT on activity_logs for the activity tab.
  This will be resolved in Phase 2 via IActivityLogRepository (Step 3 below).

apps/api/src/features/stats/stats.handler.ts  (PARTIAL PROBLEM)
  Contains direct SELECT on activity_logs for recent activity display.
  This will be resolved in Phase 2 via IActivityLogRepository (Step 3 below).

==========================================================================
SECTION 4 — INTERFACES TO BUILD IN PHASE 2
==========================================================================

These are the exact interfaces to implement. Do not deviate from these signatures.

IActivityLogger (packages/core/src/observability/activity-logger.ts):

  ActivityAction = "create" | "update" | "delete" | "upload"
  EntityType = "content" | "media"

  ActivityLogEntry {
    action: ActivityAction
    entityType: EntityType
    entityId: string
    entitySlug?: string
    details?: Record<string, unknown>
    actor: { id: string; email: string; name?: string | null }
  }

  IActivityLogger {
    log(entry: ActivityLogEntry): Promise<void> | void
      -- Implementations decide whether to fire-and-forget.
      -- Must never throw synchronously; errors must be caught internally.
  }

IActivityLogRepository (packages/core/src/observability/activity-log.repository.ts):

  ActivityLogRecord {
    id: string
    userId: string
    userEmail: string
    userName: string | null
    action: ActivityAction
    entityType: EntityType
    entityId: string
    entitySlug: string | null
    details: Record<string, unknown> | null
    createdAt: number
  }

  ActivityLogListOptions {
    userId?: string
    entitySlug?: string
    limit: number
  }

  IActivityLogRepository {
    list(options: ActivityLogListOptions): Promise<ActivityLogRecord[]>
      -- Used by settings handler (user activity tab) and stats handler (recent activity).
  }

INotificationRepository (packages/core/src/notifications/notification.repository.ts):

  NotificationType = "info" | "success" | "warning" | "error"

  NotificationRecord {
    id: string
    title: string
    message: string
    type: NotificationType
    isRead: boolean
    createdAt: number
  }

  NotificationStats {
    totalCount: number
    latestCreatedAt: number
    readCount: number
  }

  INotificationRepository {
    list(limit: number): Promise<NotificationRecord[]>
      -- Returns the most recent notifications, ordered by createdAt DESC.
    stats(): Promise<NotificationStats>
      -- Returns aggregate data used for ETag generation and badge count.
    create(record: Omit<NotificationRecord, "id" | "createdAt" | "isRead">): Promise<string>
      -- Inserts a new notification. Returns the generated id.
    markRead(notificationId: string): Promise<void>
    markUnread(notificationId: string): Promise<void>
    markAllRead(): Promise<void>
    delete(notificationId: string): Promise<void>
  }

INotificationService (packages/core/src/notifications/notification-service.ts):

  CreateNotificationInput {
    title: string
    message: string
    type?: NotificationType
  }

  INotificationService {
    notify(input: CreateNotificationInput): Promise<void> | void
      -- High-level port used by callers (e.g., public API handlers).
      -- Implementations decide whether to fire-and-forget.
      -- Must never throw synchronously; errors must be caught internally.
  }

==========================================================================
SECTION 5 — INTERFACES TO BE BUILT IN FUTURE PHASES (use now, implement later)
==========================================================================

When Phase 2 code needs something from a future phase, declare the type
and add a TODO comment. Never fall back to the old inline approach.

IAnalyticsRepository (Phase 4 -- §4.3 of abstraction-report.md):
  recordRequest(seed: string, dayTimestamp: number): Promise<void>
  sumByMetric(metric: "requests" | "visitors", seed: string, sinceTimestamp: number): Promise<number>
  groupByMetric(seed: string, sinceTimestamp: number): Promise<Record<string, number>>
  Will be injected as c.get("analyticsRepository") via repositoryMiddleware.
  -- TODO Phase 4: inject IAnalyticsRepository via repositoryMiddleware

IWidgetRepository (Phase 5 -- §3.7 of abstraction-report.md):
  aggregate, growth, leaderboard, timeseries
  Will be injected as c.get("widgetRepository") via repositoryMiddleware.

IClock (Phase 4 -- §4.6 of abstraction-report.md):
  now(): number (milliseconds)
  nowSeconds(): number (seconds)
  Will replace Date.now() and Math.floor(Date.now() / 1000) in deterministic tests.
  -- TODO Phase 4: inject IClock and replace Date.now() calls

==========================================================================
SECTION 6 — THE GOLD STANDARD PATTERN (email module — replicate exactly)
==========================================================================

Every new abstraction must replicate the email module structure:

  feature-or-domain/
    index.ts           -- ONLY file imported from outside; exports public API only
    *.provider.ts      -- formal interface (the contract)
    *.service.ts       -- orchestrator + factory function
    *.types.ts         -- shared types; no framework imports
    providers/
      concrete.ts      -- ONE class per file; knows the external dependency

Rules:
1. One interface per contract. No abstract base classes.
2. Concrete implementations go in dedicated subfolders. One class per file.
3. One factory function at the module boundary.
4. Barrel index.ts exports only the public API. Never export internals.
5. Shared pure types live in *.types.ts.
6. Zero Hono/HTTP coupling inside concrete implementations.

Anti-patterns forbidden (observed in the current problem files):
  - Free functions that accept Hono Context and execute inline SQL
  - Extracting actor/user identity inside the logger (the caller must provide it)
  - INSERT or SELECT statements outside of a D1* repository class

==========================================================================
SECTION 7 — CODE QUALITY CONVENTIONS (non-negotiable)
==========================================================================

NAMING:
  Variables and functions: full descriptive English words, zero abbreviations.
    BAD:  usr, act, notif, cb, n, db, req, res
    GOOD: userRecord, activityEntry, notification, callback, hitCount, database

  Types, interfaces, classes: PascalCase, full words.
    BAD:  IActLog, NotifRepo, ActLogger
    GOOD: IActivityLogRepository, INotificationRepository, IActivityLogger

  Constants: SCREAMING_SNAKE_CASE, full words.
    BAD:  MAX_NOTIF, DEFAULT_LIM
    GOOD: MAXIMUM_NOTIFICATION_LIST_SIZE, DEFAULT_LIST_LIMIT

  File names: kebab-case, full words.
    BAD:  act-log.ts, notif-repo.ts
    GOOD: activity-log.repository.ts, notification.repository.ts

COMMENTS (English only):
  - Write a JSDoc comment on every exported interface method explaining WHY.
  - Add inline comments only where intent cannot be inferred from the code.
  - Never comment the obvious.

CODE STRUCTURE:
  - No nested if statements beyond 2 levels. Use early returns (guard clauses).
  - No chained ternary expressions.
  - No inline condition chains with 3+ && operators. Extract to named booleans.
  - Prefer async/await over .then() chains.
  - One responsibility per function. Split if exceeding ~20 lines.
  - Magic numbers must be named constants at the top of the file.

SQL in D1 repositories:
  - Never interpolate variables into SQL strings. Always use ? with .bind(...).
  - Map snake_case DB columns to camelCase TypeScript properties on every result.
  - Each method is a self-contained function with a single db.prepare(...) call
    (unless a batch/transaction is explicitly required).

==========================================================================
SECTION 8 — YOUR OPERATING RULES
==========================================================================

1. Work ONE step at a time. Never start step N+1 before the user confirms step N.

2. Before writing any file, state:
   - FILES TO CREATE: list with full paths
   - FILES TO MODIFY: list with full paths and a one-line description of the change
   - FILES TO DELETE: list (if applicable)

3. Follow the email module pattern (Section 6) for every new abstraction.

4. Never touch files not listed in the current step.

5. When a Phase 2 file needs a service from a future phase (Section 5),
   use the interface name and add a TODO comment. Do not fall back to inline SQL.

6. After writing each file, stop and ask: "Ready for the next file?"

==========================================================================
SECTION 9 — CURRENT TASK: PHASE 2 — OBSERVABILITY AND NOTIFICATIONS
==========================================================================

Execute the following steps in order.

--------------------------------------------------------------------------
PHASE 2 — STEP 1: IActivityLogger + D1ActivityLogger + InMemoryActivityLogger
--------------------------------------------------------------------------

Goal: replace the free function logActivity(c, params) with an interface-based
logger that has zero knowledge of Hono and can be injected in tests.

FILES TO CREATE:

  packages/core/src/observability/activity-logger.ts
    Defines ActivityAction, EntityType, ActivityLogEntry, IActivityLogger.
    JSDoc on log(): explain that the caller must extract actor data before calling,
    and that implementations are responsible for fire-and-forget and error swallowing.

  apps/api/src/shared/d1-activity-logger.ts
    D1ActivityLogger implements IActivityLogger.
    Constructor: (db: D1Database, scheduleBackgroundTask?: (task: Promise<unknown>) => void)
    The scheduleBackgroundTask parameter wraps c.executionCtx.waitUntil.
    When provided, the INSERT runs as a background task.
    When absent, the INSERT runs inline (useful for test environments).
    The INSERT must never throw to the caller; errors are caught and logged to console.error.
    SQL target table: activity_logs
    Columns: id, user_id, user_email, user_name, action, entity_type, entity_id, entity_slug, details
    id: crypto.randomUUID()
    details: JSON.stringify if present, null otherwise

  apps/api/src/shared/in-memory-activity-logger.ts
    InMemoryActivityLogger implements IActivityLogger.
    Stores entries in a public readonly entries: ActivityLogEntry[] array.
    Used in tests to assert side effects without touching D1.

FILES TO MODIFY:

  packages/core/src/index.ts
    Export IActivityLogger, ActivityLogEntry, ActivityAction, EntityType.

  apps/api/src/types.ts
    Add activityLogger: IActivityLogger to AppEnv Variables.

FILES TO DELETE (after migration in Step 2):
  apps/api/src/shared/activity-logger.ts  -- the old free function, deleted once callers are updated

--------------------------------------------------------------------------
PHASE 2 — STEP 2: Migrate callers from logActivity(c) to activityLogger.log()
--------------------------------------------------------------------------

Goal: remove all calls to the old logActivity free function and replace with
c.get("activityLogger").log({ ... }).

The actor object must be built from c.get("jwtPayload") in each calling handler
BEFORE passing it to the logger. The logger must never receive a Hono Context.

FILES TO MODIFY:

  apps/api/src/features/content/handlers/create.ts
    Replace logActivity(context, {...}) with:
      const jwtPayload = context.get("jwtPayload")
      context.get("activityLogger").log({
        action: "create",
        entityType: "content",
        entityId: id,
        entitySlug: slug,
        details: { title },
        actor: { id: jwtPayload.sub, email: jwtPayload.email ?? "unknown", name: jwtPayload.name ?? null }
      })

  apps/api/src/features/content/handlers/update.ts
    Same pattern as create.ts.

  apps/api/src/features/content/handlers/delete.ts
    Same pattern. action: "delete".

  apps/api/src/upload.ts
    Same pattern. action: "upload", entityType: "media".

  apps/api/src/middleware/auth-providers.middleware.ts  (or a new observability middleware)
    Add injection of activityLogger via c.set("activityLogger", new D1ActivityLogger(...)).
    Pass c.executionCtx.waitUntil.bind(c.executionCtx) as the scheduleBackgroundTask argument.
    This is the ONLY place where D1ActivityLogger is instantiated in production.

NOTE: if authProvidersMiddleware is not the right place for this injection,
create a new apps/api/src/middleware/observability.middleware.ts file instead.
The middleware name and location must reflect single responsibility.

--------------------------------------------------------------------------
PHASE 2 — STEP 3: IActivityLogRepository + D1ActivityLogRepository
--------------------------------------------------------------------------

Goal: give settings handler and stats handler a typed repository to read
from activity_logs, replacing their inline SELECT statements.

FILES TO CREATE:

  packages/core/src/observability/activity-log.repository.ts
    Defines ActivityLogRecord, ActivityLogListOptions, IActivityLogRepository.
    JSDoc on list(): explain it is used for the activity tab in settings
    and for the recent activity feed in stats.

  apps/api/src/shared/d1-activity-log.repository.ts
    D1ActivityLogRepository implements IActivityLogRepository.
    Constructor: (db: D1Database)
    list(options) builds a SELECT query with optional WHERE user_id = ? and WHERE entity_slug = ?
    clauses depending on which options fields are provided.
    Use guard clauses to build the WHERE conditions; do not nest ifs.
    Always ORDER BY created_at DESC LIMIT options.limit.
    Map snake_case columns to camelCase fields on the returned objects.
    details: parse JSON if not null, otherwise return null.

FILES TO MODIFY:

  packages/core/src/index.ts
    Export IActivityLogRepository, ActivityLogRecord, ActivityLogListOptions.

  apps/api/src/types.ts
    Add activityLogRepository: IActivityLogRepository to AppEnv Variables.

  apps/api/src/middleware/repository.middleware.ts
    Instantiate D1ActivityLogRepository and inject via c.set("activityLogRepository").

  apps/api/src/features/settings/settings.handler.ts
    Replace the inline SELECT on activity_logs with:
      const entries = await context.get("activityLogRepository").list({ userId: ..., limit: ... })

  apps/api/src/features/stats/stats.handler.ts
    Replace the inline SELECT on activity_logs with:
      const recentActivity = await context.get("activityLogRepository").list({ limit: 10 })

--------------------------------------------------------------------------
PHASE 2 — STEP 4: INotificationRepository + D1NotificationRepository
--------------------------------------------------------------------------

Goal: give notifications.handler.ts a typed repository, replacing all 5
inline SQL statements with method calls.

FILES TO CREATE:

  packages/core/src/notifications/notification.repository.ts
    Defines NotificationType, NotificationRecord, NotificationStats, INotificationRepository.
    JSDoc on stats(): explain it is used to generate the ETag for the GET /notifications
    response, enabling the client to skip parsing when nothing changed.
    JSDoc on list(): explain the limit parameter prevents unbounded reads.
    JSDoc on create(): explain it returns the generated id so callers can reference the record.

  apps/api/src/shared/d1-notification.repository.ts
    D1NotificationRepository implements INotificationRepository.
    Constructor: (db: D1Database)
    list(limit): SELECT id, title, message, type, isread, createdat FROM notifications
                 ORDER BY createdat DESC LIMIT ?
    stats(): SELECT COUNT(*) as total_count, MAX(createdat) as latest_created_at,
                    SUM(isread) as read_count FROM notifications
             Map the result to NotificationStats with camelCase field names.
    create(record): INSERT INTO notifications (id, title, message, type)
                    VALUES (?, ?, ?, ?)
                    id = crypto.randomUUID()
                    Returns the generated id.
    markRead(id): UPDATE notifications SET isread = 1 WHERE id = ?
    markUnread(id): UPDATE notifications SET isread = 0 WHERE id = ?
    markAllRead(): UPDATE notifications SET isread = 1
    delete(id): DELETE FROM notifications WHERE id = ?
    All methods use .bind(...) with ? placeholders. No string interpolation.
    Map isread (0/1 integer) to isRead (boolean) on read.

FILES TO MODIFY:

  packages/core/src/index.ts
    Export INotificationRepository, NotificationRecord, NotificationType, NotificationStats.

  apps/api/src/types.ts
    Add notificationRepository: INotificationRepository to AppEnv Variables.

  apps/api/src/middleware/repository.middleware.ts
    Instantiate D1NotificationRepository and inject via c.set("notificationRepository").

  apps/api/src/features/notifications/notifications.handler.ts
    Rewrite all 5 route handlers to use context.get("notificationRepository").
    The ETag logic in GET /notifications must be preserved exactly:
      const notificationStats = await context.get("notificationRepository").stats()
      const etagValue = `W/"${notificationStats.totalCount}-${notificationStats.latestCreatedAt}-${notificationStats.readCount}"`
    The handler must never contain db.prepare or c.env.DB.
    The handler must use guard clauses for early returns (e.g., 304 Not Modified).

--------------------------------------------------------------------------
PHASE 2 — STEP 5: INotificationService + BackgroundNotificationService
--------------------------------------------------------------------------

Goal: replace the free function createNotification(c, params) with an interface
that can be injected and tested, following the email module pattern.

FILES TO CREATE:

  packages/core/src/notifications/notification-service.ts
    Defines CreateNotificationInput, INotificationService.
    JSDoc on notify(): explain this is the high-level port for callers that want
    to create a notification without knowing about the repository or D1.
    Implementations decide whether to fire-and-forget.

  apps/api/src/shared/background-notification-service.ts
    BackgroundNotificationService implements INotificationService.
    Constructor: (
      notificationRepository: INotificationRepository,
      scheduleBackgroundTask?: (task: Promise<unknown>) => void
    )
    notify(input): calls notificationRepository.create(input).
    When scheduleBackgroundTask is provided, runs as a background task.
    Errors must be caught internally and logged to console.error.
    Default type when not provided: "info".

  apps/api/src/shared/in-memory-notification-service.ts
    InMemoryNotificationService implements INotificationService.
    Stores calls in a public readonly receivedNotifications: CreateNotificationInput[] array.
    Used in tests to assert side effects.

FILES TO MODIFY:

  packages/core/src/index.ts
    Export INotificationService, CreateNotificationInput.

  apps/api/src/types.ts
    Add notificationService: INotificationService to AppEnv Variables.

  apps/api/src/middleware/observability.middleware.ts  (or auth-providers.middleware.ts)
    Instantiate BackgroundNotificationService using the already-injected notificationRepository
    and c.executionCtx.waitUntil.bind(c.executionCtx).
    Inject via c.set("notificationService").
    NOTE: notificationRepository must already be set in context before this middleware runs.
    Ensure middleware registration order in factory.ts reflects this dependency.

  apps/api/src/public/public-add.ts
    Replace createNotification(c, {...}) with:
      context.get("notificationService").notify({ title: ..., message: ..., type: "info" })

FILES TO DELETE (after migration):
  apps/api/src/shared/notification-service.ts  -- the old free function

--------------------------------------------------------------------------
PHASE 2 — STEP 6: observabilityMiddleware (consolidation)
--------------------------------------------------------------------------

Goal: if Steps 2 and 5 created injection logic spread across multiple middlewares,
consolidate all observability-related injections into a single middleware.

This step is a cleanup step. Execute it only after Steps 1-5 are complete
and the user has confirmed each one.

FILES TO CREATE (if not already created in Steps 2 or 5):

  apps/api/src/middleware/observability.middleware.ts
    Exports observabilityMiddleware(overrides?: ObservabilityOverrides).
    ObservabilityOverrides: {
      activityLogger?: IActivityLogger
      notificationService?: INotificationService
    }
    When no overrides, instantiates:
      D1ActivityLogger(c.env.DB, c.executionCtx.waitUntil.bind(c.executionCtx))
      BackgroundNotificationService(c.get("notificationRepository"), c.executionCtx.waitUntil.bind(...))
    Injects via c.set("activityLogger") and c.set("notificationService").
    IMPORTANT: must run after repositoryMiddleware so that notificationRepository is available.

FILES TO MODIFY:

  apps/api/src/factory.ts
    Ensure middleware registration order:
      1. repositoryMiddleware      (injects all repositories including notificationRepository)
      2. storageMiddleware         (injects bucket)
      3. authProvidersMiddleware   (injects hashProvider, tokenService)
      4. rateLimiterMiddleware     (injects rateLimiters)
      5. observabilityMiddleware   (injects activityLogger, notificationService — depends on notificationRepository)
    Remove any activityLogger or notificationService injection that was added
    temporarily in earlier steps to other middlewares.

==========================================================================
SECTION 10 — PHASE 2 COMPLETION CHECKLIST
==========================================================================

Before marking Phase 2 complete, verify every produced file against these rules:

  [x] No abbreviations in variable, function, parameter or type names
  [x] Every exported interface method has a JSDoc explaining WHY (not the obvious what)
  [x] Inline comments only where code alone is insufficient, always in English
  [x] No if nesting beyond 2 levels — guard clauses used instead
  [x] No condition chains with 3+ inline && operators — extracted to named booleans
  [x] No chained ternary expressions
  [x] All magic numbers are named constants at the top of the file
  [x] Each file has a single responsibility
  [x] D1Database accessed only in D1* repository and D1* logger files
  [x] Hono Context never passed into IActivityLogger.log() or INotificationService.notify()
  [x] The actor object in activity log entries is always built by the caller (the handler)
  [x] INotificationService is injected AFTER INotificationRepository in middleware order
  [x] The old activity-logger.ts and notification-service.ts free functions are deleted
  [x] notifications.handler.ts contains zero db.prepare() or c.env.DB references
  [x] settings.handler.ts and stats.handler.ts contain zero inline SELECT on activity_logs
  [x] Future-phase interfaces (IClock, IAnalyticsRepository) are referenced via TODO comments

==========================================================================
SECTION 11 — PHASE 2 COMPLETION REPORT (2026-05-07)
==========================================================================

Status: COMPLETE. 329 tests pass (302 pre-existing + 27 new).

Steps executed:
  Step 1 — IActivityLogger + D1ActivityLogger + InMemoryActivityLogger ✓
  Step 2 — Caller migration (create/update/delete/upload + draft + public-edit) ✓
  Step 3 — IActivityLogRepository + D1ActivityLogRepository ✓
  Step 4 — INotificationRepository + D1NotificationRepository ✓
  Step 5 — INotificationService + BackgroundNotificationService ✓
  Step 6 — observabilityMiddleware consolidation ✓

Files created (core):
  packages/core/src/observability/activity-logger.ts
  packages/core/src/observability/activity-log.repository.ts
  packages/core/src/notifications/notification.repository.ts
  packages/core/src/notifications/notification-service.ts

Files created (api):
  apps/api/src/shared/d1-activity-logger.ts
  apps/api/src/shared/in-memory-activity-logger.ts
  apps/api/src/shared/d1-activity-log.repository.ts
  apps/api/src/shared/d1-notification.repository.ts
  apps/api/src/shared/background-notification-service.ts
  apps/api/src/shared/in-memory-notification-service.ts
  apps/api/src/middleware/observability.middleware.ts
  apps/api/src/shared/d1-activity-logger.test.ts
  apps/api/src/shared/d1-activity-log.repository.test.ts
  apps/api/src/shared/d1-notification.repository.test.ts
  apps/api/src/shared/background-notification-service.test.ts
  docs/observability-and-notifications.md

Files deleted:
  apps/api/src/shared/activity-logger.ts (legacy free function)
  apps/api/src/shared/notification-service.ts (legacy free function)

Files modified:
  packages/core/src/index.ts                                         -- barrel exports
  apps/api/src/types.ts                                              -- AppEnv.Variables + jwtPayload.name
  apps/api/src/middleware/repository.middleware.ts                   -- inject activityLog/notification repositories
  apps/api/src/factory.ts                                            -- register observabilityMiddleware
  apps/api/src/features/content/handlers/{create,update,delete}.ts   -- migrated to activityLogger.log
  apps/api/src/features/draft/draft.handler.ts                       -- migrated (saveDraft + publishDraft)
  apps/api/src/upload.ts                                             -- migrated to activityLogger.log
  apps/api/src/public/public-add.ts                                  -- migrated to notificationService.notify
  apps/api/src/public/public-edit.ts                                 -- migrated to notificationService.notify
  apps/api/src/features/notifications/notifications.handler.ts      -- full rewrite, zero SQL
  apps/api/src/features/settings/settings.handler.ts                 -- activity tab via repository
  apps/api/src/features/stats/stats.handler.ts                       -- recent-activity + total via repository
  CLAUDE.md                                                          -- doc link

Extras beyond spec (gap-closure to satisfy checklist row 15):
  IActivityLogRepository.countSince({ action, entityType, sinceTimestamp }): Promise<number>
    Reason: /stats/total widget needed today/week/month create-event counts
    on activity_logs. Plan only specified list(); without countSince the
    handler would have retained inline SELECT, violating the checklist.
    Method documented with WHY-focused JSDoc; 2 dedicated test cases added.

Middleware order in factory.ts (verified):
  1. repositoryMiddleware
  2. storageMiddleware
  3. authProvidersMiddleware
  4. rateLimiterMiddleware
  5. observabilityMiddleware  (depends on notificationRepository from #1)

Begin with Step 1. List the files you will create and modify, then proceed file by file.
After each file, stop and ask: "Ready for the next file?"
