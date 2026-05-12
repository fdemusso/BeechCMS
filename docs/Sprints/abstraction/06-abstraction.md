You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

Do NOT explore the codebase further. All relevant context is provided in this prompt.
Read it fully before writing any code.

Phases 1 through 5 are complete. This prompt covers Phase 6 only.

### Stack

- API: Hono on Cloudflare Workers, D1 (SQLite), R2, Cloudflare RateLimit bindings
- Dashboard: React + TanStack Query + axios, in-memory token store
- Shared package: @beechcms/core (pure TypeScript, zero HTTP/cloud dependencies)
- Monorepo: Turborepo

==========================================================================
SECTION 1 — WHAT PHASES 1–5 DELIVERED (already in production, do not rewrite)
==========================================================================

PHASE 1: IHashProvider, ITokenService, IUserRepository, ISessionRepository,
         IPasswordResetTokenRepository, IRateLimiter, IRateLimiterRegistry
         — all injected via context or constructor.

PHASE 2: IActivityLogger, IActivityLogRepository, INotificationRepository,
         INotificationService — injected via context or constructor.

PHASE 3: IWidgetRepository, ISearchRepository, IAnalyticsRepository
         — injected via context. widget.ts and search.ts contain zero
         c.env.DB references. analytics recording uses IAnalyticsRepository.

PHASE 4: IClock (packages/core/src/clock.ts + SystemClock + FixedClock)
         IIdGenerator (packages/core/src/id-generator.ts + SystemIdGenerator
         + SequentialIdGenerator) — both constructor-injected into D1* classes.
         IAnalyticsRepository.recordRequest(seedSlug: string) — day-bucket
         computed internally by D1AnalyticsRepository.

PHASE 5: ISeedRegistry, SeedRegistry, InMemorySeedRegistry
         (packages/core/src/seed-registry.ts, exported from core index.ts).
         c.var.seedRegistry is now typed as ISeedRegistry.
         stats.handler.ts and search.ts use .all() / .visibleInDashboard().
         IFieldRegistry + FieldRegistryImpl
         (apps/dashboard/src/components/fields/field-registry.ts).
         registry.ts uses fieldRegistry singleton; old Map constants removed.
         upload.ts uses c.get("activityLogger").log(...) — logActivity removed.

Middleware registration order (DO NOT CHANGE):
  1. repositoryMiddleware
  2. storageMiddleware
  3. authProvidersMiddleware
  4. rateLimiterMiddleware
  5. observabilityMiddleware

Full list of context variables currently in AppEnv Variables:
  repository, idempotencyRepository, mediaRepository, systemStatsRepository,
  userRepository, sessionRepository, passwordResetTokenRepository,
  activityLogRepository, notificationRepository, widgetRepository,
  searchRepository, analyticsRepository,
  bucket, hashProvider, tokenService, rateLimiters,
  activityLogger, notificationService,
  getSeed, seedRegistry (ISeedRegistry),
  jwtPayload

==========================================================================
SECTION 2 — WHAT PHASE 6 COVERS
==========================================================================

Phase 6 is the final cleanup sprint. It resolves all remaining inline
duplications and direct-library couplings that were deferred from earlier
phases. All items are sourced from the abstraction-interfaces report,
sections 3.8, 4.1, 4.2, and 4.4.

The four tasks are:

  Task A — SHA-256 dedup (report §3.8):
    computeSha256Hash is defined inline in two password-reset files and
    duplicated once more as hashRefreshToken in auth/refresh.ts.
    sha256hex is already exported from packages/core/src/policies.ts.
    All three inline implementations must be deleted; every call site
    imports sha256hex from "@beechcms/core" instead.

  Task B — getClientIp dedup (report §7 anti-patterns):
    The expression req.raw.headers.get("cf-connecting-ip") ?? "unknown"
    is repeated in at least four files. Extract it to a named utility
    function getClientIp(req: HonoRequest): string in
    apps/api/src/shared/request-utils.ts and replace all inline
    occurrences with the import.

  Task C — setup.ts migration (report §4.2):
    apps/api/src/features/setup/index.ts still calls:
      context.env.DB.prepare("SELECT COUNT(*) ...").first()
      bcrypt.hash(password, 12)
      context.env.DB.prepare("INSERT INTO users ...").run()
    After Phases 1 and 4, these are replaced with:
      c.get("userRepository").count()
      c.get("hashProvider").hash(password)
      c.get("userRepository").create(...)
      c.get("idGenerator").uuid()   ← replaces crypto.randomUUID()
    This makes setup.ts fully testable without D1 or bcrypt.

  Task D — public-routes.ts migration (report §4.9 follow-up):
    apps/api/src/public/public-routes.ts still calls
    Object.values(c.get("seedRegistry")) in two endpoints (GET /schema
    and GET /schema.html). After Phase 5, c.get("seedRegistry") is
    ISeedRegistry, so Object.values() no longer compiles.
    Replace all Object.values(c.get("seedRegistry")) calls with
    c.get("seedRegistry").all() (or a more specific method where
    appropriate).

==========================================================================
SECTION 3 — CURRENT STATE OF EACH TARGET IN DETAIL
==========================================================================

3.1 SHA-256 DUPLICATE IMPLEMENTATIONS

  File 1: apps/api/src/features/password-reset/request.ts (lines 11–19)
    async function computeSha256Hash(text: string): Promise<string> {
      const encoder = new TextEncoder()
      const data = encoder.encode(text)
      const hashBuffer = await crypto.subtle.digest("SHA-256", data)
      return Array.from(new Uint8Array(hashBuffer))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("")
    }
    Used as: const hashedToken = await computeSha256Hash(rawToken)

  File 2: apps/api/src/features/password-reset/reset.ts (lines 13–21)
    async function computeSha256Hash(text: string): Promise<string> {
      const encoder = new TextEncoder()
      const data = encoder.encode(text)
      const hashBuffer = await crypto.subtle.digest("SHA-256", data)
      return Array.from(new Uint8Array(hashBuffer))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("")
    }
    Used as: const hashedResetToken = await computeSha256Hash(resetToken)

  File 3: apps/api/src/auth/refresh.ts (line ~30)
    async function hashRefreshToken(token: string): Promise<string> {
      const encoder = new TextEncoder()
      const data = encoder.encode(token)
      const hashBuffer = await crypto.subtle.digest("SHA-256", data)
      return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("")
    }
    Used as: const tokenHash = await hashRefreshToken(rawToken)

  Canonical source: packages/core/src/policies.ts exports sha256hex(input: string): Promise<string>
    — exact same implementation; already exported from core index.ts.

  Action:
    In each of the three files:
      1. Delete the local function definition entirely.
      2. Add import { sha256hex } from "@beechcms/core"
      3. Replace every call site:
           computeSha256Hash(x)  →  sha256hex(x)
           hashRefreshToken(x)   →  sha256hex(x)
      4. No other changes to any of the three files.

3.2 getClientIp INLINE PATTERN

  The expression req.raw.headers.get("cf-connecting-ip") ?? "unknown"
  appears verbatim in:

    - apps/api/src/features/password-reset/request.ts
        const clientIp = req.raw.headers.get("cf-connecting-ip") ?? "unknown"
    - apps/api/src/features/password-reset/reset.ts
        const clientIpAddress = req.raw.headers.get("cf-connecting-ip") ?? "unknown"
    - apps/api/src/auth/login.ts
        const ip = req.raw.headers.get("cf-connecting-ip") ?? "unknown"
    - apps/api/src/auth/refresh.ts
        const ip = req.raw.headers.get("cf-connecting-ip") ?? "unknown"
    - apps/api/src/public/rate-limit-middleware.ts
        const clientIp = req.raw.headers.get("cf-connecting-ip") ?? "unknown"

  New utility:
    File: apps/api/src/shared/request-utils.ts

    import type { HonoRequest } from "hono"

    /** The header Cloudflare sets on every incoming request to the Worker. */
    const CLOUDFLARE_CLIENT_IP_HEADER = "cf-connecting-ip"

    /** The fallback value used when the IP header is absent (local dev, unit tests). */
    const UNKNOWN_IP = "unknown"

    /**
     * Extracts the real client IP address from a Cloudflare Worker request.
     *
     * Cloudflare injects the cf-connecting-ip header on every request that
     * passes through the edge. In local development (wrangler dev) or in
     * unit tests the header may be absent, in which case the string "unknown"
     * is returned so that rate-limiter keys remain non-empty and safe to use.
     *
     * Never derive security decisions from this value alone; treat it as a
     * best-effort hint for rate-limiting and logging purposes only.
     */
    export function getClientIp(request: HonoRequest): string {
      return request.raw.headers.get(CLOUDFLARE_CLIENT_IP_HEADER) ?? UNKNOWN_IP
    }

  Action in each of the five files:
    1. Add import { getClientIp } from "../shared/request-utils"
       (adjust relative path per file location).
    2. Replace the inline expression with getClientIp(req) or getClientIp(c.req)
       depending on how the request is named in each file.
    3. Keep the local variable name the same (clientIp, clientIpAddress, ip)
       to minimise diff noise.
    4. No other changes to any of the five files.

  NOTE on path adjustments:
    - apps/api/src/auth/login.ts → "../shared/request-utils"
    - apps/api/src/auth/refresh.ts → "../shared/request-utils"
    - apps/api/src/features/password-reset/request.ts → "../../shared/request-utils"
    - apps/api/src/features/password-reset/reset.ts → "../../shared/request-utils"
    - apps/api/src/public/rate-limit-middleware.ts → "../shared/request-utils"

3.3 setup/index.ts CURRENT STATE

  apps/api/src/features/setup/index.ts (extracted from codebase context):

    import { Hono } from "hono"
    import bcrypt from "bcryptjs"
    import type { Env, Variables } from "../../../../types"
    import { publicProblem } from "../../../../public/problem-details"

    const setupApp = new Hono<{ Bindings: Env; Variables: Variables }>()

    // GET /auth/setup
    setupApp.get("/auth/setup", async (context) => {
      const userCountResult = await context.env.DB
        .prepare("SELECT COUNT(*) as count FROM users")
        .first<{ count: number }>()
      const needsInitialSetup = (userCountResult?.count ?? 0) === 0
      return context.json({ needsSetup: needsInitialSetup })
    })

    // POST /auth/setup
    setupApp.post("/auth/setup", async (context) => {
      const userCountResult = await context.env.DB
        .prepare("SELECT COUNT(*) as count FROM users")
        .first<{ count: number }>()
      if ((userCountResult?.count ?? 0) > 0) {
        return publicProblem(context, { ... status: 403 })
      }

      // ... validation ...

      const hashedPassword = await bcrypt.hash(password, 12)
      const newUserId = crypto.randomUUID()
      const normalizedEmail = email.trim().toLowerCase()
      const normalizedName = typeof name === "string" ? name.trim() : null

      await context.env.DB
        .prepare("INSERT INTO users (id, email, passwordhash, role, name) VALUES (?, ?, ?, ?, ?)")
        .bind(newUserId, normalizedEmail, hashedPassword, "admin", normalizedName)
        .run()

      return context.json({ success: true }, 201)
    })

  Injection points available after Phases 1–4:
    c.get("userRepository")   → IUserRepository (count, create, findByEmail, …)
    c.get("hashProvider")     → IHashProvider  (hash, verify)
    c.get("idGenerator")      → IIdGenerator   (uuid)

  Target state:
    import { Hono } from "hono"
    import type { Env, Variables } from "../../../../types"
    import { publicProblem } from "../../../../public/problem-details"
    // bcrypt import REMOVED
    // crypto.randomUUID() REMOVED

    // GET /auth/setup
    setupApp.get("/auth/setup", async (context) => {
      const userCount = await context.get("userRepository").count()
      const needsInitialSetup = userCount === 0
      return context.json({ needsSetup: needsInitialSetup })
    })

    // POST /auth/setup
    setupApp.post("/auth/setup", async (context) => {
      const userCount = await context.get("userRepository").count()
      if (userCount > 0) {
        return publicProblem(context, { ... status: 403 })
      }

      // ... same validation logic unchanged ...

      const hashedPassword = await context.get("hashProvider").hash(password)
      const newUserId = context.get("idGenerator").uuid()
      const normalizedEmail = email.trim().toLowerCase()
      const normalizedName = typeof name === "string" ? name.trim() : null

      await context.get("userRepository").create({
        id: newUserId,
        email: normalizedEmail,
        passwordHash: hashedPassword,
        role: "admin",
        name: normalizedName ?? undefined,
      })

      return context.json({ success: true }, 201)
    })

  IMPORTANT: The full validation block (email regex, password length check,
  publicProblem calls for bad JSON, missing fields, etc.) must be preserved
  exactly as-is. Only the three injection points above change.

  IUserRepository.create() signature from Phase 1:
    create(user: Omit<UserRecord, "avatarUrl" | "notificationPrefs"> & {
      avatarUrl?: string | null
      notificationPrefs?: string
    }): Promise<void>

  IIdGenerator.uuid() signature from Phase 4:
    uuid(): string

3.4 public-routes.ts CURRENT STATE (schema endpoints)

  apps/api/src/public/public-routes.ts contains two endpoints that still
  call Object.values(c.get("seedRegistry")):

  Endpoint 1 — GET /schema (JSON):
    const registry = c.get("seedRegistry")
    const publicSeeds = Object.values(registry)
      .filter(seed => seed.allowPublicRead === true
                   || seed.allowPublicPost === true
                   || seed.allowPublicEdit === true)
      .map(seed => ({ ... }))

  Endpoint 2 — GET /schema.html (HTML):
    const registry = c.get("seedRegistry")
    const publicSeeds = Object.values(registry)
      .filter(seed => seed.allowPublicRead === true
                   || seed.allowPublicPost === true
                   || seed.allowPublicEdit === true)

  After Phase 5, c.get("seedRegistry") returns ISeedRegistry (not
  Record<string, Seed>), so Object.values() no longer compiles.

  ISeedRegistry does not expose a method for the combined
  "allowPublicRead OR allowPublicPost OR allowPublicEdit" filter because
  that combination is specific to the Public API schema endpoint and was
  not included as a standard method.

  Correct migration:
    Replace: Object.values(c.get("seedRegistry"))
    With:    c.get("seedRegistry").all()

  Then leave the existing .filter(...) chain intact, since the filter
  logic is a one-off combination not worth adding to ISeedRegistry.

  After migration, NO direct Object.values(c.get("seedRegistry")) call
  remains anywhere in apps/api/src/.

==========================================================================
SECTION 4 — FILE INVENTORY FOR PHASE 6
==========================================================================

FILES TO CREATE (1):
  apps/api/src/shared/request-utils.ts
    New utility. Full implementation provided in §3.2.

FILES TO MODIFY (7):
  apps/api/src/auth/refresh.ts
    - Delete hashRefreshToken function.
    - Add import { sha256hex } from "@beechcms/core".
    - Add import { getClientIp } from "../shared/request-utils".
    - Replace hashRefreshToken(x) with sha256hex(x).
    - Replace inline IP expression with getClientIp(c.req) or getClientIp(req).

  apps/api/src/features/password-reset/request.ts
    - Delete computeSha256Hash function.
    - Add import { sha256hex } from "@beechcms/core".
    - Add import { getClientIp } from "../../shared/request-utils".
    - Replace computeSha256Hash(x) with sha256hex(x).
    - Replace inline IP expression with getClientIp(c.req) or getClientIp(req).

  apps/api/src/features/password-reset/reset.ts
    - Delete computeSha256Hash function.
    - Add import { sha256hex } from "@beechcms/core".
    - Add import { getClientIp } from "../../shared/request-utils".
    - Replace computeSha256Hash(x) with sha256hex(x).
    - Replace inline IP expression with getClientIp(c.req) or getClientIp(req).

  apps/api/src/auth/login.ts
    - Add import { getClientIp } from "../shared/request-utils".
    - Replace inline IP expression with getClientIp(c.req) or getClientIp(req).
    - No SHA-256 changes needed in this file.

  apps/api/src/public/rate-limit-middleware.ts
    - Add import { getClientIp } from "../shared/request-utils".
    - Replace inline IP expression with getClientIp(c.req).
    - No SHA-256 changes needed in this file.

  apps/api/src/features/setup/index.ts
    - Remove import of bcryptjs entirely.
    - Replace context.env.DB.prepare("SELECT COUNT(*)...") with
      context.get("userRepository").count().
    - Replace bcrypt.hash(...) with context.get("hashProvider").hash(...).
    - Replace crypto.randomUUID() with context.get("idGenerator").uuid().
    - Replace context.env.DB.prepare("INSERT INTO users...").run() with
      context.get("userRepository").create({ ... }).
    - All validation logic unchanged.

  apps/api/src/public/public-routes.ts
    - Replace Object.values(c.get("seedRegistry")) with
      c.get("seedRegistry").all() in both schema endpoints.
    - The .filter() chains that follow remain unchanged.

FILES TO DELETE (0).

==========================================================================
SECTION 5 — GOLD STANDARD PATTERN (same rules as all previous phases)
==========================================================================

Rules:
1. One responsibility per function. Split at ~20 lines.
2. No nested ifs beyond 2 levels. Guard clauses.
3. No chained ternary expressions.
4. No 3+ inline && chains. Extract to named booleans.
5. Zero Hono/HTTP coupling inside utility implementations.
6. Named constants for magic values (see CLOUDFLARE_CLIENT_IP_HEADER,
   UNKNOWN_IP in §3.2).

==========================================================================
SECTION 6 — CODE QUALITY CONVENTIONS (non-negotiable)
==========================================================================

NAMING:
  Full descriptive English words. Zero abbreviations.
    BAD:  sha256, hashFn, getPwHash, ipHeader
    GOOD: sha256hex, hashPassword, getClientIp, CLOUDFLARE_CLIENT_IP_HEADER

  Constants: SCREAMING_SNAKE_CASE.
  Files: kebab-case, full words.

COMMENTS (English only):
  JSDoc on every exported function and constant explaining WHY.
  Inline comments only where intent cannot be inferred from the code alone.

==========================================================================
SECTION 7 — YOUR OPERATING RULES
==========================================================================

1. Work ONE step at a time. Never start step N+1 before the user confirms step N.

2. Before writing any file, state:
   - FILES TO CREATE: list with full paths
   - FILES TO MODIFY: list with full paths and one-line change description
   - FILES TO DELETE: list (if any)

3. After writing each file, stop and ask: "Ready for the next file?"

4. Never touch files not listed in the current step.

==========================================================================
SECTION 8 — CURRENT TASK: PHASE 6 — SHA-256 DEDUP, getClientIp, SETUP MIGRATION, PUBLIC ROUTES
==========================================================================

Execute the following steps in order.

--------------------------------------------------------------------------
PHASE 6 — STEP 1: Create apps/api/src/shared/request-utils.ts
--------------------------------------------------------------------------

Implement getClientIp exactly as specified in §3.2.
Full JSDoc required. Named constants required.
No other functions in this file for now (leave room for future additions).

After writing this file, stop and ask: "Ready for the next file?"

--------------------------------------------------------------------------
PHASE 6 — STEP 2: Patch apps/api/src/auth/refresh.ts
--------------------------------------------------------------------------

Changes:
  1. Delete the hashRefreshToken function entirely.
  2. Add import { sha256hex } from "@beechcms/core".
  3. Add import { getClientIp } from "../shared/request-utils".
  4. Replace every call to hashRefreshToken(x) with sha256hex(x).
  5. Replace the inline IP expression with getClientIp(c.req) / getClientIp(req).
  6. No other changes. All logic, variable names, comments preserved.

After writing this file, stop and ask: "Ready for the next file?"

--------------------------------------------------------------------------
PHASE 6 — STEP 3: Patch apps/api/src/features/password-reset/request.ts
--------------------------------------------------------------------------

Changes:
  1. Delete the computeSha256Hash function entirely.
  2. Add import { sha256hex } from "@beechcms/core".
  3. Add import { getClientIp } from "../../shared/request-utils".
  4. Replace computeSha256Hash(x) with sha256hex(x).
  5. Replace the inline IP expression with getClientIp(c.req) / getClientIp(req).
  6. No other changes.

After writing this file, stop and ask: "Ready for the next file?"

--------------------------------------------------------------------------
PHASE 6 — STEP 4: Patch apps/api/src/features/password-reset/reset.ts
--------------------------------------------------------------------------

Changes:
  1. Delete the computeSha256Hash function entirely.
  2. Add import { sha256hex } from "@beechcms/core".
  3. Add import { getClientIp } from "../../shared/request-utils".
  4. Replace computeSha256Hash(x) with sha256hex(x).
  5. Replace the inline IP expression with getClientIp(c.req) / getClientIp(req).
  6. No other changes.

After writing this file, stop and ask: "Ready for the next file?"

--------------------------------------------------------------------------
PHASE 6 — STEP 5: Patch apps/api/src/auth/login.ts
--------------------------------------------------------------------------

Changes:
  1. Add import { getClientIp } from "../shared/request-utils".
  2. Replace the inline IP expression with getClientIp(c.req) / getClientIp(req).
  3. No SHA-256 changes needed.
  4. No other changes.

After writing this file, stop and ask: "Ready for the next file?"

--------------------------------------------------------------------------
PHASE 6 — STEP 6: Patch apps/api/src/public/rate-limit-middleware.ts
--------------------------------------------------------------------------

Changes:
  1. Add import { getClientIp } from "../shared/request-utils".
  2. Replace the inline IP expression with getClientIp(c.req).
  3. No SHA-256 changes needed.
  4. No other changes.

After writing this file, stop and ask: "Ready for the next file?"

--------------------------------------------------------------------------
PHASE 6 — STEP 7: Migrate apps/api/src/features/setup/index.ts
--------------------------------------------------------------------------

Changes:
  1. Remove import of bcryptjs entirely.
  2. Replace context.env.DB.prepare("SELECT COUNT(*)...").first() (×2)
     with await context.get("userRepository").count().
  3. Replace bcrypt.hash(password, 12) with
     await context.get("hashProvider").hash(password).
  4. Replace crypto.randomUUID() with context.get("idGenerator").uuid().
  5. Replace the context.env.DB.prepare("INSERT INTO users...").run() call
     with await context.get("userRepository").create({ ... }) using the
     field names from IUserRepository.create() as specified in §3.3.
  6. Preserve all validation logic (email regex, password length, JSON
     parse error handling, publicProblem calls) exactly as-is.
  7. No other changes.

After writing this file, stop and ask: "Ready for the next file?"

--------------------------------------------------------------------------
PHASE 6 — STEP 8: Patch apps/api/src/public/public-routes.ts
--------------------------------------------------------------------------

Changes:
  1. In GET /schema:
     Replace Object.values(c.get("seedRegistry"))
     with    c.get("seedRegistry").all()
     Keep the .filter() and .map() chains that follow unchanged.
  2. In GET /schema.html:
     Replace Object.values(c.get("seedRegistry"))
     with    c.get("seedRegistry").all()
     Keep the .filter() chain that follows unchanged.
  3. No other changes to this file.

After writing this file, announce Phase 6 complete.

==========================================================================
SECTION 9 — PHASE 6 COMPLETION CHECKLIST
==========================================================================

Before marking Phase 6 complete, verify every produced file:

  [ ] request-utils.ts created with getClientIp, JSDoc, named constants
  [ ] No inline "cf-connecting-ip" ?? "unknown" expression remains in
      login.ts, refresh.ts, request.ts, reset.ts, rate-limit-middleware.ts
  [ ] No computeSha256Hash function remains in password-reset/request.ts
      or password-reset/reset.ts
  [ ] No hashRefreshToken function remains in auth/refresh.ts
  [ ] All three files import { sha256hex } from "@beechcms/core"
  [ ] All sha256hex calls are await sha256hex(x) (function is async)
  [ ] setup/index.ts contains no bcryptjs import
  [ ] setup/index.ts contains no context.env.DB calls
  [ ] setup/index.ts contains no crypto.randomUUID() call
  [ ] setup/index.ts uses userRepository.count(), hashProvider.hash(),
      idGenerator.uuid(), userRepository.create()
  [ ] All validation logic in setup/index.ts is preserved unchanged
  [ ] public-routes.ts contains no Object.values(c.get("seedRegistry")) call
  [ ] No abbreviations in names anywhere
  [ ] JSDoc on every new exported function

Begin with Step 1. List the files, then write the first file.
After each file, stop and ask: "Ready for the next file?"
