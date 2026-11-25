You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

Do NOT explore the codebase further. All relevant context is provided in this prompt.
Read it fully before writing any code.

### Stack

- API: Hono on Cloudflare Workers, D1 (SQLite), R2, Cloudflare RateLimit bindings
- Dashboard: React + TanStack Query + axios, in-memory token store
- Shared package: @beechcms/core (pure TypeScript, zero HTTP/cloud dependencies)
- Monorepo: Turborepo

==========================================================================
SECTION 1 — RELEVANT DIRECTORY STRUCTURE
==========================================================================

packages/core/src/
  content.repository.ts       -- ContentRepository interface — ALREADY EXISTS, DO NOT TOUCH
  idempotency.repository.ts   -- IdempotencyRepository interface — ALREADY EXISTS
  media.repository.ts         -- MediaRepository interface — ALREADY EXISTS
  storage.ts                  -- BeechBucket interface — ALREADY EXISTS
  policies.ts                 -- exports sha256hex — ALREADY EXISTS, import from here, do not rewrite
  types.ts                    -- Seed, BranchType and other core types
  index.ts                    -- public barrel — extend when adding new interfaces to core

apps/api/src/
  types.ts                    -- AppEnv (Hono Bindings + Variables) — must be updated each phase
  factory.ts                  -- Hono app entry point, registers all middleware
  middleware.ts               -- authMiddleware — uses jose jwtVerify directly (refactor target)
  middleware/
    repository.middleware.ts  -- injects ContentRepository etc. via c.set() — extend here for new repos
    storage.middleware.ts     -- injects BeechBucket via c.set() — use as injection pattern reference
  auth/
    login.ts                  -- imports bcryptjs directly (refactor target)
    refresh.ts                -- imports jose SignJWT directly, contains inline hashRefreshToken
  features/
    email/                    -- THE GOLD STANDARD MODULE — replicate this pattern for every new abstraction
      index.ts                -- sole public API barrel, the only file imported from outside the feature
      email.provider.ts       -- EmailProvider interface (the formal contract)
      email.service.ts        -- orchestrator: factory createProvider() + composition
      email.types.ts          -- shared types used by provider, service and templates
      providers/resend.ts     -- sole external coupling point (knows Resend, nothing else does)
    setup/index.ts            -- calls bcrypt.hash and INSERT INTO users directly (refactor target)
    password-reset/
      request.ts              -- contains inline computeSha256Hash, duplicate of core sha256hex
      reset.ts                -- contains inline computeSha256Hash, duplicate of core sha256hex
    settings/settings.handler.ts  -- calls bcrypt directly and has inline SQL on users table

==========================================================================
SECTION 2 — INTERFACES ALREADY IN PRODUCTION
==========================================================================

These interfaces exist and are injected via middleware. Use them as-is.
Never rewrite or duplicate them.

ContentRepository (packages/core/src/content.repository.ts):
  - findById, findMany, create, update, delete
  - existsSlug, hasDraft, saveDraft, getDraft, publishDraft, deleteDraft
  - Injected as c.get("repository") via repositoryMiddleware

MediaRepository (packages/core/src/media.repository.ts):
  - trackUpload, getByKey, untrack, list, count
  - Injected as c.get("mediaRepository") via repositoryMiddleware

IdempotencyRepository (packages/core/src/idempotency.repository.ts):
  - lookup, store, cleanup
  - Injected as c.get("idempotencyRepository") via repositoryMiddleware

SystemStatsRepository (packages/core/src/storage.ts area):
  - incrementStorage, decrementStorage, setStorage, getStorageUsage
  - Injected via repositoryMiddleware

BeechBucket (packages/core/src/storage.ts):
  - put, get, delete, head, getUrl, getTotalSize, list
  - Injected as c.get("bucket") via storageMiddleware

EmailProvider (apps/api/src/features/email/email.provider.ts):
  - send(email: OutboundEmail): Promise<void>
  - NOT injected via middleware — consumed internally by email.service.ts only

sha256hex (packages/core/src/policies.ts):
  - sha256hex(input: string): Promise<string>
  - Import directly from @beechcms/core wherever a SHA-256 hex digest is needed

==========================================================================
SECTION 3 — INTERFACES TO BE BUILT IN FUTURE PHASES (KNOWN CONTRACTS)
==========================================================================

These interfaces DO NOT EXIST YET but will be created in later phases.
When writing Phase 1 code, declare the types and inject them via context
as if they already exist. Leave a TODO comment on each usage pointing to
the phase that will implement them. This prevents accumulating refactoring debt.

IActivityLogger (will be created in Phase 2 — §3.5 of abstraction-report.md):
  - log(entry: ActivityLogEntry): Promise<void> | void
  - Will be injected as c.get("activityLogger") via observabilityMiddleware
  - Phase 1 handlers that currently call logActivity(c, ...) should instead call
    c.get("activityLogger").log(...) and add: // TODO: Phase 2 — inject via observabilityMiddleware

INotificationRepository (will be created in Phase 2 — §3.6):
  - create, list, stats, markRead, markUnread, markAllRead, delete
  - Will be injected as c.get("notificationRepository") via repositoryMiddleware

IAnalyticsRepository (will be created in Phase 4 — §4.3):
  - recordRequest, sumByMetric, groupByMetric
  - Will be injected via repositoryMiddleware

IWidgetRepository (will be created in Phase 5 — §3.7):
  - aggregate, growth, leaderboard, timeseries
  - Will be injected via repositoryMiddleware

IClock (will be created in Phase 4 — §4.6):
  - now(): number (milliseconds), nowSeconds(): number
  - Will be injected as a constructor parameter in session/token services

==========================================================================
SECTION 4 — THE GOLD STANDARD PATTERN (email module)
==========================================================================

Every new abstraction must replicate the email module structure exactly:

  feature-or-domain/
    index.ts           -- ONLY file imported from outside; exports public API only
    *.provider.ts      -- formal interface (the contract)
    *.service.ts       -- orchestrator + factory function
    *.types.ts         -- shared types; no framework imports
    providers/
      concrete.ts      -- ONE class per file; knows the external dependency

Rules derived from this pattern:
1. One interface per contract. No abstract base classes.
2. Concrete implementations go in dedicated subfolders. One class per file.
3. One factory function at the module boundary. It is the only place to swap implementations.
4. The barrel index.ts exports only the public API: types, high-level functions, input resolvers.
   Never export providers or internal helpers from index.ts.
5. Shared pure types live in *.types.ts. Providers and builders depend only on types, never on each other.
6. Zero Hono/HTTP coupling inside concrete implementations. The Hono Context is only an argument
   of the caller (the handler), never of the provider or repository.

Anti-patterns explicitly forbidden (observed in the current codebase):
- Free functions that take Hono Context and execute inline SQL (logActivity, createNotification)
- Direct imports of bcryptjs, jose, or Cloudflare RateLimit bindings inside handlers
- Identical utility functions copied across multiple feature files (computeSha256Hash x2)
- "Ghost repositories": entities (users, sessions, notifications) with inline SQL scattered across 5+ handlers

==========================================================================
SECTION 5 — CODE QUALITY CONVENTIONS (non-negotiable)
==========================================================================

NAMING:
  Variables and functions: full descriptive English words, zero abbreviations.
    BAD:  usr, pwdHash, tkSvc, cfgObj, n, cb
    GOOD: userRecord, passwordHash, tokenService, configOptions, hitCount, callback

  Types, interfaces, classes: PascalCase, full words.
    BAD:  IRTRep, HashProv, UsrRepo
    GOOD: ISessionRepository, IHashProvider, IUserRepository

  Constants: SCREAMING_SNAKE_CASE, full words.
    BAD:  MIN_PWD, MAX_PWD, DEF_ROUNDS
    GOOD: MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, DEFAULT_BCRYPT_ROUNDS

  File names: kebab-case, full words.
    BAD:  usr-repo.ts, tkn-svc.ts, auth-prov.ts
    GOOD: user.repository.ts, token-service.ts, auth-providers.middleware.ts

COMMENTS (English only):
  - Write a JSDoc comment on every exported interface method explaining WHY it exists,
    not what it obviously does.
  - Add inline comments ONLY when the code alone cannot convey the intent
    (e.g., timing-attack mitigation, SQL injection prevention note).
  - Never comment the obvious:
    BAD:  // returns the user
    GOOD: // Use a dummy hash comparison even when the user is not found to
          // prevent timing-based user enumeration attacks.

CODE STRUCTURE:
  - No nested if statements beyond 2 levels. Use early returns (guard clauses).
  - No chained ternary expressions (a ? b : c ? d : e).
  - No long condition chains with 3+ && operators inline.
    Extract them into a named boolean variable with a descriptive name.
  - Prefer async/await over .then() chains.
  - One responsibility per function. If a function exceeds ~20 lines, split it.
  - Magic numbers must be named constants at the top of the file.

==========================================================================
SECTION 6 — YOUR OPERATING RULES
==========================================================================

1. Work ONE step at a time within the current phase.
   Never start step N+1 before the user confirms step N is complete.

2. Before writing any file, state:
   - FILES TO CREATE: list with full paths
   - FILES TO MODIFY: list with full paths and a one-line description of the change
   - FILES TO DELETE: list (if any)

3. Follow the email module pattern (Section 4) for every new abstraction.

4. Never touch files not listed in the current phase plan.

5. When a Phase 1 file needs a service from a future phase (Section 3),
   use the interface name directly and add a TODO comment referencing the phase.
   Do not fall back to the old inline implementation.

6. After writing each file, stop and ask: "Ready for the next file?"

==========================================================================
SECTION 7 — CURRENT TASK: PHASE 1 — AUTH ABSTRACTIONS
==========================================================================

Execute the following steps in order.

--------------------------------------------------------------------------
PHASE 1 — STEP 1: Deduplicate sha256hex (approx. 10 minutes)
--------------------------------------------------------------------------

Problem:
  computeSha256Hash is defined identically in two files:
    apps/api/src/features/password-reset/request.ts
    apps/api/src/features/password-reset/reset.ts
  The function hashRefreshToken in apps/api/src/auth/refresh.ts does the same thing.
  packages/core/src/policies.ts already exports sha256hex with the exact same implementation.

Action:
  FILES TO MODIFY:
    apps/api/src/features/password-reset/request.ts
      Remove computeSha256Hash definition. Import sha256hex from @beechcms/core.
    apps/api/src/features/password-reset/reset.ts
      Same as above.
    apps/api/src/auth/refresh.ts
      Remove hashRefreshToken. Use sha256hex from @beechcms/core directly.

  No new files. No interface changes.

--------------------------------------------------------------------------
PHASE 1 — STEP 2: IHashProvider interface in packages/core
--------------------------------------------------------------------------

FILES TO CREATE:
  packages/core/src/auth/hash-provider.ts
    Defines IHashProvider with two methods:
      hash(plaintextPassword: string): Promise<string>
      verify(plaintextPassword: string, storedHash: string): Promise<boolean>
    JSDoc on each method must explain the security contract (one-way, constant-time).

  apps/api/src/auth/bcrypt-hash-provider.ts
    BcryptHashProvider implements IHashProvider.
    Constructor accepts saltRounds: number = DEFAULT_BCRYPT_ROUNDS (named constant = 10).
    Uses bcryptjs. This is the ONLY file in the project allowed to import bcryptjs.

  apps/api/src/auth/in-memory-hash-provider.ts
    InMemoryHashProvider implements IHashProvider.
    hash() returns a deterministic prefixed string (HASH_PREFIX + plaintext).
    verify() checks the same prefix. Used in tests only.

FILES TO MODIFY:
  packages/core/src/index.ts
    Export IHashProvider.
  apps/api/src/features/setup/index.ts
    Remove bcryptjs import. Read hashProvider from c.get("hashProvider").
  apps/api/src/features/password-reset/reset.ts
    Remove bcryptjs import. Use hashProvider from context.
  apps/api/src/features/settings/settings.handler.ts
    Remove bcryptjs import. Use hashProvider from context.
  apps/api/src/auth/login.ts
    The verifyPassword function must accept hashProvider: IHashProvider as a parameter
    instead of calling bcrypt directly.

--------------------------------------------------------------------------
PHASE 1 — STEP 3: ITokenService interface in packages/core
--------------------------------------------------------------------------

FILES TO CREATE:
  packages/core/src/auth/token-service.ts
    Defines:
      JwtClaims { sub: string; email?: string; name?: string; [key: string]: unknown }
      IssueTokenOptions { ttlSeconds?: number }  (JSDoc: default 900 = 15 min)
      ITokenService with two methods:
        issue(claims: JwtClaims, options?: IssueTokenOptions): Promise<string>
        verify(token: string): Promise<JwtClaims | null>
    verify() must return null on ANY failure, never throw.

  apps/api/src/auth/jose-token-service.ts
    JoseTokenService implements ITokenService.
    Constructor accepts: secret string, config JoseTokenServiceConfig.
    Config fields: issuer?, audience?, algorithm? (HS256 | HS384 | HS512).
    This is the ONLY file allowed to import from jose.
    issue() enforces protected header typ: "JWT".
    verify() catches all errors and returns null.

  apps/api/src/auth/static-token-service.ts
    StaticTokenService implements ITokenService. Used in tests only.
    issue() returns "test:" + claims.sub
    verify() returns the stored claims if token starts with "test:", otherwise null.

FILES TO MODIFY:
  packages/core/src/index.ts
    Export ITokenService, JwtClaims, IssueTokenOptions.
  apps/api/src/auth/refresh.ts
    Remove jose import. Read tokenService from c.get("tokenService") and call .issue().
  apps/api/src/middleware.ts
    Remove jose import. Read tokenService from c.get("tokenService") and call .verify().

--------------------------------------------------------------------------
PHASE 1 — STEP 4: authProvidersMiddleware
--------------------------------------------------------------------------

FILES TO CREATE:
  apps/api/src/middleware/auth-providers.middleware.ts
    Exports authProvidersMiddleware(overrides?: AuthProviderOverrides).
    AuthProviderOverrides: { hashProvider?: IHashProvider; tokenService?: ITokenService }
    When no overrides are given, instantiates BcryptHashProvider and JoseTokenService
    using c.env.JWT_SECRET, c.env.JWT_ISSUER, c.env.JWT_AUDIENCE.
    Sets both on context via c.set().

FILES TO MODIFY:
  apps/api/src/types.ts
    Add to AppEnv Variables:
      hashProvider: IHashProvider
      tokenService: ITokenService
  apps/api/src/factory.ts
    Register authProvidersMiddleware in the middleware chain before auth routes.

--------------------------------------------------------------------------
PHASE 1 — STEP 5: IUserRepository, ISessionRepository, IPasswordResetTokenRepository
--------------------------------------------------------------------------

FILES TO CREATE:
  packages/core/src/auth/user.repository.ts
    IUserRepository with these methods:
      countAll(): Promise<number>
        JSDoc: used to block re-setup when a user already exists.
      findById(userId: string): Promise<UserRecord | null>
      findByEmail(email: string): Promise<UserRecord | null>
      create(user: NewUserInput): Promise<void>
      updateProfile(userId: string, fields: { name?: string; email?: string }): Promise<void>
      updatePasswordHash(userId: string, newPasswordHash: string): Promise<void>
      updateAvatarUrl(userId: string, avatarUrl: string | null): Promise<void>
      updateNotificationPreferences(userId: string, preferencesJson: string): Promise<void>
      emailBelongsToAnotherUser(email: string, currentUserId: string): Promise<boolean>
        JSDoc: used during email change to detect conflicts without exposing user existence.

    UserRecord fields (camelCase in TypeScript, mapped to snake_case in SQL):
      id, email, name, passwordHash, role, avatarUrl, notificationPreferences

  packages/core/src/auth/session.repository.ts
    ISessionRepository with:
      saveRefreshToken(record: NewRefreshToken): Promise<void>
      findActiveByHash(tokenHash: string, nowTimestamp: number): Promise<RefreshTokenRecord | null>
        JSDoc: nowTimestamp compared against expiresAt and revokedAt to guarantee token validity.
      revokeByHash(tokenHash: string, nowTimestamp: number): Promise<boolean>
      revokeAllForUser(userId: string, nowTimestamp: number): Promise<void>
        JSDoc: must be called on password change to invalidate all existing sessions.
      listActiveForUser(userId: string, nowTimestamp: number, limit: number): Promise<ActiveSessionSummary[]>
      revokeById(sessionId: string, userId: string, nowTimestamp: number): Promise<boolean>

  packages/core/src/auth/password-reset-token.repository.ts
    IPasswordResetTokenRepository with:
      invalidatePending(userId: string, nowTimestamp: number): Promise<void>
        JSDoc: called before creating a new token to ensure only one active token per user.
      create(record: NewPasswordResetToken): Promise<void>
      findValidByHashWithEmail(tokenHash: string, nowTimestamp: number): Promise<ValidatedResetToken | null>
        JSDoc: joins users table to return email alongside token data, avoiding a second query.
      markUsed(tokenId: string, nowTimestamp: number): Promise<void>

  apps/api/src/shared/d1-user.repository.ts
    D1UserRepository implements IUserRepository.
    Constructor: (db: D1Database).
    Every method uses db.prepare(...).bind(...). Never interpolate user input into SQL strings.
    All field names in SQL are snake_case; map to camelCase on the returned TypeScript object.

  apps/api/src/shared/d1-session.repository.ts
    D1SessionRepository implements ISessionRepository.
    Constructor: (db: D1Database).
    Same SQL safety rules as above.

  apps/api/src/shared/d1-password-reset-token.repository.ts
    D1PasswordResetTokenRepository implements IPasswordResetTokenRepository.
    Constructor: (db: D1Database).
    Same SQL safety rules.

FILES TO MODIFY:
  packages/core/src/index.ts
    Export the three new interfaces and their associated record types.
  apps/api/src/middleware/repository.middleware.ts
    Instantiate D1UserRepository, D1SessionRepository, D1PasswordResetTokenRepository.
    Inject them via c.set("userRepository"), c.set("sessionRepository"),
    c.set("passwordResetTokenRepository").
  apps/api/src/types.ts
    Add the three new repositories to AppEnv Variables.
  apps/api/src/auth/login.ts
    Remove inline SELECT. Use c.get("userRepository").findByEmail().
  apps/api/src/auth/refresh.ts
    Remove all inline SQL on refresh_tokens. Use c.get("sessionRepository").
  apps/api/src/features/setup/index.ts
    Remove all inline SQL on users. Use c.get("userRepository").countAll() and .create().
  apps/api/src/features/password-reset/request.ts
    Remove all inline SQL. Use userRepository.findByEmail() and passwordResetTokenRepository.*
  apps/api/src/features/password-reset/reset.ts
    Remove all inline SQL. Use the three repositories.
  apps/api/src/features/settings/settings.handler.ts
    Remove all inline SQL on users and refresh_tokens.
    Use userRepository.* and sessionRepository.*

--------------------------------------------------------------------------
PHASE 1 — STEP 6: IRateLimiter and RateLimiterRegistry
--------------------------------------------------------------------------

FILES TO CREATE:
  packages/core/src/rate-limit/rate-limiter.ts
    RateLimitResult: { isAllowed: boolean; retryAfterSeconds?: number }
    IRateLimiter:
      checkLimit(key: string): Promise<RateLimitResult>
        JSDoc: key should combine IP address and endpoint name to prevent cross-endpoint sharing.

  apps/api/src/rate-limit/cloudflare-rate-limiter.ts
    CloudflareRateLimiter implements IRateLimiter.
    Constructor: (binding: RateLimit).
    This is the ONLY file allowed to access a Cloudflare RateLimit binding directly.

  apps/api/src/rate-limit/no-op-rate-limiter.ts
    NoOpRateLimiter implements IRateLimiter.
    checkLimit() always returns { isAllowed: true }.
    Used in local development when bindings are absent.

  apps/api/src/rate-limit/in-memory-rate-limiter.ts
    InMemoryRateLimiter implements IRateLimiter.
    Constructor: (maxAllowedHits: number).
    Tracks hit counts in a Map. Returns isAllowed: false once maxAllowedHits is exceeded.
    Used in tests to assert 429 behaviour deterministically.

  apps/api/src/middleware/rate-limit.middleware.ts
    Defines:
      RateLimiterName union type:
        "login" | "tokenRefresh" | "forgotPassword" | "resetPassword" | "publicApiRead" | "publicApiWrite"
      IRateLimiterRegistry: { getLimiter(name: RateLimiterName): IRateLimiter }
      rateLimiterMiddleware(overrides?: { registry?: IRateLimiterRegistry })
        When no override, calls buildDefaultRegistry(env) which maps each Cloudflare
        binding to a CloudflareRateLimiter and falls back to NoOpRateLimiter if absent.
    Injects registry via c.set("rateLimiters").

FILES TO MODIFY:
  packages/core/src/index.ts
    Export IRateLimiter, RateLimitResult.
  apps/api/src/types.ts
    Add rateLimiters: IRateLimiterRegistry to AppEnv Variables.
  apps/api/src/factory.ts
    Register rateLimiterMiddleware.
    Replace the 5 inline env.X_RATE_LIMITER.limit({ key }) calls with:
      const result = await c.get("rateLimiters").getLimiter("login").checkLimit(clientIp)
      if (!result.isAllowed) { ... return 429 ... }
  apps/api/src/features/password-reset/request.ts
    Replace inline rate limit call with rateLimiters.getLimiter("forgotPassword").checkLimit().
  apps/api/src/features/password-reset/reset.ts
    Replace inline rate limit call with rateLimiters.getLimiter("resetPassword").checkLimit().
  apps/api/src/public/rate-limit-middleware.ts
    Replace inline binding calls with getLimiter("publicApiRead") and getLimiter("publicApiWrite").

==========================================================================
SECTION 8 — PHASE 1 COMPLETION CHECKLIST
==========================================================================

Before marking Phase 1 complete, verify every produced file against these rules:

  [x] No abbreviations in variable, function, parameter or type names
  [x] Every exported interface method has a JSDoc explaining WHY (not the obvious what)
  [x] Inline comments only where code alone is insufficient, always in English
  [x] No if nesting beyond 2 levels — guard clauses used instead
  [x] No condition chains with 3+ inline && operators — extracted to named booleans
  [x] No chained ternary expressions
  [x] All magic numbers are named constants defined at the top of the file
  [x] Each file has a single responsibility
  [x] bcryptjs imported only in bcrypt-hash-provider.ts
  [x] jose imported only in jose-token-service.ts
  [x] Cloudflare RateLimit binding accessed only in cloudflare-rate-limiter.ts
  [~] D1Database accessed only in D1* repository files
        Remaining: settings.handler.ts activity log route (→ Phase 2 IActivityLogRepository)
                   settings.handler.ts storage orphan scan (→ Phase 2 IContentScanRepository)
                   factory.ts analytics middleware (→ Phase 4 IAnalyticsRepository)
        All three sites have // TODO: Phase N comments pointing to the future interface.
  [x] Future-phase interfaces referenced via TODO comments, not bypassed

Phase 1 COMPLETE — all steps executed (Steps 1–6).
The three remaining D1 direct accesses are out of Phase 1 scope and are marked with TODO comments.
