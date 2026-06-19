You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

Do NOT explore the codebase further. All relevant context is provided in this prompt.
Read it fully before writing any code.

This sprint covers **Sprint 0 of the Automations Engine milestone**: defining
the contracts (interfaces, types, no-op stub, DB schema) that make every
subsequent task (#52, #53, #54, #55, #56) independently implementable.

The project is in **beta** — DB used only for testing. Migrations can be
rewritten freely; no production data to preserve.

### Stack

- API: Hono on Cloudflare Workers, D1 (SQLite), R2
- Dashboard: React + TanStack Query + axios
- Shared package: @beechcms/core (pure TypeScript, zero HTTP/cloud deps)
- Monorepo: Turborepo

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

VSA rule: slices never import concrete implementations from other slices.
Only shared layer is `packages/core`, where contracts like
`ContentRepository`, `MediaRepository`, `IdempotencyRepository` already live.
This sprint adds the **automations contracts** to that layer.

Content handlers (`create.ts`, `update.ts`, `delete.ts`) must fire
automations but must never import from `automations/`. Beech already solves
this via DI through the Hono context (see `AppEnv.Variables` in
`apps/api/src/types.ts` — every repository is injected there). Same pattern
applies:

- Content handler calls `c.get('automationRunner').run(...)`
- Handler only knows `IAutomationRunner`
- Real runner registered at app startup (Task #52)
- `NoOpAutomationRunner` registered until then
- Swapping = zero code change in handlers

==========================================================================
SECTION 2 — CURRENT STATE (verified, do not re-explore)
==========================================================================

2.1 EXISTING INTERFACE PATTERN IN packages/core/src/

  Current exports in `packages/core/src/index.ts`:
    content.repository.js, idempotency.repository.js, media.repository.js,
    storage.js, auth/hash-provider.js, auth/token-service.js,
    auth/user.repository.js, auth/session.repository.js,
    auth/password-reset-token.repository.js,
    rate-limit/rate-limiter.js,
    observability/activity-logger.js, observability/activity-log.repository.js,
    observability/analytics.repository.js,
    notifications/notification.repository.js, notifications/notification-service.js,
    widget/widget.repository.js, search/search.repository.js,
    content-scan.repository.js, clock.js, id-generator.js, seed-registry.js

  Every file exports pure interfaces (no D1, no Hono). D1 implementations
  live in `apps/api/src/shared/*.repository.d1.ts`.

2.2 CONTEXT VARIABLES — apps/api/src/types.ts

  Current `Variables` interface (line 36) already contains 24 entries:
    jwtPayload, getSeed, seedRegistry, repository, idempotencyRepository,
    bucket, mediaRepository, systemStatsRepository, hashProvider,
    tokenService, userRepository, sessionRepository,
    passwordResetTokenRepository, rateLimiters, activityLogger,
    activityLogRepository, notificationRepository, notificationService,
    widgetRepository, searchRepository, analyticsRepository,
    contentScanRepository, clock, idGenerator

  AppEnv (line 63): `{ Bindings: Env; Variables: Variables }`

2.3 MIDDLEWARE REGISTRATION ORDER — apps/api/src/factory.ts

  In `createBeechApp()` (line 91), registration order:
    1. app.use('*', repositoryMiddleware({...}))         line 107
    2. app.use('*', storageMiddleware({...}))            line 114
    3. app.use('*', authProvidersMiddleware())           line 118
    4. app.use('*', rateLimiterMiddleware())             line 119
    5. app.use('*', observabilityMiddleware())           line 120

  All repository-style bindings happen inside `repositoryMiddleware`
  (apps/api/src/middleware/repository.middleware.ts), which sets every
  `context.set('xRepository', new D1XRepository(database))`. This is the
  file to extend.

2.4 CONTENT HANDLERS — apps/api/src/features/content/handlers/

  - create.ts → `createHandler()` line 31, calls
        `await repository.create(seed, id, finalSlug, status, privacyData)`
        at line 121, returns 201 at line 139.
        Activity log fires at line 126 (`context.get('activityLogger').log(...)`).
        AutomationRunner.run() must fire after successful create, before
        returning, same site as activityLogger.log().

  - update.ts → `updateHandler()`. Same pattern: fire automation after
        successful repository.update().

  - delete.ts → `deleteHandler()`. Fire automation after successful
        repository.delete().

  Payload shape passed to `run()` is `{ seedSlug, event, entry }` —
  `entry` is the deserialized record (post-engine `dbToApi` for
  update/delete after re-fetch, or the just-written privacyData merged
  with id+slug+status for create).

2.5 DB SCHEMA — beta, no preservation needed

  Migrations directory: apps/api/migrations/
    Current files: 0000_v040_base.sql, 0028_v040_seed_data.sql
  User confirmed: "non sono importanti possiamo riscrivere l'intero
  database perché siamo in beta e lo usiamo solo per testing."
  Add the new table to a fresh migration file `0029_automations.sql`
  (lowest unused number). Do NOT modify existing migrations.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

This sprint produces five concrete artifacts. All must land in a single
PR. No feature code, no runner logic — only contracts + the no-op.

  Task 1 — D1 migration `0029_automations.sql`
  Task 2 — Type file `packages/core/src/automations.types.ts`
  Task 3 — Runner interface `packages/core/src/automations.runner.interface.ts`
  Task 4 — Repository interface `packages/core/src/automations.repository.interface.ts`
  Task 5 — No-op stub `packages/core/src/automations.runner.stub.ts`
  Task 6 — Wiring: `apps/api/src/types.ts` + `repositoryMiddleware`
           registration of `NoOpAutomationRunner`
  Task 7 — Exports in `packages/core/src/index.ts`

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

4.1 TASK 1 — Migration

  File: apps/api/migrations/0029_automations.sql

  ```sql
  CREATE TABLE IF NOT EXISTS automations (
    id                 TEXT    NOT NULL PRIMARY KEY,
    seed_slug          TEXT    NOT NULL,
    name               TEXT    NOT NULL,
    enabled            INTEGER NOT NULL DEFAULT 1,
    trigger_event      TEXT    NOT NULL CHECK(trigger_event IN ('create','update','delete','cron')),
    trigger_cron       TEXT,
    trigger_conditions TEXT,
    actions            TEXT    NOT NULL,
    created_at         INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at         INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_automations_seed_slug ON automations(seed_slug);
  CREATE INDEX IF NOT EXISTS idx_automations_enabled   ON automations(enabled);
  ```

  After write: run `pnpm run db:reset:local` in `apps/api/` to verify clean
  apply on a fresh local D1.

4.2 TASK 2 — Types

  File: `packages/core/src/automations.types.ts`

  ```ts
  export type AutomationTriggerEvent = 'create' | 'update' | 'delete' | 'cron'

  export interface TriggerCondition {
    field: string
    op: 'eq' | 'neq' | 'contains' | 'gt' | 'lt' | 'isempty' | 'isnotempty'
    value: unknown
  }

  export type AutomationAction =
    | { type: 'webhook';      url: string; method?: 'POST'|'GET'|'PUT'; headers?: Record<string,string>; body_template?: string }
    | { type: 'send_mail';    to: string; subject_template: string; body_template: string }
    | { type: 'edit_field';   field: string; value: unknown }
    | { type: 'create_entry'; seed_slug: string; field_map: Record<string,string> }

  export interface Automation {
    id: string
    seed_slug: string
    name: string
    enabled: boolean
    trigger_event: AutomationTriggerEvent
    trigger_cron: string | null
    trigger_conditions: TriggerCondition[] | null
    actions: AutomationAction[]
    created_at: number
    updated_at: number
  }
  ```

  Discriminated union on `type` lets downstream tasks use exhaustiveness
  checks (`never` fallback) when handling actions.

4.3 TASK 3 — Runner interface

  File: `packages/core/src/automations.runner.interface.ts`

  ```ts
  import type { AutomationTriggerEvent } from './automations.types'

  export interface AutomationEventPayload {
    seedSlug: string
    event: AutomationTriggerEvent
    entry: Record<string, unknown>
  }

  export interface IAutomationRunner {
    run(payload: AutomationEventPayload): Promise<void>
  }
  ```

  Pure interface. No imports from outside `packages/core`. No Cloudflare,
  no Hono, no D1.

4.4 TASK 4 — Repository interface

  File: `packages/core/src/automations.repository.interface.ts`

  ```ts
  import type { Automation, AutomationAction, TriggerCondition, AutomationTriggerEvent } from './automations.types'

  export interface CreateAutomationInput {
    seed_slug: string
    name: string
    trigger_event: AutomationTriggerEvent
    trigger_cron: string | null
    trigger_conditions: TriggerCondition[] | null
    actions: AutomationAction[]
  }

  export type UpdateAutomationInput = Partial<CreateAutomationInput>

  export interface IAutomationRepository {
    list(seedSlug: string): Promise<Automation[]>
    findById(id: string): Promise<Automation | null>
    create(input: CreateAutomationInput): Promise<string>
    update(id: string, input: UpdateAutomationInput): Promise<void>
    toggle(id: string, enabled: boolean): Promise<void>
    delete(id: string): Promise<void>
    findActive(seedSlug: string, event: AutomationTriggerEvent): Promise<Automation[]>
  }
  ```

  Note: spec uses `interface UpdateAutomationInput extends Partial<...>`;
  switched to `type` alias because empty-interface-extending-type is
  flagged by `@typescript-eslint/no-empty-object-type`. Behavior
  identical.

4.5 TASK 5 — No-op stub

  File: `packages/core/src/automations.runner.stub.ts`

  ```ts
  import type { IAutomationRunner, AutomationEventPayload } from './automations.runner.interface'

  export class NoOpAutomationRunner implements IAutomationRunner {
    async run(_payload: AutomationEventPayload): Promise<void> {
      // intentionally empty
    }
  }
  ```

  Single underscore-prefixed parameter satisfies lint while keeping the
  shape testable.

4.6 TASK 6 — API wiring

  Step 6a — Extend `Variables` in `apps/api/src/types.ts`:

    Add `IAutomationRunner` to the existing `import type { ... } from '@beechcms/core'`
    statement at line 2.

    Add to the `Variables` interface (around line 60, after `idGenerator`):

    ```ts
    automationRunner: IAutomationRunner
    ```

  Step 6b — Register stub in `repositoryMiddleware`:

    File: `apps/api/src/middleware/repository.middleware.ts`

    - Add to imports: `NoOpAutomationRunner` and type `IAutomationRunner`
      from `@beechcms/core`.
    - Add `automationRunner?: IAutomationRunner` to `RepositoryOverrides`.
    - At the end of the `context.set(...)` block (after `idGenerator`,
      line 57), add:
      ```ts
      context.set('automationRunner', overrides?.automationRunner ?? new NoOpAutomationRunner())
      ```

    Rationale for placing it here, not in `factory.ts`: every other
    repository-style binding lives in `repositoryMiddleware`, and the
    `overrides` parameter is the existing test-injection seam. Task #52
    will swap `NoOpAutomationRunner` for the real `AutomationRunner` by
    editing this same line.

  Do NOT touch content handlers in this sprint. Wiring `c.get('automationRunner').run(...)`
  into create/update/delete handlers is Task #53, not Sprint 0.

4.7 TASK 7 — Core barrel exports

  File: `packages/core/src/index.ts`

  Append (after the existing `seed-registry.js` export, line 40):

  ```ts
  export * from './automations.types.js'
  export * from './automations.runner.interface.js'
  export * from './automations.repository.interface.js'
  export * from './automations.runner.stub.js'
  ```

  Use `.js` extensions to match the existing ESM convention in this
  barrel.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from repo root after all tasks:

  1. `pnpm run build` in `packages/core/` — emits dist/ with no errors
  2. `npx tsc --noEmit` in `apps/api/` — zero errors, Variables type ok
  3. `npx tsc --noEmit` in `apps/dashboard/` — zero errors (no functional
     change but core types changed)
  4. `pnpm run test` in `apps/api/` — existing flow tests pass; the
     NoOpAutomationRunner registration must not break any test
  5. `pnpm run db:reset:local` in `apps/api/` — fresh migration applies
  6. Boot dev: `pnpm run dev` at root — both API (:8789) and Dashboard
     (:5173) start without errors

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

  [ ] `0029_automations.sql` applies clean on fresh D1
  [ ] All types, interfaces, and stub exported from `@beechcms/core`
  [ ] `IAutomationRunner` and `IAutomationRepository` have zero concrete
      dependencies (no D1, no Hono, no Cloudflare imports)
  [ ] `NoOpAutomationRunner` registered inside `repositoryMiddleware` —
      app boots without errors, all existing tests pass
  [ ] `Variables` in `apps/api/src/types.ts` includes
      `automationRunner: IAutomationRunner`
  [ ] `tsc --noEmit` passes with zero errors across the monorepo
  [ ] Tasks #52 (runner impl), #53 (handler wiring), #54 (D1 repo),
      #55 (API routes), #56 (dashboard UI) can start independently after
      this PR merges

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

  - Real `AutomationRunner` implementation (Task #52)
  - Content handler integration (`c.get('automationRunner').run(...)` in
    create/update/delete) (Task #53)
  - `D1AutomationRepository` (Task #54)
  - REST endpoints `/api/automations/*` (Task #55)
  - Dashboard UI for managing automations (Task #56)
  - Cron trigger scheduling (handled separately, depends on Workers Cron
    Triggers binding)
  - Condition evaluator + template renderer for actions (part of #52)
