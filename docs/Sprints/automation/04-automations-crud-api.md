You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

Do NOT explore the codebase further. All relevant context is provided in this
prompt. Read it fully before writing any code.

This sprint covers **Sprint 3 of the Automations Engine milestone**:
completing the `D1AutomationRepository` (full CRUD) and exposing the REST
endpoints `/api/automations/*` that the Dashboard (#56) will consume. It
depends ONLY on the contracts from Sprint 0 (`IAutomationRepository`, Zod
runtime, types). It has zero dependency on the runner (Sprint 1, #52) or
the cron handler (Sprint 2, #53): the repository is a pure data layer and
the API handlers consume it through the interface.

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

Sprint 0 delivered the `IAutomationRepository` contract with all seven
methods (`list`, `findById`, `findActive`, `create`, `update`, `toggle`,
`delete`). Sprint 1 shipped `D1AutomationRepository` with only
`findActive` implemented — every other method currently throws
`'not implemented in sprint 08'`. Sprint 2 added the wildcard-`'*'`
branch to `findActive` but did not touch the rest.

This sprint closes that gap: the repository becomes fully functional and
six REST endpoints expose the operations to authenticated Dashboard
clients. After this PR merges, Sprint 04 (#56, Dashboard UI) can start
without further API work.

### Why Zod validation at the API boundary

`actions` and `trigger_conditions` are persisted as raw JSON strings in
D1. Any malformed payload reaching the runner causes silent failures at
execution time. Zod at the boundary guarantees only structurally valid
automations are persisted — same pattern already used by
`validateAndSanitizeSeedPayload` in the content handlers.

### Why a dedicated `toggle` endpoint

Enable/disable is the most frequent operation from the Dashboard list
view (a single switch). A `PATCH /:id/toggle` is a one-field atomic
update — avoids round-tripping the full automation just to flip a
boolean. Mirrors the `mark-as-read` pattern in `notifications.handler.ts`.

### VSA boundaries

The slice that owns this work is `apps/api/src/features/automations/`.
HTTP handlers import the repository **interface** from `@beechcms/core`
and resolve the concrete instance from the Hono context — the same
pattern as every other repository (`context.get('automationRepository')`).
The D1 implementation lives in `apps/api/src/shared/` (already there
since Sprint 1) and is the only file that knows about `D1Database`.

==========================================================================
SECTION 2 — CURRENT STATE (verified, do not re-explore)
==========================================================================

2.1 CONTRACTS — packages/core/src/ (delivered by Sprint 0)

  `automations.types.ts`
    `Automation`, `AutomationAction` (discriminated union on `type` over
    `webhook | send_mail | edit_field | create_entry`),
    `TriggerCondition`, `AutomationTriggerEvent`
    (`'create' | 'update' | 'delete' | 'cron'`).

  `automations.repository.interface.ts`
    `IAutomationRepository`:
      list(seedSlug: string): Promise<Automation[]>
      findById(id: string): Promise<Automation | null>
      findActive(seedSlug, event): Promise<Automation[]>
      create(input: CreateAutomationInput): Promise<string>
      update(id: string, input: UpdateAutomationInput): Promise<void>
      toggle(id: string, enabled: boolean): Promise<void>
      delete(id: string): Promise<void>

    `CreateAutomationInput`:
      seed_slug, name, trigger_event, trigger_cron (string|null),
      trigger_conditions (TriggerCondition[]|null), actions
      (AutomationAction[]).
    `UpdateAutomationInput = Partial<CreateAutomationInput>`.

  All re-exported through `@beechcms/core` barrel.

2.2 D1 SCHEMA — apps/api/migrations/0029_automations.sql

  Table `automations`:
    id TEXT PK, seed_slug TEXT, name TEXT, enabled INTEGER NOT NULL
    DEFAULT 1, trigger_event TEXT CHECK IN ('create','update','delete','cron'),
    trigger_cron TEXT NULL, trigger_conditions TEXT NULL (JSON),
    actions TEXT NOT NULL (JSON), created_at INTEGER, updated_at INTEGER.
  Indexes: `idx_automations_seed_slug`, `idx_automations_enabled`.

  No migration changes required.

2.3 REPOSITORY STUB — apps/api/src/shared/automations.repository.d1.ts

  `D1AutomationRepository` exists and:
    - implements `findActive(seedSlug, event)` with the `'*'` wildcard
      branch (delivered by Sprint 1 + extended by Sprint 2);
    - declares the other six methods as parameter-typed bodies that
      throw `Error('not implemented in sprint 08')`.

  Shared deserializer `rowToAutomation(row)` is already exported as a
  module-private function — reuse it.

  Method signatures must match `IAutomationRepository` exactly; the
  underscore-prefixed parameter convention (`_id`, `_input`) is the
  house lint style.

2.4 CONTEXT INJECTION — apps/api/src/types.ts

  `Variables` currently exposes `automationRunner: IAutomationRunner`
  (line ~62) but NOT the repository. Handlers cannot yet do
  `context.get('automationRepository')` — that key does not exist.
  This sprint adds it (Section 4.3).

  `Env` and `Variables` are both exported. `AppEnv` is the combined
  shape consumed by Hono apps. `Bindings: Env; Variables: Variables`.

2.5 MIDDLEWARE — apps/api/src/middleware/repository.middleware.ts

  Already constructs `new D1AutomationRepository(database)` once, inside
  the `automationRunner` factory (delivered by Sprint 1, line ~59 area).
  That instance is private to the runner. This sprint hoists the
  instantiation one line up and exposes it through context so HTTP
  handlers can also reach it (Section 4.3.2).

2.6 FACTORY ROUTING — apps/api/src/factory.ts

  Existing protected route registration block (verified, line ~289):

  ```ts
  const apiProtected = new Hono<{ Bindings: Env; Variables: Variables }>()
  apiProtected.use('*', authMiddleware())

  apiProtected.route('/settings', settingsApp)
  apiProtected.route('/schema', schemaApp)
  apiProtected.route('/content', notificationsApp)
  apiProtected.route('/content', statsApp)
  apiProtected.route('/content', rotateFieldApp)
  apiProtected.route('/content', draftApp)
  apiProtected.route('/content', contentFeature)
  apiProtected.route('/widget', widgetApp)
  apiProtected.route('/', uploadRoutes)
  ...
  app.route('/api', apiProtected)
  ```

  The new `automationsApp` mounts here under `/automations`, inside the
  `apiProtected` sub-app — so authentication is inherited. The final
  URL surface is `/api/automations/*` (the `/api` prefix is added by
  `app.route('/api', apiProtected)`).

2.7 ERROR RESPONSES — apps/api/src/public/problem-details

  `publicProblem(context, { type, status, title, detail })` is the
  project-wide RFC 7807 helper. Used by setup, content (delete/facets),
  password reset. Use it for every non-2xx response in this slice.

2.8 ZOD — packages/core depends on `zod ^4.3.6`

  Imports in `apps/api` resolve through the workspace
  (`apps/api/src/features/rotate-field/rotate-field.schema.ts` already
  uses `import { z } from 'zod'`). No new dependency to add.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Single PR. Files are independent; only intra-file order matters.

  Task 1 — Zod schemas
           apps/api/src/features/automations/automations.schema.ts

  Task 2 — Complete D1 repository (replace the six `not implemented`
           stubs)
           apps/api/src/shared/automations.repository.d1.ts

  Task 3 — Context wiring: expose `automationRepository`
           apps/api/src/types.ts
           apps/api/src/middleware/repository.middleware.ts

  Task 4 — REST handler
           apps/api/src/features/automations/automations.handler.ts

  Task 5 — Slice barrel update
           apps/api/src/features/automations/index.ts

  Task 6 — Route registration
           apps/api/src/factory.ts

  Task 7 — Tests
           apps/api/src/features/automations/__tests__/
             automations.schema.test.ts
             automations.repository.test.ts   (in-memory mock)
             automations.handler.test.ts

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

4.1 TASK 1 — Zod schemas

  File: `apps/api/src/features/automations/automations.schema.ts`

  ```ts
  import { z } from 'zod'

  const triggerConditionSchema = z.object({
    field: z.string().min(1),
    op: z.enum(['eq', 'neq', 'contains', 'gt', 'lt', 'isempty', 'isnotempty']),
    value: z.unknown(),
  })

  const webhookActionSchema = z.object({
    type: z.literal('webhook'),
    url: z.string().url(),
    method: z.enum(['POST', 'GET', 'PUT']).optional(),
    headers: z.record(z.string()).optional(),
    body_template: z.string().optional(),
  })

  const sendMailActionSchema = z.object({
    type: z.literal('send_mail'),
    to: z.string().email(),
    subject_template: z.string().min(1),
    body_template: z.string().min(1),
  })

  const editFieldActionSchema = z.object({
    type: z.literal('edit_field'),
    field: z.string().min(1),
    value: z.unknown(),
  })

  const createEntryActionSchema = z.object({
    type: z.literal('create_entry'),
    seed_slug: z.string().min(1),
    field_map: z.record(z.string()),
  })

  export const automationActionSchema = z.discriminatedUnion('type', [
    webhookActionSchema,
    sendMailActionSchema,
    editFieldActionSchema,
    createEntryActionSchema,
  ])

  export const createAutomationSchema = z
    .object({
      seed_slug: z.string().min(1),
      name: z.string().min(1).max(100),
      trigger_event: z.enum(['create', 'update', 'delete', 'cron']),
      trigger_cron: z.string().nullable().optional(),
      trigger_conditions: z.array(triggerConditionSchema).nullable().optional(),
      actions: z.array(automationActionSchema).min(1, 'At least one action is required'),
    })
    .refine(
      (data) => data.trigger_event !== 'cron' || !!data.trigger_cron,
      { message: 'trigger_cron is required when trigger_event is cron', path: ['trigger_cron'] },
    )

  export const updateAutomationSchema = createAutomationSchema
    .innerType()
    .partial()

  export const toggleAutomationSchema = z.object({
    enabled: z.boolean(),
  })

  export type CreateAutomationBody = z.infer<typeof createAutomationSchema>
  export type UpdateAutomationBody = z.infer<typeof updateAutomationSchema>
  ```

  Note on `updateAutomationSchema`: `.partial()` cannot be called on a
  `ZodEffects` (the `.refine` result), so use `.innerType().partial()`
  to drop the cron-required refinement on partial updates (PATCHing
  only the `name` should not require `trigger_cron`). The same
  cron-required rule on full PUT is preserved through
  `createAutomationSchema`.

  Discriminated union on `action.type` matches the
  `AutomationAction` discriminant in core — typings flow through
  unchanged.

4.2 TASK 2 — Complete D1 repository

  File: `apps/api/src/shared/automations.repository.d1.ts`

  Replace each of the six `not implemented in sprint 08` stubs with the
  real body. Keep `findActive` and `rowToAutomation` unchanged. The new
  bodies:

  ```ts
  async list(seedSlug: string): Promise<Automation[]> {
    const result = await this.db
      .prepare(`SELECT * FROM automations WHERE seed_slug = ? ORDER BY created_at DESC`)
      .bind(seedSlug)
      .all<AutomationRow>()
    return (result.results ?? []).map(rowToAutomation)
  }

  async findById(id: string): Promise<Automation | null> {
    const row = await this.db
      .prepare(`SELECT * FROM automations WHERE id = ?`)
      .bind(id)
      .first<AutomationRow>()
    return row ? rowToAutomation(row) : null
  }

  async create(input: CreateAutomationInput): Promise<string> {
    const id = crypto.randomUUID()
    const now = Math.floor(Date.now() / 1000)
    await this.db
      .prepare(
        `INSERT INTO automations
           (id, seed_slug, name, enabled, trigger_event, trigger_cron,
            trigger_conditions, actions, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.seed_slug,
        input.name,
        input.trigger_event,
        input.trigger_cron ?? null,
        input.trigger_conditions ? JSON.stringify(input.trigger_conditions) : null,
        JSON.stringify(input.actions),
        now,
        now,
      )
      .run()
    return id
  }

  async update(id: string, input: UpdateAutomationInput): Promise<void> {
    const now = Math.floor(Date.now() / 1000)
    const fields: string[] = []
    const values: unknown[] = []

    const map: Record<string, unknown> = {
      seed_slug: input.seed_slug,
      name: input.name,
      trigger_event: input.trigger_event,
      trigger_cron: input.trigger_cron,
      trigger_conditions:
        input.trigger_conditions !== undefined
          ? input.trigger_conditions === null
            ? null
            : JSON.stringify(input.trigger_conditions)
          : undefined,
      actions: input.actions !== undefined ? JSON.stringify(input.actions) : undefined,
    }

    for (const [column, value] of Object.entries(map)) {
      if (value !== undefined) {
        fields.push(`${column} = ?`)
        values.push(value)
      }
    }

    if (fields.length === 0) return

    values.push(now, id)
    await this.db
      .prepare(`UPDATE automations SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`)
      .bind(...values)
      .run()
  }

  async toggle(id: string, enabled: boolean): Promise<void> {
    const now = Math.floor(Date.now() / 1000)
    await this.db
      .prepare(`UPDATE automations SET enabled = ?, updated_at = ? WHERE id = ?`)
      .bind(enabled ? 1 : 0, now, id)
      .run()
  }

  async delete(id: string): Promise<void> {
    await this.db.prepare(`DELETE FROM automations WHERE id = ?`).bind(id).run()
  }
  ```

  Notes / verification points:

  - `crypto.randomUUID()` is available in the Workers runtime — used
    already by other repositories. Do NOT introduce `nanoid` or import
    `IIdGenerator` here; the issue spec deliberately keeps the
    repository self-contained.
  - JSON column round-trip: `trigger_conditions` accepts three states
    — present array, `null`, undefined (no change on PATCH). The
    serialiser above distinguishes them: `null` clears the column,
    `undefined` skips it, array serialises as JSON.
  - `update` short-circuits when no recognised field is provided (the
    `Partial` could be empty after Zod strips unknown keys) to avoid
    issuing `UPDATE … SET updated_at = ? WHERE id = ?`. This matches
    the no-op semantics of `PUT /:id` with an empty body.
  - Method signatures must keep matching `IAutomationRepository`.
    Replace the `_id: string` underscore prefix only when the param is
    actually consumed.

4.3 TASK 3 — Context wiring

  4.3.1 File: `apps/api/src/types.ts`

  Add `IAutomationRepository` to the existing
  `import type { ... } from '@beechcms/core'` (sibling of
  `IAutomationRunner` already imported in Sprint 0). Then extend
  `Variables`:

  ```ts
  automationRepository: IAutomationRepository
  ```

  Place it adjacent to `automationRunner` so reviewers see the pair.

  4.3.2 File: `apps/api/src/middleware/repository.middleware.ts`

  The runner factory already does
  `new D1AutomationRepository(database)` inline (delivered by Sprint 1).
  Hoist it to a single shared instance and expose it through context:

  ```ts
  const automationRepository = overrides?.automationRepository
    ?? new D1AutomationRepository(database)

  context.set('automationRepository', automationRepository)

  context.set(
    'automationRunner',
    overrides?.automationRunner ?? new AutomationRunner({
      automationRepository,                       // reuse the same instance
      contentRepository: context.get('repository'),
      getSeed: context.get('getSeed'),
      idGenerator: resolvedIdGenerator,
      env: context.env as unknown as Record<string, string | undefined>,
    }),
  )
  ```

  Add `automationRepository?: IAutomationRepository` to
  `RepositoryOverrides`. Update the imports section: ensure
  `IAutomationRepository` is imported from `@beechcms/core` (its type
  is needed for the override).

  Rationale: one D1 connection-bound instance is cheaper than two and
  ensures handlers + runner see identical data even mid-request.

4.4 TASK 4 — REST handler

  File: `apps/api/src/features/automations/automations.handler.ts`

  ```ts
  /// <reference types="@cloudflare/workers-types" />
  import { Hono } from 'hono'
  import type { Env, Variables } from '../../types'
  import { publicProblem } from '../../public/problem-details'
  import {
    createAutomationSchema,
    updateAutomationSchema,
    toggleAutomationSchema,
  } from './automations.schema'

  const automationsApp = new Hono<{ Bindings: Env; Variables: Variables }>()

  /**
   * GET /automations?seed=<slug>
   * Returns every automation declared for the given seed, newest first.
   */
  automationsApp.get('/', async (context) => {
    const seedSlug = context.req.query('seed')
    if (!seedSlug) {
      return publicProblem(context, {
        type: 'missing-seed',
        status: 400,
        title: 'Bad Request',
        detail: 'Query param `seed` is required',
      })
    }
    const repository = context.get('automationRepository')
    const automations = await repository.list(seedSlug)
    return context.json(automations)
  })

  /**
   * POST /automations
   * Creates a new automation. Body validated by `createAutomationSchema`.
   */
  automationsApp.post('/', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return publicProblem(context, {
        type: 'invalid-json',
        status: 400,
        title: 'Bad Request',
        detail: 'Request body is not valid JSON',
      })
    }

    const parsed = createAutomationSchema.safeParse(body)
    if (!parsed.success) {
      return publicProblem(context, {
        type: 'automation-validation-failed',
        status: 400,
        title: 'Bad Request',
        detail: parsed.error.message,
      })
    }

    const repository = context.get('automationRepository')
    const id = await repository.create({
      seed_slug: parsed.data.seed_slug,
      name: parsed.data.name,
      trigger_event: parsed.data.trigger_event,
      trigger_cron: parsed.data.trigger_cron ?? null,
      trigger_conditions: parsed.data.trigger_conditions ?? null,
      actions: parsed.data.actions,
    })
    return context.json({ id }, 201)
  })

  /**
   * GET /automations/:id
   */
  automationsApp.get('/:id', async (context) => {
    const id = context.req.param('id')
    const automation = await context.get('automationRepository').findById(id)
    if (!automation) {
      return publicProblem(context, {
        type: 'automation-not-found',
        status: 404,
        title: 'Not Found',
        detail: `Automation ${id} does not exist`,
      })
    }
    return context.json(automation)
  })

  /**
   * PUT /automations/:id
   * Full update — partial bodies allowed; `trigger_cron` validation
   * (required when `trigger_event` is `cron`) is enforced only on
   * payloads that carry both fields.
   */
  automationsApp.put('/:id', async (context) => {
    const id = context.req.param('id')
    const repository = context.get('automationRepository')
    const existing = await repository.findById(id)
    if (!existing) {
      return publicProblem(context, {
        type: 'automation-not-found',
        status: 404,
        title: 'Not Found',
        detail: `Automation ${id} does not exist`,
      })
    }

    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return publicProblem(context, {
        type: 'invalid-json', status: 400,
        title: 'Bad Request',
        detail: 'Request body is not valid JSON',
      })
    }

    const parsed = updateAutomationSchema.safeParse(body)
    if (!parsed.success) {
      return publicProblem(context, {
        type: 'automation-validation-failed',
        status: 400,
        title: 'Bad Request',
        detail: parsed.error.message,
      })
    }

    // Cross-field check: when a PATCH changes trigger_event to 'cron'
    // it must either supply trigger_cron or the existing row must
    // already have one.
    const nextEvent = parsed.data.trigger_event ?? existing.trigger_event
    const nextCron  = parsed.data.trigger_cron  ?? existing.trigger_cron
    if (nextEvent === 'cron' && !nextCron) {
      return publicProblem(context, {
        type: 'automation-validation-failed',
        status: 400,
        title: 'Bad Request',
        detail: 'trigger_cron is required when trigger_event is cron',
      })
    }

    await repository.update(id, parsed.data)
    return context.body(null, 204)
  })

  /**
   * PATCH /automations/:id/toggle
   * Atomic single-field flip — does not require sending the full body.
   */
  automationsApp.patch('/:id/toggle', async (context) => {
    const id = context.req.param('id')
    const repository = context.get('automationRepository')
    const existing = await repository.findById(id)
    if (!existing) {
      return publicProblem(context, {
        type: 'automation-not-found', status: 404,
        title: 'Not Found',
        detail: `Automation ${id} does not exist`,
      })
    }

    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return publicProblem(context, {
        type: 'invalid-json', status: 400,
        title: 'Bad Request',
        detail: 'Request body is not valid JSON',
      })
    }

    const parsed = toggleAutomationSchema.safeParse(body)
    if (!parsed.success) {
      return publicProblem(context, {
        type: 'automation-validation-failed',
        status: 400, title: 'Bad Request',
        detail: parsed.error.message,
      })
    }

    await repository.toggle(id, parsed.data.enabled)
    return context.body(null, 204)
  })

  /**
   * DELETE /automations/:id
   */
  automationsApp.delete('/:id', async (context) => {
    const id = context.req.param('id')
    const repository = context.get('automationRepository')
    const existing = await repository.findById(id)
    if (!existing) {
      return publicProblem(context, {
        type: 'automation-not-found', status: 404,
        title: 'Not Found',
        detail: `Automation ${id} does not exist`,
      })
    }
    await repository.delete(id)
    return context.body(null, 204)
  })

  export { automationsApp }
  ```

  Notes:

  - The mount path is `/automations` (no `/api` prefix) — the prefix is
    added by `factory.ts` via `app.route('/api', apiProtected)`.
  - Authentication is inherited from `apiProtected.use('*', authMiddleware())`;
    do NOT register `authMiddleware()` on `automationsApp` directly —
    that would double-wrap.
  - Every non-2xx response goes through `publicProblem` for RFC 7807
    consistency. No raw `c.json({ error: ... }, 400)` calls.
  - Pre-flight `findById` before `update`/`toggle`/`delete` lets the
    handler return a clean 404 without relying on D1 row-count
    semantics. Cost: one extra indexed PK lookup per write — negligible.
  - `PUT /:id` accepts a partial body intentionally. The spec called it
    `PUT` for REST consistency with the issue, but the semantics are
    PATCH-like. Document this in the route docstring; the Dashboard
    sends the full edit payload anyway (#56).

4.5 TASK 5 — Slice barrel

  File: `apps/api/src/features/automations/index.ts`

  Append:

  ```ts
  export { automationsApp } from './automations.handler'
  export {
    createAutomationSchema,
    updateAutomationSchema,
    toggleAutomationSchema,
    automationActionSchema,
  } from './automations.schema'
  export type { CreateAutomationBody, UpdateAutomationBody } from './automations.schema'
  ```

  Only the Hono sub-app and the schemas are exported. The handler
  internals stay slice-private.

4.6 TASK 6 — Route registration

  File: `apps/api/src/factory.ts`

  Add import alongside the existing slice imports:

  ```ts
  import { automationsApp } from './features/automations'
  ```

  Mount on the protected sub-app, adjacent to the other content routes
  (around line 295 area):

  ```ts
  apiProtected.route('/automations', automationsApp)
  ```

  No other edits to this file. The final URLs are:
    GET    /api/automations?seed=<slug>
    POST   /api/automations
    GET    /api/automations/:id
    PUT    /api/automations/:id
    PATCH  /api/automations/:id/toggle
    DELETE /api/automations/:id

  All inherit JWT auth from `apiProtected.use('*', authMiddleware())`.

4.7 TASK 7 — Tests

  File: `apps/api/src/features/automations/__tests__/automations.schema.test.ts`

  Cover `createAutomationSchema` for:
    - Minimal valid create (event `create`, one webhook action).
    - `trigger_event = 'cron'` without `trigger_cron` → fails with
      `trigger_cron` in the issue path.
    - `actions = []` → fails (`min(1)`).
    - Discriminated union: unknown `action.type` rejected.
    - `webhook.url` must be a real URL.
    - `send_mail.to` must be a valid email.
    - `trigger_conditions` accepts `null` and arrays.
  Cover `updateAutomationSchema` for:
    - Empty `{}` passes.
    - `{ name: 'x' }` passes without requiring `trigger_cron`
      (proves `.innerType().partial()` correctly dropped the refine).
  Cover `toggleAutomationSchema` for:
    - `{ enabled: true }` / `{ enabled: false }` pass.
    - Missing / non-boolean rejected.

  File: `apps/api/src/features/automations/__tests__/automations.repository.test.ts`

  Build an in-memory mock of `IAutomationRepository` matching the
  contract; assert that:
    - `D1AutomationRepository.create` serialises `actions` and
      `trigger_conditions` to JSON before binding (use a fake
      `D1Database` that records bound params).
    - `update` builds the SET clause from provided keys only (assert
      the generated SQL via the fake `prepare()` stub).
    - `toggle` only writes `enabled` and `updated_at`.
    - JSON round-trip: a fixture row deserialises through
      `rowToAutomation` with `trigger_conditions: null` when the column
      is null, and with the parsed array otherwise.

  The fake `D1Database` is a hand-rolled object with `prepare()`
  returning a chainable builder that records `.bind()` / `.run()` /
  `.all()` / `.first()` calls. No `miniflare`, no `wrangler` — pure
  unit tests.

  File: `apps/api/src/features/automations/__tests__/automations.handler.test.ts`

  Spin a `Hono` app with `automationsApp` mounted under `/`, and
  inject a stub repository via `app.use('*', async (c, next) => { c.set('automationRepository', stub); await next() })`.
  Scenarios:
    - `GET /` without `?seed=` → 400 with `missing-seed`.
    - `GET /?seed=posts` → 200, returns the repository payload.
    - `POST /` with invalid body → 400.
    - `POST /` with valid body → 201 + `{ id }`.
    - `GET /:id` unknown → 404.
    - `PUT /:id` 404 when repository says not found.
    - `PUT /:id` with `trigger_event = 'cron'` and no
      `trigger_cron` (in body or existing) → 400.
    - `PATCH /:id/toggle` with `{ enabled: false }` → 204, asserts
      `repository.toggle(id, false)` called.
    - `DELETE /:id` → 204.

  No D1, no JWT, no `factory.ts` boot — the slice is testable in
  isolation because all dependencies are accessed through context.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from repo root after all tasks:

  1. `npm run build` in `packages/core/` — no changes; emits cleanly.
  2. `npx tsc --noEmit` in `apps/api/` — zero errors. The
     `IAutomationRepository` implementation completeness is the
     critical type gate.
  3. `npm run test` in `apps/api/` — new tests pass; existing tests
     unaffected. The added `automationRepository` context key is
     additive.
  4. `npm run db:reset:local` in `apps/api/` — no migration changes,
     no-op rerun.
  5. `npm run dev` at root — API boots (:8789), Dashboard boots (:5173).
  6. Smoke test (cURL, after logging in to get a JWT):

     a. Create:
        ```
        curl -X POST http://localhost:8789/api/automations \
          -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
          -d '{"seed_slug":"posts","name":"notify-on-create","trigger_event":"create","trigger_conditions":null,"actions":[{"type":"webhook","url":"https://webhook.site/<id>"}]}'
        ```
        → 201 `{ "id": "<uuid>" }`.
     b. List:
        ```
        curl "http://localhost:8789/api/automations?seed=posts" -H "Authorization: Bearer $JWT"
        ```
        → 200, array of one.
     c. Toggle off:
        ```
        curl -X PATCH http://localhost:8789/api/automations/<id>/toggle \
          -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
          -d '{"enabled":false}'
        ```
        → 204. Repeat (b), assert `enabled: false`.
     d. Update name:
        ```
        curl -X PUT http://localhost:8789/api/automations/<id> \
          -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
          -d '{"name":"renamed"}'
        ```
        → 204.
     e. Delete:
        ```
        curl -X DELETE http://localhost:8789/api/automations/<id> \
          -H "Authorization: Bearer $JWT"
        ```
        → 204. List returns empty.

  7. Negative smoke: POST a body with `trigger_event: "cron"` and no
     `trigger_cron` → 400 with `automation-validation-failed`.

  8. End-to-end with the runner (proves repository ↔ runner share the
     same D1 instance):
     - Create an automation via `POST /api/automations` with
       `trigger_event: 'create'` and a webhook action.
     - `POST /api/content/posts` with a valid payload.
     - webhook.site receives the POST.
     This verifies that the repository instance written to by the API
     is the same one read by `AutomationRunner.run` (Section 4.3.2 is
     the load-bearing change here).

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

  [ ] `D1AutomationRepository` fully implements `IAutomationRepository`
      (TypeScript enforced); no `not implemented` throws remain.
  [ ] All six endpoints return correct HTTP status codes (200/201/204/400/404).
  [ ] `actions` and `trigger_conditions` round-trip through JSON
      serialisation without data loss.
  [ ] Zod validation errors are returned in `publicProblem` (RFC 7807)
      format, never as raw `{ error: ... }`.
  [ ] `PATCH /:id/toggle` only updates `enabled` and `updated_at`
      (verified via SQL spy in unit tests).
  [ ] Creating a `cron` automation without `trigger_cron` → 400 with
      the Zod path detail.
  [ ] `findActive('*', 'cron')` continues to return automations across
      all seeds (regression coverage).
  [ ] All endpoints require valid JWT (inherited from `apiProtected.use(authMiddleware())`).
  [ ] The handler is testable with an in-memory mock of
      `IAutomationRepository` — no D1 required in unit tests.
  [ ] `automationRepository` is exposed on the Hono context and shared
      with `AutomationRunner` (single instance per request).
  [ ] `tsc --noEmit` passes across the monorepo.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

  - Dashboard UI for managing automations, including cron-expression
    builder — Task #56.
  - Run history / observability (last-fired timestamp, success/failure
    counters) — future.
  - Pagination on `GET /automations` — current scale (per-seed
    automation count) makes a single-shot list acceptable.
  - Bulk operations (toggle/delete many) — add later if the Dashboard
    needs them.
  - Public API surface under `/api/v1/public/automations` — automations
    are admin-only; no public read path.
  - Authorization beyond JWT (per-role permissions on the
    automations resource) — current model treats every authenticated
    user as full admin; revisit alongside the broader RBAC sprint.
