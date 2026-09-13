# Sprint Plan — `BulkTransferCorePrimitives`

Feature: Bulk Data Transfer (Export / Import) — Sprint 1 of 4.
Roadmap: `output/backlog/ROADMAP.md`.

---

### Pre-Computation Analysis

#### a) God Nodes identified via the CLI

Degrees read from `graphify explain`. Three nodes dominate the blast radius of anything that
touches content persistence or background work:

| Node | ID | Degree | Why it matters here |
|---|---|---|---|
| `createBeechApp()` | `apps_api_src_factory_createbeechapp` | **66** | Single composition root. Owns the middleware registration order and receives `config.jobs: JobRegistry`. Any job or route added later is wired through it. |
| `D1ContentRepository` | `apps_api_src_shared_db_repositories_content_repository_d1_d1contentrepository` | **52** | The only `ContentRepository` implementation. Constructed in `repository.middleware.ts:7`, `index.ts:10` and `queue-consumer.ts:8`. Every engine-mediated write in the feature lands here. |
| `AppEnv` | `apps_api_src_types_appenv` | **43** | The Hono context contract (`Variables` carries `repository`, `bucket`, `queue`, `seedRegistry`, `getSeed`, `idGenerator`, `jwtPayload`). Re-exported by `factory.ts:11`; every handler in every slice imports it. |

Secondary nodes actually rewritten by this sprint, with their real degrees:

- `IQueueService` — `packages_core_src_queue_queue_interface_iqueueservice`, degree **6**, `packages/core/src/queue/queue.interface.ts:51`.
- `planCreateSeed()` — `packages_core_src_engine_seed_ddl_plancreateseed`, degree **10** (not touched in S1; it is the DDL vehicle for the `import_jobs` seed in S3).

`graphify explain "Seed"` and `graphify explain "ContentRepository"` both return **Ambiguous**
(72 and 2 matching nodes respectively — the graph indexes `docs/api/**` typedoc Markdown as
nodes alongside source). Resolved by passing the full node id, as the CLI instructs.

#### b) Architectural boundaries affected

| Package | Touched in S1? | Exactly what |
|---|---|---|
| `@beechcms/core` | **YES — the whole sprint lives here** | New leaf module `packages/core/src/transfer/` (pure functions + codecs, no I/O, no imports outside `engine/types.js`). One additive field on `JobContext` in `packages/core/src/queue/queue.interface.ts`. Two new lines in the `packages/core/src/index.ts` barrel. |
| `apps/api` | **YES — compile-fix only** | The four sites that construct a `JobContext` literal must supply the new required field: `src/middleware/queue.middleware.ts:38`, `src/shared/jobs/queue-consumer.ts:24`, and the test factories `src/features/search/jobs/semantic-search.worker.test.ts:105,148,188` and `src/shared/services/queue/in-memory-queue-service.test.ts:9`. **No route, no handler, no slice logic.** |
| `apps/dashboard` | **NO** | Untouched in S1. UI is S4. |

No Vertical Slice is opened in S1. The `content`, `upload` and `search` slices under
`apps/api/src/features/` are not modified.

#### c) `graphify affected` impact analysis

```
$ graphify affected "IQueueService" --depth 2
Affected nodes for IQueueService
- HookContext        [references]  packages/core/src/common/hooks.ts:L28
- hooks.ts           [imports]     packages/core/src/common/hooks.ts:L7
- queue.stub.ts      [imports]     packages/core/src/queue/queue.stub.ts:L4
- NoOpQueueService   [implements]  packages/core/src/queue/queue.stub.ts:L7
- core/src/index.ts  [re_exports]  packages/core/src/index.ts:L25

$ graphify affected "queue.interface.ts" --depth 3
- core/src/index.ts  [re_exports]  packages/core/src/index.ts:L69
- hooks.ts           [imports_from] packages/core/src/common/hooks.ts:L7
- queue.stub.ts      [imports_from] packages/core/src/queue/queue.stub.ts:L4
- HookContext        [references]  packages/core/src/common/hooks.ts:L28
- NoOpQueueService   [implements]  packages/core/src/queue/queue.stub.ts:L7

$ graphify affected "JobContext" --depth 2
No affected nodes found.

$ graphify affected "packages_core_src_content_content_repository_contentrepository" --depth 2
- HookContext        [references]  packages/core/src/common/hooks.ts:L18
- JobContext         [references]  packages/core/src/queue/queue.interface.ts:L25
- hooks.ts           [imports]     packages/core/src/common/hooks.ts:L4
- queue.interface.ts [imports]     packages/core/src/queue/queue.interface.ts:L4
- core/src/index.ts  [re_exports]  packages/core/src/index.ts:L25
- queue.stub.ts      [imports_from] packages/core/src/queue/queue.stub.ts:L4
```

**Reading of the result, including its limit.** `affected "JobContext"` returns *nothing*, and
`affected "IQueueService"` stops at `core/src/index.ts`. That is not evidence of a zero blast
radius outside core — it is the graph's package boundary: `apps/api` imports from the
`@beechcms/core` **barrel**, so every cross-package edge collapses onto the
`core/src/index.ts [re_exports]` node and the reverse traversal terminates there. The AST graph
also does not record type-only structural uses of `JobContext` in object literals.

Because the graph cannot cross the barrel, the downstream set was completed by direct lookup —
which is exactly what `tooling_graphify.md` prescribes once the architecture is understood. The
**complete** list of `JobContext` consumers that a required new field breaks:

```
apps/api/src/middleware/queue.middleware.ts:38                     const jobContext: JobContext = {   ← construction
apps/api/src/shared/jobs/queue-consumer.ts:24                      const context: JobContext = {      ← construction
apps/api/src/shared/services/queue/in-memory-queue-service.ts:18   private readonly context: JobContext  ← consumer, no change
apps/api/src/features/search/jobs/semantic-search.worker.ts:59     function resolveWorkerBindings(context: JobContext)  ← consumer, no change
apps/api/src/features/search/jobs/semantic-search.worker.test.ts:105,148,188   const context: JobContext = {   ← construction
apps/api/src/shared/services/queue/in-memory-queue-service.test.ts:9          function makeContext(): JobContext   ← construction
```

Six construction sites, all inside `apps/api`, all caught by `tsc --noEmit`. The new `transfer/`
module has **no** reverse edges — it is new leaf code; nothing can break from it.

---

### VETO Audit

Proposed boundaries evaluated against `_config/ponytail_arch.md`.

**1. THE BOTANICAL INVARIANT — does anything bypass `@beechcms/core`?**
Nothing in S1 touches a database. The `transfer/` module is pure: it converts between byte/line
streams and plain `Record<string, unknown>` payloads. It never builds SQL, never names a
physical column it invented, and never imports `D1Database`. Column projection is derived from
`seed.branches[].alias` plus the engine's own `SYSTEM_COLUMNS`, so the Botanical Engine stays the
single source of truth for what a content table contains. `toImportPayload` deliberately emits a
plain payload object destined for `validateAndSanitizeSeedPayload` + `ContentRepository.create`
in S3 — it does not pre-serialize anything for storage, so `apiToDb`/`serializeForDb` keeps
sole ownership of the DB representation. **PASS.**

**2. Branch IDs vs hardcoded field names.**
The export column projection iterates `seed.branches` and uses `branch.alias` — which is, by the
engine's own definition (`engine/types.ts:82`), *the SQL column name and the API payload key*.
That is the correct handle here: a CSV header and an NDJSON key are API-payload surface, not
persistence references. `br_XX` ids are the correct handle for things that must survive an alias
rename (FTS triggers, layouts, automations); a CSV file is a point-in-time wire format and must
carry the alias the caller sees in the API. No field name is hardcoded anywhere; the only literal
names in the module are the engine's own `SYSTEM_COLUMNS` members. **PASS.**

**3. VSA ENFORCEMENT — cross-slice imports.**
Zero. S1 opens no slice under `apps/api/src/features/` or `apps/dashboard/src/features/`. The
shared logic that S2 (export, `content` slice) and S3 (import, its own slice) both need is
placed in `@beechcms/core` **up front** — which is precisely the remedy rule 3 mandates when two
slices need the same logic. Verified with `graphify path "computeVectorJob" "listHandler"` →
`No directed path found`: the existing `search` job slice does not reach into the `content`
slice today, and S1 adds no edge that would let the future `import` slice do so either.
**PASS.**

**4. CLOUDFLARE PURITY.**
No new dependency of any kind. `packages/core/package.json` gains nothing; the codecs are hand
written against `String`/`JSON` only, which is what lets them run inside a Worker with no bundle
cost. No ORM, no CSV library, no stream polyfill. The `JobContext.queue` addition keeps
continuation on the *native* Cloudflare Queue transport instead of a stateful in-process loop.
**PASS.**

**5. YAGNI — the one finding, and the adjustment.**
`JobContext.queue` is consumed by no code until S3. That is a genuine YAGNI smell and it was
challenged. Two alternatives were examined:

- *Defer it to S3.* Rejected: it turns S3 into a two-tier sprint (core contract + API slice)
  and reintroduces exactly the sequential-merge hazard the roadmap split exists to remove.
- *Let the import worker read `env['QUEUE']` itself*, the way `semantic-search.worker.ts:59`
  reads `env['DB']` / `env['AI']`. Rejected on rule 3 grounds: it pushes transport knowledge and
  an `as Queue<QueueMessage>` cast down into a feature slice, and it silently loses chunk
  continuation in local dev where no `QUEUE` binding exists — the developer would see a job stop
  after 500 rows with no error. `JobContext` exists so a job handler never has to know which
  transport it is running on; taking the escape hatch here would erode that contract permanently.

**Adjustment made in this audit:** the field is declared **required**, not optional
(`queue: IQueueService`, not `queue?:`). An optional field would let the six construction sites
compile untouched and would push a `context.queue?.enqueue(...)` null-check into every future
handler. Required makes `tsc --noEmit` enumerate the blast radius for the executing agent and
keeps handler code honest. The cost is bounded and known: six literals, all listed above.
**PASS with the adjustment applied.**

**6. Scope gate.** The feature does not fit one sprint (sequential merges core → api → dashboard;
export and import are independently validatable boundaries). Split into four sprints; only S1 is
detailed. Everything deferred appears in SECTION 7 with its roadmap reference.

**Verdict: APPROVED.** Proceeding to the linear Sprint Plan.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Two later sprints need the same three answers, and neither may compute them for itself.

**1. "Is this seed flat?"** is a *schema* question, not a transport question. The brief makes the
identical flat-vs-relational rule binding in both directions: CSV is legal only for a seed with
no relational/array branch, in export (§4) and in import (§2). If S2 answers it inside the
`content` slice and S3 answers it inside the `import` slice, the two answers drift the first time
a `BranchType` is added to `engine/types.ts:14`, and a file exported as CSV stops being
importable as CSV. `_config/ponytail_arch.md` rule 3 is explicit about the remedy: logic needed
by two slices moves to `@beechcms/core`. Building it in core **first** is the only ordering in
which neither slice can be tempted to own it.

**2. "How is a row written to, and read from, the wire?"** Export encodes; import decodes. They
must be exact inverses or a round-trip silently corrupts data — a CSV field containing a comma,
a quote, or an embedded newline is the classic case, and it is the case a per-slice
implementation gets wrong. One codec module, one set of unit tests, both directions provably
symmetric before either endpoint exists.

**3. "How does a chunked job continue itself?"** The brief's import contract is a cursor loop:
process N rows, persist the offset, re-enqueue, and on retry resume from the last confirmed
offset. `JobContext` (`packages/core/src/queue/queue.interface.ts:24`) today carries
`repository`, `bucket`, `clock`, `idGenerator`, `env` — and deliberately no producer port. A job
therefore cannot schedule its own successor. This is a **core contract change**, and the roadmap
rule is that core contract changes land before the API that consumes them.

**Botanical adherence.** The module is schema-driven end to end: every column it emits comes from
`seed.branches` or the engine's `SYSTEM_COLUMNS`; it produces payload objects for
`validateAndSanitizeSeedPayload` rather than rows for D1; it contains no SQL. The
`JobContext.queue` addition strengthens the invariant it sits next to — a handler now has a
sanctioned producer port and no reason to reach into `context.env` for the raw `QUEUE` binding,
just as it already has `repository` so it never reaches for `env.DB`.

**VSA adherence.** S1 opens no slice. It places shared logic in core *before* two slices exist
that would otherwise each grow their own copy, which is enforcement by construction rather than
by review.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Queue contract — `packages/core/src/queue/queue.interface.ts`**

```ts
export interface QueueMessage<T = unknown> { name: string; payload: T }            // L13

export interface JobContext {                                                      // L24
  repository: ContentRepository
  bucket: BeechBucket
  clock: IClock
  idGenerator: IIdGenerator
  env: Record<string, string | undefined>     // "deliberately does not expose DB"
}

export type JobHandler<T = unknown> = (payload: T, context: JobContext) => Promise<void>   // L33
export type JobRegistry = Record<string, JobHandler<any>>                                  // L39
export interface IQueueService { enqueue<T>(name: string, payload: T): Promise<boolean> }  // L51
```

Implementations: `NoOpQueueService` (`packages/core/src/queue/queue.stub.ts:7`),
`CloudflareQueueService` (`apps/api/src/shared/services/queue/cloudflare-queue-service.ts`,
wraps `Queue<QueueMessage>`, returns `false` on transport rejection),
`InMemoryQueueService` (`apps/api/src/shared/services/queue/in-memory-queue-service.ts:15`,
runs the handler in-process, via `executionCtx.waitUntil` when available and awaited inline
otherwise).

**Middleware registration order — `apps/api/src/factory.ts` (`createBeechApp`, L117)**

```
L129  app.use('*', repositoryMiddleware({...}))     // 1. must be first — everything below needs it
L143  app.use('*', seedRegistryMiddleware())        // hydrates seedRegistry from D1 `seeds`
L146  app.use('*', storageMiddleware({...}))        // sets `bucket`
L150  app.use('*', queueMiddleware(config.jobs ?? {}))   // sets `queue`; needs repository + bucket
L152  app.use('*', authProvidersMiddleware(...))
L153  app.use('*', rateLimiterMiddleware(...))
L154  app.use('*', observabilityMiddleware())
...
L239  apiProtected.use('*', authMiddleware({ acceptOAuth: true }))
L242  apiProtected.use('*', oauthScopeMiddleware())   // must stay immediately after authMiddleware
L246  apiProtected.use('*', permissionMiddleware())
L293  app.route('/api', apiProtected)
```

`queueMiddleware` (`apps/api/src/middleware/queue.middleware.ts:22`) selects
`overrides.queue` → `CloudflareQueueService(context.env.QUEUE)` → `InMemoryQueueService`, and
builds the `JobContext` literal at **L38** from `context.get('repository')` and
`context.get('bucket')` — hence the documented ordering constraint.

**Consumer-side dispatch — `apps/api/src/shared/jobs/queue-consumer.ts:18`**
`dispatchQueueBatch` builds the `JobContext` literal at **L24** (`new D1ContentRepository(env.DB)`,
`createBucketProvider(...)`, `SystemClock`, `SystemIdGenerator`), then per message:
`ack()` on success / malformed body / unknown handler name, `retry()` on throw.
Entry point: `apps/api/src/index.ts` `queue()` export, with `const jobs = { ...semanticSearchJobs }`.

**Existing job precedent — `apps/api/src/features/search/jobs/semantic-search.worker.ts`**
`JobRegistry` exported as a const map (L351); `resolveWorkerBindings(context)` (L59) casts
`context.env` to reach `DB`/`AI`/`SEARCH_R2`. This is the pattern the import consumer would have
copied for `QUEUE` — see VETO Audit §5 for why S1 forecloses it.

**Engine facts the codecs must respect**

- `BranchType` (`packages/core/src/engine/types.ts:14`) =
  `'text' | 'number' | 'boolean' | 'json' | 'date' | 'richtext' | 'file' | 'tags' | 'relation' | 'repeater'`.
- `SYSTEM_COLUMNS` (`packages/core/src/engine/ddl.ts:54`) =
  `{'id','slug','status','created_at','updated_at','deleted_at'}`.
- `generateCreateTable` (`ddl.ts:166`) **skips** `relation` branches with `multiple: true` — they
  have no parent column at all; they live in a junction table.
- `branch.alias` is both the SQL column name and the API payload key (`types.ts:82`).
- The `status` column carries `CHECK (status IN ('draft','review','published','archived'))`
  (`ddl.ts:174`) — relevant to S3, recorded here so the mapping helper does not invent values.
- Alias collisions are rejected at registry construction (`engine/seed-registry.ts:52-70`)
  against `SQL_RESERVED_WORDS` and `AUTOMATION_RESERVED_WORDS`. Verified: `offset` and `key` are
  SQL-reserved, `count` is automation-reserved — so S3's job seed must not use them as aliases.
- Validation entry point for import is `validateAndSanitizeSeedPayload(seed, payload, options)`
  (`packages/core/src/engine/validation/index.ts:412`), as already used by
  `apps/api/src/features/content/handlers/create.ts:72`.

**Packaging.** `packages/core` builds with plain `tsc` (`packages/core/package.json`), tests with
`vitest` (`packages/core/vitest.config.ts`), and every internal import uses an explicit `.js`
extension (NodeNext ESM). Its barrel is `packages/core/src/index.ts` — `queue.interface.js` is
re-exported at **L69**.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**New files — `packages/core/src/transfer/` (pure, zero new dependencies)**

| File | Contents |
|---|---|
| `transfer.types.ts` | `TransferFormat`, `isTransferFormat`, `FormatCompatibility`, `LineParseResult`, `TransferRecord`, `ImportPayload` |
| `transfer.constants.ts` | `DEFAULT_EXPORT_MAX_ROWS`, `DEFAULT_EXPORT_PAGE_SIZE`, `DEFAULT_IMPORT_CHUNK_ROWS`, `MAX_JOB_ERROR_SAMPLES` |
| `flat-seed.ts` | `nonFlatBranches`, `isFlatSeed`, `checkFormatCompatibility` |
| `ndjson.ts` | `encodeNdjsonLine`, `parseNdjsonLine`, `class LineReader` |
| `csv.ts` | `encodeCsvValue`, `encodeCsvRow`, `class CsvRowReader` |
| `row-mapping.ts` | `exportColumns`, `toCsvCells`, `fromCsvCells`, `toImportPayload` |
| `index.ts` | barrel for the six modules above |

**New test files — unit tier, colocated with their source (`testing_conventions.md` §0, Rule 1.1/1.3)**

`flat-seed.test.ts`, `ndjson.test.ts`, `csv.test.ts`, `row-mapping.test.ts` — all in
`packages/core/src/transfer/`. `transfer.types.ts` and `transfer.constants.ts` carry no behaviour
and get no test file.

**Modified files**

| File | Change |
|---|---|
| `packages/core/src/queue/queue.interface.ts` | add `queue: IQueueService` to `JobContext` (required) + doc comment |
| `packages/core/src/index.ts` | add `export * from './transfer/index.js'` |
| `apps/api/src/middleware/queue.middleware.ts` | supply `queue` in the `JobContext` literal (L38) — self-reference resolved by post-construction assignment |
| `apps/api/src/shared/jobs/queue-consumer.ts` | supply `queue` in the `JobContext` literal (L24) |
| `apps/api/src/features/search/jobs/semantic-search.worker.test.ts` | add `queue` to the three context literals (L105, L148, L188) |
| `apps/api/src/shared/services/queue/in-memory-queue-service.test.ts` | add `queue` to `makeContext()` (L9) |

**Explicitly excluded from this sprint:** every route, every migration, every UI file. The
`transfer/` module is called by nothing at the end of S1 except its own tests; `JobContext.queue`
is read by nothing. That is the intended end state — see SECTION 7.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

**D1 migrations: none in this sprint.** No `CREATE TABLE`, no `CREATE INDEX`, no entry in
`apps/api/wrangler.jsonc`. The `import_jobs` system seed is S3.

Every file below opens with the core SPDX header used throughout `packages/core`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso
```

(Note: `packages/core` uses the MIT header; `apps/api` uses the BUSL-1.1 three-line header from
`testing_conventions.md` §1.2. Do not mix them. Quote style: single quotes, no semicolons —
match the surrounding files.)

---

#### 4.1 `packages/core/src/transfer/transfer.types.ts`

```ts
import type { Branch } from '../engine/types.js'

/** Wire formats supported for bulk transfer. NDJSON is universal; CSV is flat-only. */
export type TransferFormat = 'csv' | 'ndjson'

export const TRANSFER_FORMATS = ['csv', 'ndjson'] as const satisfies readonly TransferFormat[]

export function isTransferFormat(value: unknown): value is TransferFormat {
  return typeof value === 'string' && (TRANSFER_FORMATS as readonly string[]).includes(value)
}

/**
 * Outcome of checking a requested format against a seed's shape.
 * `offendingBranches` is non-empty only on the incompatible branch, and exists so the
 * caller can name the exact fields in its 400 response instead of a generic message.
 */
export type FormatCompatibility =
  | { compatible: true }
  | {
      compatible: false
      code: 'csv_requires_flat_seed'
      offendingBranches: Array<{ alias: string; type: Branch['type'] }>
    }

/** A decoded wire row, keyed by branch alias / system column name. */
export type TransferRecord = Record<string, unknown>

/**
 * Per-line decode outcome. Import is best-effort (brief §2), so a bad line is a VALUE,
 * never a thrown error — the consumer must record it in the job report and keep going.
 */
export type LineParseResult =
  | { ok: true; record: TransferRecord }
  | { ok: false; code: LineParseErrorCode; message: string }

export type LineParseErrorCode =
  | 'invalid_json'
  | 'not_an_object'
  | 'column_count_mismatch'
  | 'unterminated_quote'

/**
 * A decoded row split into the three arguments `ContentRepository.create` takes.
 * `slug` and `status` are optional: the caller supplies its own defaults
 * (`create.ts` slugifies the display-name branch and defaults status to 'draft').
 */
export interface ImportPayload {
  slug?: string
  status?: string
  data: TransferRecord
}
```

---

#### 4.2 `packages/core/src/transfer/transfer.constants.ts`

```ts
/**
 * Hard cap on rows a single synchronous export may stream (brief §2). Past this the
 * endpoint answers 413 rather than opening a stream that the edge may truncate mid-file.
 * Overridable per deployment by the API layer (S2) — this is the default, not the law.
 */
export const DEFAULT_EXPORT_MAX_ROWS = 50_000

/** Page size for the export producer's findMany loop. Never materialise the full set. */
export const DEFAULT_EXPORT_PAGE_SIZE = 500

/**
 * Rows an import consumer processes per queue invocation before persisting its offset
 * and re-enqueuing (brief §2). Sized well under the Workers CPU budget so a chunk that
 * retries repeats at most this many already-inserted rows.
 */
export const DEFAULT_IMPORT_CHUNK_ROWS = 500

/**
 * Upper bound on per-row errors retained in a job report (brief §4). Beyond this only
 * the aggregate failure count grows, so one pathological file cannot unbound the row.
 */
export const MAX_JOB_ERROR_SAMPLES = 100
```

---

#### 4.3 `packages/core/src/transfer/flat-seed.ts`

```ts
import type { Branch, BranchType, Seed } from '../engine/types.js'
import type { FormatCompatibility, TransferFormat } from './transfer.types.js'

/**
 * Branch types whose value is a collection or a nested document, never a scalar cell.
 * A CSV cell cannot carry them without inventing a flattening convention that the
 * importer would then have to guess at — which the brief rules out (§5).
 */
const NON_FLAT_BRANCH_TYPES: ReadonlySet<BranchType> = new Set<BranchType>([
  'relation',
  'repeater',
  'tags',
  'json',
])

/** True for a branch that cannot be represented as a single scalar CSV cell. */
function isNonFlat(branch: Branch): boolean {
  // A `file` branch is a single URL string — flat — unless it is an asset list.
  if (branch.type === 'file') return branch.multiple === true
  return NON_FLAT_BRANCH_TYPES.has(branch.type)
}

/** Every branch of `seed` that makes it non-flat, in declaration order. Empty when flat. */
export function nonFlatBranches(seed: Seed): Branch[] {
  return seed.branches.filter(isNonFlat)
}

/** A seed is flat when every branch maps to exactly one scalar column. */
export function isFlatSeed(seed: Seed): boolean {
  return nonFlatBranches(seed).length === 0
}

/**
 * The single authority on "may this seed be transferred in this format?", shared by the
 * export endpoint and the import endpoint so the two can never disagree.
 * NDJSON is universal; CSV requires a flat seed.
 */
export function checkFormatCompatibility(
  seed: Seed,
  format: TransferFormat,
): FormatCompatibility {
  if (format === 'ndjson') return { compatible: true }

  const offenders = nonFlatBranches(seed)
  if (offenders.length === 0) return { compatible: true }

  return {
    compatible: false,
    code: 'csv_requires_flat_seed',
    offendingBranches: offenders.map((branch) => ({ alias: branch.alias, type: branch.type })),
  }
}
```

---

#### 4.4 `packages/core/src/transfer/ndjson.ts`

```ts
import type { LineParseResult, TransferRecord } from './transfer.types.js'

/** Serialises one record as an NDJSON line, terminator included. */
export function encodeNdjsonLine(record: TransferRecord): string {
  return `${JSON.stringify(record)}\n`
}

/**
 * Decodes one NDJSON line. Never throws: a malformed line is a failed row in the job
 * report, not an aborted import (brief §2 — best-effort, not atomic).
 */
export function parseNdjsonLine(line: string): LineParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch (error) {
    return {
      ok: false,
      code: 'invalid_json',
      message: error instanceof Error ? error.message : 'Malformed JSON',
    }
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, code: 'not_an_object', message: 'Line is not a JSON object' }
  }

  return { ok: true, record: parsed as TransferRecord }
}

const BYTE_ORDER_MARK = '﻿'

/**
 * Splits an arbitrarily-chunked text stream into complete lines, holding the trailing
 * partial line until the next chunk completes it. Stateful by necessity: a single
 * R2 read boundary may fall in the middle of a record, and an import that lost that
 * record would report a phantom failed row.
 *
 * Blank lines are dropped — a trailing newline at end of file is not a record.
 */
export class LineReader {
  private buffer = ''
  private sawFirstChunk = false

  /** Feeds a chunk and returns every line completed by it. */
  push(chunk: string): string[] {
    let text = chunk
    if (!this.sawFirstChunk) {
      this.sawFirstChunk = true
      if (text.startsWith(BYTE_ORDER_MARK)) text = text.slice(BYTE_ORDER_MARK.length)
    }

    this.buffer += text
    const parts = this.buffer.split('\n')
    this.buffer = parts.pop() ?? ''
    return parts.map(stripCarriageReturn).filter((line) => line.length > 0)
  }

  /** Flushes the trailing line of a file that does not end in a newline. */
  end(): string[] {
    const remainder = stripCarriageReturn(this.buffer)
    this.buffer = ''
    return remainder.length > 0 ? [remainder] : []
  }
}

function stripCarriageReturn(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line
}
```

---

#### 4.5 `packages/core/src/transfer/csv.ts`

```ts
/**
 * RFC 4180 CSV codec. Hand-written rather than pulled from npm: `packages/core` ships to a
 * Worker bundle and the two rules that matter here (quote-wrap on delimiter/quote/newline,
 * double the inner quote) are four lines. A dependency would cost more than it saves.
 */

const DELIMITER = ','
const ROW_TERMINATOR = '\r\n'
const QUOTE = '"'
const MUST_QUOTE = /[",\r\n]/

/** Encodes one cell. `null`/`undefined` become an empty, unquoted field. */
export function encodeCsvValue(value: string | null | undefined): string {
  if (value === null || value === undefined) return ''
  if (!MUST_QUOTE.test(value)) return value
  return `${QUOTE}${value.replaceAll(QUOTE, `${QUOTE}${QUOTE}`)}${QUOTE}`
}

/** Encodes one row, CRLF terminator included (RFC 4180 §2.1). */
export function encodeCsvRow(cells: Array<string | null | undefined>): string {
  return cells.map(encodeCsvValue).join(DELIMITER) + ROW_TERMINATOR
}

const BYTE_ORDER_MARK = '﻿'

/**
 * Splits an arbitrarily-chunked CSV text stream into rows of cells.
 *
 * Stateful and quote-aware: a newline inside a quoted field is DATA, not a row break, so
 * a naive `split('\n')` corrupts any export containing a multi-line text branch — which
 * the export side of this same module is perfectly capable of producing. The parser
 * therefore carries its in-quotes state across chunk boundaries as well as across lines.
 */
export class CsvRowReader {
  private cells: string[] = []
  private field = ''
  private inQuotes = false
  private quoteJustClosed = false
  private pendingCarriageReturn = false
  private rowHasContent = false
  private sawFirstChunk = false

  /** Feeds a chunk and returns every row completed by it. */
  push(chunk: string): string[][] {
    let text = chunk
    if (!this.sawFirstChunk) {
      this.sawFirstChunk = true
      if (text.startsWith(BYTE_ORDER_MARK)) text = text.slice(BYTE_ORDER_MARK.length)
    }

    const rows: string[][] = []

    for (const char of text) {
      if (this.pendingCarriageReturn) {
        this.pendingCarriageReturn = false
        // A lone CR terminates the row too; a CRLF consumes the LF here.
        const row = this.completeRow()
        if (row) rows.push(row)
        if (char === '\n') continue
      }

      if (this.inQuotes) {
        if (this.quoteJustClosed) {
          this.quoteJustClosed = false
          if (char === QUOTE) {
            this.field += QUOTE // an escaped quote inside a quoted field
            continue
          }
          this.inQuotes = false
          // fall through: this char is a normal unquoted char
        } else if (char === QUOTE) {
          this.quoteJustClosed = true
          continue
        } else {
          this.field += char
          continue
        }
      }

      if (char === QUOTE) {
        this.inQuotes = true
        this.rowHasContent = true
        continue
      }
      if (char === DELIMITER) {
        this.pushField()
        continue
      }
      if (char === '\r') {
        this.pendingCarriageReturn = true
        continue
      }
      if (char === '\n') {
        const row = this.completeRow()
        if (row) rows.push(row)
        continue
      }
      this.field += char
      this.rowHasContent = true
    }

    return rows
  }

  /**
   * Flushes the final row of a file with no trailing newline.
   * @throws never — an unterminated quote is reported by `hasUnterminatedQuote()` so the
   *   caller can record it as a failed row rather than losing the whole chunk.
   */
  end(): string[][] {
    if (this.pendingCarriageReturn) this.pendingCarriageReturn = false
    const row = this.completeRow()
    return row ? [row] : []
  }

  /** True when `end()` was reached inside an open quoted field — the file is truncated. */
  hasUnterminatedQuote(): boolean {
    return this.inQuotes && !this.quoteJustClosed
  }

  private pushField(): void {
    this.cells.push(this.field)
    this.field = ''
    this.rowHasContent = true
  }

  private completeRow(): string[] | null {
    if (!this.rowHasContent && this.cells.length === 0 && this.field === '') return null
    this.cells.push(this.field)
    const row = this.cells
    this.cells = []
    this.field = ''
    this.inQuotes = false
    this.quoteJustClosed = false
    this.rowHasContent = false
    return row
  }
}
```

---

#### 4.6 `packages/core/src/transfer/row-mapping.ts`

```ts
import type { Seed } from '../engine/types.js'
import { nonFlatBranches } from './flat-seed.js'
import type { ImportPayload, LineParseResult, TransferRecord } from './transfer.types.js'

/**
 * System columns exported for every seed, in this order, ahead of the branch columns.
 * `deleted_at` is deliberately absent: a trashed row is not exportable content, and the
 * repository's default `trashed: 'active'` mode never hands one to the producer anyway.
 */
export const EXPORT_SYSTEM_COLUMNS = ['id', 'slug', 'status', 'created_at', 'updated_at'] as const

/**
 * Columns the importer must never accept from a file: the engine owns them.
 * `id` is minted by `idGenerator.uuid()`, the timestamps by SQLite defaults. Accepting an
 * `id` from a file would also turn insert-only import (brief §2) into a covert upsert.
 */
const IMPORT_REJECTED_COLUMNS: ReadonlySet<string> = new Set([
  'id',
  'created_at',
  'updated_at',
  'deleted_at',
])

/**
 * The ordered column projection for exporting `seed`: system columns, then one column per
 * scalar branch in declaration order. Non-flat branches are omitted — this projection is
 * only ever used for CSV, and `checkFormatCompatibility` has already refused a seed that
 * has any. NDJSON export emits the record whole and does not call this.
 */
export function exportColumns(seed: Seed): string[] {
  const excluded = new Set(nonFlatBranches(seed).map((branch) => branch.alias))
  return [
    ...EXPORT_SYSTEM_COLUMNS,
    ...seed.branches.map((branch) => branch.alias).filter((alias) => !excluded.has(alias)),
  ]
}

/**
 * Projects an API-shaped record onto `columns` as CSV cells.
 * `null`/`undefined` become an empty field; booleans become `true`/`false`; everything else
 * is stringified. The record is expected to have already passed through `dbToApi`, so a
 * `date` branch arrives as a number and is written as its unix-seconds integer.
 */
export function toCsvCells(record: TransferRecord, columns: string[]): Array<string | null> {
  return columns.map((column) => {
    const value = record[column]
    if (value === null || value === undefined) return null
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    return String(value)
  })
}

/**
 * Rebuilds a record from a CSV row. An empty cell is treated as ABSENT, not as null:
 * CSV cannot distinguish the two, and omitting the key lets the engine's own
 * required-field validation produce the error instead of this module guessing.
 */
export function fromCsvCells(columns: string[], cells: string[]): LineParseResult {
  if (cells.length !== columns.length) {
    return {
      ok: false,
      code: 'column_count_mismatch',
      message: `Expected ${columns.length} columns, received ${cells.length}`,
    }
  }

  const record: TransferRecord = {}
  for (const [index, column] of columns.entries()) {
    const cell = cells[index] ?? ''
    if (cell === '') continue
    record[column] = cell
  }
  return { ok: true, record }
}

/**
 * Splits a decoded record into the shape `ContentRepository.create` consumes, dropping the
 * engine-owned columns. Returns `data` WITHOUT `slug`/`status`, mirroring
 * `apps/api/src/features/content/handlers/create.ts:68-70`, so the import consumer can feed
 * `data` straight to `validateAndSanitizeSeedPayload` without re-filtering.
 */
export function toImportPayload(record: TransferRecord): ImportPayload {
  const data: TransferRecord = {}
  for (const [key, value] of Object.entries(record)) {
    if (IMPORT_REJECTED_COLUMNS.has(key)) continue
    if (key === 'slug' || key === 'status') continue
    data[key] = value
  }

  const slug = typeof record['slug'] === 'string' && record['slug'] !== '' ? record['slug'] : undefined
  const status = typeof record['status'] === 'string' && record['status'] !== '' ? record['status'] : undefined

  return { ...(slug ? { slug } : {}), ...(status ? { status } : {}), data }
}
```

---

#### 4.7 `packages/core/src/transfer/index.ts`

```ts
export * from './transfer.types.js'
export * from './transfer.constants.js'
export * from './flat-seed.js'
export * from './ndjson.js'
export * from './csv.js'
export * from './row-mapping.js'
```

---

#### 4.8 `packages/core/src/index.ts` — add the barrel line

Insert immediately after the existing queue exports (currently L67–L70), keeping the file's
grouping intact:

```ts
export * from './queue/queue.stub.js'
export * from './transfer/index.js'    // ← NEW
```

---

#### 4.9 `packages/core/src/queue/queue.interface.ts` — the contract change

`IQueueService` is declared at L51, below `JobContext` at L24. TypeScript interfaces hoist, so
**no reordering is required**. Apply exactly this edit to the `JobContext` body:

```ts
export interface JobContext {
  repository: ContentRepository
  bucket: BeechBucket
  clock: IClock
  idGenerator: IIdGenerator
  /**
   * Producer port, so a job can schedule its own successor. Required for cursor-style
   * jobs that process a bounded slice per invocation, persist their offset and re-enqueue
   * (bulk import): without it a handler would have to reach into `env` for the raw QUEUE
   * binding, which is exactly the transport coupling `repository` exists to prevent for D1.
   */
  queue: IQueueService
  env: Record<string, string | undefined>
}
```

Update the interface's leading docblock (L18–L23) so the "NEVER a raw D1Database" sentence now
reads alongside the queue port; do not weaken the existing invariant sentence.

---

#### 4.10 `apps/api/src/middleware/queue.middleware.ts` — the self-referential case

`InMemoryQueueService` holds a `JobContext`, and that `JobContext` must now hold the queue that
holds it. Build the context first with a `NoOpQueueService` placeholder, then assign. Replace
lines 37–46:

```ts
    } else {
      // The in-memory transport IS the context's queue: a chunked job re-enqueuing itself in
      // local dev must reach the same in-process dispatcher. The cycle is broken by assigning
      // after construction rather than by making JobContext.queue optional, which would push a
      // null-check into every handler.
      const jobContext: JobContext = {
        repository: context.get('repository'),
        bucket: context.get('bucket'),
        clock: SystemClock,
        idGenerator: SystemIdGenerator,
        queue: new NoOpQueueService(),
        env: context.env as unknown as Record<string, string | undefined>,
      }
      const inMemoryQueue = new InMemoryQueueService(jobs, jobContext, scheduleBackgroundTask)
      jobContext.queue = inMemoryQueue
      queue = inMemoryQueue
    }
```

Add `NoOpQueueService` to the value import on L7:

```ts
import { NoOpQueueService, SystemClock, SystemIdGenerator } from '@beechcms/core'
```

> Executing agent, note: in-memory self-enqueue recurses synchronously (`InMemoryQueueService`
> awaits the handler inline when `executionCtx` is absent). S1 ships no such job, so nothing
> recurses yet; S3 owns the depth guard on its own chunk handler. Do not add one here
> speculatively.

---

#### 4.11 `apps/api/src/shared/jobs/queue-consumer.ts` — supply the producer

Replace the context literal at L24–L30:

```ts
  const context: JobContext = {
    repository: new D1ContentRepository(env.DB),
    bucket: createBucketProvider(env, env.MEDIA_BASE_URL ?? ''),
    clock: SystemClock,
    idGenerator: SystemIdGenerator,
    // Same binding the producer side uses. Absent only in local/test runs without the
    // queue binding, where NoOp is correct: there is no transport to continue onto.
    queue: env.QUEUE
      ? new CloudflareQueueService(env.QUEUE as Queue<QueueMessage>)
      : new NoOpQueueService(),
    env: env as unknown as Record<string, string | undefined>,
  }
```

Imports to add:

```ts
import { NoOpQueueService, SystemClock, SystemIdGenerator } from '@beechcms/core'
import { CloudflareQueueService } from '../services/queue/cloudflare-queue-service'
```

(`QueueMessage` is already imported as a type at L7. `Env['QUEUE']` is `Queue | undefined`
at `apps/api/src/types.ts:95`, hence the cast, which matches `queue.middleware.ts:36`.)

---

#### 4.12 Test-side `JobContext` literals

Four factories break. Each gets `queue: new NoOpQueueService()` — the tests assert job behaviour,
not continuation, so the no-op is the honest stand-in and keeps `IClock`/`ITokenService` the only
faked services in the integration tier (`testing_conventions.md` Rule 0.3 is unaffected: these
are unit-tier files).

- `apps/api/src/features/search/jobs/semantic-search.worker.test.ts` — L105, L148, L188.
- `apps/api/src/shared/services/queue/in-memory-queue-service.test.ts` — `makeContext()` at L9.

Do not reformat these files beyond the added line and the added import.

---

#### 4.13 New unit tests

Tier: **unit** for all four (Rule 0.2 — no D1, no network, no filesystem). Placement: colocated
in `packages/core/src/transfer/`, matching the existing core idiom (`ddl.test.ts`,
`serialize.test.ts` sit beside their sources). Filenames `<subject>.test.ts` (Rule 1.3).
`describe()` names the exported symbol (Rule 1.4); `it()` states behaviour + outcome without
"should" (Rule 1.5). Four zones separated by one blank line, one ACT per test, ACT result named
(§2). No `any` (§7.1). No snapshots (§7.9).

**Fixtures.** These are pure functions over `Seed`, and `@beechcms/testing` canonical seeds are
the fixture source wherever one fits (Rule 3.5). A hand-rolled `Seed` is permitted here only for
the deliberate shape a canonical seed does not cover — a seed carrying exactly one
`multiple: true` `file` branch, for the boundary in `isNonFlat`. Declare it locally, minimal, and
give every branch a valid `br_XX` id: `SeedRegistry` enforces `^br_[A-Za-z0-9]+$`
(`engine/seed-registry.ts:63`), and a fixture that violates it is the same defect class the
testing conventions exist to kill.

Required coverage, at minimum:

*`flat-seed.test.ts`* — `isFlatSeed` true for an all-scalar seed; false for each of
`relation`/`repeater`/`tags`/`json`; `file` with `multiple: true` non-flat while a plain `file`
branch stays flat; `checkFormatCompatibility(seed, 'ndjson')` compatible for a relational seed;
`checkFormatCompatibility(seed, 'csv')` on a relational seed returns
`code: 'csv_requires_flat_seed'` with every offending alias named. Drive the branch-type cases
from an array (Rule 1.6 — one cause, one arrangement).

*`csv.test.ts`* — `encodeCsvValue` leaves a plain value unquoted, quotes on comma, on CRLF, and
doubles an inner quote; `null` yields an empty field. `CsvRowReader` round-trips a row produced by
`encodeCsvRow`; parses a quoted field containing a comma, a quoted field containing a newline
(the regression guard: this is the case a `split('\n')` parser corrupts — say so in a comment per
Rule 6.2.4), and an escaped `""`; splits correctly when `push()` is called with the same document
cut mid-quoted-field; `end()` flushes a final row with no trailing newline; `hasUnterminatedQuote()`
is true for a file that ends inside a quote; a leading BOM is stripped.

*`ndjson.test.ts`* — `encodeNdjsonLine` terminates with `\n` and round-trips through
`parseNdjsonLine`; `parseNdjsonLine` returns `code: 'invalid_json'` for garbage and
`code: 'not_an_object'` for `[]` and for `"x"` — assert the code, never the message text
(Rule 5.4); `LineReader` reassembles a record split across two `push()` calls, drops blank lines,
strips `\r` from CRLF input and the leading BOM, and `end()` yields the trailing unterminated line.

*`row-mapping.test.ts`* — `exportColumns` puts the five system columns first and then the scalar
branch aliases in declaration order, omitting non-flat ones; `toCsvCells` maps `null`→`null`,
`true`→`'true'`, a number to its string; `fromCsvCells` rejects a row with the wrong cell count
via `code: 'column_count_mismatch'`; an empty cell leaves the key **absent** from the record
(assert with `Object.hasOwn`, not `toBeUndefined` — Rule 5.7); `toImportPayload` strips
`id`/`created_at`/`updated_at`/`deleted_at`, lifts `slug` and `status` out of `data`, and omits
them entirely when blank.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run in this order from the repo root. Each command must pass before the next.

```bash
# 1. Core compiles standalone (tsc, NodeNext ESM — catches a missing .js import extension)
pnpm --filter @beechcms/core run build

# 2. Core type-check
pnpm --filter @beechcms/core run type-check

# 3. apps/api type-check — THIS is the gate that enumerates the JobContext blast radius.
#    A missing `queue` on any of the six construction sites fails here.
pnpm --filter @beechcms/api run type-check

# 4. Whole-workspace type-check and build
pnpm type-check
pnpm build

# 5. Core unit tests (the four new suites)
pnpm --filter @beechcms/core run test

# 6. Workspace tests, scoped to what changed
pnpm beech test --diff

# 7. Test-placement linter (enforces testing_conventions.md tier/placement)
pnpm lint:tests

# 8. Lint
pnpm lint
```

Full-suite fallback if `--diff` selects nothing: `pnpm beech test`.

**No database command is required in this sprint.** Do not run `pnpm beech db:migrate` or
`pnpm beech db:reset` — S1 adds no migration, and a reset would only mask an unrelated local
state problem as a green result.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

**Contract & typing**

- [ ] `JobContext.queue` is declared **required** (`queue: IQueueService`), not optional.
- [ ] All six `JobContext` construction sites supply `queue`; `pnpm --filter @beechcms/api run type-check` passes.
- [ ] `queue.middleware.ts` resolves the `InMemoryQueueService` self-reference by assignment after construction, with the comment explaining why, and does **not** make the field optional to avoid it.
- [ ] `queue-consumer.ts` falls back to `NoOpQueueService` when `env.QUEUE` is absent — it never throws and never leaves `queue` undefined.
- [ ] No `any` anywhere in the new module or its tests. No non-null assertion (`!`) introduced.
- [ ] Every intra-core import carries the explicit `.js` extension; `pnpm --filter @beechcms/core run build` passes.

**Zero-dependency rule for core**

- [ ] `packages/core/package.json` is **unchanged**. No CSV library, no stream polyfill, no new dependency of any kind.
- [ ] `packages/core/src/transfer/**` imports only from `../engine/types.js` and its own siblings. It imports nothing from `apps/`, nothing from `hono`, nothing from `@cloudflare/workers-types`, and no Node built-in.
- [ ] No file in `transfer/` references `D1Database`, builds a SQL string, or names a physical column that is not derived from `seed.branches[].alias` or `EXPORT_SYSTEM_COLUMNS`.

**Behaviour**

- [ ] `checkFormatCompatibility` returns `compatible: true` for **every** seed when the format is `ndjson`.
- [ ] `checkFormatCompatibility(seed, 'csv')` is incompatible for a seed with any `relation`, `repeater`, `tags` or `json` branch, or any `file` branch with `multiple: true`, and names every offender.
- [ ] CSV round-trip is exact for a value containing a comma, a double quote, and an embedded newline.
- [ ] `CsvRowReader` and `LineReader` both produce identical output whether the document is fed in one `push()` or split at an arbitrary byte — including a split inside a quoted CSV field.
- [ ] No decode path throws on malformed input; every failure surfaces as `{ ok: false, code }`.
- [ ] `toImportPayload` never emits `id`, `created_at`, `updated_at` or `deleted_at` in `data`.

**Tests**

- [ ] Four new suites exist at `packages/core/src/transfer/*.test.ts`, unit tier, SPDX header present, `pnpm lint:tests` passes.
- [ ] Every `it()` passes in isolation (`vitest run -t '<name>'`); no ordering dependency.
- [ ] Error-path tests assert the machine-readable `code`, never message text.
- [ ] Hand-rolled `Seed` fixtures carry valid `br_[A-Za-z0-9]+` branch ids and exist only for shapes the canonical `@beechcms/testing` seeds do not cover.
- [ ] The quoted-newline CSV case carries a comment naming the defect it guards against.
- [ ] No `it.only` / `it.skip` / `describe.skip` committed.

**Scope discipline**

- [ ] `git diff --stat` touches only: `packages/core/src/transfer/**`, `packages/core/src/queue/queue.interface.ts`, `packages/core/src/index.ts`, and the four `apps/api` files listed in SECTION 3.
- [ ] Zero files under `apps/dashboard/`. Zero files under `apps/api/migrations/`. Zero changes to `apps/api/wrangler.jsonc`. Zero new routes in `apps/api/src/features/`.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent **MUST NOT** build, stub, or scaffold any of the following. Each is owned by
a named roadmap entry in `output/backlog/ROADMAP.md` and will be planned in detail when its
sprint comes up, against the graph as it exists then.

**Deferred to S2 — `ContentExportStream`**

- `GET /api/content/:slug/export`, or any other route, in any slice.
- The `ReadableStream` producer, the `findMany` pagination loop, `Content-Disposition`/
  `Content-Type` header selection.
- The `413` over-cap refusal and the `400` CSV-on-relational refusal. S1 ships only the
  *predicate* (`checkFormatCompatibility`) and the *default* (`DEFAULT_EXPORT_MAX_ROWS`); the
  HTTP mapping of both is S2's.
- Any entry in `PROTECTED_ROUTES` in `apps/api/src/middleware/permission.middleware.ts`.

**Deferred to S3 — `ContentImportJobs`**

- The `import_jobs` system seed: its `Seed` definition, the `apps/api/migrations/XXXX_*.sql` that
  bootstraps it with `seeds.source = 'code'`, and the `apps/api/wrangler.jsonc` entry.
  **Do not write a migration in this sprint.**
- `POST /api/content/:slug/import`, `GET /api/content/import-jobs/:id`, and the
  creator-or-same-seed-write-scope authorization rule.
- The `content_import_chunk` job handler, its `JobRegistry` entry, its registration in
  `apps/api/src/index.ts`, the offset cursor, the partial report, the R2 object cleanup on a
  terminal state, and the R2 lifecycle rule for orphans.
- Any consumer of `JobContext.queue`. The field is added in S1 and stays unused until S3; that is
  intended, not an oversight to be "fixed" by wiring something to it.
- Any recursion/depth guard on in-memory self-enqueue (see the note in §4.10).
- Reuse of the `/api/upload/presign` flow for import files.

**Deferred to S4 — `BulkTransferDashboard`**

- Every file under `apps/dashboard/`: export toolbar action, format picker, import wizard, job
  progress view, error-report rendering.

**Out of scope for the feature entirely** (discarded during ideation — brief §5; do not
reintroduce under any sprint)

- Atomic/transactional import. Import is best-effort with a report.
- Upsert or update via import. Insert-only; a colliding unique key is a failed row.
- CSV support for relational seeds, and any flattening/serialization heuristic that would force
  it. `NON_FLAT_BRANCH_TYPES` is a refusal list, not a to-do list.
- TTL, expiry or archival of job *records* — retention is indefinite.
- Routing export through R2 (upload-then-download). Export streams into the HTTP response.
- Gating import behind an admin/elevated role. Standard write scope is sufficient.
- Topological ordering or deferred retry of relational references inside an import file.
