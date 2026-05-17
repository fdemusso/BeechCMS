You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

Do NOT explore the codebase further. All relevant context is provided in this
prompt. Read it fully before writing any code.

This sprint covers **Sprint 2 of the Automations Engine milestone**:
implementing the Cloudflare `scheduled` handler that fires cron-triggered
automations every minute. It depends ONLY on the contracts from Sprint 0
(`IAutomationRunner`, `IAutomationRepository`) — it is fully decoupled from
Sprint 1's `AutomationRunner` and from the future `D1AutomationRepository`
CRUD (#54). Both are injected at the Worker entry point.

The project is in **beta** — DB used only for testing. Migrations can be
rewritten freely.

### Stack

- API: Hono on Cloudflare Workers, D1 (SQLite), R2
- Dashboard: React + TanStack Query + axios
- Shared package: @beechcms/core (pure TypeScript, zero HTTP/cloud deps)
- Monorepo: Turborepo

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS
==========================================================================

Sprint 0 delivered the contracts and the DB schema (table `automations`
allows `trigger_event = 'cron'` with a `trigger_cron` column). Sprint 1
delivered the real `AutomationRunner` and wired it to CRUD handlers via
`waitUntil`. Cron-triggered automations are still inert because the Worker
has no `scheduled` export.

This sprint adds two things:

1. A `[triggers] crons = ["* * * * *"]` declaration in `wrangler.jsonc`.
2. A `scheduled` export on the Worker entry point that, every minute,
   selects active cron automations whose expression matches the current
   tick and dispatches each one to `IAutomationRunner.run(...)` for every
   entry that matches its `trigger_conditions`.

### Why a catch-all `* * * * *` cron

Cloudflare Workers does not natively evaluate arbitrary cron expressions
at scheduling time — it only fires the Worker at fixed intervals. The
standard pattern is to schedule the Worker every minute and perform the
matching **inside** the handler. The cost is negligible: the handler runs
a single indexed D1 query and exits immediately if no automations match
the current minute.

### Why cron automations fetch entries

Unlike CRUD-driven triggers (the entry is already known), a cron
automation must decide **which entries to act on**. The handler applies
each automation's `trigger_conditions` as filters on the seed table using
the existing `buildSelectQuery` utility from `@beechcms/core` — the same
query builder used by the content list endpoint. No new query logic is
introduced.

VSA rule reminder: the `scheduled` handler lives in the automations
slice. It imports `IAutomationRunner` / `IAutomationRepository` from
`@beechcms/core`; concrete implementations are injected at the entry
point in `apps/api/src/index.ts`.

==========================================================================
SECTION 2 — CURRENT STATE (verified, do not re-explore)
==========================================================================

2.1 CONTRACTS — packages/core/src/ (delivered by Sprint 0)

  `automations.types.ts`            → `Automation`, `AutomationAction`,
                                       `TriggerCondition`,
                                       `AutomationTriggerEvent`
                                       (`'create'|'update'|'delete'|'cron'`)
  `automations.runner.interface.ts` → `IAutomationRunner`,
                                       `AutomationEventPayload`
  `automations.repository.interface.ts` → `IAutomationRepository`
                                       (`list`, `findById`, `create`,
                                       `update`, `toggle`, `delete`,
                                       `findActive`)
  `automations.runner.stub.ts`      → `NoOpAutomationRunner`

  Verified signature of `findActive`:
    `findActive(seedSlug: string, event: AutomationTriggerEvent): Promise<Automation[]>`

  For cron the handler passes the literal string `'*'` as `seedSlug` to
  mean "all seeds". The current `D1AutomationRepository` (stub from
  Sprint 1 in `apps/api/src/shared/automations.repository.d1.ts`)
  implements only `findActive(seedSlug, event)` with an exact-match
  WHERE clause — this sprint MUST extend that one method to honour
  `'*'` (Section 4.4). All other CRUD methods stay as `throw new Error('not implemented')`
  until #54.

2.2 RUNNER — apps/api/src/features/automations/ (delivered by Sprint 1)

  `automation-runner.ts`         → `AutomationRunner` class implementing
                                    `IAutomationRunner`; constructor takes
                                    `AutomationRunnerDeps` (no `D1Database`).
  `automation-runner.utils.ts`   → `evaluateConditions`, `interpolate`.
  `action-executors/`            → `webhook`, `send_mail`, `edit_field`,
                                    `create_entry` (+ dispatcher
                                    `executeAction`).
  `index.ts` (barrel)            → exports `AutomationRunner`,
                                    `AutomationRunnerDeps`.

  The runner's `run()` already calls `evaluateConditions(automation.trigger_conditions, entry)`
  for every action. The cron handler does NOT need to re-evaluate
  conditions itself for the matching — it only needs to fetch the
  entries that match. The runner re-checks per-entry and skips
  non-matching rows. This duplication is intentional: it lets the runner
  remain the single source of truth for condition semantics, while the
  cron handler reuses the existing `buildSelectQuery` to avoid scanning
  the full table.

2.3 D1 SCHEMA — apps/api/migrations/0029_automations.sql

  Table `automations` (created in Sprint 0):
    id TEXT PK, seed_slug TEXT NOT NULL, name TEXT NOT NULL,
    enabled INTEGER NOT NULL, trigger_event TEXT CHECK IN
    ('create','update','delete','cron'), trigger_cron TEXT NULL,
    trigger_conditions TEXT NULL (JSON), actions TEXT NOT NULL (JSON),
    created_at INTEGER, updated_at INTEGER

  Indexes: `idx_automations_seed_slug`, `idx_automations_enabled`.

  No migration changes are required by this sprint.

2.4 WORKER ENTRY — apps/api/src/index.ts

  Current shape (verified):

  ```ts
  import { createBeechApp } from './factory'
  let seeds: any = []
  try {
    const mod = await import('../seed.ts')
    const registry = mod.default || mod.SEED_REGISTRY || mod
    seeds = (typeof registry === 'object' && !Array.isArray(registry))
      ? Object.values(registry)
      : registry
  } catch (e) {}
  const app = createBeechApp({ seeds })
  app.get('/', (c) => c.text('Beech API is running (Local Dev Mode)'))
  export default app
  ```

  `export default app` works because Hono apps satisfy
  `ExportedHandler<Env>['fetch']` shape. To add a `scheduled` handler the
  default export must become `{ fetch: app.fetch, scheduled }`. This is
  the canonical Cloudflare pattern and breaks no existing route.

  `createBeechApp(config: BeechConfig)` returns a `Hono` instance and
  exposes nothing else. The cron handler instantiates its dependencies
  directly from `env` and from `@beechcms/core`'s `seedRegistry` (built
  from `config.seeds`).

2.5 wrangler.jsonc

  Current file already declares D1 binding `DB`, R2 `MEDIA_BUCKET`, rate
  limiters, and `compatibility_flags: ["nodejs_compat"]`. There is no
  `triggers` object yet. This sprint adds it.

2.6 EXECUTION MODEL

  Cloudflare Workers terminate as soon as the handler returns. For the
  `scheduled` handler, `event.scheduledTime` is a Unix millisecond
  timestamp passed by the platform. Wrap the work in
  `ctx.waitUntil(promise)` so the Worker stays alive until processing
  finishes. The local dev runner (`wrangler dev --test-scheduled`)
  exposes `GET /__scheduled?cron=*+*+*+*+*` for manual triggering.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Single PR. Order matters only within a file; files are independent.

  Task 1 — `wrangler.jsonc`: add `triggers.crons = ["* * * * *"]`.

  Task 2 — Pure utility
           `apps/api/src/features/automations/cron-runner.utils.ts`
           (`cronMatches(expression, scheduledTime)`).

  Task 3 — Cron handler
           `apps/api/src/features/automations/cron-runner.ts`
           (`runCronAutomations(repo, runner, getSeed, contentRepository, scheduledTime)`).

  Task 4 — Extend `D1AutomationRepository.findActive` to accept
           `seedSlug === '*'` and return automations across all seeds.

  Task 5 — Public slice barrel
           `apps/api/src/features/automations/index.ts`
           (re-export `runCronAutomations`).

  Task 6 — Worker entry
           `apps/api/src/index.ts` — replace `export default app` with
           `export default { fetch: app.fetch, scheduled }`. Build
           dependencies for the scheduled call using the same factories
           as `repositoryMiddleware`.

  Task 7 — Tests
           `apps/api/src/features/automations/__tests__/`
             cron-runner.utils.test.ts
             cron-runner.test.ts

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

4.1 TASK 1 — wrangler.jsonc

  File: `apps/api/wrangler.jsonc`

  Add a top-level `triggers` object alongside the existing
  `d1_databases`, `r2_buckets`, `ratelimits` blocks:

  ```jsonc
  "triggers": {
    "crons": ["* * * * *"]
  }
  ```

  Place it anywhere in the root object — order does not matter for
  Wrangler. Comma-correctness matters: jsonc is JSON-with-comments, the
  preceding block must end with a comma.

4.2 TASK 2 — Pure utility: cronMatches

  File: `apps/api/src/features/automations/cron-runner.utils.ts`

  ```ts
  /**
   * Returns true if the cron expression is due at the given timestamp.
   *
   * Supported fields (minute, hour, day-of-month, month, day-of-week):
   *   '*'          always matches
   *   integer      exact match
   *   'a,b,c'      list match
   *   'a-b'        range match (inclusive)
   *   '/n'         step (e.g. '* / 15' → every 15 minutes — without
   *                space; written here as '/n' to avoid breaking jsdoc)
   *
   * Anything else (named months, mixed range+step) returns false. This
   * covers every cron expression the Dashboard can produce in #56.
   *
   * All comparisons are in UTC because Cloudflare schedules in UTC.
   */
  export function cronMatches(expression: string | null, scheduledTime: number): boolean {
    if (!expression) return false
    const parts = expression.trim().split(/\s+/)
    if (parts.length !== 5) return false

    const d = new Date(scheduledTime)
    const actual = [
      d.getUTCMinutes(),
      d.getUTCHours(),
      d.getUTCDate(),
      d.getUTCMonth() + 1,
      d.getUTCDay(),
    ] as const

    return parts.every((field, i) => matchField(field, actual[i]))
  }

  function matchField(field: string, value: number): boolean {
    if (field === '*') return true
    // list: "1,3,5"
    if (field.includes(',')) {
      return field.split(',').some((part) => matchField(part, value))
    }
    // step: "*/15" or "5-30/5"
    if (field.includes('/')) {
      const [rangePart, stepPart] = field.split('/')
      const step = Number(stepPart)
      if (!Number.isFinite(step) || step <= 0) return false
      if (rangePart === '*') return value % step === 0
      if (rangePart.includes('-')) {
        const [lo, hi] = rangePart.split('-').map(Number)
        return value >= lo && value <= hi && (value - lo) % step === 0
      }
      return false
    }
    // range: "1-5"
    if (field.includes('-')) {
      const [lo, hi] = field.split('-').map(Number)
      return Number.isFinite(lo) && Number.isFinite(hi) && value >= lo && value <= hi
    }
    // exact integer
    const n = Number(field)
    return Number.isFinite(n) && n === value
  }
  ```

  Pure function, no side effects, independently testable. Day-of-week
  matches Cloudflare convention (0 = Sunday).

4.3 TASK 3 — Cron handler

  File: `apps/api/src/features/automations/cron-runner.ts`

  ```ts
  import type {
    Automation,
    ContentRepository,
    IAutomationRepository,
    IAutomationRunner,
    Seed,
    TriggerCondition,
  } from '@beechcms/core'
  import { cronMatches } from './cron-runner.utils'

  export interface CronRunnerDeps {
    automationRepository: IAutomationRepository
    runner: IAutomationRunner
    contentRepository: ContentRepository
    getSeed: (slug: string) => Seed | null
  }

  /**
   * Entry point for the Cloudflare `scheduled` handler. Fully decoupled
   * from concrete classes — both repository and runner are injected as
   * interfaces, so this function is unit-testable with mocks.
   */
  export async function runCronAutomations(
    deps: CronRunnerDeps,
    scheduledTime: number,
  ): Promise<void> {
    const automations = await deps.automationRepository.findActive('*', 'cron')

    for (const automation of automations) {
      if (!cronMatches(automation.trigger_cron, scheduledTime)) continue

      const seed = deps.getSeed(automation.seed_slug)
      if (!seed) {
        console.warn('[cron] unknown seed', { automationId: automation.id, seedSlug: automation.seed_slug })
        continue
      }

      let entries: Array<Record<string, unknown>> = []
      try {
        entries = await fetchMatchingEntries(deps.contentRepository, seed, automation)
      } catch (err) {
        console.error('[cron] fetch entries failed', { automationId: automation.id, err })
        continue
      }

      for (const entry of entries) {
        try {
          await deps.runner.run({
            seedSlug: automation.seed_slug,
            event: 'cron',
            entry,
          })
        } catch (err) {
          // Per-entry isolation: one bad entry never aborts the rest.
          console.error('[cron] entry processing failed', {
            automationId: automation.id,
            entryId: entry.id,
            err,
          })
        }
      }
    }
  }

  /**
   * Translate `trigger_conditions` into the `filters` shape accepted by
   * `ContentRepository.list`, then list matching entries. The repository
   * already uses `buildSelectQuery` from `@beechcms/core` internally, so
   * the alias→ID translation happens through the Botanical Engine.
   */
  async function fetchMatchingEntries(
    repository: ContentRepository,
    seed: Seed,
    automation: Automation,
  ): Promise<Array<Record<string, unknown>>> {
    const filters = (automation.trigger_conditions ?? []).map(conditionToFilter)
    const result = await repository.list(seed, { filters, status: 'any', limit: 1000, offset: 0 })
    return result.items
  }

  function conditionToFilter(c: TriggerCondition) {
    return { field: c.field, op: c.op, value: c.value }
  }
  ```

  Notes / verification points:

  - `ContentRepository.list` signature: confirm in
    `packages/core/src/content.repository.ts`. The list call above uses
    the shape `(seed, options)` where `options` carries `filters`,
    `status`, `limit`, `offset` — same shape that `buildSelectQuery`
    consumes (already verified in `apps/api/src/shared/content.repository.d1.ts`
    lines 42–46). If the real signature is `(seed, filters, status, …)`
    positional, adapt the call accordingly — do NOT inline a raw SQL
    query in this file.
  - `conditionToFilter` is a one-line passthrough today; it exists so
    Sprint 03 owns the place to evolve the mapping (e.g. when the issue
    spec eventually adds operators that `buildSelectQuery` does not yet
    accept).
  - `status: 'any'` ensures published + draft entries are considered.
    Per-entry status checks belong in user-defined `trigger_conditions`,
    not in the handler.
  - The hard limit of 1000 is intentional: a runaway cron automation
    cannot accidentally enqueue a million entries per minute. If a real
    use-case needs more, surface it as a Sprint 04+ ticket; do not raise
    the limit silently.
  - The handler does NOT pre-evaluate `trigger_conditions` in memory.
    Filtering happens in SQL via `buildSelectQuery`. The runner then
    re-evaluates conditions per-entry (cf. Sprint 1 §4.5), which is
    correct: SQL filtering is a coarse pass, the runner is the
    authoritative gate.

4.4 TASK 4 — Extend D1AutomationRepository.findActive for '*'

  File: `apps/api/src/shared/automations.repository.d1.ts`

  Current implementation matches on `seed_slug = ?` exactly. Update only
  this one method to handle the cron wildcard:

  ```ts
  async findActive(seedSlug: string, event: AutomationTriggerEvent): Promise<Automation[]> {
    const result = seedSlug === '*'
      ? await this.db
          .prepare(`SELECT * FROM automations WHERE trigger_event = ? AND enabled = 1`)
          .bind(event)
          .all<AutomationRow>()
      : await this.db
          .prepare(`SELECT * FROM automations WHERE seed_slug = ? AND trigger_event = ? AND enabled = 1`)
          .bind(seedSlug, event)
          .all<AutomationRow>()
    return (result.results ?? []).map(rowToAutomation)
  }
  ```

  No other method in `D1AutomationRepository` changes. The CRUD methods
  remain as `throw new Error('not implemented in sprint 08')` placeholders
  until #54.

4.5 TASK 5 — Slice barrel

  File: `apps/api/src/features/automations/index.ts`

  Append to the existing exports:

  ```ts
  export { runCronAutomations } from './cron-runner'
  export type { CronRunnerDeps } from './cron-runner'
  ```

  Only the cron entry point is exposed. `cronMatches` and the internal
  helpers remain slice-private.

4.6 TASK 6 — Worker entry: add `scheduled` export

  File: `apps/api/src/index.ts`

  Replace the existing `export default app` block. The seed loader
  (top of file) stays untouched.

  ```ts
  import { createBeechApp } from './factory'
  import { seedRegistry } from '@beechcms/core'
  import { runCronAutomations, AutomationRunner } from './features/automations'
  import { D1AutomationRepository } from './shared/automations.repository.d1'
  import { D1ContentRepository } from './shared/content.repository.d1'
  import { SystemIdGenerator } from '@beechcms/core'

  let seeds: any = []
  try {
    // @ts-ignore
    const mod = await import('../seed.ts')
    const registry = mod.default || mod.SEED_REGISTRY || mod
    seeds = (typeof registry === 'object' && !Array.isArray(registry))
      ? Object.values(registry)
      : registry
  } catch (e) {}

  const app = createBeechApp({ seeds })
  app.get('/', (c) => c.text('Beech API is running (Local Dev Mode)'))

  export default {
    fetch: app.fetch,

    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
      const automationRepository = new D1AutomationRepository(env.DB)
      const contentRepository    = new D1ContentRepository(env.DB)
      const idGenerator          = new SystemIdGenerator()
      const getSeed              = (slug: string) => seedRegistry.get(slug) ?? null

      const runner = new AutomationRunner({
        automationRepository,
        contentRepository,
        getSeed,
        idGenerator,
        env: env as unknown as Record<string, string | undefined>,
      })

      ctx.waitUntil(
        runCronAutomations(
          { automationRepository, runner, contentRepository, getSeed },
          event.scheduledTime,
        ),
      )
    },
  } satisfies ExportedHandler<Env>
  ```

  Verification points:

  - `Env` type: confirm it is exported from `apps/api/src/types.ts`
    (sibling of `Variables` — re-export if needed).
  - `seedRegistry`: confirm `@beechcms/core` exposes a registry built
    from the seeds passed to `createBeechApp`. If the registry is
    populated inside `createBeechApp` rather than globally, replicate
    the population step here before instantiating `getSeed` (e.g.
    `seedRegistry.registerMany(seeds)`), then pass the same `getSeed`
    that the HTTP path uses.
  - `D1ContentRepository`: import path matches the one used by
    `repositoryMiddleware`. Reuse the exact same factory; do NOT create
    a parallel repository class.
  - The `scheduled` handler does NOT share the request-scoped context
    used by `fetch`. Repositories must be re-instantiated per tick —
    they are cheap (constructor just stores `env.DB`).
  - During Sprint 03 development the `AutomationRunner` constructed
    here can be temporarily swapped for `NoOpAutomationRunner` (from
    `@beechcms/core`) to test the cron pipeline in isolation. Revert
    to `AutomationRunner` before merging.

  Type safety: the `satisfies ExportedHandler<Env>` clause forces the
  exported shape to conform to Cloudflare's handler contract at compile
  time. Hono's `app.fetch` already matches `ExportedHandlerFetchHandler`.

4.7 TASK 7 — Tests

  File: `apps/api/src/features/automations/__tests__/cron-runner.utils.test.ts`

  Cover `cronMatches` for:
    - `'* * * * *'` matches any timestamp.
    - `null` / empty / malformed (not 5 fields) → `false`.
    - Exact minute/hour: `'0 9 * * *'` matches `2026-05-14T09:00:00Z`
      but not `09:01:00Z`.
    - Day-of-week: `'0 9 * * 1'` matches a Monday, not a Tuesday.
    - List: `'0 9,17 * * *'` matches 09:00 and 17:00 only.
    - Range: `'0 9-11 * * *'` matches 09:00, 10:00, 11:00; not 12:00.
    - Step: `'*/15 * * * *'` matches :00, :15, :30, :45.
    - Range + step: `'5-30/5 * * * *'` matches :05, :10, …, :30.

  File: `apps/api/src/features/automations/__tests__/cron-runner.test.ts`

  Build the `CronRunnerDeps` with hand-rolled stubs:

  - `automationRepository`: returns a fixed list of `Automation`
    objects from `findActive('*', 'cron')`. Assert called with exactly
    those arguments.
  - `runner`: spy that records every `run()` call.
  - `contentRepository.list`: returns a deterministic array.
  - `getSeed`: returns a seed for known slugs, `null` for unknown.

  Scenarios:

  1. Two automations, only one cron matches the tick → runner invoked
     once per matching entry of that one.
  2. One automation, `trigger_conditions` filter → repository.list is
     called with the translated filters (assert the `filters` arg
     shape).
  3. `getSeed` returns `null` for the automation's seed → no runner
     calls, no throw, warning logged.
  4. `runner.run()` throws on entry #2 of 3 → entry #1 and #3 still
     processed; iteration is not aborted.
  5. `repository.list` throws → handler logs and continues to the next
     automation; no rethrow.
  6. Zero active cron automations → handler resolves quietly, no calls
     to `runner.run`.

  Tests use the in-memory stubs only; no D1, no `wrangler`, no fetch.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from repo root after all tasks:

  1. `npm run build` in `packages/core/` — no changes; must still emit
     cleanly.
  2. `npx tsc --noEmit` in `apps/api/` — zero errors. The
     `satisfies ExportedHandler<Env>` clause is the critical type gate.
  3. `npm run test` in `apps/api/` — new tests pass; existing tests
     unaffected (the `scheduled` export is invisible to `app.fetch`-
     based test runners).
  4. `npm run db:reset:local` in `apps/api/` — no migration changes,
     should be a no-op rerun.
  5. `npm run dev` at root — API boots (:8789), Dashboard boots (:5173).
  6. Smoke test (manual cron trigger):

     a. `wrangler d1 execute beech-db --local --command "INSERT INTO automations (id, seed_slug, name, enabled, trigger_event, trigger_cron, trigger_conditions, actions, created_at, updated_at) VALUES ('cron_test_01', 'posts', 'every-minute', 1, 'cron', '* * * * *', NULL, '[{\"type\":\"webhook\",\"url\":\"https://webhook.site/<id>\"}]', unixepoch(), unixepoch())"`
     b. Ensure at least one row exists in the `posts` seed table.
     c. `wrangler dev --test-scheduled` in `apps/api/`.
     d. In another terminal:
        `curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"`
     e. webhook.site receives one POST per `posts` row, within a few
        seconds (`waitUntil`).

  7. Negative smoke: change `trigger_cron` to `'0 9 * * *'` and re-run
     step 6d at any other minute → webhook.site receives nothing.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

  [ ] `wrangler.jsonc` declares `triggers.crons = ["* * * * *"]`
  [ ] `scheduled` is exported from the Worker default export and
      satisfies `ExportedHandler<Env>`
  [ ] `runCronAutomations` accepts `IAutomationRepository`,
      `IAutomationRunner`, `ContentRepository`, and a seed resolver —
      no concrete imports inside the function body
  [ ] `cronMatches` is a pure function (no DB, no fetch, no `Date.now()`)
      and is unit-tested for `*`, exact, list, range, step, and
      range+step expressions
  [ ] `D1AutomationRepository.findActive` accepts `seedSlug === '*'` and
      returns automations across all seeds; existing exact-match
      behaviour preserved
  [ ] A failure on one entry does not abort processing of remaining
      entries; a failure on `list()` does not abort other automations
  [ ] Works end-to-end with the real `AutomationRunner` from Sprint 1
      AND can be temporarily wired with `NoOpAutomationRunner` for
      isolated testing
  [ ] `wrangler dev --test-scheduled` + `GET /__scheduled` triggers the
      handler and produces the expected side effects (smoke test §5.6)
  [ ] `tsc --noEmit` passes across the monorepo

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

  - REST endpoints `/api/automations/*` (CRUD on automations) — Task #55
  - Full `D1AutomationRepository` CRUD (list/create/update/toggle/delete)
    — Task #54
  - Dashboard UI for managing automations, including cron-expression
    builder — Task #56
  - Sub-minute scheduling (Cloudflare's minimum granularity is one
    minute)
  - Timezone-aware cron (Cloudflare schedules in UTC; per-automation
    timezone support is a Sprint 04+ concern)
  - Distributed locking / single-flight (multiple Workers receiving the
    same tick is not a concern at current scale; revisit if the same
    automation starts firing twice in production logs)
  - Run history / observability (last-fired timestamp, success/failure
    counters) — future
  - Loop detection (cron fires automation A that creates entry that
    fires automation B) — future
