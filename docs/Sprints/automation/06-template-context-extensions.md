You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

Do NOT explore the codebase further. All relevant context is provided in this
prompt. Read it fully before writing any code.

This sprint covers **Sprint 6 of the Automations Engine milestone**: extending
the template/context layer used by automation actions so that authors can
reference data from *other* seeds, aggregate over collections, and pick a
specific entry from a seed — not only the entry that fired the trigger.

It builds on:

- Sprint 1 (`AutomationRunner`, `interpolate`)
- Sprint 2 (cron handler with batch + per-entry actions)
- Sprint 4 (CRUD API for automations)
- Sprint 5 (Dashboard UI)

The new layer is **trigger-agnostic**: it powers cron, create, update and
delete triggers identically. It is the foundation for "complex" native
automations such as welcome emails, "top-customer-for-product" reports,
inventory roll-ups, and any future report-style action.

### Stack

- API: Hono on Cloudflare Workers, D1 (SQLite), R2
- Dashboard: React + TanStack Query + axios
- Shared package: @beechcms/core
- Monorepo: Turborepo

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS
==========================================================================

Today the template engine (`interpolate` in
`apps/api/src/features/automations/automation-runner.utils.ts`) only resolves
keys against the entry object passed by the runner. Two structural limits:

1. **Single-entry context.** For cron batch actions the runner injects the
   *first* matching entry plus `{{_count}}` (`cron-runner.ts:92`). This is
   arbitrary and misleading — authors writing a "top customer per product"
   report cannot pick *which* entry to expose, nor reach into a sibling seed.

2. **No cross-seed access.** An action triggered on `orders` cannot read
   the related `customer` entry. The runner does not expose the
   `ContentRepository` to the template layer. Workarounds (storing the
   customer's email on the order) duplicate state and defeat the seed
   model.

This sprint introduces a **context resolver** that:

- Extends the template grammar with seed-scoped lookups and aggregates.
- Adds an optional `context` block on `Automation` (parallel to `actions`)
  that pre-loads named queries before action execution.
- Honours the same Botanical Engine alias↔ID translation already used by
  `ContentRepository.findMany`, so authors write seed-native aliases
  (`{{customers:firstone:email}}`), never internal `br_NN` IDs.

VSA rule: the resolver lives inside the automations slice. It depends on
`ContentRepository` and the seed registry through DI — both already on the
`ActionContext` (`apps/api/src/features/automations/action-executors/index.ts:7`).

==========================================================================
SECTION 2 — CURRENT STATE (verified, do not re-explore)
==========================================================================

2.1 TEMPLATE ENGINE — `automation-runner.utils.ts`

  ```ts
  export function interpolate(
    template: string,
    entry: Record<string, unknown>,
    defaultValue = '',
    onMissing?: (field: string) => void,
  ): string
  ```

  Replaces `{{ key }}` and `{ key }`. Supports dot paths via `resolvePath`.
  No async, no I/O, no seed awareness. Used by every executor.

2.2 ACTION CONTEXT — `action-executors/index.ts`

  ```ts
  export interface ActionContext {
    env: Record<string, string | undefined>
    repository: ContentRepository
    getSeed: (slug: string) => Seed | null
    seed: Seed                       // the triggering seed
    entry: Record<string, unknown>   // the triggering entry (or batch first)
    idGenerator: IIdGenerator
  }
  ```

  All four executors (`webhook`, `send-mail`, `edit-field`, `create-entry`)
  call `interpolate(template, ctx.entry, ...)`. None of them currently see
  more than the single entry.

2.3 BATCH CRON — `cron-runner.ts:67–103`

  Cron handler classifies actions into `PER_ENTRY_ACTIONS`
  (`edit_field`, `create_entry`) vs batch (`send_mail`, `webhook`). Batch
  actions receive `{ ...entries[0], _count: entries.length }`. This sprint
  generalises that synthesis: the cron handler builds a richer context
  object and hands it to the resolver, so batch templates can iterate or
  aggregate over the full `entries` array.

2.4 CONTENT REPOSITORY — verified shape

  `ContentRepository.findMany(seed, options): Promise<{ items, total }>`
  Accepts `{ filters, status, pagination, search, sort }`. Already used by
  `cron-runner.ts` (line 147). Returns API-aliased rows (post-`dbToApi`).

2.5 AUTOMATION TYPE — `packages/core/src/automations.types.ts`

  `Automation` currently has `actions: AutomationAction[]`. No `context`
  field. The D1 schema (`0029_automations.sql`) stores `actions` as a JSON
  text column. Sprint 0 left room for additive JSON shape changes — no
  migration is required for new optional fields on either side as long as
  the new column is added explicitly.

2.6 SEED REGISTRY

  `getSeed(slug)` returns a `Seed` with `branches[]`. Branch lookup
  (`alias` → branch) is already done in `cron-runner.ts:129` via
  `seed.branches.find((b) => b.alias === c.field)`. The same lookup is
  needed by the new aggregate helpers to validate fields.

==========================================================================
SECTION 3 — DESIGN
==========================================================================

3.1 TEMPLATE GRAMMAR — backwards compatible

  Existing forms keep their meaning:

    `{{title}}`              → current entry's `title` (unchanged)
    `{{author.name}}`        → dot-path on current entry (unchanged)
    `{{_count}}`             → batch count in cron (unchanged)

  New forms (recognised only when the key contains `:`):

    `{{<scope>:<selector>:<field>}}`

  `<scope>` is one of:

    `this`                   the triggering entry (alias for current behaviour)
    `batch`                  the full array of matched entries (cron only)
    `<seedSlug>`             a sibling seed by slug
    `<contextKey>`           a named pre-loaded query (see §3.2)

  `<selector>` is one of:

    `lastone`                most recent by `created_at DESC` (DEFAULT when
                              selector omitted — `{{customers:email}}` ≡
                              `{{customers:lastone:email}}`)
    `firstone`               oldest by `created_at ASC`
    `byid(<id>)`             specific entry by primary id
    `where(<alias>=<value>)` first entry matching equality filter
    `all`                    the full list — only valid before an aggregate

  `<field>` is either a seed branch alias (or system column: `id`, `slug`,
  `status`, `created_at`, `updated_at`) **or** an aggregate when the
  selector is `all`:

    `count`                  cardinality
    `sum:<alias>`            sum of numeric branch
    `avg:<alias>`            average
    `min:<alias>` / `max:<alias>`
    `pluck:<alias>`          comma-joined list of values (top 100)

  Examples:

    `{{customers:firstone:email}}`
    `{{customers:byid(c_42):name}}`
    `{{orders:where(status=paid):total}}`
    `{{orders:all:count}}`
    `{{orders:all:sum:total}}`
    `{{batch:count}}` / `{{batch:all:pluck:email}}`

  Quote-free for now. Values inside `where(...)` and `byid(...)` are
  literal strings — numeric and boolean coercion happens at filter build
  time, mirroring `query-builder.ts:toEngineFilters` semantics.

3.2 CONTEXT BLOCK — named pre-loaded queries

  Add an optional `context` field on `Automation`:

  ```ts
  export interface AutomationContextLoad {
    as: string                       // variable name, kebab/camel/snake
    seed_slug: string
    selector?: 'lastone' | 'firstone' | 'all' | { byid: string }
                                     // omitted → lastone
    where?: TriggerCondition[]       // applied as filters
    order_by?: string                // alias or system column
    order?: 'asc' | 'desc'
    limit?: number                   // default 100, hard cap 1000
  }

  export interface Automation {
    // …existing fields…
    context?: AutomationContextLoad[]
  }
  ```

  Resolution order at run time:

  1. Build the **template context** object:
     ```ts
     {
       this:  triggeringEntry,
       batch: entries,                 // cron only — single-element array
                                       //   for CRUD triggers
       // named loads from automation.context, resolved in declaration order
       <as_1>: resolvedEntryOrList,
       <as_2>: …,
     }
     ```
  2. Each `context[i]` may reference earlier loads and `this` in its
     `where.value` via `{{…}}` (recursive interpolation, one pass — no
     transitive expansion to avoid quoting hell).
  3. Pass the assembled context to every action's templated fields.

  Why pre-load instead of resolving lazily inside `interpolate`?
  Three reasons:

  - **Determinism.** All I/O for one automation run happens up front; the
    template pass is sync, matching `interpolate`'s current shape.
  - **Cost.** A single template can reference `{{customers:email}}` ten
    times; pre-loading queries once de-duplicates the work.
  - **Audit.** Context loads are inspectable and loggable as a unit
    (future observability hook), separate from action execution.

  Inline `{{<seedSlug>:…}}` lookups are still allowed — they desugar to
  an anonymous context load with the same caching scope (memoised inside
  one run by `(seedSlug, selector, where)` key).

3.3 TRIGGER COVERAGE

  Resolver works for every `AutomationTriggerEvent`:

  - **create/update/delete** — `this` is the triggering entry,
    `batch = [this]`, all other scopes resolve via `ContentRepository`.
  - **cron** — `this` is the per-entry row (per-entry actions) or the
    first row (batch actions, for backwards compatibility),
    `batch` is the full matched list. Aggregates over `batch` now work
    natively (`{{batch:all:count}}` replaces today's ad-hoc `{{_count}}`,
    which stays as a deprecated alias for one release cycle).

3.4 SECURITY / SAFETY

  - **Slug allowlist.** Resolver only accepts slugs present in the seed
    registry. Unknown slug → render `defaultValue` and call `onMissing`.
  - **Field allowlist.** Field must be a known branch alias or system
    column of that seed. Unknown field → `defaultValue` + `onMissing`.
  - **Hard limits.** Each `all`/aggregate query caps at 1000 rows (same
    limit as `cron-runner.fetchMatchingEntries`). `pluck` truncates the
    rendered list at 100 values; `_truncated` marker appended.
  - **No template-in-id execution.** `byid(<id>)` does NOT interpolate
    `{{…}}` *inside* the parentheses unless the id literal is wrapped in
    `<>` braces explicitly: `byid({{this.customer_id}})` works because
    the outer pass expands first, then the resolver sees a static id.
    Document this in the UI.

==========================================================================
SECTION 4 — DELIVERABLES
==========================================================================

Single PR. Order within a file matters; files are independent.

  [x] Task 1 — Types
    `packages/core/src/automations.types.ts`
      + `AutomationContextLoad`, `AutomationContextSelector`
      + `Automation.context?: AutomationContextLoad[]`

  [x] Task 2 — D1 migration
    `apps/api/migrations/0030_automations_context.sql`
      ALTER TABLE automations ADD COLUMN context TEXT NULL.
      Repository (read+write paths in
      `apps/api/src/shared/automations.repository.d1.ts`) parses/serialises
      it as JSON, identical to `actions`.

  [x] Task 3 — Template grammar parser (pure)
    `apps/api/src/features/automations/template-grammar.ts`
      `parseTemplateKey(raw: string): ParsedKey`
      Returns a discriminated union covering `{simple}`, `{scope, selector,
      field, aggregate, args}` etc. Pure function, fully unit-testable.

  [x] Task 4 — Resolver
    `apps/api/src/features/automations/context-resolver.ts`
      `resolveAutomationContext(deps, automation, triggerEntry, batchEntries):
        Promise<ResolvedContext>`
      Pre-loads `automation.context` declarations and exposes `lookup(key)`
      used by the new `interpolate`. Handles caching, slug/field
      validation, aggregates.
    `apps/api/src/features/automations/filter-translation.ts`
      `conditionToFilterGroup` extracted as shared util (was in cron-runner).

  [x] Task 5 — Interpolate v2
    Replace `interpolate` body in `automation-runner.utils.ts` with the
    grammar-aware version. Existing call sites (`webhook`, `send_mail`,
    `edit_field`, `create_entry`) pass `ResolvedContext` instead of the
    raw entry object — keep a thin `interpolateLegacy(template, entry)`
    overload for tests that still pass a plain record.

  [x] Task 6 — Runner integration
    `automation-runner.ts` and `cron-runner.ts`:
      - Build `ResolvedContext` once per `run()` (CRUD) or per automation
        (cron) before iterating actions.
      - Replace ad-hoc `{ ...entries[0], _count }` synthesis with
        `{ this: entries[0] ?? null, batch: entries }`.
      - Keep `_count` working as a legacy alias mapped to
        `batch:all:count` — emit a console.warn once per run.
      - `deriveEntryContext()` for per-entry cron (shared seed-query cache).

  [x] Task 7 — CRUD API
    Sprint 4 handler / schema files in
    `apps/api/src/features/automations/automations.{handler,schema}.ts`:
      - Zod schema accepts optional `context` with the new shape.
      - Validation rejects unknown selector kinds, `limit > 1000`,
        unknown `seed_slug`.

  [x] Task 8 — Dashboard UI
    `apps/dashboard/src/features/automations/components/automation-editor/`:
      - New "Context" panel (ContextSection + ContextLoadCard) above "Actions".
      - Seed picker, selector dropdown (lastone/firstone/all/byid), order/limit.
      - TODO: where-condition builder (requires TriggerCondition UI reuse).
      - TODO: template input autocomplete dropdown.
      - i18n: added keys under `automations.context.*` in
        `apps/dashboard/src/locales/{it,en}.json`.

  [x] Task 9 — Tests
    `apps/api/src/features/automations/__tests__/`
      `template-grammar.test.ts`     — parser, ~25 cases
      `context-resolver.test.ts`     — resolver with mock repository:
        - `this`, `batch`, named load, inline seed lookup
        - aggregates: count, sum, avg, min, max, pluck
        - selectors: lastone (default), firstone, byid, where
        - unknown slug / field → defaultValue + onMissing fires
        - limit cap, pluck truncation
        - recursive `where.value` interpolation (one pass only)
      `cron-runner.test.ts` (extend) — assert new batch shape
      `automation-runner.test.ts` (extend) — assert CRUD trigger shape

==========================================================================
SECTION 5 — TASK DETAILS
==========================================================================

5.1 TASK 1 — Types

  ```ts
  // packages/core/src/automations.types.ts

  export type AutomationContextSelector =
    | { kind: 'lastone' }
    | { kind: 'firstone' }
    | { kind: 'all' }
    | { kind: 'byid'; id: string }

  export interface AutomationContextLoad {
    as: string
    seed_slug: string
    selector?: AutomationContextSelector   // default { kind: 'lastone' }
    where?: TriggerCondition[]
    order_by?: string
    order?: 'asc' | 'desc'
    limit?: number                         // default 100, max 1000
  }

  export interface Automation {
    // …existing fields…
    context: AutomationContextLoad[] | null
  }
  ```

  `context` is `null` when no loads are declared — matches the existing
  `trigger_conditions: TriggerCondition[] | null` convention.

5.2 TASK 3 — Grammar parser (pure)

  ```ts
  // template-grammar.ts

  export type ParsedKey =
    | { kind: 'simple'; path: string }                   // {title}, {a.b.c}
    | {
        kind: 'scoped'
        scope: string                                    // this | batch | <slug> | <ctxKey>
        selector: AutomationContextSelector
        op: 'field' | 'count' | 'sum' | 'avg' | 'min' | 'max' | 'pluck'
        field: string | null                             // null for count
      }

  export function parseTemplateKey(raw: string): ParsedKey | null
  ```

  Tokenising rules:

  - Split on `:` at the top level. Parens `(...)` are atomic — commas and
    colons inside parens belong to the argument list, not to the token
    stream.
  - 1 token → `simple`.
  - First token is a known keyword (`this`, `batch`) OR matches the
    `[a-z0-9_-]+` slug pattern → `scoped`. Default selector when only
    two tokens (`<scope>:<field>`).
  - Aggregates (`count`/`sum`/…) require the selector to be `all` —
    enforce this in the parser; reject otherwise.

  This file has zero imports — pure string handling.

5.3 TASK 4 — Resolver

  ```ts
  // context-resolver.ts

  import type {
    Automation, AutomationContextLoad, ContentRepository, Seed,
    TriggerCondition,
  } from '@beechcms/core'
  import type { ParsedKey } from './template-grammar'

  export interface ResolverDeps {
    contentRepository: ContentRepository
    getSeed: (slug: string) => Seed | null
  }

  export interface ResolvedContext {
    lookup(key: ParsedKey): unknown      // returns value or undefined
  }

  export async function resolveAutomationContext(
    deps: ResolverDeps,
    automation: Automation,
    triggerEntry: Record<string, unknown> | null,
    batchEntries: Array<Record<string, unknown>>,
  ): Promise<ResolvedContext>
  ```

  Implementation outline:

  - Build a `Map<string, Promise<unknown>>` keyed by the canonical scope
    signature `${slug}|${selector}|${whereHash}|${order}|${limit}`.
  - For each declared `automation.context[i]`:
      a. Interpolate `where[*].value` against the partial context built
         so far (one pass).
      b. Fire `contentRepository.findMany(seed, …)` with translated
         filters via the existing `conditionToFilterGroup` helper —
         **promote it to a shared util** in
         `apps/api/src/features/automations/filter-translation.ts` so
         the cron handler and the resolver share one implementation.
      c. Store the result under `as`.
  - `lookup(parsed)`:
      - `simple` → `resolvePath(this, path)`
      - `scoped` with scope `this` → `resolvePath(triggerEntry, field)`
      - scope `batch` → operates on `batchEntries` (count/sum/pluck/…)
      - scope is a named context key → use the stored result
      - scope is an unknown identifier → check seed registry; if it's a
        seed slug, build an anonymous load with the parsed selector
        and resolve on-demand (memoised). If neither → `undefined`
        (triggers `onMissing` in `interpolate`).

  Aggregate implementations are arithmetic on the result array — no
  SQL aggregates yet (D1 is fast enough at 1000-row caps, and keeping
  the aggregate semantics in TS avoids dialect drift).

5.4 TASK 5 — Interpolate v2

  Signature change (additive):

  ```ts
  export function interpolate(
    template: string,
    context: ResolvedContext | Record<string, unknown>,
    defaultValue = '',
    onMissing?: (field: string) => void,
  ): string
  ```

  When `context` looks like a plain record (no `lookup`), wrap it in an
  ad-hoc `ResolvedContext` that only knows the `this` scope — keeps
  every existing test green.

5.5 TASK 6 — Runner integration

  In `AutomationRunner.run()` (`automation-runner.ts`):

  ```ts
  const resolved = await resolveAutomationContext(
    { contentRepository: deps.contentRepository, getSeed: deps.getSeed },
    automation,
    entry,
    [entry],
  )
  for (const action of automation.actions) {
    if (!evaluateConditions(automation.trigger_conditions, entry)) continue
    await executeAction(action, { ...baseCtx, entry, context: resolved })
  }
  ```

  In `cron-runner.ts`:

  - Build `resolved` once per automation **before** the action loop with
    `triggerEntry = entries[0] ?? null, batchEntries = entries`.
  - Per-entry actions rebuild a cheap derivative `ResolvedContext` whose
    `this` is the current entry — this re-uses the same cached seed
    queries (only the `this` scope differs).

  `ActionContext` (in `action-executors/index.ts`) grows one field:

  ```ts
  context: ResolvedContext
  ```

  Each executor switches from `interpolate(tpl, ctx.entry)` to
  `interpolate(tpl, ctx.context)`.

5.6 TASK 8 — Dashboard UI

  Component layout:

  ```
  AutomationEditor
   ├── TriggerSection             (existing)
   ├── ContextSection             (NEW)
   │    └── ContextLoadCard[]     repeat for each declared load
   │         seed picker · selector · where-builder · order · limit
   └── ActionsSection             (existing)
        actions get a new "Insert variable" button that opens a
        keyed-list popover backed by the parsed context schema
  ```

  Variable popover groups:

  - **This entry** — branches of the triggering seed.
  - **Batch** — `count`, `pluck:<alias>`, `sum:<numeric>` per numeric
    branch.
  - **Loaded context** — one entry per declared `context[i].as` with
    its seed's branches.
  - **Other seeds** — every registered slug; selector defaults shown
    inline (`lastone` greyed as default).

  i18n keys (sample):

  ```jsonc
  "automations.context.title": "Context"
  "automations.context.add": "Load data"
  "automations.context.as": "Variable name"
  "automations.context.selector.lastone": "Most recent"
  "automations.context.selector.firstone": "Oldest"
  "automations.context.selector.byid": "Specific entry by id"
  "automations.context.selector.all": "All matching entries"
  ```

5.7 TASK 9 — Tests highlight

  `context-resolver.test.ts` mandatory cases:

  1. `this` scope returns triggering entry's field.
  2. `batch:all:count` matches `batchEntries.length`.
  3. `<slug>:lastone:<field>` calls `findMany` with `limit:1`,
     `order_by:'created_at'`, `order:'desc'`.
  4. `<slug>:byid(x):<field>` calls `findMany` with the id filter.
  5. Named context with `where.value = "{{this.product_id}}"` resolves
     the value before issuing the query.
  6. Two references to the same `<slug>:lastone:<field>` issue ONE
     repository call (memoisation).
  7. Unknown slug → `lookup` returns `undefined`; `interpolate` falls
     back to `defaultValue` and fires `onMissing` once.
  8. `pluck` over 150 rows truncates to 100 and appends ` …` marker.
  9. `sum`/`avg` on a non-numeric field returns `0` and fires
     `onMissing`.
  10. Recursive `where.value` interpolation is one-pass: a value
      containing `{{this.x}}` is expanded; a value containing
      `{{other_ctx.y}}` where `other_ctx` is declared *after* the
      current load resolves to `defaultValue` (no forward refs).

==========================================================================
SECTION 6 — VALIDATION
==========================================================================

  1. `npm run build` in `packages/core/` — types compile clean.
  2. `npx tsc --noEmit` in `apps/api/` — zero errors.
  3. `npx tsc --noEmit` in `apps/dashboard/` — zero errors.
  4. `npm run test` in `apps/api/` — all new tests pass; pre-existing
     automation tests pass without modification (the legacy interpolate
     overload guarantees this).
  5. `npm run db:reset:local` — `0030_automations_context.sql` applies.
  6. End-to-end smoke (cron, real Worker):

     a. Seed: `orders` (alias `total: number`, `customer_id: text`,
        `status: text`) and `customers` (alias `email`, `name`).
     b. Insert one customer `c_1`, three orders for `c_1` with totals
        10, 20, 30.
     c. Create automation:
        ```jsonc
        {
          "seed_slug": "orders",
          "trigger_event": "cron",
          "trigger_cron": "* * * * *",
          "context": [
            { "as": "topCustomer", "seed_slug": "customers",
              "selector": { "kind": "byid", "id": "c_1" } }
          ],
          "actions": [{
            "type": "send_mail",
            "to": "{{topCustomer.email}}",
            "subject_template": "Your {{batch:all:count}} orders",
            "body_template": "Total spent: {{orders:all:sum:total}}"
          }]
        }
        ```
     d. `wrangler dev --test-scheduled` + `curl /__scheduled?cron=*+*+*+*+*`
     e. Expect: one email to `c_1`'s address, subject "Your 3 orders",
        body "Total spent: 60".

  7. End-to-end smoke (welcome email, create trigger):

     Automation on `users` seed, `trigger_event: create`, action
     `send_mail` with `to: {{this.email}}`, subject and body referencing
     `{{this.name}}`. Creating a user via the dashboard triggers
     exactly one email.

==========================================================================
SECTION 7 — ACCEPTANCE CRITERIA
==========================================================================

  [ ] `interpolate` understands the new `scope:selector:field` grammar
      AND remains backwards compatible — every existing test passes
      without edits
  [ ] `Automation.context` is persisted (migration `0030`), validated
      by the CRUD API, and round-trips through the dashboard editor
  [ ] Resolver caches identical scoped lookups within one automation
      run (verified by spying on `findMany`)
  [ ] Aggregates `count`, `sum`, `avg`, `min`, `max`, `pluck` produce
      correct results on `batch` and on `<slug>:all`
  [ ] Unknown slug, unknown field, and unknown selector all degrade
      safely to `defaultValue` + `onMissing` — never throw
  [ ] Hard caps enforced: max 1000 rows per scoped load, max 100
      values per `pluck`
  [ ] Cron handler, CRUD handlers, and every action executor share one
      `ResolvedContext` per automation run
  [ ] Dashboard editor exposes a Context panel and a variable picker
      whose entries match the parser's accepted grammar
  [ ] `_count` continues to work as an alias for `batch:all:count`
      (one console.warn per run)

==========================================================================
SECTION 8 — BONUS: BOOLEAN CONDITION GROUPS ON `when`
==========================================================================

8.1 PROBLEM

  Today `trigger_conditions` is a flat `TriggerCondition[]` evaluated as a
  pure AND chain by `evaluateConditions`
  (`automation-runner.utils.ts:3-9`). Two limits:

  - **No OR**. "Fire when `status = paid` OR `status = refunded`" requires
    duplicating the whole automation.
  - **No context-aware predicates**. The check only sees `entry[field]` —
    it cannot compare against another seed's value, a context load, or
    an aggregate. Users have to choose between flexible templates (this
    sprint) and flexible triggers (today: none).

  Bonus scope: extend `when` so it
    (a) supports nested AND/OR groups, and
    (b) accepts predicates whose left- *or* right-hand side is any
        template key resolvable by §3.1's grammar.

8.2 NEW SHAPE — recursive group

  ```ts
  // packages/core/src/automations.types.ts

  export type WhenOperand =
    | { kind: 'literal'; value: unknown }
    | { kind: 'ref';     key: string }   // template grammar key, e.g.
                                         // "this.total", "orders:all:sum:total",
                                         // "topCustomer.tier"

  export interface WhenPredicate {
    kind: 'predicate'
    left:  WhenOperand                   // usually a `ref`
    op:    'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
         | 'contains' | 'startswith' | 'endswith'
         | 'in' | 'notin'
         | 'isempty' | 'isnotempty'
         | 'matches'                      // regex, anchored
    right?: WhenOperand                  // omitted for isempty/isnotempty
  }

  export interface WhenGroup {
    kind: 'group'
    op: 'AND' | 'OR'
    children: WhenNode[]                 // 1..N
    negate?: boolean                     // optional NOT-wrapper
  }

  export type WhenNode = WhenPredicate | WhenGroup

  export interface Automation {
    // …existing fields…
    trigger_conditions: WhenNode | TriggerCondition[] | null
    //                  ^ new shape    ^ legacy shape (read-only fallback)
  }
  ```

  Storage stays one JSON column. The repository's `rowToAutomation`
  detects the shape: array → wrap in `{ kind: 'group', op: 'AND',
  children: <converted predicates> }`; object → pass through. Writes
  always emit the new shape. Migration `0031_automations_when.sql` is a
  data-only backfill (in beta — safe to rewrite). No schema change
  needed.

  `negate` on a group is sugar for "NOT(group)" — keeps the tree flat
  for the common case (e.g. exclusion lists) without forcing users to
  introduce a "fake" outer group.

8.3 EVALUATION SEMANTICS

  ```ts
  // automation-runner.utils.ts (replaces evaluateConditions)

  export function evaluateWhen(
    node: WhenNode | null,
    context: ResolvedContext,
  ): boolean {
    if (!node) return true
    if (node.kind === 'predicate') return evalPredicate(node, context)
    const results = node.children.map((c) => evaluateWhen(c, context))
    const combined = node.op === 'AND'
      ? results.every(Boolean)
      : results.some(Boolean)
    return node.negate ? !combined : combined
  }
  ```

  - Short-circuit: `AND` stops at first `false`, `OR` at first `true`.
    Implementation uses an imperative loop, not `.every`/`.some`, so
    side-effectful `lookup()` calls (memoised, but still measurable)
    are skipped after the result is decided.
  - Operands are resolved through the same `ResolvedContext` built for
    templates — zero extra I/O, full reuse of caching.
  - Coercion table (mirrors `query-builder.ts:toEngineFilters`):
    `gt/gte/lt/lte` cast both sides to `Number`; `contains/startswith/
    endswith/matches` cast to `String`; `in/notin` require an array
    literal on the right; `eq/neq` compare with `===` after string
    normalisation when one side is numeric-looking string and the
    other is a number.
  - Missing-key resolution: any `ref` that resolves to `undefined`
    propagates as `null`. Comparisons against `null`:
        `eq null`        → true only when the other side is null
        `isempty`        → true
        `gt/gte/lt/lte`  → false (no exception)
    This matches SQL `WHERE` semantics and the existing `is_empty`
    operator in `query-builder.ts`.

8.4 TRIGGER COVERAGE

  - **create / update / delete**: `when` evaluated *after*
    `ResolvedContext` is built, *before* dispatching actions. A failed
    `when` skips the entire action list for that entry — no partial
    execution.
  - **cron**: `when` is evaluated **per entry** even for batch actions.
    Today the cron handler applies `trigger_conditions` as SQL filters
    via `conditionToFilterGroup` (`cron-runner.ts:128-139`) and relies
    on the runner to re-evaluate. With the new shape this becomes
    two-tier:
      - SQL pre-filter: only the **predicates inside the outermost
        AND group whose `left` is a `this:<field>` ref against a
        literal** are pushed down to `findMany`. Everything else
        (OR branches, cross-seed refs, aggregates) is evaluated in
        memory. This preserves the 1000-row cap as an upper bound
        without losing expressiveness.
      - In-memory: `evaluateWhen(node, perEntryContext)` decides.

8.5 NEW DELIVERABLES (added to Section 4)

  Task 10 — Types + migration shim
    `packages/core/src/automations.types.ts` (types above)
    `apps/api/src/shared/automations.repository.d1.ts`
      `rowToAutomation` upcasts legacy arrays to a root AND group;
      `automationToRow` always serialises the new shape.

  Task 11 — Evaluator (pure)
    `apps/api/src/features/automations/when-evaluator.ts`
      `evaluateWhen`, `evalPredicate`, operand resolution.

  Task 12 — SQL push-down helper
    `apps/api/src/features/automations/when-pushdown.ts`
      `extractPushdownFilters(node: WhenNode, seed: Seed): FilterGroup[]`
      Returns ONLY the predicates safe to push down (literal-compared,
      single-seed, inside the root AND). Pure, deterministic. Cron
      handler uses this in place of `conditionToFilterGroup` mapping.

  Task 13 — Runner wiring
    Replace every `evaluateConditions(...)` call site with
    `evaluateWhen(automation.trigger_conditions, resolved)`. Two sites:
    `automation-runner.ts` per-action loop, `cron-runner.ts` cron
    branch (in-memory re-check after SQL pre-filter).

  Task 14 — CRUD schema
    `automations.schema.ts`: recursive Zod schema for `WhenNode`.
    Reject groups with zero children; reject `in`/`notin` whose right
    is not an array literal; cap nesting depth at 10.

  Task 15 — Dashboard editor
    `apps/dashboard/src/features/automations/components/automation-editor/`:
      - Replace the flat `WhenSection` with a recursive tree builder:
        each node is either a `+ Add condition` row (predicate) or a
        `+ Group` row with `AND`/`OR` toggle.
        Drag-to-reparent NOT required for v1 — add/remove/clone is
        enough.
      - Each predicate row: left key picker (same dropdown as the
        template variable picker from Task 8 — full grammar), op
        select, right input. Right input switches between literal and
        ref (toggle button), so users can compare two refs.
      - i18n keys under `automations.when.*` (group, and, or, not,
        operator labels, add-condition, add-group).

  Task 16 — Tests
    `when-evaluator.test.ts`     — operator matrix, short-circuit,
                                    null handling, negate.
    `when-pushdown.test.ts`      — only safe predicates pushed down;
                                    OR / cross-seed / aggregate refs
                                    stay in-memory.
    Update existing automation tests that pass `TriggerCondition[]`
    to verify the upcast path still works (one assertion: the
    repository round-trips a legacy array into a root AND group).

8.6 EXAMPLES

  "Fire on order.create when total > 100 AND (customer.tier = 'gold'
  OR customer.lifetime_spend > 5000)":

  ```jsonc
  {
    "trigger_conditions": {
      "kind": "group", "op": "AND",
      "children": [
        { "kind": "predicate",
          "left":  { "kind": "ref", "key": "this.total" },
          "op":    "gt",
          "right": { "kind": "literal", "value": 100 } },
        { "kind": "group", "op": "OR",
          "children": [
            { "kind": "predicate",
              "left":  { "kind": "ref", "key": "customers:byid({{this.customer_id}}):tier" },
              "op":    "eq",
              "right": { "kind": "literal", "value": "gold" } },
            { "kind": "predicate",
              "left":  { "kind": "ref", "key": "customers:byid({{this.customer_id}}):lifetime_spend" },
              "op":    "gt",
              "right": { "kind": "literal", "value": 5000 } }
          ] }
      ]
    }
  }
  ```

  "Fire cron when there exist >= 10 unpaid orders":

  ```jsonc
  {
    "trigger_event": "cron",
    "trigger_cron": "0 9 * * *",
    "trigger_conditions": {
      "kind": "predicate",
      "left":  { "kind": "ref", "key": "orders:where(status=unpaid):all:count" },
      "op":    "gte",
      "right": { "kind": "literal", "value": 10 }
    }
  }
  ```

8.7 ACCEPTANCE CRITERIA (added)

  [ ] `evaluateWhen` handles arbitrary nested AND/OR/NOT with
      short-circuit and identical results to the legacy
      `evaluateConditions` when fed an upcasted flat AND group
  [ ] Both operands of every predicate accept the full §3.1 template
      grammar — verified by a test that compares
      `orders:all:sum:total > customers:byid(c_1):credit_limit`
  [ ] SQL push-down keeps the 1000-row cap effective: a `when` whose
      root is an AND containing one `this.status = 'active'` literal
      predicate must reduce the rows fetched by `findMany`
  [ ] Legacy `TriggerCondition[]` payloads continue to work for read
      (upcast at boundary) and are rewritten on next save
  [ ] Dashboard editor renders the tree, lets users add/remove
      predicates and groups, and toggles between literal and ref on
      the right operand

==========================================================================
SECTION 9 — OUT OF SCOPE
==========================================================================

  - SQL-side aggregates (always client-side over capped result sets).
  - Two-pass / transitive interpolation in `where.value`.
  - Joins beyond simple "load entries of seed X filtered by trigger
    field" — multi-step relational lookups belong to a future
    "relations" sprint.
  - Cross-tenant / cross-database queries — single D1 binding assumed.
  - Async streaming of large reports — 1000-row cap is the contract.
  - Custom user-defined functions in templates (e.g. `format_date`) —
    deferred to a "template filters" sprint; the grammar reserves the
    final `:` slot so adding `{{this.created_at:date(YYYY-MM-DD)}}`
    later is non-breaking.
  - Permission scoping per context load (currently inherits the
    Worker's full DB access; tenant-aware resolvers are future work).
