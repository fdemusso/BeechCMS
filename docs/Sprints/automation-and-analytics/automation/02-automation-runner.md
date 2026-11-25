You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

Do NOT explore the codebase further. All relevant context is provided in this
prompt. Read it fully before writing any code.

This sprint covers **Sprint 1 of the Automations Engine milestone**:
implementing the real `IAutomationRunner` defined in Sprint 0 (07) and wiring
it to the content handlers via `waitUntil`.

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

Sprint 02 delivered the contracts: `IAutomationRunner`,
`IAutomationRepository`, `Automation`/`AutomationAction` types,
`NoOpAutomationRunner` registered in `repositoryMiddleware`. Content handlers
do not yet call `c.get('automationRunner').run(...)` — automations are inert.

This sprint produces a working end-to-end runner so that creating, updating,
or deleting an entry triggers any matching automation's actions
(`webhook`, `send_mail`, `edit_field`, `create_entry`). After this PR
merges, only the **REST endpoints** (#55) and the **Dashboard UI** (#56)
remain before automations are user-facing. Cron triggers (#53b) are out of
scope; this sprint handles the three CRUD events only.

VSA rule reminder: content handlers never import from `features/automations/`.
They only know `IAutomationRunner` and call it through the context, exactly
like `activityLogger`. The runner — and only the runner — knows about
action executors, the repository, and the email slice.

==========================================================================
SECTION 2 — CURRENT STATE (verified, do not re-explore)
==========================================================================

2.1 CONTRACTS — packages/core/src/

  Already exported by Sprint 02 (verified):
    automations.types.ts            → Automation, AutomationAction (discriminated union),
                                       TriggerCondition, AutomationTriggerEvent
    automations.runner.interface.ts → IAutomationRunner, AutomationEventPayload
    automations.repository.interface.ts → IAutomationRepository (list, findById, create,
                                          update, toggle, delete, findActive)
    automations.runner.stub.ts      → NoOpAutomationRunner

  All re-exported from `@beechcms/core` via the barrel.

2.2 D1 SCHEMA — apps/api/migrations/0029_automations.sql

  Table `automations` exists with columns:
    id TEXT PK, seed_slug TEXT, name TEXT, enabled INTEGER,
    trigger_event TEXT CHECK IN ('create','update','delete','cron'),
    trigger_cron TEXT NULL, trigger_conditions TEXT NULL (JSON),
    actions TEXT NOT NULL (JSON), created_at INTEGER, updated_at INTEGER
  Indexes: idx_automations_seed_slug, idx_automations_enabled.

  No D1 implementation of `IAutomationRepository` exists yet. This sprint
  ships the minimum slice of it needed by the runner (`findActive` only).
  Full CRUD lands with the REST endpoints task (#54/#55).

2.3 STUB REGISTRATION — apps/api/src/middleware/repository.middleware.ts

  Line 15 imports `NoOpAutomationRunner` from `@beechcms/core`.
  Line 35 defines `automationRunner?: IAutomationRunner` in `RepositoryOverrides`.
  Line 59:
    context.set('automationRunner', overrides?.automationRunner ?? new NoOpAutomationRunner())

  Sprint 08 replaces this single line. No other file in
  `repository.middleware.ts` is touched.

2.4 CONTENT HANDLERS — apps/api/src/features/content/handlers/

  - create.ts → `createHandler()` line 31. Activity log fires at line 126
        via `context.get('activityLogger').log(...)`. Response returns 201
        at line 139. Automation hook lands immediately after the activity
        log call, before the `return` statement.
  - update.ts → `updateHandler()` line 33. Same pattern after successful
        `repository.update()`.
  - delete.ts → `deleteHandler()` line 9. Same pattern after successful
        `repository.delete()`.

  Each call site adds exactly three lines (see Section 4.5).

2.5 EMAIL SLICE — apps/api/src/features/email/

  Current public API (verified in `apps/api/src/features/email/index.ts`):
    sendPasswordResetEmail(...)
    sendPasswordChangedEmail(...)
    resolveEmailLocale, SUPPORTED_EMAIL_LOCALES
    EmailLocale, PasswordResetEmailParams, PasswordChangedEmailParams

  **There is no generic `sendMail` export.** The internal pipeline is
  `service → template builder → provider (Resend)`. The provider lives in
  `providers/resend.ts` and the service is `email.service.ts`.

  The `send_mail` automation action MUST go through this slice — the
  runner is NOT allowed to import the Resend provider directly. This
  sprint extends the email module with a generic `sendAutomationMail`
  service entry (Section 4.4).

2.6 EXECUTION CONTEXT

  Cloudflare Workers terminate as soon as the HTTP response is sent.
  `context.executionCtx.waitUntil(promise)` keeps the worker alive until
  the promise resolves, without blocking the response. The existing
  `activityLogger` pattern in content handlers already uses this idiom
  for fire-and-forget side effects — automations follow the same shape.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Single PR. Order matters only within a file; files are independent.

  Task 1 — `D1AutomationRepository` (findActive only)
           apps/api/src/shared/automations.repository.d1.ts

  Task 2 — Pure utilities (no DB, no fetch)
           apps/api/src/features/automations/automation-runner.utils.ts

  Task 3 — Action executors (one file per action type)
           apps/api/src/features/automations/action-executors/
             webhook.executor.ts
             send-mail.executor.ts
             edit-field.executor.ts
             create-entry.executor.ts
             index.ts  (dispatcher)

  Task 4 — Generic mail entry in email slice
           apps/api/src/features/email/email.service.ts  (add export)
           apps/api/src/features/email/email.types.ts    (add params type)
           apps/api/src/features/email/index.ts          (re-export)
           apps/api/src/features/email/templates/automation-mail.ts (new)

  Task 5 — Runner implementation
           apps/api/src/features/automations/automation-runner.ts

  Task 6 — Public slice barrel
           apps/api/src/features/automations/index.ts

  Task 7 — Swap stub → real runner
           apps/api/src/middleware/repository.middleware.ts

  Task 8 — Hook into content handlers (3 lines × 3 files)
           apps/api/src/features/content/handlers/create.ts
           apps/api/src/features/content/handlers/update.ts
           apps/api/src/features/content/handlers/delete.ts

  Task 9 — Tests (unit for utils + executors, integration for runner)
           apps/api/src/features/automations/__tests__/

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

4.1 TASK 1 — D1AutomationRepository (findActive subset)

  File: `apps/api/src/shared/automations.repository.d1.ts`

  Implement only the methods the runner needs. The remaining CRUD methods
  required by `IAutomationRepository` MUST be present (the class must
  implement the full interface) but can throw `Error('not implemented')`
  until #54/#55. This keeps the type contract honest while bounding scope.

  ```ts
  import type {
    IAutomationRepository, Automation, AutomationAction, TriggerCondition,
    AutomationTriggerEvent, CreateAutomationInput, UpdateAutomationInput,
  } from '@beechcms/core'

  interface AutomationRow {
    id: string
    seed_slug: string
    name: string
    enabled: number
    trigger_event: AutomationTriggerEvent
    trigger_cron: string | null
    trigger_conditions: string | null
    actions: string
    created_at: number
    updated_at: number
  }

  export class D1AutomationRepository implements IAutomationRepository {
    constructor(private readonly db: D1Database) {}

    async findActive(seedSlug: string, event: AutomationTriggerEvent): Promise<Automation[]> {
      const result = await this.db
        .prepare(
          `SELECT * FROM automations
           WHERE seed_slug = ? AND trigger_event = ? AND enabled = 1`
        )
        .bind(seedSlug, event)
        .all<AutomationRow>()
      return (result.results ?? []).map(rowToAutomation)
    }

    // CRUD methods throw until #54/#55 — interface contract preserved.
    list(): Promise<Automation[]>          { throw new Error('not implemented in sprint 08') }
    findById(): Promise<Automation | null> { throw new Error('not implemented in sprint 08') }
    create(): Promise<string>              { throw new Error('not implemented in sprint 08') }
    update(): Promise<void>                { throw new Error('not implemented in sprint 08') }
    toggle(): Promise<void>                { throw new Error('not implemented in sprint 08') }
    delete(): Promise<void>                { throw new Error('not implemented in sprint 08') }
  }

  function rowToAutomation(row: AutomationRow): Automation {
    return {
      id: row.id,
      seed_slug: row.seed_slug,
      name: row.name,
      enabled: row.enabled === 1,
      trigger_event: row.trigger_event,
      trigger_cron: row.trigger_cron,
      trigger_conditions: row.trigger_conditions
        ? (JSON.parse(row.trigger_conditions) as TriggerCondition[])
        : null,
      actions: JSON.parse(row.actions) as AutomationAction[],
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }
  ```

  Method signatures for the stubbed CRUD methods MUST match
  `IAutomationRepository` exactly — TypeScript will enforce this.
  Use parameter destructuring `(_input: CreateAutomationInput)` to keep
  the lint clean. The bodies just throw.

4.2 TASK 2 — Pure utilities

  File: `apps/api/src/features/automations/automation-runner.utils.ts`

  ```ts
  import type { TriggerCondition } from '@beechcms/core'

  export function evaluateConditions(
    conditions: TriggerCondition[] | null,
    entry: Record<string, unknown>,
  ): boolean {
    if (!conditions || conditions.length === 0) return true
    return conditions.every((condition) => evaluateSingle(condition, entry[condition.field]))
  }

  function evaluateSingle(c: TriggerCondition, actual: unknown): boolean {
    switch (c.op) {
      case 'eq':         return actual === c.value
      case 'neq':        return actual !== c.value
      case 'contains':   return typeof actual === 'string' && actual.includes(String(c.value))
      case 'gt':         return Number(actual) > Number(c.value)
      case 'lt':         return Number(actual) < Number(c.value)
      case 'isempty':    return actual == null || actual === ''
      case 'isnotempty': return actual != null && actual !== ''
      default: {
        const _exhaustive: never = c.op
        return false
      }
    }
  }

  /** Replaces `{{fieldAlias}}` with the entry value (or empty string). */
  export function interpolate(template: string, entry: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(entry[key] ?? ''))
  }
  ```

  Notes:
  - `eq`/`neq` use strict equality (`===`/`!==`), NOT loose equality from
    the issue spec. Loose equality is a known footgun and the type union
    in `TriggerCondition.value` is `unknown`; the user wires up matching
    types in the UI in #56.
  - Exhaustiveness check guarantees compile error if a new operator is
    added to `TriggerCondition['op']` without updating this function.

4.3 TASK 3 — Action executors

  Each executor file exports one async function. The dispatcher
  (`index.ts`) routes on `action.type`. Adding a new action type = add
  one file here + one case in the dispatcher. Nothing else changes.

  4.3.1 File: `apps/api/src/features/automations/action-executors/webhook.executor.ts`

  ```ts
  import type { AutomationAction } from '@beechcms/core'
  import { interpolate } from '../automation-runner.utils'

  type WebhookAction = Extract<AutomationAction, { type: 'webhook' }>

  export async function executeWebhook(
    action: WebhookAction,
    entry: Record<string, unknown>,
  ): Promise<void> {
    const body = action.body_template
      ? interpolate(action.body_template, entry)
      : JSON.stringify(entry)

    const response = await fetch(action.url, {
      method: action.method ?? 'POST',
      headers: { 'Content-Type': 'application/json', ...(action.headers ?? {}) },
      body,
    })

    if (!response.ok) {
      throw new Error(`Webhook ${action.url} responded ${response.status}`)
    }
  }
  ```

  4.3.2 File: `apps/api/src/features/automations/action-executors/send-mail.executor.ts`

  ```ts
  import type { AutomationAction } from '@beechcms/core'
  import { sendAutomationMail } from '../../email'
  import { interpolate } from '../automation-runner.utils'

  type SendMailAction = Extract<AutomationAction, { type: 'send_mail' }>

  export async function executeSendMail(
    action: SendMailAction,
    entry: Record<string, unknown>,
    env: { RESEND_API_KEY?: string; EMAIL_FROM?: string },
  ): Promise<void> {
    await sendAutomationMail({
      to: interpolate(action.to, entry),
      subject: interpolate(action.subject_template, entry),
      body: interpolate(action.body_template, entry),
      resendApiKey: env.RESEND_API_KEY,
      from: env.EMAIL_FROM,
    })
  }
  ```

  The runner imports the email slice through its **public barrel**
  (`features/email`), never reaching into `providers/resend` directly.

  4.3.3 File: `apps/api/src/features/automations/action-executors/edit-field.executor.ts`

  ```ts
  import type { AutomationAction, ContentRepository, Seed } from '@beechcms/core'
  import { interpolate } from '../automation-runner.utils'

  type EditFieldAction = Extract<AutomationAction, { type: 'edit_field' }>

  export async function executeEditField(
    action: EditFieldAction,
    entry: Record<string, unknown>,
    repository: ContentRepository,
    seed: Seed,
  ): Promise<void> {
    const id = entry.id
    if (typeof id !== 'string') {
      throw new Error('edit_field: entry.id missing')
    }
    const resolved = typeof action.value === 'string'
      ? interpolate(action.value, entry)
      : action.value
    await repository.update(seed, id, null, null, { [action.field]: resolved })
  }
  ```

  NOTE: verify the exact `ContentRepository.update` signature in
  `packages/core/src/content.repository.ts`. The above uses the
  `(seed, id, slug, status, data)` shape that matches `create()` in
  Sprint 02's documented call site. If the real `update` signature
  differs, adapt — but do NOT inline alias→ID translation; the
  repository handles it via the Botanical Engine.

  4.3.4 File: `apps/api/src/features/automations/action-executors/create-entry.executor.ts`

  ```ts
  import type { AutomationAction, ContentRepository, Seed } from '@beechcms/core'

  type CreateEntryAction = Extract<AutomationAction, { type: 'create_entry' }>
  type SeedResolver = (slug: string) => Seed | null

  export async function executeCreateEntry(
    action: CreateEntryAction,
    entry: Record<string, unknown>,
    repository: ContentRepository,
    getSeed: SeedResolver,
    idGenerator: { newId: () => string },
  ): Promise<void> {
    const targetSeed = getSeed(action.seed_slug)
    if (!targetSeed) throw new Error(`create_entry: unknown seed ${action.seed_slug}`)

    const payload: Record<string, unknown> = {}
    for (const [targetField, sourceField] of Object.entries(action.field_map)) {
      // If source field exists on the trigger entry, copy it; otherwise treat
      // the mapping value as a literal string (per issue spec).
      payload[targetField] = sourceField in entry ? entry[sourceField] : sourceField
    }

    await repository.create(targetSeed, idGenerator.newId(), null, 'draft', payload)
  }
  ```

  ID generation goes through the injected `IIdGenerator`, never
  `crypto.randomUUID()` directly. This matches the rest of the codebase
  and keeps tests deterministic.

  4.3.5 File: `apps/api/src/features/automations/action-executors/index.ts`

  ```ts
  import type {
    AutomationAction, ContentRepository, Seed, IIdGenerator,
  } from '@beechcms/core'
  import { executeWebhook }     from './webhook.executor'
  import { executeSendMail }    from './send-mail.executor'
  import { executeEditField }   from './edit-field.executor'
  import { executeCreateEntry } from './create-entry.executor'

  export interface ActionContext {
    entry: Record<string, unknown>
    env: Record<string, string | undefined>
    repository: ContentRepository
    getSeed: (slug: string) => Seed | null
    seed: Seed
    idGenerator: IIdGenerator
  }

  export async function executeAction(action: AutomationAction, ctx: ActionContext): Promise<void> {
    switch (action.type) {
      case 'webhook':      return executeWebhook(action, ctx.entry)
      case 'send_mail':    return executeSendMail(action, ctx.entry, ctx.env)
      case 'edit_field':   return executeEditField(action, ctx.entry, ctx.repository, ctx.seed)
      case 'create_entry': return executeCreateEntry(action, ctx.entry, ctx.repository, ctx.getSeed, ctx.idGenerator)
      default: {
        const _exhaustive: never = action
        throw new Error(`unknown action type: ${(action as { type: string }).type}`)
      }
    }
  }
  ```

4.4 TASK 4 — Generic mail entry in email slice

  The issue assumes a generic `sendMail` exists in the email slice. It
  doesn't. Add one without touching the existing password flows.

  4.4.1 File: `apps/api/src/features/email/email.types.ts` (append)

  ```ts
  export interface AutomationMailParams {
    to: string
    subject: string
    /** Plain text or HTML — passed verbatim to provider. */
    body: string
    resendApiKey?: string
    from?: string
  }
  ```

  4.4.2 File: `apps/api/src/features/email/templates/automation-mail.ts` (new)

  ```ts
  import type { AutomationMailParams } from '../email.types'

  /** Identity builder: automation payloads are already user-authored. */
  export function buildAutomationEmail(params: AutomationMailParams) {
    return {
      to: params.to,
      subject: params.subject,
      html: params.body,
      text: stripHtml(params.body),
    }
  }

  function stripHtml(input: string): string {
    return input.replace(/<[^>]+>/g, '').trim()
  }
  ```

  4.4.3 File: `apps/api/src/features/email/email.service.ts` (append export)

  Add alongside the existing service functions — same `createProvider()`
  factory, same provider abstraction. Do NOT introduce a second
  `ResendEmailProvider` import path.

  ```ts
  import { buildAutomationEmail } from './templates/automation-mail'
  import type { AutomationMailParams } from './email.types'

  export async function sendAutomationMail(params: AutomationMailParams): Promise<void> {
    const provider = createProvider(params.resendApiKey)
    const message = buildAutomationEmail(params)
    await provider.send({
      from: params.from ?? DEFAULT_FROM,
      ...message,
    })
  }
  ```

  Verify `createProvider`'s actual signature in the existing file. If it
  takes additional params, mirror the call shape of
  `sendPasswordResetEmail` exactly. The goal: no duplicate provider
  instantiation logic.

  4.4.4 File: `apps/api/src/features/email/index.ts` (append)

  ```ts
  export { sendAutomationMail } from './email.service'
  export type { AutomationMailParams } from './email.types'
  ```

4.5 TASK 5 — AutomationRunner

  File: `apps/api/src/features/automations/automation-runner.ts`

  ```ts
  import type {
    IAutomationRunner, IAutomationRepository, AutomationEventPayload,
    ContentRepository, Seed, IIdGenerator,
  } from '@beechcms/core'
  import { evaluateConditions } from './automation-runner.utils'
  import { executeAction } from './action-executors'

  export interface AutomationRunnerDeps {
    automationRepository: IAutomationRepository
    contentRepository: ContentRepository
    getSeed: (slug: string) => Seed | null
    idGenerator: IIdGenerator
    env: Record<string, string | undefined>
  }

  export class AutomationRunner implements IAutomationRunner {
    constructor(private readonly deps: AutomationRunnerDeps) {}

    async run(payload: AutomationEventPayload): Promise<void> {
      const { seedSlug, event, entry } = payload
      const seed = this.deps.getSeed(seedSlug)
      if (!seed) return

      const automations = await this.deps.automationRepository.findActive(seedSlug, event)

      for (const automation of automations) {
        if (!evaluateConditions(automation.trigger_conditions, entry)) continue

        for (const action of automation.actions) {
          try {
            await executeAction(action, {
              entry,
              env: this.deps.env,
              repository: this.deps.contentRepository,
              getSeed: this.deps.getSeed,
              seed,
              idGenerator: this.deps.idGenerator,
            })
          } catch (error) {
            // Isolated per action: one bad webhook never blocks a valid email.
            console.error('[automations] action failed', {
              automationId: automation.id,
              actionType: action.type,
              error,
            })
          }
        }
      }
    }
  }
  ```

  Design choices:
  - **DI via constructor**: runner takes `AutomationRunnerDeps`, NOT a
    raw `D1Database`. The issue example couples to `D1AutomationRepository`
    inside the constructor — this prevents test injection. Reading
    Beech's existing patterns (e.g. `D1ContentRepository` is always
    injected, never instantiated by the consumer), DI is the house style.
  - **Error isolation per action, not per automation**: a misconfigured
    webhook inside automation A must not block a valid email inside
    automation A's next action. Wrap each `executeAction` call.
  - **No `Promise.all`**: actions execute serially because `edit_field`
    or `create_entry` may depend on prior actions in the same automation.
    Run them in declared order.

4.6 TASK 6 — Slice barrel

  File: `apps/api/src/features/automations/index.ts`

  ```ts
  export { AutomationRunner } from './automation-runner'
  export type { AutomationRunnerDeps } from './automation-runner'
  ```

  Only the runner class is exposed. Executors and utils are slice-private.
  Repository D1 impl lives under `apps/api/src/shared/` (matches every
  other repository) and is imported by the middleware, not by callers.

4.7 TASK 7 — Swap stub in repositoryMiddleware

  File: `apps/api/src/middleware/repository.middleware.ts`

  Current line 15:
  ```ts
  import { SystemClock, SystemIdGenerator, NoOpAutomationRunner } from '@beechcms/core'
  ```

  Change to:
  ```ts
  import { SystemClock, SystemIdGenerator } from '@beechcms/core'
  import { AutomationRunner } from '../features/automations'
  import { D1AutomationRepository } from '../shared/automations.repository.d1'
  ```

  Remove `NoOpAutomationRunner` from the `@beechcms/core` import — it is
  no longer used in production wiring (still exported from core for
  test scenarios).

  Replace line 59:
  ```ts
  context.set('automationRunner', overrides?.automationRunner ?? new NoOpAutomationRunner())
  ```
  With:
  ```ts
  context.set(
    'automationRunner',
    overrides?.automationRunner ?? new AutomationRunner({
      automationRepository: new D1AutomationRepository(database),
      contentRepository: context.get('repository'),
      getSeed: context.get('getSeed'),
      idGenerator: resolvedIdGenerator,
      env: context.env as unknown as Record<string, string | undefined>,
    }),
  )
  ```

  Ordering matters: `context.set('repository', ...)` runs at line 44
  before the automationRunner registration, so `context.get('repository')`
  is safe here. `getSeed` is set by an earlier middleware
  (`factory.ts` line ~91 area); verify it is set before
  `repositoryMiddleware` runs — if not, fall back to importing
  `seedRegistry` directly and building a `(slug) => seedRegistry.get(slug) ?? null` resolver inline.

4.8 TASK 8 — Wire content handlers

  Three files, three identical 3-line additions. Place each block
  immediately **after** the existing `activityLogger.log(...)` call site
  in that handler, and **before** the `return c.json(...)` statement.

  4.8.1 `apps/api/src/features/content/handlers/create.ts`

  After line 126 (`context.get('activityLogger').log(...)`):

  ```ts
  context.executionCtx.waitUntil(
    context.get('automationRunner').run({
      seedSlug: slug,
      event: 'create',
      entry: { id, slug: finalSlug, status, ...privacyData },
    }),
  )
  ```

  Variable names (`slug`, `id`, `finalSlug`, `status`, `privacyData`)
  match those already in scope at line 126 — verify locally.

  4.8.2 `apps/api/src/features/content/handlers/update.ts`

  After the activity log call in `updateHandler()`:

  ```ts
  context.executionCtx.waitUntil(
    context.get('automationRunner').run({
      seedSlug: slug,
      event: 'update',
      entry: updatedEntry,           // post-engine dbToApi result
    }),
  )
  ```

  Use the already-built API-shape entry returned by the handler; if the
  handler re-fetches and runs `dbToApi`, reuse that result rather than
  re-fetching.

  4.8.3 `apps/api/src/features/content/handlers/delete.ts`

  After the activity log call in `deleteHandler()`:

  ```ts
  context.executionCtx.waitUntil(
    context.get('automationRunner').run({
      seedSlug: slug,
      event: 'delete',
      entry: deletedEntry,           // last known state before delete
    }),
  )
  ```

  For delete, capture the entry **before** calling `repository.delete()`
  (re-read it, or have `repository.delete` return the prior row if its
  signature allows). Without this, the entry payload to the automation
  is empty — webhooks and templates lose all context.

  None of these handlers gain new imports — `IAutomationRunner` is
  resolved purely through `context.get()`.

4.9 TASK 9 — Tests

  File: `apps/api/src/features/automations/__tests__/automation-runner.utils.test.ts`

  Cover `evaluateConditions` for every operator (eq, neq, contains, gt,
  lt, isempty, isnotempty), null/empty array short-circuit, type
  coercion in `gt`/`lt`. Cover `interpolate` for: present field, missing
  field (→ empty string), multiple placeholders, no placeholders.

  File: `apps/api/src/features/automations/__tests__/action-executors.test.ts`

  - webhook: mock `fetch`, assert URL/method/headers/body; assert throw
    on non-2xx.
  - send_mail: mock the email service `sendAutomationMail`, assert
    interpolation happened on `to`/`subject`/`body`.
  - edit_field: mock `ContentRepository`, assert `update` called with
    interpolated value when value is string, raw value when not.
  - create_entry: assert `getSeed` lookup, `idGenerator.newId()` use,
    field map → payload conversion (existing field → entry value,
    non-matching key → literal string).

  File: `apps/api/src/features/automations/__tests__/automation-runner.test.ts`

  - Run with no matching automations → no side effects.
  - Run with one automation, conditions false → no actions invoked.
  - Run with two actions, first throws → second still runs.
  - Run with `getSeed` returning `null` → no actions invoked, no throw.

  Inject mock `IAutomationRepository` and `ContentRepository` —
  the constructor takes deps explicitly, no D1 needed in tests.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from repo root after all tasks:

  1. `pnpm run build` in `packages/core/` — no changes expected, must still
     emit cleanly (catches accidental edits to core barrel).
  2. `npx tsc --noEmit` in `apps/api/` — zero errors. Particular focus:
     `AutomationAction` discriminated union exhaustiveness in
     `executeAction`.
  3. `pnpm run test` in `apps/api/` — all new tests pass; existing tests
     unaffected (NoOpAutomationRunner is no longer registered, but
     content handlers only call `.run()` via context; no test should
     break unless it asserted on absence of a side effect).
  4. `pnpm run db:reset:local` in `apps/api/` — migrations apply.
  5. `pnpm run dev` at root — API boots (:8789), Dashboard boots (:5173).
  6. Smoke test:
       a. Insert via `wrangler d1 execute` a test row into `automations`
          with `seed_slug='posts'`, `trigger_event='create'`,
          `actions='[{"type":"webhook","url":"https://webhook.site/<id>"}]'`,
          `enabled=1`.
       b. `POST /api/content/posts` with a valid payload.
       c. Response 201 returns immediately.
       d. Webhook.site shows the POST within a few seconds (waitUntil).

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

  [x] `AutomationRunner` implements `IAutomationRunner`
  [x] Constructor takes `AutomationRunnerDeps` — no `D1Database` arg
  [x] `D1AutomationRepository` implements `IAutomationRepository`;
      `findActive` is functional, CRUD methods throw `not implemented`
  [x] `evaluateConditions` and `interpolate` are pure (no DB, no fetch)
      and unit-tested
  [x] Each action executor lives in its own file under
      `action-executors/` and is invoked via the dispatcher switch
  [x] Error in one action is logged and does NOT skip remaining actions
      in the same automation
  [x] `executeAction` switch is exhaustive over `AutomationAction['type']`
      (TypeScript `never` guard)
  [x] Email slice exposes `sendAutomationMail` via its public barrel;
      runner never imports `providers/resend` directly
  [x] `repositoryMiddleware` registers `AutomationRunner` (not the
      no-op); `NoOpAutomationRunner` no longer imported in middleware
  [x] `create.ts`, `update.ts`, `delete.ts` each add exactly one
      `waitUntil(runner.run(...))` block; no other changes to handlers
  [x] `tsc --noEmit` passes across the monorepo
  [ ] Smoke test in Section 5.6 succeeds end-to-end

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

  - REST endpoints `/api/automations/*` (CRUD on automations) — Task #55
  - Full `D1AutomationRepository` (list/create/update/toggle/delete) — Task #54
  - Dashboard UI for managing automations — Task #56
  - Cron trigger handler (Workers Cron Triggers) — Task #53b
  - Retry policy / dead-letter queue for failed actions — future
  - Per-automation observability (run history, last-fired timestamp) — future
  - Loop detection (automation A fires automation B fires automation A) — future
