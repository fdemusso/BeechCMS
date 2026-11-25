You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

Do NOT explore the codebase further. All relevant context is provided in this prompt.
Read it fully before writing any code.

Phases 1 and 2 are complete. This prompt covers Phase 3 only.

### Stack

- API: Hono on Cloudflare Workers, D1 (SQLite), R2, Cloudflare RateLimit bindings
- Dashboard: React + TanStack Query + axios, in-memory token store
- Shared package: @beechcms/core (pure TypeScript, zero HTTP/cloud dependencies)
- Monorepo: Turborepo

==========================================================================
SECTION 1 — WHAT PHASES 1 AND 2 DELIVERED (already in production, do not rewrite)
==========================================================================

PHASE 1 DELIVERABLES:

packages/core/src/auth/hash-provider.ts
  IHashProvider { hash(plaintext): Promise<string>; verify(plaintext, hash): Promise<boolean> }

packages/core/src/auth/token-service.ts
  JwtClaims, IssueTokenOptions, ITokenService { issue, verify }

packages/core/src/auth/user.repository.ts
  UserRecord, IUserRepository
  Methods: countAll, findById, findByEmail, create, updateProfile, updatePasswordHash,
           updateAvatarUrl, updateNotificationPreferences, emailBelongsToAnotherUser
  Injected as c.get("userRepository")

packages/core/src/auth/session.repository.ts
  RefreshTokenRecord, ISessionRepository
  Methods: saveRefreshToken, findActiveByHash, revokeByHash, revokeAllForUser,
           listActiveForUser, revokeById
  Injected as c.get("sessionRepository")

packages/core/src/auth/password-reset-token.repository.ts
  IPasswordResetTokenRepository
  Methods: invalidatePending, create, findValidByHashWithEmail, markUsed
  Injected as c.get("passwordResetTokenRepository")

packages/core/src/rate-limit/rate-limiter.ts
  RateLimitResult, IRateLimiter, IRateLimiterRegistry
  RateLimiterName: "login"|"tokenRefresh"|"forgotPassword"|"resetPassword"|"publicApiRead"|"publicApiWrite"
  Injected as c.get("rateLimiters")

Concrete implementations in apps/api/src/:
  auth/bcrypt-hash-provider.ts, auth/in-memory-hash-provider.ts
  auth/jose-token-service.ts, auth/static-token-service.ts
  rate-limit/cloudflare-rate-limiter.ts, rate-limit/no-op-rate-limiter.ts, rate-limit/in-memory-rate-limiter.ts
  middleware/auth-providers.middleware.ts
  middleware/rate-limit.middleware.ts
  shared/d1-user.repository.ts, shared/d1-session.repository.ts, shared/d1-password-reset-token.repository.ts

PHASE 2 DELIVERABLES:

packages/core/src/observability/activity-logger.ts
  ActivityAction, EntityType, ActivityLogEntry, IActivityLogger { log(entry): Promise<void>|void }
  Injected as c.get("activityLogger")

packages/core/src/observability/activity-log.repository.ts
  ActivityLogRecord, ActivityLogListOptions, IActivityLogRepository { list(options): Promise<ActivityLogRecord[]> }
  Injected as c.get("activityLogRepository")

packages/core/src/notifications/notification.repository.ts
  NotificationType, NotificationRecord, NotificationStats, INotificationRepository
  Methods: list, stats, create, markRead, markUnread, markAllRead, delete
  Injected as c.get("notificationRepository")

packages/core/src/notifications/notification-service.ts
  CreateNotificationInput, INotificationService { notify(input): Promise<void>|void }
  Injected as c.get("notificationService")

Concrete implementations in apps/api/src/:
  shared/d1-activity-logger.ts        -- D1ActivityLogger implements IActivityLogger
  shared/in-memory-activity-logger.ts -- InMemoryActivityLogger (test only)
  shared/d1-activity-log.repository.ts
  shared/d1-notification.repository.ts
  shared/background-notification-service.ts
  shared/in-memory-notification-service.ts
  middleware/observability.middleware.ts  -- injects activityLogger and notificationService

Middleware registration order in factory.ts (already in place):
  1. repositoryMiddleware      (ContentRepository, MediaRepository, IdempotencyRepository,
                                SystemStatsRepository, IUserRepository, ISessionRepository,
                                IPasswordResetTokenRepository, IActivityLogRepository,
                                INotificationRepository)
  2. storageMiddleware         (BeechBucket)
  3. authProvidersMiddleware   (IHashProvider, ITokenService)
  4. rateLimiterMiddleware     (IRateLimiterRegistry)
  5. observabilityMiddleware   (IActivityLogger, INotificationService)

Deleted in Phase 2:
  apps/api/src/shared/activity-logger.ts   -- old free function, removed
  apps/api/src/shared/notification-service.ts -- old free function, removed

==========================================================================
SECTION 2 — INTERFACES ALREADY IN PRODUCTION (pre-Phase 1)
==========================================================================

ContentRepository (packages/core/src/content.repository.ts):
  Injected as c.get("repository")

MediaRepository (packages/core/src/media.repository.ts):
  Injected as c.get("mediaRepository")

IdempotencyRepository (packages/core/src/idempotency.repository.ts):
  Injected as c.get("idempotencyRepository")

SystemStatsRepository:
  Injected via repositoryMiddleware

BeechBucket (packages/core/src/storage.ts):
  put, get, delete, head, getUrl, getTotalSize, list
  Injected as c.get("bucket")

EmailProvider (apps/api/src/features/email/email.provider.ts):
  Consumed internally by email.service.ts only. Never inject via middleware.

sha256hex (packages/core/src/policies.ts):
  Import directly from @beechcms/core wherever needed.

==========================================================================
SECTION 3 — CURRENT STATE OF PHASE 3 TARGETS
==========================================================================

apps/api/src/widget.ts  (PRIMARY TARGET — full rewrite of data access layer)

  This file is a single Hono app with 5 route handlers, each building SQL directly
  against c.env.DB. The SQL construction is split across several private helpers
  defined at the top of the same file:

  timeWindowSql(window): string
    Returns a D1-compatible WHERE clause fragment for the given TimeWindow.

  previousWindowSql(window): { current: string, previous: string }
    Returns two WHERE clause fragments for growth comparison (current vs previous period).

  resolveColumnExpr(seed, alias): string
    Validates an alias against seed.branches or a SYSTEM_COLUMNS set,
    returns the raw alias to use in SQL. Used to prevent column injection.

  buildAggregateExpr(seed, formula): string
    Translates an AggregateFormula discriminated union into a SQL expression string
    (e.g., op:"sum", column:"price" becomes SUM(CAST(price AS REAL))).

  parseFormula(raw): AggregateFormula | null
    JSON.parses query string value, returns null on failure.

  parseWindow(raw): TimeWindow
    Returns the raw string if it matches the TimeWindow union, defaults to "all".

  The 5 routes:
    GET /aggregate/:seed   -- single SELECT with buildAggregateExpr
    GET /growth/:seed      -- two parallel SELECTs with previousWindowSql
    GET /leaderboard/:seed -- ORDER BY scoreExpr DESC LIMIT ?
    GET /list/:seed        -- paginated SELECT with optional search + filters + sort
    GET /timeseries/:seed  -- GROUP BY date bucket expression

  Problems:
  - All 5 routes call c.env.DB.prepare(...) directly. Not testable without D1.
  - The "list" route duplicates the pagination and filter logic already present
    in ContentRepository.findMany but reimplements it in isolation.
  - SQL injection surface: buildAggregateExpr and resolveColumnExpr validate
    against the Seed but use raw string interpolation for aliases and SQL keywords
    (e.g., ORDER BY scoreExpr orderDir — orderDir is validated to "ASC"/"DESC" but
    still interpolated). D1WidgetRepository must use only ? placeholders and
    bind all values; SQL keywords like ORDER directions must be hardcoded branches,
    not interpolated strings.

apps/api/src/search.ts  (SECONDARY TARGET — inline DB call, no repository)

  This file contains a single searchRouter Hono app with one route GET /:
  - It calls buildFtsQuery (a pure function in search-utils.ts) to produce
    the SQL string and bindings array.
  - It then calls c.env.DB.prepare(sql).bind(...binds).all() and
    c.env.DB.prepare(countSql).bind(...countBinds).first() directly.
  - No repository. Not testable without D1 and FTS tables.

apps/api/src/features/stats/stats.handler.ts  (TERTIARY TARGET — analytics inline SQL)

  After Phase 2, the activity log SELECT was moved to IActivityLogRepository.
  However, this handler still contains inline SQL for the analytics counters
  (reading from the analytics table) instead of using IAnalyticsRepository.
  This will be resolved in Step 3 of Phase 3 below.

The analytics recording middleware in apps/api/src/factory.ts:
  Lines ~175-198 contain: INSERT INTO analytics ON CONFLICT DO UPDATE inline,
  using c.executionCtx.waitUntil directly. No repository. This too will be
  moved to IAnalyticsRepository in Step 3.

==========================================================================
SECTION 4 — INTERFACES TO BUILD IN PHASE 3
==========================================================================

IWidgetRepository (packages/core/src/widget/widget.repository.ts):

  AggregateFormula (discriminated union — same shape as the private type in widget.ts):
    | { op: "count" }
    | { op: "sum" | "avg" | "min" | "max"; column: string }
    | { op: "countWhere"; column: string; value: unknown }
    | { op: "percentageOf"; numeratorColumn: string; denominatorColumn: string }

  TimeWindow = "week" | "month" | "year" | "all"

  LeaderboardEntry { id: string; label: string; score: number | string }

  LeaderboardOptions {
    scoreColumn: string
    limit: number
    orderDirection: "ASC" | "DESC"
  }

  TimeseriesPoint { label: string; value: number }

  WidgetListOptions {
    limit: number
    offset: number
    search?: string
    filters?: Array<{ column: string; op: string; value: unknown }>
    orderByColumn?: string
    orderDirection?: "ASC" | "DESC"
  }

  WidgetListResult {
    entries: Array<Record<string, unknown>>   -- raw data, caller deserialises
    totalCount: number
  }

  GrowthResult {
    currentValue: number
    previousValue: number
  }

  IWidgetRepository {
    aggregate(seed: Seed, formula: AggregateFormula, window: TimeWindow): Promise<number>
      -- JSDoc: Returns the formula result for the given time window. Always returns a
         number; implementations must return 0 when the query produces no rows.

    growth(seed: Seed, formula: AggregateFormula, window: TimeWindow): Promise<GrowthResult>
      -- JSDoc: Evaluates the formula twice — once for the current window period and once
         for the equivalent previous period — to support trend calculations.
         Implementations must return { currentValue: 0, previousValue: 0 } on empty results.

    leaderboard(seed: Seed, options: LeaderboardOptions): Promise<LeaderboardEntry[]>
      -- JSDoc: Returns entries sorted by scoreColumn, excluding nulls. label resolves
         from seed.displayNameAlias; falls back to id when not set.

    list(seed: Seed, options: WidgetListOptions): Promise<WidgetListResult>
      -- JSDoc: Paginated read of content entries. Filters and search are applied server-side.
         The caller is responsible for deserialising branch values from the raw Record.

    timeseries(
      seed: Seed,
      formula: AggregateFormula,
      window: TimeWindow,
      groupColumn: string
    ): Promise<TimeseriesPoint[]>
      -- JSDoc: Groups entries by a date bucket derived from groupColumn and aggregates
         the formula. Days with no entries are omitted (no zero-fill). Points are ordered
         ascending by label.
  }

ISearchRepository (packages/core/src/search/search.repository.ts):

  SearchQueryOptions {
    queryText: string
    schemaSlug: string | null
    statusFilter: string | null
    limit: number
    cursor: string | null
  }

  SearchResultRow {
    entryId: string
    schemaSlug: string
    slug: string | null
    status: string
    title: string | null
    excerpt: string
    rank: number
  }

  SearchCountResult {
    total: number
  }

  ISearchRepository {
    search(options: SearchQueryOptions, seeds: Seed[]): Promise<SearchResultRow[]>
      -- JSDoc: Executes a UNION ALL full-text search across all FTS-enabled seed tables.
         Returns at most options.limit + 1 rows so the caller can detect hasMore
         without a separate count query for the cursor case.
         Implementations must propagate the EMPTY_QUERY error thrown by buildFtsQuery
         so the route handler can return an empty result set rather than a 500.

    count(options: Omit<SearchQueryOptions, "limit" | "cursor">, seeds: Seed[]): Promise<SearchCountResult>
      -- JSDoc: Runs the count variant of the FTS query to support the total field in
         the search response. Called in parallel with search() by the route handler.
  }

IAnalyticsRepository (packages/core/src/observability/analytics.repository.ts):

  AnalyticsMetric = "requests" | "visitors"

  IAnalyticsRepository {
    recordRequest(seedSlug: string, dayTimestamp: number): Promise<void>
      -- JSDoc: Upserts a request counter for the given seed and day bucket.
         dayTimestamp must be a Unix timestamp truncated to midnight UTC.
         Implementations must use INSERT ... ON CONFLICT DO UPDATE to be idempotent.

    sumByMetric(
      metric: AnalyticsMetric,
      seedSlug: string,
      sinceTimestamp: number
    ): Promise<number>
      -- JSDoc: Returns the total count for the given metric since sinceTimestamp.
         Used by stats handler for total requests and visitor counts.

    groupByMetric(
      seedSlug: string,
      sinceTimestamp: number
    ): Promise<Record<string, number>>
      -- JSDoc: Returns a map of date strings to request counts, used by the
         stats handler to render the sparkline / chart data.
  }

==========================================================================
SECTION 5 — EXISTING PURE HELPERS TO REUSE (do not rewrite these)
==========================================================================

apps/api/src/search-utils.ts exports:
  buildFtsQuery(params, seeds): { sql, binds, countSql, countBinds }
    -- Pure function. Takes SearchQueryParams and Seed[]. Throws Error("EMPTY_QUERY")
       when the query text produces no FTS terms. D1SearchRepository will call this
       directly before executing the prepared statements.
  encodeCursor(rank, entryId): string
  decodeCursor(cursor): { rank, entryId } | null
  mapFtsRow(row: FtsRow): SearchResultItem
    -- Maps a raw D1 row to a SearchResultItem. D1SearchRepository returns raw rows;
       the calling handler is responsible for calling mapFtsRow on each result.
  FtsRow interface (the raw D1 row type)
  SearchResultItem interface (the mapped output type)
  SearchQueryParams interface (used as input to buildFtsQuery)

These helpers are pure (no D1 access). Keep them in search-utils.ts unchanged.
D1SearchRepository imports them; the route handler imports only D1SearchRepository.

==========================================================================
SECTION 6 — INTERFACES TO BE BUILT IN FUTURE PHASES (use now, implement later)
==========================================================================

IClock (Phase 4 -- §4.6 of abstraction-report.md):
  now(): number (milliseconds)
  nowSeconds(): number (seconds)
  When Phase 3 code calls Date.now() or Math.floor(Date.now() / 1000), add:
  -- TODO Phase 4: replace with c.get("clock").now() once IClock is injected

IIdGenerator (Phase 4 -- §4.5):
  uuid(): string
  When Phase 3 code calls crypto.randomUUID(), add:
  -- TODO Phase 4: replace with c.get("idGenerator").uuid() for deterministic tests

==========================================================================
SECTION 7 — GOLD STANDARD PATTERN (same rules as phases 1 and 2)
==========================================================================

Every new abstraction replicates the email module structure:

  domain/
    *.repository.ts  or  *.service.ts   -- formal interface (the contract)
    implementations exist in apps/api/src/shared/

Rules (unchanged from prior phases):
1. One interface per contract. No abstract base classes.
2. Concrete implementations in dedicated files under apps/api/src/shared/.
3. Zero Hono/HTTP coupling inside D1* classes.
4. All SQL uses ? placeholders and .bind(...). No string interpolation of user values.
   SQL keywords like ORDER BY direction must be hardcoded conditional branches
   (if orderDirection === "DESC" ... else ...), never interpolated from a variable.
5. snake_case DB columns map to camelCase TypeScript properties on read.
6. D1Database accessed only in D1* files.

==========================================================================
SECTION 8 — CODE QUALITY CONVENTIONS (non-negotiable, same as prior phases)
==========================================================================

NAMING:
  Full descriptive English words. Zero abbreviations.
    BAD:  aggExpr, wSql, prevWin, colExpr, seedSlug
    GOOD: aggregateExpression, windowSqlFragment, previousWindowFilter,
          columnExpression, contentTypeSlug

  Constants: SCREAMING_SNAKE_CASE.
    BAD:  MAX_LIM, DEF_LIMIT
    GOOD: MAXIMUM_LIST_LIMIT, DEFAULT_PAGE_SIZE

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

SQL safety rules (stricter in Phase 3 due to dynamic query building):
  - Column aliases from user input must be validated against seed.branches or
    SYSTEM_COLUMNS before being used in SQL. Validation logic lives in
    D1WidgetRepository, not in the route handler.
  - The only dynamic SQL segments allowed without ? binding are:
    table names (derived from seed.slug — never from user input),
    SQL keywords (COUNT, SUM, etc. — selected by switch/case on validated enums),
    ORDER BY direction (hardcoded "ASC" or "DESC" branches, never a variable).
  - ALL user-supplied values (search terms, filter values, limit, offset)
    must be passed via .bind(...).

==========================================================================
SECTION 9 — YOUR OPERATING RULES
==========================================================================

1. Work ONE step at a time. Never start step N+1 before the user confirms step N.

2. Before writing any file, state:
   - FILES TO CREATE: list with full paths
   - FILES TO MODIFY: list with full paths and one-line change description
   - FILES TO DELETE: list (if any)

3. After writing each file, stop and ask: "Ready for the next file?"

4. When a Phase 3 file needs something from a future phase, use the interface name
   and add a TODO comment (Section 6). Do not fall back to inline Date.now() without a TODO.

5. Never touch files not listed in the current step.

==========================================================================
SECTION 10 — CURRENT TASK: PHASE 3 — WIDGET, SEARCH, AND ANALYTICS REPOSITORIES
==========================================================================

Execute the following steps in order.

--------------------------------------------------------------------------
PHASE 3 — STEP 1: IWidgetRepository interface in packages/core
--------------------------------------------------------------------------

FILES TO CREATE:

  packages/core/src/widget/widget.repository.ts
    Defines all types listed in Section 4 under IWidgetRepository:
      AggregateFormula (discriminated union)
      TimeWindow
      LeaderboardEntry
      LeaderboardOptions
      TimeseriesPoint
      WidgetListOptions
      WidgetListResult
      GrowthResult
      IWidgetRepository (5 methods with JSDoc)

    Important notes on the interface design:
    - LeaderboardOptions uses orderDirection: "ASC" | "DESC" (not a raw string).
      This forces implementations to branch on a safe enum rather than interpolating.
    - WidgetListOptions.filters uses op: string (validated later by implementations
      against a known set of operators).
    - list() returns raw Record<string, unknown> entries — callers call
      deserializeFromDb themselves. The repository must NOT import or call
      deserializeFromDb; that remains the route handler's responsibility.

FILES TO MODIFY:
  packages/core/src/index.ts
    Export IWidgetRepository and all associated types.

--------------------------------------------------------------------------
PHASE 3 — STEP 2: D1WidgetRepository
--------------------------------------------------------------------------

FILES TO CREATE:

  apps/api/src/shared/d1-widget.repository.ts
    D1WidgetRepository implements IWidgetRepository.
    Constructor: (db: D1Database)

    Internal private helpers (all defined as private methods or module-scope functions):

      resolveColumnExpression(seed: Seed, alias: string): string
        Checks against a SYSTEM_COLUMNS Set (same set as widget.ts).
        Validates alias against seed.branches. Throws Error("UNSAFE_COLUMN") if not found.
        Returns the alias as-is if valid (D1 JSON extract handles mapping internally).
        JSDoc: throws UNSAFE_COLUMN if the alias is not in seed branches or system columns,
        preventing SQL injection via column names.

      buildAggregateExpression(seed: Seed, formula: AggregateFormula): string
        Switch on formula.op. Calls resolveColumnExpression for any column alias.
        Returns a SQL expression string (not a full query — just the SELECT expression).
        This is the only place in D1WidgetRepository where SQL strings are built
        by concatenation; all parts are validated or hardcoded SQL keywords.

      buildTimeWindowFilter(window: TimeWindow): string
        Returns a SQL fragment for the WHERE clause.
        case "week":  return "created_at > unixepoch('now', '-7 days')"
        case "month": return "created_at > unixepoch('now', '-1 month')"
        case "year":  return "created_at > unixepoch('now', '-1 year')"
        case "all":   return "1=1"

      buildPreviousWindowFilter(window: TimeWindow): { currentFilter: string; previousFilter: string }
        Returns two fragments for the growth query.

    Method implementations:

      aggregate(seed, formula, window):
        SELECT {aggregateExpression} as computed_value FROM content_{seed.slug}
        WHERE {timeWindowFilter}
        No bindings needed (no user values in this query; all are validated expressions).
        Return row.computed_value ?? 0.

      growth(seed, formula, window):
        Two parallel DB.prepare calls using Promise.all.
        Each uses the same aggregateExpression with its respective window filter.
        Return { currentValue, previousValue }.

      leaderboard(seed, options):
        Validate options.scoreColumn via resolveColumnExpression.
        Resolve label column from seed.displayNameAlias.
        Build: SELECT id, {labelColumn} as label, {scoreColumn} as score
               FROM content_{seed.slug}
               WHERE {scoreColumn} IS NOT NULL
               ORDER BY CAST({scoreColumn} AS REAL) {ASC or DESC — hardcoded branch}
               LIMIT ?
        Bind only options.limit via .bind(options.limit).
        Return mapped array.

      list(seed, options):
        Validate options.orderByColumn via resolveColumnExpression if provided.
        Build the WHERE clause incrementally using guard clauses and an array of
        SQL fragments + bindings array.
        For each filter, validate op against ALLOWED_FILTER_OPERATORS Set
        (eq, neq, like, gt, lt). Skip silently if op unknown.
        Validate filter.column via resolveColumnExpression; skip if UNSAFE_COLUMN thrown.
        Paginate with LIMIT ? OFFSET ? — always the last two bindings.
        Run count and data queries in parallel with Promise.all.
        Return { entries: rows, totalCount }.
        NOTE: do NOT call deserializeFromDb here. Return raw rows.

      timeseries(seed, formula, window, groupColumn):
        Validate groupColumn via resolveColumnExpression.
        Build date bucket expression:
          if groupColumn === "created_at": use strftime('%Y-%m-%d', groupColumn, 'unixepoch')
          otherwise: use strftime('%Y-%m-%d', CAST({groupColumn} AS INTEGER), 'unixepoch')
        Build: SELECT {dateBucketExpression} as bucket_label, {aggregateExpression} as bucket_value
               FROM content_{seed.slug}
               WHERE {timeWindowFilter}
               GROUP BY bucket_label
               ORDER BY bucket_label ASC
        Return mapped array.

FILES TO MODIFY:
  apps/api/src/types.ts
    Add widgetRepository: IWidgetRepository to AppEnv Variables.

  apps/api/src/middleware/repository.middleware.ts
    Instantiate D1WidgetRepository and inject via c.set("widgetRepository").

--------------------------------------------------------------------------
PHASE 3 — STEP 3: Migrate widget.ts route handlers to use IWidgetRepository
--------------------------------------------------------------------------

Goal: remove all c.env.DB.prepare calls from widget.ts. The private helper
functions (timeWindowSql, buildAggregateExpr, etc.) become dead code and must
be deleted. The route handlers keep their query-string parsing, seed validation,
and response shaping logic.

FILES TO MODIFY:

  apps/api/src/widget.ts
    Delete all private helper functions at the top of the file.
    Retain parseFormula and parseWindow (they parse query string params,
    not D1 interactions — they are still needed by the route handlers).
    Retain the discriminated union type definitions for AggregateFormula and TimeWindow
    ONLY if they are not yet importable from @beechcms/core. Once Step 1 exports
    them, replace the local definitions with imports.

    Route changes:

    GET /aggregate/:seed
      const result = await context.get("widgetRepository")
                           .aggregate(seed, formula, window)
      return context.json({ value: result, window })

    GET /growth/:seed
      const { currentValue, previousValue } = await context.get("widgetRepository")
                                                   .growth(seed, formula, window)
      Compute percentageChange and trend here in the handler (pure arithmetic,
      no D1 needed — stays in the handler as it was before).
      return context.json({ current: currentValue, previous: previousValue,
                            percentageChange, trend })

    GET /leaderboard/:seed
      const entries = await context.get("widgetRepository")
                           .leaderboard(seed, { scoreColumn, limit, orderDirection })
      return context.json(entries)

    GET /list/:seed
      Parse query string params as before.
      const { entries, totalCount } = await context.get("widgetRepository")
                                           .list(seed, { limit, offset, search, filters,
                                                         orderByColumn, orderDirection })
      Call deserializeFromDb on each entry here in the handler (as it did before).
      return context.json({ entries: deserializedEntries, total: totalCount })

    GET /timeseries/:seed
      const points = await context.get("widgetRepository")
                          .timeseries(seed, formula, window, groupColumn)
      return context.json(points)

    After migration: widget.ts must contain zero c.env.DB references.

--------------------------------------------------------------------------
PHASE 3 — STEP 4: ISearchRepository interface and D1SearchRepository
--------------------------------------------------------------------------

FILES TO CREATE:

  packages/core/src/search/search.repository.ts
    Defines SearchQueryOptions, SearchResultRow, SearchCountResult, ISearchRepository.
    JSDoc on search(): explain the limit+1 pattern for cursor detection.
    JSDoc on count(): explain it is called in parallel with search() and must
    use the same filter inputs but without limit or cursor.
    ISearchRepository must NOT import from search-utils.ts — that is an
    implementation detail of D1SearchRepository, not part of the contract.

  apps/api/src/shared/d1-search.repository.ts
    D1SearchRepository implements ISearchRepository.
    Constructor: (db: D1Database)

    search(options, seeds):
      Call buildFtsQuery with the options mapped to SearchQueryParams.
      If buildFtsQuery throws Error("EMPTY_QUERY"), return [] immediately.
      Execute db.prepare(sql).bind(...binds).all<FtsRow>().
      Return results.results ?? [].
      NOTE: returns raw FtsRow[], not SearchResultItem[]. The route handler
      calls mapFtsRow on each result. Do not call mapFtsRow here.

    count(options, seeds):
      Call buildFtsQuery with limit: 0 and cursor: null to get countSql/countBinds.
      If buildFtsQuery throws Error("EMPTY_QUERY"), return { total: 0 }.
      Execute db.prepare(countSql).bind(...countBinds).first<{ total: number }>().
      Return { total: result?.total ?? 0 }.

FILES TO MODIFY:

  packages/core/src/index.ts
    Export ISearchRepository, SearchQueryOptions, SearchResultRow, SearchCountResult.

  apps/api/src/types.ts
    Add searchRepository: ISearchRepository to AppEnv Variables.

  apps/api/src/middleware/repository.middleware.ts
    Instantiate D1SearchRepository and inject via c.set("searchRepository").

  apps/api/src/search.ts
    Replace the two direct c.env.DB.prepare calls with:
      const [rawRows, countResult] = await Promise.all([
        context.get("searchRepository").search(queryOptions, seeds),
        context.get("searchRepository").count(queryOptions, seeds),
      ])
    Keep mapFtsRow and encodeCursor calls in the handler (they are pure functions).
    After migration: search.ts must contain zero c.env.DB references.

--------------------------------------------------------------------------
PHASE 3 — STEP 5: IAnalyticsRepository interface in packages/core
--------------------------------------------------------------------------

FILES TO CREATE:

  packages/core/src/observability/analytics.repository.ts
    Defines AnalyticsMetric, IAnalyticsRepository (3 methods as in Section 4).
    JSDoc on recordRequest(): explain the idempotent upsert requirement.
    JSDoc on sumByMetric(): explain it aggregates the metric column, not just row count.
    JSDoc on groupByMetric(): explain it returns a date-string keyed map suitable
    for chart rendering without further transformation.

FILES TO MODIFY:

  packages/core/src/index.ts
    Export IAnalyticsRepository, AnalyticsMetric.

--------------------------------------------------------------------------
PHASE 3 — STEP 6: D1AnalyticsRepository
--------------------------------------------------------------------------

FILES TO CREATE:

  apps/api/src/shared/d1-analytics.repository.ts
    D1AnalyticsRepository implements IAnalyticsRepository.
    Constructor: (db: D1Database)

    recordRequest(seedSlug, dayTimestamp):
      INSERT INTO analytics (seed, day, requests, visitors)
      VALUES (?, ?, 1, 1)
      ON CONFLICT(seed, day) DO UPDATE SET requests = requests + 1
      Bind: seedSlug, dayTimestamp.
      -- TODO Phase 4: replace Date.now() with IClock.now() for deterministic tests

    sumByMetric(metric, seedSlug, sinceTimestamp):
      SELECT SUM({metric column}) as total
      FROM analytics
      WHERE seed = ? AND day >= ?
      metric "requests" maps to the requests column; "visitors" maps to the visitors column.
      The column name is selected by a switch statement on the metric enum, not interpolated.
      Bind: seedSlug, sinceTimestamp.
      Return result?.total ?? 0.

    groupByMetric(seedSlug, sinceTimestamp):
      SELECT strftime('%Y-%m-%d', day, 'unixepoch') as date_label, SUM(requests) as daily_count
      FROM analytics
      WHERE seed = ? AND day >= ?
      GROUP BY date_label
      ORDER BY date_label ASC
      Bind: seedSlug, sinceTimestamp.
      Build and return a Record<string, number> from the rows.

FILES TO MODIFY:

  apps/api/src/types.ts
    Add analyticsRepository: IAnalyticsRepository to AppEnv Variables.

  apps/api/src/middleware/repository.middleware.ts
    Instantiate D1AnalyticsRepository and inject via c.set("analyticsRepository").

--------------------------------------------------------------------------
PHASE 3 — STEP 7: Migrate analytics recording middleware and stats handler
--------------------------------------------------------------------------

Goal: remove all inline SQL from the analytics middleware in factory.ts
and from the stats handler.

FILES TO MODIFY:

  apps/api/src/factory.ts
    Locate the analytics middleware block (lines ~175-198).
    Replace the inline INSERT INTO analytics ... ON CONFLICT with:
      const analyticsRepo = context.get("analyticsRepository")
      const currentDayTimestamp = Math.floor(Date.now() / 1000 / 86400) * 86400
      // TODO Phase 4: replace Date.now() with IClock.now() for deterministic tests
      context.executionCtx.waitUntil(
        analyticsRepo.recordRequest(seedSlug, currentDayTimestamp)
      )
    NOTE: analyticsRepository must already be available in context at this point.
    Ensure repositoryMiddleware runs before this analytics middleware in factory.ts.

  apps/api/src/features/stats/stats.handler.ts
    Replace every inline SELECT on the analytics table with calls to
    context.get("analyticsRepository"):
      sumByMetric for request totals and visitor totals
      groupByMetric for the chart data
    After migration: stats.handler.ts must contain zero c.env.DB.prepare references
    for the analytics table.

==========================================================================
SECTION 11 — PHASE 3 COMPLETION CHECKLIST
==========================================================================

Before marking Phase 3 complete, verify every produced file:

  [x] No abbreviations in names
  [x] JSDoc on every exported interface method (WHY, not the obvious WHAT)
  [x] No ifs nested beyond 2 levels — guard clauses used
  [x] No 3+ inline && chains — extracted to named booleans
  [x] No chained ternary expressions
  [x] Magic numbers are named constants at top of file
  [x] widget.ts contains zero c.env.DB references after Step 3
  [x] search.ts contains zero c.env.DB references after Step 4
  [x] factory.ts analytics block contains zero inline SQL after Step 7
  [x] stats.handler.ts contains zero inline SQL for analytics after Step 7
  [x] All SQL uses ? placeholders; ORDER BY direction uses hardcoded branches
  [x] Column aliases from user input validated via resolveColumnExpression before SQL use
  [x] D1Database accessed only in D1* files
  [x] buildFtsQuery, encodeCursor, decodeCursor, mapFtsRow unchanged in search-utils.ts
  [x] deserializeFromDb called by route handlers, not by D1WidgetRepository
  [x] Future-phase items (IClock, IIdGenerator) referenced via TODO comments

Begin with Step 1. List the files you will create and modify, then proceed file by file.
After each file, stop and ask: "Ready for the next file?"
