You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

Do NOT explore the codebase further. All relevant context is provided in this prompt.
Read it fully before writing any code.

Phases 1, 2, and 3 are complete. This prompt covers Phase 4 only.

### Stack

- API: Hono on Cloudflare Workers, D1 (SQLite), R2, Cloudflare RateLimit bindings
- Dashboard: React + TanStack Query + axios, in-memory token store
- Shared package: @beechcms/core (pure TypeScript, zero HTTP/cloud dependencies)
- Monorepo: Turborepo

==========================================================================
SECTION 1 — WHAT PHASES 1–3 DELIVERED (already in production, do not rewrite)
==========================================================================

PHASE 1 DELIVERABLES:

packages/core/src/auth/hash-provider.ts
  IHashProvider { hash, verify }

packages/core/src/auth/token-service.ts
  JwtClaims, IssueTokenOptions, ITokenService { issue, verify }

packages/core/src/auth/user.repository.ts
  UserRecord, IUserRepository (injected as c.get("userRepository"))

packages/core/src/auth/session.repository.ts
  RefreshTokenRecord, ISessionRepository (injected as c.get("sessionRepository"))

packages/core/src/auth/password-reset-token.repository.ts
  IPasswordResetTokenRepository (injected as c.get("passwordResetTokenRepository"))

packages/core/src/rate-limit/rate-limiter.ts
  RateLimitResult, IRateLimiter, IRateLimiterRegistry
  RateLimiterName: "login"|"tokenRefresh"|"forgotPassword"|"resetPassword"|"publicApiRead"|"publicApiWrite"
  Injected as c.get("rateLimiters")

Concrete implementations:
  apps/api/src/auth/bcrypt-hash-provider.ts
  apps/api/src/auth/in-memory-hash-provider.ts
  apps/api/src/auth/jose-token-service.ts
  apps/api/src/auth/static-token-service.ts
  apps/api/src/rate-limit/cloudflare-rate-limiter.ts
  apps/api/src/rate-limit/no-op-rate-limiter.ts
  apps/api/src/rate-limit/in-memory-rate-limiter.ts
  apps/api/src/middleware/auth-providers.middleware.ts
  apps/api/src/middleware/rate-limit.middleware.ts
  apps/api/src/shared/d1-user.repository.ts
  apps/api/src/shared/d1-session.repository.ts
  apps/api/src/shared/d1-password-reset-token.repository.ts

PHASE 2 DELIVERABLES:

packages/core/src/observability/activity-logger.ts
  ActivityAction, EntityType, ActivityLogEntry, IActivityLogger
  Injected as c.get("activityLogger")

packages/core/src/observability/activity-log.repository.ts
  ActivityLogRecord, ActivityLogListOptions, IActivityLogRepository
  Injected as c.get("activityLogRepository")

packages/core/src/notifications/notification.repository.ts
  NotificationType, NotificationRecord, NotificationStats, INotificationRepository
  Injected as c.get("notificationRepository")

packages/core/src/notifications/notification-service.ts
  CreateNotificationInput, INotificationService
  Injected as c.get("notificationService")

Concrete implementations:
  apps/api/src/shared/d1-activity-logger.ts
  apps/api/src/shared/in-memory-activity-logger.ts
  apps/api/src/shared/d1-activity-log.repository.ts
  apps/api/src/shared/d1-notification.repository.ts
  apps/api/src/shared/background-notification-service.ts
  apps/api/src/shared/in-memory-notification-service.ts
  apps/api/src/middleware/observability.middleware.ts

PHASE 3 DELIVERABLES:

packages/core/src/widget/widget.repository.ts
  AggregateFormula, TimeWindow, LeaderboardEntry, LeaderboardOptions,
  TimeseriesPoint, WidgetListOptions, WidgetListResult, GrowthResult, IWidgetRepository
  Injected as c.get("widgetRepository")

packages/core/src/search/search.repository.ts
  SearchQueryOptions, SearchResultRow, SearchCountResult, ISearchRepository
  Injected as c.get("searchRepository")

packages/core/src/observability/analytics.repository.ts
  AnalyticsMetric, IAnalyticsRepository
  Injected as c.get("analyticsRepository")

Concrete implementations:
  apps/api/src/shared/d1-widget.repository.ts
  apps/api/src/shared/d1-search.repository.ts
  apps/api/src/shared/d1-analytics.repository.ts

Migration results:
  apps/api/src/widget.ts        — zero c.env.DB references
  apps/api/src/search.ts        — zero c.env.DB references
  apps/api/src/factory.ts       — analytics recording block uses analyticsRepository
  apps/api/src/features/stats/stats.handler.ts
                                — analytics reads use analyticsRepository

Phase 3 TODO comments now embedded in the codebase:
  D1AnalyticsRepository.recordRequest()      — TODO Phase 4: replace Date.now() with IClock
  D1SessionRepository (date comparisons)     — TODO Phase 4: replace Date.now() with IClock
  D1ActivityLogger (uuid)                    — TODO Phase 4: replace with IIdGenerator
  D1NotificationRepository (uuid)            — TODO Phase 4: replace with IIdGenerator
  D1PasswordResetTokenRepository (uuid)      — TODO Phase 4: replace with IIdGenerator
  apps/api/src/factory.ts analytics block    — TODO Phase 4: replace Date.now() with IClock
  apps/api/src/features/stats/stats.handler.ts — TODO Phase 4: replace Date.now() with IClock

Middleware registration order (already in place):
  1. repositoryMiddleware   (ContentRepository, MediaRepository, IdempotencyRepository,
                             SystemStatsRepository, IUserRepository, ISessionRepository,
                             IPasswordResetTokenRepository, IActivityLogRepository,
                             INotificationRepository, IWidgetRepository,
                             ISearchRepository, IAnalyticsRepository)
  2. storageMiddleware      (BeechBucket)
  3. authProvidersMiddleware (IHashProvider, ITokenService)
  4. rateLimiterMiddleware  (IRateLimiterRegistry)
  5. observabilityMiddleware (IActivityLogger, INotificationService)

==========================================================================
SECTION 2 — INTERFACES ALREADY IN PRODUCTION (pre-Phase 1)
==========================================================================

ContentRepository        — injected as c.get("repository")
MediaRepository          — injected as c.get("mediaRepository")
IdempotencyRepository    — injected as c.get("idempotencyRepository")
SystemStatsRepository    — injected via repositoryMiddleware
BeechBucket              — injected as c.get("bucket")
EmailProvider            — consumed internally by email.service.ts ONLY
sha256hex                — import directly from @beechcms/core

==========================================================================
SECTION 3 — CURRENT STATE OF PHASE 4 TARGETS
==========================================================================

3.1 Date.now() / Math.floor(Date.now() / 1000) USAGE SITES

All these sites carry "// TODO Phase 4: replace with IClock" comments.

apps/api/src/shared/d1-analytics.repository.ts
  recordRequest():
    const dayTimestamp = Math.floor(Date.now() / 1000 / 86400) * 86400
  (NOTE: this is the internal day-bucket computation for the upsert.
   The sinceTimestamp parameter is already provided by callers — no change there.)

apps/api/src/factory.ts  — analytics middleware block
  const currentDayTimestamp = Math.floor(Date.now() / 1000 / 86400) * 86400

apps/api/src/features/stats/stats.handler.ts — GET /stats/total
  const now = Math.floor(Date.now() / 1000)
  const twentyFourHoursAgo = now - 24 * 60 * 60
  const sevenDaysAgo        = now - 7 * 24 * 60 * 60
  const thirtyDaysAgo       = now - 30 * 24 * 60 * 60

apps/api/src/features/stats/stats.handler.ts — GET /stats/health
  const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000)

apps/api/src/features/stats/stats.handler.ts — GET /stats/cloudflare
  const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000)

apps/api/src/shared/d1-session.repository.ts
  findActiveByHash(hash, now): uses caller-supplied `now` — no change needed
  revokeByHash(hash, now):     uses caller-supplied `now` — no change needed
  saveRefreshToken():
    createdAt: Math.floor(Date.now() / 1000)
  (The now parameter is supplied by callers for queries; createdAt on insert uses Date.now().)

apps/api/src/auth/jose-token-service.ts
  issue():
    .setIssuedAt()      — jose uses Date.now() internally; this call has no argument
    .setExpirationTime(`${ttl}s`)
  (jose's setIssuedAt() is a no-arg call — pass the clock's nowSeconds() instead
   to allow deterministic tests: .setIssuedAt(clock.nowSeconds()))

3.2 crypto.randomUUID() USAGE SITES

All these sites carry "// TODO Phase 4: replace with IIdGenerator" comments.

apps/api/src/shared/d1-activity-logger.ts
  log():    crypto.randomUUID()  — used as the activity log entry id

apps/api/src/shared/d1-notification.repository.ts
  create(): crypto.randomUUID()  — used as the notification record id

apps/api/src/shared/d1-password-reset-token.repository.ts
  create(): crypto.randomUUID()  — used as the token record id

==========================================================================
SECTION 4 — INTERFACES TO BUILD IN PHASE 4
==========================================================================

IClock (packages/core/src/clock.ts):

  export interface IClock {
    /**
     * Returns the current Unix timestamp in milliseconds.
     * Equivalent to Date.now() in production.
     * Overridable in tests for deterministic time-sensitive assertions.
     */
    now(): number

    /**
     * Returns the current Unix timestamp in whole seconds.
     * Equivalent to Math.floor(Date.now() / 1000) in production.
     * Used by JWT issuance, session expiry, and analytics day-bucket computations.
     */
    nowSeconds(): number
  }

  Concrete implementations to create:

  packages/core/src/clock.ts  (same file as the interface):
    export const SystemClock: IClock = {
      now: () => Date.now(),
      nowSeconds: () => Math.floor(Date.now() / 1000),
    }

  apps/api/src/shared/fixed-clock.ts  (test only):
    export class FixedClock implements IClock {
      constructor(private readonly fixedNowMs: number) {}
      now(): number { return this.fixedNowMs }
      nowSeconds(): number { return Math.floor(this.fixedNowMs / 1000) }
    }

IIdGenerator (packages/core/src/id-generator.ts):

  export interface IIdGenerator {
    /**
     * Generates a new universally unique identifier.
     * Production implementation delegates to crypto.randomUUID().
     * Test implementations return deterministic values for snapshot assertions.
     */
    uuid(): string
  }

  Concrete implementations to create:

  packages/core/src/id-generator.ts  (same file as the interface):
    export const SystemIdGenerator: IIdGenerator = {
      uuid: () => crypto.randomUUID(),
    }

  apps/api/src/shared/sequential-id-generator.ts  (test only):
    export class SequentialIdGenerator implements IIdGenerator {
      private counter = 0
      uuid(): string {
        this.counter++
        return `test-id-${String(this.counter).padStart(4, "0")}`
      }
      reset(): void { this.counter = 0 }
    }

==========================================================================
SECTION 5 — INJECTION STRATEGY
==========================================================================

Both IClock and IIdGenerator are lightweight cross-cutting utilities.
They are NOT injected via a dedicated middleware — they are constructor
arguments of the concrete D1* classes and JoseTokenService.

Pattern:

  class D1ActivityLogger implements IActivityLogger {
    constructor(
      private readonly db: D1Database,
      private readonly clock: IClock,
      private readonly idGenerator: IIdGenerator,
      private readonly waitUntil?: (p: Promise<unknown>) => void,
    ) {}
  }

The middleware that instantiates each class (repositoryMiddleware,
authProvidersMiddleware, observabilityMiddleware) passes SystemClock
and SystemIdGenerator by default, and accepts override objects for testing.

Override shape convention (same pattern used for all previous middlewares):

  repositoryMiddleware(overrides?: {
    repository?: ContentRepository
    ...
    clock?: IClock
    idGenerator?: IIdGenerator
  })

  authProvidersMiddleware(overrides?: {
    hashProvider?: IHashProvider
    tokenService?: ITokenService
    clock?: IClock
  })

  observabilityMiddleware(overrides?: {
    activityLogger?: IActivityLogger
    notificationService?: INotificationService
    clock?: IClock
    idGenerator?: IIdGenerator
  })

The clock and idGenerator overrides propagate to all D1* classes that
need them. There is no need to add IClock or IIdGenerator to AppEnv
Variables — they are constructor-injected, not context-injected.

==========================================================================
SECTION 6 — GOLD STANDARD PATTERN (same rules as phases 1–3)
==========================================================================

Rules (unchanged):
1. One interface per contract. No abstract base classes.
2. Concrete implementations in dedicated files under apps/api/src/shared/.
3. Zero Hono/HTTP coupling inside concrete classes.
4. IClock and IIdGenerator are constructor arguments, not context variables.
5. Production code uses SystemClock and SystemIdGenerator.
6. Test code uses FixedClock and SequentialIdGenerator.
7. Do NOT add clock or idGenerator to c.var (AppEnv Variables).

==========================================================================
SECTION 7 — CODE QUALITY CONVENTIONS (non-negotiable)
==========================================================================

NAMING:
  Full descriptive English words. Zero abbreviations.
    BAD:  fixedMs, nowMs, seqGen, idGen, clk
    GOOD: fixedNowMs, millisecondsTimestamp, sequentialGenerator

  Constants: SCREAMING_SNAKE_CASE.
  Files: kebab-case, full words.

COMMENTS (English only):
  JSDoc on every exported interface method explaining WHY.
  Inline comments only where intent cannot be inferred from the code alone.

CODE STRUCTURE:
  - No nested ifs beyond 2 levels. Guard clauses.
  - No chained ternary expressions.
  - No 3+ inline && chains. Extract to named booleans.
  - One responsibility per function. Split at ~20 lines.
  - Magic numbers are named constants at the top of the file.

==========================================================================
SECTION 8 — YOUR OPERATING RULES
==========================================================================

1. Work ONE step at a time. Never start step N+1 before the user confirms step N.

2. Before writing any file, state:
   - FILES TO CREATE: list with full paths
   - FILES TO MODIFY: list with full paths and one-line change description
   - FILES TO DELETE: none expected in Phase 4

3. After writing each file, stop and ask: "Ready for the next file?"

4. Never touch files not listed in the current step.

==========================================================================
SECTION 9 — CURRENT TASK: PHASE 4 — IClock AND IIdGenerator
==========================================================================

Execute the following steps in order.

--------------------------------------------------------------------------
PHASE 4 — STEP 1: IClock interface and SystemClock in packages/core
--------------------------------------------------------------------------

FILES TO CREATE:
  packages/core/src/clock.ts
    Define IClock interface with two methods: now() and nowSeconds().
    JSDoc on both methods as specified in Section 4.
    Define SystemClock as the production singleton.
    Export both from this file.

FILES TO MODIFY:
  packages/core/src/index.ts
    Export IClock and SystemClock.

--------------------------------------------------------------------------
PHASE 4 — STEP 2: IIdGenerator interface and SystemIdGenerator in packages/core
--------------------------------------------------------------------------

FILES TO CREATE:
  packages/core/src/id-generator.ts
    Define IIdGenerator interface with one method: uuid().
    JSDoc as specified in Section 4.
    Define SystemIdGenerator as the production singleton.
    Export both from this file.

FILES TO MODIFY:
  packages/core/src/index.ts
    Export IIdGenerator and SystemIdGenerator.

--------------------------------------------------------------------------
PHASE 4 — STEP 3: FixedClock and SequentialIdGenerator (test implementations)
--------------------------------------------------------------------------

FILES TO CREATE:
  apps/api/src/shared/fixed-clock.ts
    FixedClock implements IClock.
    Constructor accepts fixedNowMs: number.
    now() returns fixedNowMs.
    nowSeconds() returns Math.floor(fixedNowMs / 1000).
    JSDoc: explains this class is for tests only, enabling deterministic
    time assertions without vi.useFakeTimers or global Date patching.

  apps/api/src/shared/sequential-id-generator.ts
    SequentialIdGenerator implements IIdGenerator.
    Private counter starts at 0.
    uuid() increments counter, returns "test-id-{counter padded to 4 digits}".
    reset() sets counter back to 0.
    JSDoc: explains this class is for tests only, producing stable IDs
    for snapshot assertions and deterministic order verification.

--------------------------------------------------------------------------
PHASE 4 — STEP 4: Update D1ActivityLogger to accept IClock and IIdGenerator
--------------------------------------------------------------------------

FILE TO MODIFY:
  apps/api/src/shared/d1-activity-logger.ts

Changes:
  1. Add clock: IClock and idGenerator: IIdGenerator as constructor parameters
     (after db, before the optional waitUntil).
  2. In log(): replace crypto.randomUUID() with this.idGenerator.uuid().
  3. Remove the TODO Phase 4 comment for uuid.
  4. No other changes.

Constructor signature after this step:
  constructor(
    private readonly db: D1Database,
    private readonly clock: IClock,
    private readonly idGenerator: IIdGenerator,
    private readonly waitUntil?: (p: Promise<unknown>) => void,
  )

Note: D1ActivityLogger does not currently use Date.now() directly —
the createdAt column in activitylogs uses DEFAULT unixepoch in the schema.
So only IIdGenerator is needed here; IClock is accepted in the constructor
for future use (and symmetry with D1NotificationRepository).

--------------------------------------------------------------------------
PHASE 4 — STEP 5: Update D1NotificationRepository to accept IClock and IIdGenerator
--------------------------------------------------------------------------

FILE TO MODIFY:
  apps/api/src/shared/d1-notification.repository.ts

Changes:
  1. Add clock: IClock and idGenerator: IIdGenerator as constructor parameters.
  2. In create(): replace crypto.randomUUID() with this.idGenerator.uuid().
  3. Remove the TODO Phase 4 comment for uuid.
  4. No other changes. (createdAt also uses DEFAULT unixepoch in schema.)

Constructor signature after this step:
  constructor(
    private readonly db: D1Database,
    private readonly clock: IClock,
    private readonly idGenerator: IIdGenerator,
  )

--------------------------------------------------------------------------
PHASE 4 — STEP 6: Update D1PasswordResetTokenRepository to accept IIdGenerator
--------------------------------------------------------------------------

FILE TO MODIFY:
  apps/api/src/shared/d1-password-reset-token.repository.ts

Changes:
  1. Add idGenerator: IIdGenerator as a constructor parameter.
  2. In create(): replace crypto.randomUUID() with this.idGenerator.uuid().
  3. Remove the TODO Phase 4 comment for uuid.
  4. No other changes.

Constructor signature after this step:
  constructor(
    private readonly db: D1Database,
    private readonly idGenerator: IIdGenerator,
  )

Note: D1PasswordResetTokenRepository receives `now` as a method argument
from callers. It does not call Date.now() internally. IClock is NOT needed
in its constructor.

--------------------------------------------------------------------------
PHASE 4 — STEP 7: Update D1SessionRepository to accept IClock
--------------------------------------------------------------------------

FILE TO MODIFY:
  apps/api/src/shared/d1-session.repository.ts

Changes:
  1. Add clock: IClock as a constructor parameter.
  2. In saveRefreshToken():
     Replace: createdAt: Math.floor(Date.now() / 1000)
     With:    createdAt: this.clock.nowSeconds()
  3. Remove the TODO Phase 4 comment for Date.now() in saveRefreshToken.
  4. No other changes. (findActiveByHash, revokeByHash, etc. use caller-supplied `now`.)

Constructor signature after this step:
  constructor(
    private readonly db: D1Database,
    private readonly clock: IClock,
  )

--------------------------------------------------------------------------
PHASE 4 — STEP 8: Update D1AnalyticsRepository to accept IClock
--------------------------------------------------------------------------

FILE TO MODIFY:
  apps/api/src/shared/d1-analytics.repository.ts

Changes:
  1. Add clock: IClock as a constructor parameter.
  2. In recordRequest():
     Replace: Math.floor(Date.now() / 1000 / 86400) * 86400
     With:    the equivalent using this.clock.nowSeconds()
     i.e.:    Math.floor(this.clock.nowSeconds() / SECONDS_PER_DAY) * SECONDS_PER_DAY
     where:   const SECONDS_PER_DAY = 86400 (named constant at top of file)
  3. Remove the TODO Phase 4 comment.
  4. No other changes.

Constructor signature after this step:
  constructor(
    private readonly db: D1Database,
    private readonly clock: IClock,
  )

--------------------------------------------------------------------------
PHASE 4 — STEP 9: Update JoseTokenService to accept IClock
--------------------------------------------------------------------------

FILE TO MODIFY:
  apps/api/src/auth/jose-token-service.ts

Changes:
  1. Add clock: IClock as a constructor parameter (after config).
  2. In issue():
     Replace: .setIssuedAt()
     With:    .setIssuedAt(this.clock.nowSeconds())
     This makes the issued-at claim deterministic in tests.
  3. Remove the TODO Phase 4 comment (if present; it may have been implicit).
  4. No other changes. (.setExpirationTime(`${ttl}s`) is relative to issuedAt — leave as-is.)

Constructor signature after this step:
  constructor(
    secret: string,
    private readonly config: JoseTokenServiceConfig,
    private readonly clock: IClock,
  )

--------------------------------------------------------------------------
PHASE 4 — STEP 10: Update repositoryMiddleware to pass clock and idGenerator
--------------------------------------------------------------------------

FILE TO MODIFY:
  apps/api/src/middleware/repository.middleware.ts

Changes:
  1. Add clock?: IClock and idGenerator?: IIdGenerator to RepositoryOverrides.
  2. Import SystemClock from @beechcms/core and SystemIdGenerator from @beechcms/core.
  3. Resolve: const resolvedClock = overrides?.clock ?? SystemClock
              const resolvedIdGenerator = overrides?.idGenerator ?? SystemIdGenerator
  4. Pass resolvedClock to:
       D1SessionRepository(db, resolvedClock)
       D1AnalyticsRepository(db, resolvedClock)
  5. Pass resolvedIdGenerator to:
       D1PasswordResetTokenRepository(db, resolvedIdGenerator)
  6. Pass both to:
       D1ActivityLogger(db, resolvedClock, resolvedIdGenerator, waitUntil?)
       D1NotificationRepository(db, resolvedClock, resolvedIdGenerator)
  7. No other changes.

Note: D1UserRepository, D1ContentRepository, D1MediaRepository,
D1SystemStatsRepository, D1IdempotencyRepository, D1SearchRepository,
D1WidgetRepository, D1ActivityLogRepository do NOT need clock or
idGenerator — they either use caller-supplied timestamps or no UUIDs.

--------------------------------------------------------------------------
PHASE 4 — STEP 11: Update authProvidersMiddleware to pass clock to JoseTokenService
--------------------------------------------------------------------------

FILE TO MODIFY:
  apps/api/src/middleware/auth-providers.middleware.ts

Changes:
  1. Add clock?: IClock to the overrides object.
  2. Import SystemClock from @beechcms/core.
  3. Resolve: const resolvedClock = overrides?.clock ?? SystemClock
  4. Pass resolvedClock as the third constructor argument to JoseTokenService:
       new JoseTokenService(secret, config, resolvedClock)
  5. No other changes.

--------------------------------------------------------------------------
PHASE 4 — STEP 12: Update observabilityMiddleware to pass clock and idGenerator
--------------------------------------------------------------------------

FILE TO MODIFY:
  apps/api/src/middleware/observability.middleware.ts

Changes:
  1. Add clock?: IClock and idGenerator?: IIdGenerator to the overrides.
  2. Import SystemClock and SystemIdGenerator from @beechcms/core.
  3. Resolve both with ?? SystemClock and ?? SystemIdGenerator.
  4. When constructing D1ActivityLogger (if this middleware creates it directly):
       new D1ActivityLogger(db, resolvedClock, resolvedIdGenerator, waitUntil)
     If observabilityMiddleware reads the already-injected activityLogger from context
     (i.e., it was instantiated by repositoryMiddleware), no change needed here —
     just add the overrides for future use.
  5. Same for BackgroundNotificationService or any other class constructed here
     that uses D1NotificationRepository internally.

IMPORTANT NOTE for Step 12:
  Check what observabilityMiddleware currently constructs. If it creates
  D1ActivityLogger and BackgroundNotificationService itself (separate from
  repositoryMiddleware), update those constructors here. If it reads
  notificationRepository from context (already set by repositoryMiddleware),
  BackgroundNotificationService wraps it — clock/idGenerator are not needed
  in BackgroundNotificationService itself.

--------------------------------------------------------------------------
PHASE 4 — STEP 13: Resolve remaining Date.now() calls in factory.ts and stats.handler.ts
--------------------------------------------------------------------------

APPROACH: These files use Date.now() directly inside route handlers and middleware.
Since IClock is NOT injected into c.var (Section 5), the cleanest approach is
a module-level import of SystemClock, used wherever the TODO Phase 4 comment sits.
This makes the production code use SystemClock.nowSeconds() while remaining testable
by passing a FixedClock to the D1* constructors (which is the correct test surface).

FILES TO MODIFY:

  apps/api/src/factory.ts
    In the analytics middleware block:
      Replace: Math.floor(Date.now() / 1000 / 86400) * 86400
      With:    the analyticsRepository.recordRequest() call already delegates
               to D1AnalyticsRepository, which now uses this.clock internally.
               Therefore, remove the currentDayTimestamp computation entirely
               from factory.ts — it is now encapsulated in the repository.
      The call becomes simply:
        context.executionCtx.waitUntil(
          context.get("analyticsRepository").recordRequest(seedSlug)
        )
      Update the IAnalyticsRepository.recordRequest signature accordingly:
        recordRequest(seedSlug: string): Promise<void>
        (remove the dayTimestamp parameter — the repository computes it internally)

  IMPORTANT: This means the IAnalyticsRepository interface in
    packages/core/src/observability/analytics.repository.ts
  must also be updated to remove the dayTimestamp parameter from recordRequest.
  The D1AnalyticsRepository implementation computes the day bucket internally
  using this.clock.

  apps/api/src/features/stats/stats.handler.ts
    For all Date.now() usages, add at the top of the file:
      import { SystemClock } from "@beechcms/core"
    Then replace each call:
      Date.now()                       → SystemClock.now()
      Math.floor(Date.now() / 1000)    → SystemClock.nowSeconds()
      Math.floor((Date.now() - X) / 1000) → SystemClock.nowSeconds() - X_IN_SECONDS

    Compute named constants for the time offsets:
      const SECONDS_PER_MINUTE  = 60
      const SECONDS_PER_HOUR    = 60 * SECONDS_PER_MINUTE
      const SECONDS_PER_DAY     = 24 * SECONDS_PER_HOUR
      const DAYS_30_IN_SECONDS  = 30 * SECONDS_PER_DAY
      const DAYS_7_IN_SECONDS   = 7 * SECONDS_PER_DAY
      const HOURS_24_IN_SECONDS = 24 * SECONDS_PER_HOUR

    Remove all TODO Phase 4 comments for Date.now() in these files.

==========================================================================
SECTION 10 — PHASE 4 COMPLETION CHECKLIST
==========================================================================

Before marking Phase 4 complete, verify every produced file:

  [x] No abbreviations in names
  [x] JSDoc on every exported interface method (WHY, not the obvious WHAT)
  [x] No ifs nested beyond 2 levels — guard clauses used
  [x] No chained ternary expressions
  [x] No 3+ inline && chains
  [x] Magic numbers are named constants (SECONDS_PER_DAY, etc.)
  [x] IClock and IIdGenerator are constructor-injected, NOT in c.var
  [x] FixedClock and SequentialIdGenerator are marked as test-only in JSDoc
  [x] All TODO Phase 4 comments for Date.now() and crypto.randomUUID() removed
  [x] IAnalyticsRepository.recordRequest signature updated to remove dayTimestamp
  [x] D1AnalyticsRepository.recordRequest uses clock internally
  [x] factory.ts passes only seedSlug to analyticsRepository.recordRequest
  [x] stats.handler.ts uses SystemClock.now() / SystemClock.nowSeconds()
  [x] Production code never references FixedClock or SequentialIdGenerator
  [x] No circular imports introduced

Begin with Step 1. List the files you will create and modify, then proceed file by file.
After each file, stop and ask: "Ready for the next file?"
