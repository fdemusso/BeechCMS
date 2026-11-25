# Sprint Plan — `ContentImportJobs`

Feature: Bulk Data Transfer (Export / Import) — Sprint 3 of 4.
Roadmap: `output/backlog/ROADMAP.md`.
Previous sprints: `docs/Sprints/BulkTransferCorePrimitives/` (merged, PASS) and
`docs/Sprints/ContentExportStream/` (merged, PASS).

---

### Pre-Computation Analysis

#### a) God Nodes identified via the CLI

Degrees read from `graphify explain` against the current graph (`graphify-out/graph.json`,
regenerated 2026-09-13 16:12, i.e. after the S2 archive commit `a1d3171` at 16:10 — no
`graphify update` was needed).

| Node | ID | Degree | Why it matters here |
|---|---|---|---|
| `createBeechApp()` | `apps_api_src_factory_createbeechapp` | **67** | The composition root. Owns the middleware registration order and receives `config.jobs: JobRegistry` at `factory.ts:L150` (`queueMiddleware(config.jobs ?? {})`). It is what makes a job handler reachable from the request side, and what the integration suite instantiates. **Not edited by S3** — the registry is passed in from `apps/api/src/index.ts:L16`. |
| `D1SeedRepository` | `apps_api_src_shared_db_repositories_seed_repository_d1_d1seedrepository` | **15** | The sanctioned reader of the `seeds` table. It is how a **queue-side** job handler obtains a `Seed` — `JobContext` carries no `getSeed`. Precedent: `semantic-search.worker.ts:L23,L232`. S3 copies that pattern exactly and adds no new mechanism. |
| `planCreateSeed()` | `packages_core_src_engine_seed_ddl_plancreateseed` | **10** | `packages/core/src/engine/seed-ddl.ts:L26`. The DDL vehicle for the `import_jobs` system seed. Used at **authoring time** to generate the migration SQL (§4.1) — not called at runtime by any S3 code. |
| `resolveRouteRule()` | `apps_api_src_middleware_permission_middleware_resolverouterule` | **3** | `permission.middleware.ts:L174`. Consumer of `PROTECTED_ROUTES`, which gains two rows. Its reverse edges are the fail-closed completeness gate. |
| `dispatchQueueBatch()` | `apps_api_src_shared_jobs_queue_consumer_dispatchqueuebatch` | **5** | `shared/jobs/queue-consumer.ts:L19`. Production-side dispatch; builds the `JobContext` literal at L24 (already carrying `queue`, shipped in S1). **Not edited by S3.** |

`graphify explain "Seed"` / `"ContentRepository"` / `"validateAndSanitizeSeedPayload"` still return
**Ambiguous** (the graph indexes `docs/api/**` typedoc Markdown as nodes alongside source);
resolved by passing full node ids, as `tooling_graphify.md` instructs.
`graphify explain "presignHandler"` returns `No node matching` — the presign route is an inline
arrow function on `uploadRoutes` (`features/upload/index.ts:L146`), not a named export, so it has
no node. Read directly instead, per the tool's own decision heuristic.

#### b) Architectural boundaries affected

| Package | Touched in S3? | Exactly what |
|---|---|---|
| `@beechcms/core` | **NO** | Zero files. Every primitive S3 needs shipped in S1: `parseNdjsonLine`, `LineReader`, `CsvRowReader`, `fromCsvCells`, `toImportPayload`, `checkFormatCompatibility`, `isTransferFormat`, `DEFAULT_IMPORT_CHUNK_ROWS`, `MAX_JOB_ERROR_SAMPLES`, and `JobContext.queue`. Two candidate core edits were examined and **rejected** in the VETO Audit (§5, §6). If the executing agent finds itself editing `packages/core/`, it has gone off-plan. |
| `apps/api` | **YES — one slice, three shared files, one migration** | New in the `content` slice: `import-job.ts` (slice-shared helpers), `handlers/import.ts`, `handlers/import-job-status.ts`, `jobs/import-chunk.worker.ts`, plus their tests. Modified: `features/content/index.ts` (two route lines), `features/content/constants.ts` (error strings + byte cap), `middleware/permission.middleware.ts` (two `PROTECTED_ROUTES` rows), `types.ts` (two optional `Env` vars), `src/index.ts` (one job-registry spread). New: `migrations/0031_import_jobs_seed.sql`. |
| `apps/dashboard` | **NO** | Untouched. UI is S4. |
| `docs/` | **YES — reference only** | Two new sections in `docs/reference/internal-content.md`, alongside the `## Export Entries` section S2 added at L62. |

**Vertical Slice boundaries.** All new runtime code lives inside the `content` slice. It imports
from `@beechcms/core`, from `apps/api/src/shared/**` (`query-utils`, `db/repositories/seed.repository.d1`)
and from `apps/api/src/public/problem-details` — repo-wide infrastructure, not slices. It imports
**nothing** from `features/upload/`, `features/search/`, `features/seeds/` or any sibling slice.
The R2 object arrives as an opaque key in the request body; the `content` slice never calls the
upload slice's presign code, it only calls `context.get('bucket')` — the `BeechBucket` port that
`storageMiddleware` (`factory.ts:L145`) already injects for every request.

#### c) `graphify affected` impact analysis

```
$ graphify affected "planCreateSeed" --depth 2
Affected nodes for planCreateSeed()
- seed-ddl.test.ts [imports] packages/core/src/engine/seed-ddl.test.ts:L5

$ graphify affected "dispatchQueueBatch" --depth 2
- queue()                       [calls]   apps/api/src/index.ts:L74
- api/src/index.ts              [imports] apps/api/src/index.ts:L12
- flow-background-queues.test.ts [imports] apps/api/test/flow/flow-background-queues.test.ts:L7

$ graphify affected "resolveRouteRule" --depth 2
- permissionMiddleware()          [calls]   apps/api/src/middleware/permission.middleware.ts:L226
- permission.middleware.test.ts   [imports] apps/api/src/middleware/permission.middleware.test.ts:L7
- createBeechApp()                [calls]   apps/api/src/factory.ts:L246
- src/factory.ts                  [imports] apps/api/src/factory.ts:L18

$ graphify affected "content/index.ts" --depth 1
- src/factory.ts [imports_from] apps/api/src/factory.ts:L19

$ graphify affected "uploadRoutes" --depth 2
- src/factory.ts [imports_from] apps/api/src/factory.ts:L36
- (+16 test files that import createBeechApp transitively — see reading below)

$ graphify explain "D1SeedRepository"
  degree 15; <-- repository.middleware.ts:L25, semantic-search.worker.ts:L23,
  api/src/index.ts:L11, seed.repository.d1.test.ts:L6

$ graphify path "exportHandler" "uploadRoutes"
No directed path found between 'exportHandler' and 'uploadRoutes'.
$ graphify path "computeVectorJob" "createHandler"
No directed path found between 'computeVectorJob' and 'createHandler'.
```

**Reading of the result, including its three blind spots — all closed by direct inspection.**

1. **`affected "planCreateSeed"` returning only its own test is accurate and is the point.**
   S3 calls `planCreateSeed` **at authoring time**, not at runtime: its output is pasted into
   `migrations/0031_import_jobs_seed.sql` (the exact bytes are in §4.1, generated by running the
   built `packages/core/dist` against the seed definition, not written by hand). The blast radius
   of the migration is therefore the D1 schema, which the graph does not model at all.

2. **`affected "uploadRoutes"` is an over-count, exactly as in S2.** The 16 test files listed
   import `createBeechApp`, not the upload router; the graph collapses the factory's transitive
   imports. S3 does not modify `uploadRoutes` — it reuses the *runtime* presign flow from the
   caller's side only.

3. **The `@beechcms/core` barrel still terminates reverse traversal** (documented in S1 and S2).
   `apps/api` imports from the barrel, so `affected` on any core symbol stops at
   `core/src/index.ts`. Irrelevant this sprint: S3 changes zero core files.

**The three real impact facts the graph cannot give, established by direct reading:**

- **`PROTECTED_ROUTES` order.** `GET /^\/api\/content\/([^/]+)\/[^/]+$/` at
  `permission.middleware.ts:L138` is a swallower: it matches `/api/content/import-jobs/<uuid>`
  with `capture1 = 'import-jobs'`, which is not a seed slug and would 403 every caller. The new
  `GET` row **must** sit in the literal-prefix block above it, next to `/api/content/drafts`
  (L110) and `/api/content/stats/...` (L114) — the block whose header comment already says
  `ORDER IS SIGNIFICANT — first match wins`. `POST /api/content/:slug/import` has no swallower
  (there is no `POST /^\/api\/content\/([^/]+)\/[^/]+$/` row), but it is placed next to the
  `export` row for readability.
- **Hono route order** in `features/content/index.ts`. `content.get('/:slug/:id', getByIdHandler)`
  (L35) swallows `/import-jobs/:id` for the same reason, so the new GET is registered at the top
  of the router. `content.post('/:slug/import', …)` collides with nothing (`POST /:slug` at L36 is
  one segment; `POST /:slug/:id/restore` is three).
- **Blast radius of registering `import_jobs` as a seed.** It becomes a row in `seeds` and is
  hydrated into `SeedRegistry` by `seedRegistryMiddleware` for every request. Three consumers were
  checked: (i) the dashboard sidebar filters on `dashboard.hidden` (`engine/types.ts:L200`) — the
  definition sets `hidden: true`; (ii) `semanticSearchHooks` short-circuits on
  `indexableSearchBranches(ctx.seed).length > 0` (`semantic-search.hooks.ts:L31,L83,L104`) — the
  definition sets `policies.search: false` on every `text` branch, so `generateFtsTable` returns
  `null` and **no vector job is enqueued per job-progress update**; (iii) the generic
  `/api/content/import_jobs` CRUD routes become reachable to a caller holding `content:*` at
  `GLOBAL_SCOPE` — accepted and documented in the VETO Audit §7.

**New leaf code has no reverse edges.** `import-job.ts`, `handlers/import.ts`,
`handlers/import-job-status.ts` and `jobs/import-chunk.worker.ts` are new; nothing can break
from them.

---

### VETO Audit

Proposed boundaries evaluated against `_config/ponytail_arch.md`.

**1. THE BOTANICAL INVARIANT — does anything bypass `@beechcms/core`?**

No content write or read in this sprint touches D1 directly.

- Imported rows are inserted with `context.repository.create(seed, id, slug, status, data)` after
  `validateAndSanitizeSeedPayload(seed, data, { operation: 'create', … })` — byte-for-byte the
  path `features/content/handlers/create.ts:L72,L118` already uses. `apiToDb`/`serializeForDb`
  keeps sole ownership of the DB representation; the importer hands over a plain payload object.
- The **job record itself** is an engine-mediated content entry: `import_jobs` is a real seed with
  a real `content_import_jobs` table emitted by `planCreateSeed`, read and written exclusively
  through `JobContext.repository` / `context.get('repository')`. This is the brief's explicit
  requirement (§2: *ImportJob è un'entità gestita dal Botanical Engine … non uno storage D1
  grezzo*), and it is why `JobContext` deliberately exposes no `D1Database`.
- The **one** raw-D1 touch in the sprint is `new D1SeedRepository(db)` inside the queue-side job
  handler, reading the `seeds` **metadata** table to resolve a `Seed`. That is not content
  persistence, `D1SeedRepository` is the sanctioned reader of that table, and it is the exact
  precedent set by `semantic-search.worker.ts:L232` and reviewed at the time. A job handler has no
  other way to obtain a `Seed`: `JobContext` carries no `getSeed`. **No new mechanism is
  introduced.**
- The migration's `CREATE TABLE` is not hand-authored: it is the verbatim output of
  `planCreateSeed(IMPORT_JOBS_SEED)` (§4.1). No invented column, no invented index name.

**PASS.**

**2. Branch IDs vs hardcoded field names.**

The `import_jobs` seed declares `br_01 … br_10`, matching `^br_[A-Za-z0-9]+$` as
`SeedRegistry` enforces at boot (`engine/seed-registry.ts:L63`). Job fields are addressed by
**alias** in payload objects, which `engine/types.ts:L82` defines as *the API payload key and the
SQL column name* — the same handle `create.ts` uses. No `br_XX` id is needed at runtime because
nothing in S3 survives an alias rename: the job record is read back through `dbToApi` in the same
deploy that wrote it.

Every alias was checked against both reserved-word lists
(`engine/sql-reserved-words.ts`, `automations/automations-grammar-words.ts`): `target_seed`,
`format`, `object_key`, `job_state`, `row_offset`, `inserted_rows`, `failed_rows`, `error_report`,
`created_by`, `finished_at` — all free. The obvious names `offset`, `key`, `count` and `status`
are **not** used: the first three are reserved (recorded in the S1 plan), and `status` is a system
column with `CHECK (status IN ('draft','review','published','archived'))` (`ddl.ts:L174`), which
cannot carry `pending`/`processing`/`completed`/`failed`. Hence `job_state`. **PASS.**

**3. VSA ENFORCEMENT — cross-feature imports.**

Zero. Verified with `graphify path "exportHandler" "uploadRoutes"` → `No directed path found`:
the `content` slice does not reach the `upload` slice today, and S3 adds no edge that would let
it. The import endpoint receives an **opaque R2 key** in its request body and reads it through
`context.get('bucket')` — the `BeechBucket` port `storageMiddleware` injects. The caller performs
presign/PUT against `/api/upload/*` on its own; the two slices are coupled only through R2, which
is infrastructure.

**The one genuine VSA question, and its answer.** Should the import job handler live in
`@beechcms/core`? Rule 3's trigger is *two slices need the same logic*. It is not met: exactly one
slice imports. The codecs that export and import genuinely share already moved to core in S1. A
queue handler in core would also drag `D1SeedRepository` — an `apps/api` class — behind it.
It stays in the slice. **PASS.**

**4. CLOUDFLARE PURITY.**

Edge-native throughout. No dependency added to `apps/api/package.json`: no CSV library, no stream
polyfill, no Node built-in. The R2 object is consumed as a `ReadableStream` through a
`TextDecoder({ stream: true })` loop and is **never** materialised as a whole string — S1's
`LineReader` and `CsvRowReader` are stateful precisely so a read boundary may fall mid-record.
Continuation is on the native Cloudflare Queue transport via `JobContext.queue` (S1), not an
in-process loop, so no stateful background process exists. The `content_import_jobs` schema change
is a numbered migration under the strict workflow, not a runtime DDL mutation. **PASS.**

**5. REJECTED core change #1 — a `range` option on `BeechBucket.get`.**

The obvious optimisation for chunked reading is a byte-range read, so chunk *k* does not re-stream
the first *k−1* chunks. It would mean adding `options?: { range?: { offset: number } }` to
`BeechBucket.get` (`packages/core/src/common/storage.ts:L27`) and implementing it in
`R2BucketAdapter`, `S3Bucket` and `NullBucket`. **Rejected.**

- The cost that matters in a Worker is **per invocation**, not aggregate. Each chunk gets its own
  CPU budget. Skipping to the offset never decodes JSON or touches D1 — it only advances the line
  reader. For the worst case this sprint permits (`IMPORT_MAX_BYTES` = 50 MB, the same default as
  `MAX_UPLOAD_BYTES`), the skip is bounded by a 50 MB decode-and-scan: tens of milliseconds,
  against a 30 s ceiling. R2→Worker egress is free and each chunk is one class-B operation.
- A byte cursor is also **harder to keep correct** than a record cursor: tracking byte offsets
  through a `TextDecoder` across multi-byte characters, and across a CSV field containing a quoted
  newline, is exactly the class of off-by-one that silently drops or duplicates a row — the defect
  S2's keyset-cursor audit was about. A record cursor is exact by construction.
- YAGNI, and the roadmap's ordering rule: a core contract change with one consumer, landing in the
  same sprint as that consumer, is the sequential-merge hazard the four-sprint split exists to
  remove. If a future deployment proves the skip is the bottleneck, the range option can be added
  then, against a real measurement.

**PASS with the record-cursor design.**

**6. REJECTED core change #2 — an `ndjson` entry in `SUPPORTED_FILE_TYPES`.**

`POST /api/upload/presign` gates on `isMimeAccepted(mimeType, 'any')`
(`features/upload/index.ts:L156`). `packages/core/src/media/file-types.ts` registers `text/csv`
(L238) but has **no `application/x-ndjson`**, so presigning an NDJSON file with its canonical MIME
type is refused today. Adding the entry is a six-line additive core change. **Rejected**: it would
widen the *media* upload allowlist for every seed's `file` branch in order to serve one transfer
path. The contract instead is that an NDJSON import file is presigned as `application/json`
(registered, L296) or `text/plain` (L233), and **the stored content type is not authoritative** —
`POST /api/content/:slug/import` takes `format` from its request body and the handler never reads
`head.contentType`. Documented in §4 and in `docs/reference/internal-content.md`. **PASS.**

**7. Two accepted consequences of making `import_jobs` a real seed, stated rather than hidden.**

- **The generic content routes cover it.** `GET /api/content/import_jobs`,
  `POST /api/content/import_jobs`, `PUT`, `DELETE` all resolve, gated by `content:*` at scope
  `import_jobs`. No role grants that scope by default; only a holder of `content:*` at
  `GLOBAL_SCOPE` (an administrator) reaches them. This is true of every seed and is not a new hole
  — inventing a "system seed" concept to hide it would be a new engine feature in service of one
  table, which rule 1 kills. The dedicated `GET /api/content/import-jobs/:id` exists because the
  brief's authorization rule (creator **or** same-seed write scope) is *narrower and different*
  from `content:read` on `import_jobs`, not because the generic route must be sealed.
- **An administrator can soft-delete the seed** through `DELETE /api/seeds/import_jobs`, which
  would break imports until re-applied. Same exposure as any code-source seed; out of scope.

**8. Scope gate.** S3 is one sprint: one slice, two routes, one job handler, one migration, no
core change, no UI. Export (S2) and import (S3) were already split as independent boundaries.
Everything deferred appears in SECTION 7 against its roadmap entry.

**Verdict: APPROVED.** Proceeding to the linear Sprint Plan.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

S1 shipped the codecs and the `JobContext.queue` producer port. S2 consumed the *export* half and
proved, against real D1, that `checkFormatCompatibility` and the CSV encoder are correct. S3 is
the first sprint in the feature that **persists state**, and it must land before S4 for three
reasons that are architectural, not scheduling convenience.

**1. The job record is a schema change, and schema changes land before their consumers.** The
dashboard's import wizard (S4) polls a job. That job cannot exist until `content_import_jobs` is
in D1 and `import_jobs` is a row in `seeds`. A D1 migration is the one artifact in this repo that
cannot be rolled back cheaply (`_config/database_workflow.md`: *never edit an already-applied
migration*), so it lands in its own reviewable diff, with the endpoints that exercise it and
nothing else. Shipping the migration together with the UI would put an irreversible artifact and a
disposable one in the same merge.

**2. Asynchrony is the whole risk, and it is invisible from the UI tier.** Export's entire failure
surface is one HTTP response. Import's is a cursor that must survive a queue retry, a chunk that
must re-enqueue itself, and an R2 object that must be deleted exactly once. Every one of those is
observable only through the job record, which is precisely what this sprint builds. Validating the
chunk loop through a browser in S4 would mean debugging a cursor through a wizard.

**3. `content:read` and `content:create` are separate gates, and the job-status rule is a third
one.** S2 added one `PROTECTED_ROUTES` row at `content:read`. S3 adds two rows — one at
`content:create` on `capture1`, and one at `AUTHED` whose real decision (creator **or** holder of
`content:create` on the job's *target* seed) is made inside the handler, because the scope is not
in the URL. That is the same shape as the `/api/content/drafts` row (L110) and its explanatory
comment. Three permission regimes in one reviewable diff against a fail-closed gate is the
maximum; adding the dashboard's surface on top would be a fourth.

**Botanical adherence.** The job is content, not a side table: its storage is
`planCreateSeed` output, its reads and writes go through `ContentRepository`, its fields are
branches with `br_XX` ids, and the imported rows are validated by
`validateAndSanitizeSeedPayload` before `repository.create` — the same chokepoint
`POST /api/content/:slug` uses. Nothing in the sprint composes SQL.

**VSA adherence.** One slice — `content`. The R2 coupling to the `upload` slice is an opaque
object key travelling through the request body, not an import. `graphify path "exportHandler"
"uploadRoutes"` → no directed path, before and after.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Middleware registration order — `apps/api/src/factory.ts` (`createBeechApp`, L117)**

```
L129  app.use('*', repositoryMiddleware({...}))       // 1. first — everything below needs it
L143  app.use('*', seedRegistryMiddleware())          // hydrates seedRegistry from D1 `seeds`
L145  app.use('*', storageMiddleware({...}))          // sets `bucket`
L150  app.use('*', queueMiddleware(config.jobs ?? {}))// sets `queue`; needs repository + bucket
L152  app.use('*', authProvidersMiddleware(...))
L153  app.use('*', rateLimiterMiddleware(...))
L154  app.use('*', observabilityMiddleware())
...
L239  apiProtected.use('*', authMiddleware({ acceptOAuth: true }))
L242  apiProtected.use('*', oauthScopeMiddleware())   // must stay immediately after authMiddleware
L246  apiProtected.use('*', permissionMiddleware())
L279  apiProtected.route('/content', content)
L293  app.route('/api', apiProtected)
```

**S3 changes none of this order.** It adds routes inside the already-mounted `content` router and
a handler to the registry `index.ts` passes into `createBeechApp`.

**Queue wiring — the two `JobContext` construction sites (both already carry `queue`, S1)**

- Request side: `middleware/queue.middleware.ts:L22`. Selects `overrides.queue` →
  `CloudflareQueueService(context.env.QUEUE)` (L37) → `InMemoryQueueService` (L52). The in-memory
  branch assigns `jobContext.queue = inMemoryQueue` **after** construction (L54) so a chunked job
  re-enqueuing itself in local dev reaches the same in-process dispatcher.
- Consumer side: `shared/jobs/queue-consumer.ts:L24`. `new D1ContentRepository(env.DB)`,
  `createBucketProvider(env, …)`, `SystemClock`, `SystemIdGenerator`,
  `queue: env.QUEUE ? new CloudflareQueueService(...) : new NoOpQueueService()` (L33),
  `env: env as unknown as Record<string, string | undefined>`.
  Per message: `ack()` on success / malformed body / unknown handler name, `retry()` on throw.
  Entry point `apps/api/src/index.ts:L74` (`queue()`), registry `const jobs = { ...semanticSearchJobs }`
  at L16.

`JobContext` (`packages/core/src/queue/queue.interface.ts:L24`) carries
`repository`, `bucket`, `clock`, `idGenerator`, `queue`, `env` — and **deliberately no
`D1Database` and no `getSeed`**.

**`InMemoryQueueService` behaviour that the integration tier depends on**
(`shared/services/queue/in-memory-queue-service.ts:L15`): it runs the handler **in-process**. When
`scheduleBackgroundTask` is present (`context.executionCtx.waitUntil`) the run is detached;
otherwise it is **awaited inline** (L43). `createTestClient` calls
`app.request(path, init, env)` with **no `executionCtx`** (`packages/testing/src/client/test-client.ts:L24`),
so `queueMiddleware`'s `try { context.executionCtx }` throws, `scheduleBackgroundTask` is
`undefined`, and every chunk — including self-continuation — completes **before the POST response
resolves**. That is what makes an end-to-end integration assertion possible without sleeping
(forbidden by `testing_conventions.md` §7.2).

**Existing job precedent — `features/search/jobs/semantic-search.worker.ts`**

- `resolveWorkerBindings(context)` (L59) casts `context.env` to reach `DB` / `AI` / `SEARCH_R2`.
- `new D1SeedRepository(db)` + `.get(payload.seedSlug)` → `seedRecord.definition` (L232-234) is how
  a queue-side handler obtains a `Seed`.
- Content access is `context.repository.findById(seed, …)` (L246) — engine-mediated.
- The registry is a const map exported as `JobRegistry` (L351) and spread into `index.ts:L16`.

**Seed storage and hydration**

- `seeds` table (`migrations/0000_v040_base.sql:L291`):
  `slug TEXT PK, definition TEXT, status TEXT CHECK(active|deleted) DEFAULT 'active',
  source TEXT CHECK(code|runtime) DEFAULT 'runtime', created_at, updated_at`.
  `seed_meta` holds `registry_version` (L303, seeded to `'1'` at L308).
- `seedRegistryMiddleware` → `getHydratedRegistry(seedRepository)`
  (`shared/services/cache/seed-registry-cache.ts:L33`): reads `registry_version`, rebuilds from
  `listActive()` when the token moved or the 5 s TTL lapsed. A migration that inserts a seed **must
  bump `registry_version`** or running isolates serve a stale registry for up to 5 s.
- **No seed with `source = 'code'` exists in the repo today.** `import_jobs` is the first.
  `packages/testing/src/seeds/provision.ts:L12` already writes canonical test seeds with
  `source = 'code'`, so the column value is exercised, but nothing ships one in a migration.
- Migrations: `apps/api/migrations/` holds `0000_v040_base.sql` and `0030_test_seeds.sql`.
  `wrangler.jsonc:L25` uses `"migrations_dir": "migrations"` — there is **no `migrations` array**,
  so Step 2 of `_config/database_workflow.md` is stale for this repo and no `wrangler.jsonc` edit
  is required. `0030_test_seeds.sql` is the shape to copy: raw `CREATE TABLE content_*` +
  indexes, no wrapper.

**Storage port — `packages/core/src/common/storage.ts:L25`**

```ts
export interface BeechBucket {
  put(key, body, options?): Promise<void>
  get(key: string): Promise<GetBucketResult | null>          // NO range parameter
  delete(key: string): Promise<void>
  head(key: string): Promise<{ size: number; contentType?: string; metadata?: … } | null>
  getUrl(key): string
  getTotalSize(): Promise<number>
  list(options?): Promise<…>
  presignPut(key, options: PresignOptions): Promise<string>
  presignGet(key, options: PresignOptions): Promise<string>
}
export interface GetBucketResult { body: ReadableStream | ArrayBuffer; contentType?: string; size: number; metadata?: … }
```

Three implementations: `R2BucketAdapter` (`shared/storage/r2-bucket.ts:L20`, returns
`r2Object.body`, a `ReadableStream`; **`presignPut`/`presignGet` throw 501** — native bindings
cannot sign), `S3Bucket` (`shared/storage/s3-bucket.ts:L35`, returns
`transformToWebStream()`), `NullBucket` (`shared/storage/factory.ts:L21`, every method throws 503).
Selection precedence in `createBucketProvider` (L134): full S3 credentials → `S3Bucket`;
`MEDIA_BUCKET` binding → `R2BucketAdapter`; otherwise `NullBucket`.

**Upload / presign flow the caller uses before calling import** (`features/upload/index.ts`)

- `POST /api/upload/presign` (L146): body `{ filename, mimeType, sizeBytes }`; refuses
  `sizeBytes > resolveMaxUploadBytes(env)` (default 50 MB, absolute ceiling 500 MB, L18) and
  `!isMimeAccepted(mimeType, 'any')` (L156). Returns `{ uploadUrl, key, expiresIn: 900 }`.
- Key shape `generateObjectKey` (L32): `` `${unixSeconds}-${8 hex}-${sanitizedFilename}` ``.
  `POST /api/upload/confirm` validates keys against
  `/^\d+(?:-[a-zA-Z0-9]+)?-[a-zA-Z0-9._-]+$/` (L187) after `sanitizeStorageKey` (L52).
- **`/upload/confirm` is NOT part of the import flow**: it would register the import file in
  `media_objects` and increment the storage counter. The import endpoint takes the raw key.
- `isMimeAccepted` (`packages/core/src/media/file-types.ts`): `text/csv` registered (L238),
  `application/json` (L296), `text/plain` (L233); **`application/x-ndjson` is absent** — see VETO
  Audit §6.

**Permission table — `middleware/permission.middleware.ts`**

`PROTECTED_ROUTES` (L69) is a closed, ordered allowlist; first match wins; any `/api/*` path not
listed is refused for every caller (`ROUTE_NOT_REGISTERED`, L15). Relevant rows today:

```
L110  GET    /^\/api\/content\/drafts$/                         AUTHED        ← literal-prefix block
L114  GET    /^\/api\/content\/stats\/[^/]+$/                   view_analytics:global
L118  GET    /^\/api\/content\/([^/]+)\/view-config$/           content:read   capture1
L121  GET    /^\/api\/content\/([^/]+)\/export$/                content:read   capture1   ← S2
L122  PATCH  /^\/api\/content\/([^/]+)\/bulk$/                  content:update capture1
L138  GET    /^\/api\/content\/([^/]+)\/[^/]+$/                 content:read   capture1   ← swallower
L141  GET    /^\/api\/content\/([^/]+)$/                        content:read   capture1
L142  POST   /^\/api\/content\/([^/]+)$/                        content:create capture1
L159  POST   /^\/api\/upload(\/(presign|confirm))?$/            content:create global
```

`resolveRouteRule` (L174) returns `capture1` as the scope for `kind: 'permission'` rules.
`permissionMiddleware` (L226) refuses in this order, all 403: no subject → deactivated account →
unregistered route → missing permission. `permission.middleware.test.ts:L13` is the completeness
test: a route mounted under `apiProtected` with no row fails it loudly.

`resolveEffectivePermissions(context)` (`shared/rbac/effective-permissions.ts:L29`) memoises the
caller's authority in the `effectivePermissions` context Variable.
`hasPermission(effective, permission, scope)` (`packages/core/src/rbac/evaluate.ts:L64`) returns
true for a global grant, else checks `byScope`.

**Content slice router — `features/content/index.ts`** (order as shipped by S2)

```
L22  content.patch('/:slug/:id/kanban-move', …)
…
L31  content.get('/:slug/export', exportHandler)        // before /:slug/:id
L32  content.get('/:slug', listHandler)
L35  content.get('/:slug/:id', getByIdHandler)          // ← swallower for /import-jobs/:id
L36  content.post('/:slug', createHandler)
```

**Create path S3 mirrors — `features/content/handlers/create.ts`**

`validateAndSanitizeSeedPayload(seed, bodyForData, { operation: 'create', allowNull: false,
requireAtLeastOneValidField: true, enforceRequiredFields: true, idGenerator })` (L72) →
`applyPrivacy(validation.data, seed)` (L94) → `id = idGenerator.uuid()` (L103) → slug fallback via
`seed.displayNameAlias` (L106) → `repository.create(seed, id, finalSlug, status, privacyData, { actor })` (L118).
`logContentActivity` and `dispatchContentAutomation` (L122-123) are called by the **handler**, not
by the repository.

**Engine facts the importer must respect**

- `SYSTEM_COLUMNS` = `{id, slug, status, created_at, updated_at, deleted_at}` (`ddl.ts:L54`).
- `status` CHECK is `('draft','review','published','archived')` (`ddl.ts:L174`).
- `BRANCH_TYPE_SQL` (`ddl.ts:L37`): `text|json|richtext|file|tags|relation|repeater → TEXT`,
  `number → REAL`, `boolean|date → INTEGER`.
- `generateIndexes` (`ddl.ts`) emits an index per `text|number|date|boolean|relation` branch whose
  resolved `policies.filter` is true, plus `status` and `created_at`.
- `generateFtsTable` returns `null` when `indexableSearchBranches(seed)` is empty; that function
  requires `type ∈ {text, richtext}` **and** resolved `policies.search` **and** `policies.public`.
- `SlugConflictError` / `EntryNotFoundError` / `RelationTargetNotFoundError`
  (`packages/core/src/content/content.repository.ts:L36,L46,L56`) are the typed failures the
  per-row loop must classify.

**S1 primitives this sprint consumes (all unconsumed until now, by design)**

`parseNdjsonLine`, `LineReader` (`ndjson.ts`), `CsvRowReader` + `hasUnterminatedQuote()`
(`csv.ts:L111`), `fromCsvCells`, `toImportPayload` (`row-mapping.ts:L57,L88`),
`checkFormatCompatibility`, `isTransferFormat`, `DEFAULT_IMPORT_CHUNK_ROWS` (500),
`MAX_JOB_ERROR_SAMPLES` (100), `LineParseResult` / `LineParseErrorCode` / `TransferFormat`.
`toImportPayload` already drops `id`, `created_at`, `updated_at`, `deleted_at` and splits
`slug`/`status` out of `data` — which is what keeps import insert-only.

**Test tiers** (`apps/api/vitest.config.ts`, `vitest.workers.config.ts`)

- `unit` — `src/**/*.test.ts`, excluding `src/**/test/integration/**` and `src/**/test/scale/**`.
- `integration` — `src/features/**/test/integration/**/*.test.ts`, real D1 + **real R2**
  (`r2Buckets: ['MEDIA_BUCKET']`), migrations applied from `migrations/` via
  `readD1Migrations` + `test/harness/apply-migrations.ts`. The new migration is therefore
  automatically present in this tier.
- `flow` — `test/**/*.test.ts`, legacy, Docker-backed. **No new file goes here.**
- `createTestHarness` (`packages/testing/src/harness.ts:L61`) builds `env = { ...TEST_ENV,
  ...options.env, DB: options.db }`; `TEST_ENV` (`env.ts:L16`) carries **no `MEDIA_BUCKET`**, so a
  suite needing R2 must pass it through `options.env`.
- `resetContentTables(db, seeds)` (`provision.ts:L28`) only clears the seeds it is given.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**New files — `apps/api` only, zero new dependencies**

| File | Contents |
|---|---|
| `apps/api/migrations/0031_import_jobs_seed.sql` | `planCreateSeed` output for `import_jobs` + `INSERT OR IGNORE INTO seeds (…, source='code')` + `registry_version` bump. |
| `apps/api/src/features/content/import-job.ts` | Slice-shared, transport-free: `IMPORT_JOBS_SLUG`, `IMPORT_JOB_FIELDS`, `CONTENT_IMPORT_CHUNK_JOB`, `ImportJobState`, `ImportJobRecord`, `ImportRowError`, `ImportChunkPayload`, `resolveImportMaxBytes()`, `resolveImportChunkRows()`, `readImportJobRecord()`, `toImportJobResponse()`, `appendErrorSamples()`. |
| `apps/api/src/features/content/handlers/import.ts` | `importHandler` — `POST /api/content/:slug/import`. |
| `apps/api/src/features/content/handlers/import-job-status.ts` | `importJobStatusHandler` + `canReadImportJob()` — `GET /api/content/import-jobs/:id`. |
| `apps/api/src/features/content/jobs/import-chunk.worker.ts` | `contentImportChunkJob`, `contentImportJobs: JobRegistry`, `decodeChunk()`. |

**New test files**

| File | Tier | Why here |
|---|---|---|
| `apps/api/src/features/content/import-job.test.ts` | **unit** | Pure functions: the two env resolvers, `appendErrorSamples` capping at `MAX_JOB_ERROR_SAMPLES`, `toImportJobResponse` shaping. Colocated with its source. |
| `apps/api/src/features/content/jobs/import-chunk.worker.test.ts` | **unit** | The handler is driven with a stubbed `ContentRepository`, a stubbed `BeechBucket` and a recording `IQueueService`. A faked repository means unit tier by Rule 0.1. Covers: cursor advance, resume-from-offset, per-row failure classification, error-sample cap, terminal-state R2 delete, self-re-enqueue, `queue_unavailable`. |
| `apps/api/src/features/content/test/integration/content-import.integration.test.ts` | **integration** | The HTTP contract through the full middleware chain against real D1 and real R2: 202 + `Location`, the persisted job row, the imported content rows, `400` CSV-on-relational, `400` bad format, `404` missing object, `413` oversize, the job-status authorization matrix, multi-chunk continuation with `IMPORT_CHUNK_ROWS: '2'`. |

**Modified files**

| File | Change |
|---|---|
| `apps/api/src/features/content/index.ts` | two lines: `content.get('/import-jobs/:id', importJobStatusHandler)` at the **top** of the router, `content.post('/:slug/import', importHandler)` next to the export row |
| `apps/api/src/features/content/constants.ts` | seven entries added to `CONTENT_ERRORS`, plus `DEFAULT_IMPORT_MAX_BYTES` |
| `apps/api/src/middleware/permission.middleware.ts` | two `PROTECTED_ROUTES` rows — one in the literal-prefix block after L114, one after the `export` row at L121 |
| `apps/api/src/types.ts` | `IMPORT_MAX_BYTES?: string` and `IMPORT_CHUNK_ROWS?: string` added to `Env` |
| `apps/api/src/index.ts` | `import { contentImportJobs } from './features/content/jobs/import-chunk.worker'` and `const jobs = { ...semanticSearchJobs, ...contentImportJobs }` |
| `docs/reference/internal-content.md` | `## Import Entries` and `## Import Job Status` sections after `## Export Entries` (L62) |

**Explicitly NOT produced in this sprint:** no file under `packages/core/`, no file under
`apps/dashboard/`, no `wrangler.jsonc` change (the repo uses `migrations_dir`, not a migrations
array), no `OAUTH_SCOPE_ROUTES` entry, no new middleware, no change to `factory.ts`. See SECTION 7.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

`apps/api` files open with the BUSL-1.1 three-line header
(`testing_conventions.md` §1.2). Quote style: single quotes, no semicolons — match the
surrounding slice.

---

#### 4.1 `apps/api/migrations/0031_import_jobs_seed.sql`

The `CREATE TABLE` and `CREATE INDEX` statements below are the **verbatim output** of
`planCreateSeed(IMPORT_JOBS_SEED)` run against `packages/core/dist`. Do not hand-edit them. Note
what the engine did **not** emit and why it matters: no `content_import_jobs_drafts` table
(`allowDrafts` absent), no `fts_import_jobs` virtual table and no FTS triggers (every `text`
branch sets `policies.search: false`, so `indexableSearchBranches` is empty), and no junction
table (no `relation` branch).

```sql
-- 0031_import_jobs_seed.sql
-- Bootstraps the `import_jobs` system content type (Bulk Data Transfer, sprint 3/4).
-- The table DDL is the verbatim output of planCreateSeed() for the definition inserted below:
-- the Botanical Engine, not this file, is the authority on the schema.

CREATE TABLE IF NOT EXISTS content_import_jobs (
  id         TEXT    NOT NULL PRIMARY KEY,
  slug       TEXT    NOT NULL UNIQUE,
  status     TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  target_seed  TEXT NOT NULL,
  format  TEXT NOT NULL,
  object_key  TEXT NOT NULL,
  job_state  TEXT NOT NULL,
  row_offset  REAL NOT NULL,
  inserted_rows  REAL NOT NULL,
  failed_rows  REAL NOT NULL,
  error_report  TEXT,
  created_by  TEXT NOT NULL,
  finished_at  INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON content_import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at ON content_import_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_import_jobs_target_seed ON content_import_jobs(target_seed);
CREATE INDEX IF NOT EXISTS idx_import_jobs_job_state ON content_import_jobs(job_state);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_by ON content_import_jobs(created_by);

-- INSERT OR IGNORE, not the repository's UPSERT: a migration runs once, and if an operator
-- already created a runtime seed on this slug we must not clobber their definition silently.
INSERT OR IGNORE INTO seeds (slug, definition, status, source, created_at, updated_at)
VALUES (
  'import_jobs',
  '{"slug":"import_jobs","label":"Import Job","labelPlural":"Import Jobs","displayNameAlias":"target_seed","dashboard":{"hidden":true},"branches":[{"id":"br_01","alias":"target_seed","label":"Target seed","type":"text","requiredOnCreate":true,"policies":{"search":false,"filter":true}},{"id":"br_02","alias":"format","label":"Format","type":"text","requiredOnCreate":true,"policies":{"search":false,"filter":false}},{"id":"br_03","alias":"object_key","label":"Object key","type":"text","requiredOnCreate":true,"policies":{"search":false,"filter":false}},{"id":"br_04","alias":"job_state","label":"State","type":"text","requiredOnCreate":true,"policies":{"search":false,"filter":true}},{"id":"br_05","alias":"row_offset","label":"Rows read","type":"number","requiredOnCreate":true,"policies":{"filter":false}},{"id":"br_06","alias":"inserted_rows","label":"Rows inserted","type":"number","requiredOnCreate":true,"policies":{"filter":false}},{"id":"br_07","alias":"failed_rows","label":"Rows failed","type":"number","requiredOnCreate":true,"policies":{"filter":false}},{"id":"br_08","alias":"error_report","label":"Error report","type":"json","policies":{"search":false,"filter":false,"sort":false}},{"id":"br_09","alias":"created_by","label":"Created by","type":"text","requiredOnCreate":true,"policies":{"search":false,"filter":true}},{"id":"br_10","alias":"finished_at","label":"Finished at","type":"date","policies":{"filter":false}}]}',
  'active',
  'code',
  unixepoch(),
  unixepoch()
);

-- seed-registry-cache.ts serves a cached SeedRegistry keyed on this token. Without the bump a
-- warm isolate would 404 on `import_jobs` for up to its 5s TTL after deploy.
UPDATE seed_meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE id = 'registry_version';
```

**No `wrangler.jsonc` edit.** `apps/api/wrangler.jsonc:L25` declares
`"migrations_dir": "migrations"`; there is no `migrations` array to append to. (The
`_config/database_workflow.md` Step 2 instruction predates that layout.)

**Alias rationale, for the reviewer:** `job_state` rather than `status` because the system `status`
column carries `CHECK (status IN ('draft','review','published','archived'))`; `row_offset` rather
than `offset`, `object_key` rather than `key`, and no `count` — all three are reserved
(`SQL_RESERVED_WORDS` / `AUTOMATION_RESERVED_WORDS`) and `SeedRegistry` throws at boot on a
reserved alias.

---

#### 4.2 `apps/api/src/features/content/constants.ts` (modified)

Append to `CONTENT_ERRORS`, and add the byte cap next to it:

```ts
export const CONTENT_ERRORS = {
  // … existing entries unchanged …
  INVALID_IMPORT_FORMAT: 'Unsupported import format',
  IMPORT_OBJECT_KEY_REQUIRED: 'objectKey is required',
  IMPORT_OBJECT_NOT_FOUND: 'No uploaded object found for that key',
  IMPORT_FILE_TOO_LARGE: 'Import file exceeds the maximum size — split the file and retry',
  IMPORT_JOBS_SEED_MISSING: 'The import_jobs system content type is not installed — run database migrations',
  IMPORT_JOB_NOT_FOUND: 'Import job not found',
  IMPORT_JOB_FORBIDDEN: 'Not authorized to read this import job',
} as const

/**
 * Default ceiling on the R2 object an import job will read. Matches DEFAULT_MAX_UPLOAD_BYTES in
 * features/upload/index.ts:L15 — the presign route already refuses anything larger, so a bigger
 * value here could never be reached, and a smaller one would accept an upload it then refuses.
 */
export const DEFAULT_IMPORT_MAX_BYTES = 50 * 1024 * 1024
```

`CSV_REQUIRES_FLAT_SEED` is **reused, not duplicated**: the message already says "request
format=ndjson" and is direction-agnostic.

---

#### 4.3 `apps/api/src/types.ts` (modified)

Add to `Env`, immediately after `EXPORT_MAX_ROWS` (L74):

```ts
  /**
   * Ceiling in bytes on an import file. Unset falls back to DEFAULT_IMPORT_MAX_BYTES.
   * Deliberately absent from wrangler.jsonc `vars`, exactly like MAX_UPLOAD_BYTES.
   */
  IMPORT_MAX_BYTES?: string
  /**
   * Rows one queue invocation processes before persisting its cursor and re-enqueuing.
   * Unset falls back to DEFAULT_IMPORT_CHUNK_ROWS from @beechcms/core.
   */
  IMPORT_CHUNK_ROWS?: string
```

---

#### 4.4 `apps/api/src/features/content/import-job.ts` (new)

Slice-shared and transport-free: no Hono `Context`, no `D1Database`, no SQL. Imported by both
handlers and by the worker, all inside the `content` slice.

```ts
import {
  DEFAULT_IMPORT_CHUNK_ROWS,
  MAX_JOB_ERROR_SAMPLES,
  type ContentRepository,
  type Seed,
  type TransferFormat,
} from '@beechcms/core'
import { DEFAULT_IMPORT_MAX_BYTES } from './constants'

/** Slug of the system seed bootstrapped by migrations/0031_import_jobs_seed.sql. */
export const IMPORT_JOBS_SLUG = 'import_jobs'

/** Queue job name. Must match the key registered in `contentImportJobs`. */
export const CONTENT_IMPORT_CHUNK_JOB = 'content_import_chunk'

/**
 * Branch aliases of the import_jobs seed, in one place so a rename is a single edit.
 * These ARE the payload keys and the SQL column names (engine/types.ts:L82).
 */
export const IMPORT_JOB_FIELDS = {
  targetSeed: 'target_seed',
  format: 'format',
  objectKey: 'object_key',
  state: 'job_state',
  rowOffset: 'row_offset',
  insertedRows: 'inserted_rows',
  failedRows: 'failed_rows',
  errorReport: 'error_report',
  createdBy: 'created_by',
  finishedAt: 'finished_at',
} as const

/**
 * Lifecycle of a job (brief §2). `completed` and `failed` are terminal: the R2 object is
 * deleted on entry to either, and a late duplicate queue delivery is a no-op.
 */
export type ImportJobState = 'pending' | 'processing' | 'completed' | 'failed'

const TERMINAL_STATES: ReadonlySet<ImportJobState> = new Set<ImportJobState>(['completed', 'failed'])

export function isTerminalState(state: string): boolean {
  return TERMINAL_STATES.has(state as ImportJobState)
}

/** One rejected row. `row` is the 1-based index of the DATA record, header excluded. */
export interface ImportRowError {
  row: number
  code: string
  message: string
  field?: string
}

/** Queue payload. Carries only the id: every cursor lives in the durable job record. */
export interface ImportChunkPayload {
  jobId: string
}

/** A job row as `dbToApi` hands it back. */
export interface ImportJobRecord {
  id: string
  targetSeed: string
  format: TransferFormat
  objectKey: string
  state: ImportJobState
  rowOffset: number
  insertedRows: number
  failedRows: number
  errors: ImportRowError[]
  createdBy: string
  createdAt: number
  updatedAt: number
  finishedAt: number | null
}

/**
 * Mirrors resolveMaxUploadBytes (features/upload/index.ts:L18) and resolveExportMaxRows
 * (handlers/export.ts:L35): an unset or unparseable binding means "use the default",
 * never "no limit".
 */
export function resolveImportMaxBytes(env: { IMPORT_MAX_BYTES?: string }): number {
  const raw = env.IMPORT_MAX_BYTES
  if (!raw) return DEFAULT_IMPORT_MAX_BYTES
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_IMPORT_MAX_BYTES
  return parsed
}

export function resolveImportChunkRows(env: { IMPORT_CHUNK_ROWS?: string }): number {
  const raw = env.IMPORT_CHUNK_ROWS
  if (!raw) return DEFAULT_IMPORT_CHUNK_ROWS
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_IMPORT_CHUNK_ROWS
  return parsed
}

/**
 * Reads a job entry through the engine and normalises it. `error_report` arrives from dbToApi
 * as a parsed value for a `json` branch, but a row written before a schema change — or by hand —
 * may still be a string, so both are tolerated and anything else degrades to an empty list
 * rather than throwing inside a status endpoint.
 */
export async function readImportJobRecord(
  repository: ContentRepository,
  jobSeed: Seed,
  jobId: string,
): Promise<ImportJobRecord> {
  const row = await repository.findById(jobSeed, jobId)
  const f = IMPORT_JOB_FIELDS
  return {
    id: String(row['id']),
    targetSeed: String(row[f.targetSeed]),
    format: String(row[f.format]) as TransferFormat,
    objectKey: String(row[f.objectKey]),
    state: String(row[f.state]) as ImportJobState,
    rowOffset: Number(row[f.rowOffset] ?? 0),
    insertedRows: Number(row[f.insertedRows] ?? 0),
    failedRows: Number(row[f.failedRows] ?? 0),
    errors: parseErrorReport(row[f.errorReport]),
    createdBy: String(row[f.createdBy]),
    createdAt: Number(row['created_at'] ?? 0),
    updatedAt: Number(row['updated_at'] ?? 0),
    finishedAt: row[f.finishedAt] === null || row[f.finishedAt] === undefined ? null : Number(row[f.finishedAt]),
  }
}

function parseErrorReport(raw: unknown): ImportRowError[] {
  if (Array.isArray(raw)) return raw as ImportRowError[]
  if (typeof raw !== 'string' || raw === '') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ImportRowError[]) : []
  } catch {
    return []
  }
}

/**
 * Appends new samples up to MAX_JOB_ERROR_SAMPLES and stops. The aggregate `failed_rows`
 * counter keeps growing past the cap (brief §4), so one pathological file cannot unbound the row.
 */
export function appendErrorSamples(
  existing: readonly ImportRowError[],
  incoming: readonly ImportRowError[],
): ImportRowError[] {
  if (existing.length >= MAX_JOB_ERROR_SAMPLES) return [...existing]
  return [...existing, ...incoming].slice(0, MAX_JOB_ERROR_SAMPLES)
}

/** The wire shape of GET /api/content/import-jobs/:id. */
export function toImportJobResponse(record: ImportJobRecord): {
  id: string
  targetSeed: string
  format: TransferFormat
  state: ImportJobState
  rowsRead: number
  insertedRows: number
  failedRows: number
  errors: ImportRowError[]
  createdAt: number
  updatedAt: number
  finishedAt: number | null
} {
  // `object_key` and `created_by` are deliberately NOT exposed: the first is an R2 path and the
  // second a user id, and neither is needed to act on a job report.
  return {
    id: record.id,
    targetSeed: record.targetSeed,
    format: record.format,
    state: record.state,
    rowsRead: record.rowOffset,
    insertedRows: record.insertedRows,
    failedRows: record.failedRows,
    errors: record.errors,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    finishedAt: record.finishedAt,
  }
}
```

---

#### 4.5 `apps/api/src/features/content/handlers/import.ts` (new)

`POST /api/content/:slug/import`. Refusal order matters: everything cheap and caller-fixable is
checked before the job row exists, so a rejected request never leaves a `pending` job behind.

```ts
import { Context } from 'hono'
import { checkFormatCompatibility, isTransferFormat, type TransferFormat } from '@beechcms/core'
import { cleanStr } from '../../../shared/utils/query-utils'
import { publicProblem } from '../../../public/problem-details'
import { CONTENT_ERRORS } from '../constants'
import { AppEnv } from '../../../types'
import { normalizeBody } from './helpers'
import {
  CONTENT_IMPORT_CHUNK_JOB,
  IMPORT_JOBS_SLUG,
  IMPORT_JOB_FIELDS,
  resolveImportMaxBytes,
  type ImportChunkPayload,
} from '../import-job'

export async function importHandler(context: Context<AppEnv>) {
  const slug = context.req.param('slug')
  if (!slug) return problem(context, 'content-invalid-slug', 'Bad Request', 400, CONTENT_ERRORS.INVALID_SLUG)

  const seed = context.get('getSeed')(slug)
  if (!seed) return problem(context, 'content-seed-not-found', 'Not Found', 404, CONTENT_ERRORS.SEED_NOT_FOUND)

  let body: Record<string, unknown>
  try {
    body = normalizeBody(await context.req.json<unknown>())
  } catch {
    return problem(context, 'content-invalid-json', 'Bad Request', 400, CONTENT_ERRORS.INVALID_JSON_BODY)
  }

  const objectKey = cleanStr(body['objectKey'])
  if (!objectKey) {
    return problem(context, 'content-import-object-key-required', 'Bad Request', 400,
      CONTENT_ERRORS.IMPORT_OBJECT_KEY_REQUIRED)
  }

  const requestedFormat = cleanStr(body['format'])
  if (requestedFormat === null || !isTransferFormat(requestedFormat)) {
    return publicProblem(context, {
      type: 'content-invalid-import-format', title: 'Bad Request', status: 400,
      detail: CONTENT_ERRORS.INVALID_IMPORT_FORMAT,
      errors: [{ field: 'format', expected: 'csv | ndjson', received: String(requestedFormat),
        message: CONTENT_ERRORS.INVALID_IMPORT_FORMAT }],
    })
  }
  const format: TransferFormat = requestedFormat

  // The same authority the export endpoint calls (handlers/export.ts:L82), so the two
  // directions can never disagree about which seeds are CSV-representable.
  const compatibility = checkFormatCompatibility(seed, format)
  if (!compatibility.compatible) {
    return publicProblem(context, {
      type: 'content-csv-requires-flat-seed', title: 'Bad Request', status: 400,
      detail: CONTENT_ERRORS.CSV_REQUIRES_FLAT_SEED,
      errors: compatibility.offendingBranches.map((branch) => ({
        field: branch.alias, expected: 'a scalar branch type', received: branch.type,
        message: CONTENT_ERRORS.CSV_REQUIRES_FLAT_SEED,
      })),
    })
  }

  const jobSeed = context.get('getSeed')(IMPORT_JOBS_SLUG)
  if (!jobSeed) {
    return problem(context, 'content-import-jobs-seed-missing', 'Internal Server Error', 500,
      CONTENT_ERRORS.IMPORT_JOBS_SEED_MISSING)
  }

  const head = await context.get('bucket').head(objectKey)
  if (!head) {
    return problem(context, 'content-import-object-not-found', 'Not Found', 404,
      CONTENT_ERRORS.IMPORT_OBJECT_NOT_FOUND)
  }

  const maxBytes = resolveImportMaxBytes(context.env)
  if (head.size > maxBytes) {
    return publicProblem(context, {
      type: 'content-import-file-too-large', title: 'Payload Too Large', status: 413,
      detail: CONTENT_ERRORS.IMPORT_FILE_TOO_LARGE,
      errors: [{ field: 'objectKey', expected: `<= ${maxBytes} bytes`, received: String(head.size),
        message: CONTENT_ERRORS.IMPORT_FILE_TOO_LARGE }],
    })
  }

  const jobId = context.get('idGenerator').uuid()
  const f = IMPORT_JOB_FIELDS
  try {
    // status is the SYSTEM column and its CHECK only admits draft|review|published|archived
    // (ddl.ts:L174). The job's own lifecycle lives in the `job_state` branch.
    await context.get('repository').create(jobSeed, jobId, jobId, 'published', {
      [f.targetSeed]: slug,
      [f.format]: format,
      [f.objectKey]: objectKey,
      [f.state]: 'pending',
      [f.rowOffset]: 0,
      [f.insertedRows]: 0,
      [f.failedRows]: 0,
      [f.errorReport]: [],
      [f.createdBy]: context.get('jwtPayload').sub,
      [f.finishedAt]: null,
    })
  } catch (error) {
    console.error('Import job create error:', error)
    return problem(context, 'content-database-error', 'Internal Server Error', 500, CONTENT_ERRORS.DATABASE_ERROR)
  }

  const payload: ImportChunkPayload = { jobId }
  await context.get('queue').enqueue(CONTENT_IMPORT_CHUNK_JOB, payload)

  return context.json({ jobId }, 202, { Location: `/api/content/import-jobs/${jobId}` })
}

function problem(context: Context<AppEnv>, type: string, title: string,
  status: 400 | 404 | 413 | 500, detail: string) {
  return publicProblem(context, { type, title, status, detail })
}
```

**Notes binding on the executing agent.**
- The job entry's `slug` is the job id. `content_import_jobs.slug` is `NOT NULL UNIQUE`, and a
  UUID is the only value guaranteed collision-free.
- `enqueue` returning `false` is **not** an error here: the chunk worker itself detects a dead
  transport and marks the job `failed` (§4.7). Failing the POST would leave a `pending` job the
  caller cannot explain.
- No `validateAndSanitizeSeedPayload` on the job payload: this handler authors it from typed
  constants, not from caller input. The **imported rows** are validated — that is where untrusted
  data enters.

---

#### 4.6 `apps/api/src/features/content/handlers/import-job-status.ts` (new)

```ts
import { Context } from 'hono'
import { EntryNotFoundError, hasPermission } from '@beechcms/core'
import { resolveEffectivePermissions } from '../../../shared/rbac/effective-permissions'
import { publicProblem } from '../../../public/problem-details'
import { CONTENT_ERRORS } from '../constants'
import { AppEnv } from '../../../types'
import { IMPORT_JOBS_SLUG, readImportJobRecord, toImportJobResponse, type ImportJobRecord } from '../import-job'

/**
 * The brief's rule (§2): the creator, OR anyone who could have started the import on the same
 * seed. Isolating a job to its creator breaks team flows — the person who launched a 10 000-row
 * import may be unavailable when it finishes. `content:create` is the permission the import
 * route itself demands, so the two can never drift apart.
 */
export async function canReadImportJob(context: Context<AppEnv>, job: ImportJobRecord): Promise<boolean> {
  if (job.createdBy === context.get('jwtPayload').sub) return true
  const effective = await resolveEffectivePermissions(context)
  return hasPermission(effective, 'content:create', job.targetSeed)
}

export async function importJobStatusHandler(context: Context<AppEnv>) {
  const jobId = context.req.param('id')
  if (!jobId) {
    return publicProblem(context, { type: 'content-invalid-slug-or-id', title: 'Bad Request',
      status: 400, detail: CONTENT_ERRORS.INVALID_SLUG_OR_ID })
  }

  const jobSeed = context.get('getSeed')(IMPORT_JOBS_SLUG)
  if (!jobSeed) {
    return publicProblem(context, { type: 'content-import-jobs-seed-missing',
      title: 'Internal Server Error', status: 500, detail: CONTENT_ERRORS.IMPORT_JOBS_SEED_MISSING })
  }

  let job: ImportJobRecord
  try {
    job = await readImportJobRecord(context.get('repository'), jobSeed, jobId)
  } catch (error) {
    if (error instanceof EntryNotFoundError) {
      return publicProblem(context, { type: 'content-import-job-not-found', title: 'Not Found',
        status: 404, detail: CONTENT_ERRORS.IMPORT_JOB_NOT_FOUND })
    }
    throw error
  }

  if (!(await canReadImportJob(context, job))) {
    return publicProblem(context, { type: 'content-import-job-forbidden', title: 'Forbidden',
      status: 403, detail: CONTENT_ERRORS.IMPORT_JOB_FORBIDDEN })
  }

  return context.json(toImportJobResponse(job), 200)
}
```

**404-before-403 is deliberate and correct here:** job ids are unguessable UUIDs, and a caller who
supplies a random id learns nothing from a 404. Reversing the order would require reading the row
to decide, which is the same disclosure.

---

#### 4.7 `apps/api/src/features/content/jobs/import-chunk.worker.ts` (new)

```ts
/// <reference types="@cloudflare/workers-types" />
import {
  CsvRowReader,
  LineReader,
  MAX_JOB_ERROR_SAMPLES,
  SlugConflictError,
  fromCsvCells,
  parseNdjsonLine,
  slugify,
  toImportPayload,
  validateAndSanitizeSeedPayload,
  type JobContext,
  type JobHandler,
  type JobRegistry,
  type Seed,
  type TransferFormat,
  type TransferRecord,
} from '@beechcms/core'
import { D1SeedRepository } from '../../../shared/db/repositories/seed.repository.d1'
import {
  CONTENT_IMPORT_CHUNK_JOB,
  IMPORT_JOBS_SLUG,
  IMPORT_JOB_FIELDS,
  appendErrorSamples,
  isTerminalState,
  readImportJobRecord,
  resolveImportChunkRows,
  type ImportChunkPayload,
  type ImportRowError,
} from '../import-job'
```

**Exact algorithm. Deviating from this order reintroduces the defects it is written to avoid.**

1. **Resolve seeds.** `const db = (context.env as Record<string, unknown>)['DB'] as D1Database | undefined`.
   When absent, log and `return` — the same defensive shape as
   `semantic-search.worker.ts:L237`. Then `const seedRepository = new D1SeedRepository(db)`;
   `jobSeed = (await seedRepository.get(IMPORT_JOBS_SLUG))?.definition`. If missing, log and
   return (the job row cannot exist without it). Read the job with
   `readImportJobRecord(context.repository, jobSeed, payload.jobId)`; on `EntryNotFoundError` log
   and return — a deleted job must not retry forever.
   `targetSeed = (await seedRepository.get(job.targetSeed))?.definition`. If the target seed was
   deleted mid-import, finish the job `failed` with a single `seed_not_found` error sample and go
   to step 7.

2. **Terminal guard.** `if (isTerminalState(job.state)) return` — makes a duplicate queue delivery
   (at-least-once is the Cloudflare Queues contract) a no-op instead of a second R2 delete.

3. **Open the object.** `const object = await context.bucket.get(job.objectKey)`. `null` → finish
   `failed` with `object_missing` and go to step 7. Normalise the body:
   `object.body instanceof ReadableStream ? object.body : new Blob([object.body]).stream()` —
   `GetBucketResult.body` is `ReadableStream | ArrayBuffer` and `S3Bucket` may hand back either.

4. **Decode, skip, process — one pass, never materialised.** Read the stream with a
   `TextDecoder('utf-8')` and `decode(value, { stream: true })`, feeding each decoded chunk into
   a `LineReader` (NDJSON) or a `CsvRowReader` (CSV). Maintain `seen` (data records observed so
   far, header excluded) and `processed` (records handled in **this** invocation).
   - CSV only: the **first** row is the header; capture it as `columns` and do not count it.
   - Skip while `seen <= job.rowOffset`: increment `seen`, decode nothing further, touch no D1.
   - Otherwise decode the record and attempt the insert (step 5); `processed += 1`.
   - Stop as soon as `processed === resolveImportChunkRows(context.env)`; then
     `await reader.cancel()` so R2 stops transferring, and set `reachedEof = false`.
   - If the stream ends first, flush `reader.end()`, set `reachedEof = true`. For CSV also check
     `csvReader.hasUnterminatedQuote()` and, when true, append one `unterminated_quote` error and
     count one failed row — the file is truncated, and losing that silently is the defect
     `hasUnterminatedQuote()` exists to surface.

   **Why a record cursor and a full re-read, rather than a byte range:** `BeechBucket.get` has no
   range parameter, and adding one was examined and rejected (VETO Audit §5). The skip decodes
   line boundaries only — no `JSON.parse`, no D1 — and is bounded by `IMPORT_MAX_BYTES`, so it
   costs tens of milliseconds against a per-invocation CPU budget measured in seconds.

5. **Per-row insert — best-effort, never throwing out of the loop.** For each decoded record,
   inside its own `try/catch`:
   - Decode: `parseNdjsonLine(line)` or `fromCsvCells(columns, cells)`. `ok: false` → one
     `ImportRowError` with the result's own `code`/`message`; **continue**.
   - `const { slug: rawSlug, status, data } = toImportPayload(record)` — this already drops
     `id`, `created_at`, `updated_at`, `deleted_at`, which is what keeps import insert-only.
   - `validateAndSanitizeSeedPayload(targetSeed, data, { operation: 'create', allowNull: false,
     requireAtLeastOneValidField: true, enforceRequiredFields: true, idGenerator: context.idGenerator })`.
     `dangerousFields.length > 0` → error `dangerous_content` with `field = dangerousFields[0]`.
     `details.length > 0` → error `validation_failed` with `field = details[0].field` and
     `message = details[0].message`. Either → **continue**.
   - `const id = context.idGenerator.uuid()`; `const entrySlug = rawSlug ? slugify(rawSlug) :
     slugify(String(validation.data[targetSeed.displayNameAlias] ?? id))` — the same fallback
     chain as `create.ts:L104-108`.
   - `await context.repository.create(targetSeed, id, entrySlug, status ?? 'draft', validation.data)`.
   - `catch`: `SlugConflictError` → error code `duplicate_slug` (this is the brief's insert-only
     rule: a colliding unique key is a **failed row**, never an overwrite and never a silent skip).
     Anything else → `insert_failed` with `error.message`. Both **continue**.

   `applyPrivacy` is **not** called: it needs a `privacyService` from the Hono context, which a
   `JobContext` does not carry. A seed with an `encrypt`/`hash` branch policy must therefore be
   refused — see the pre-flight check below.

   `logContentActivity` and `dispatchContentAutomation` are **not** called. They are handler-level
   concerns in `create.ts:L122-123`, and firing 10 000 activity rows and 10 000 automation
   dispatches from one import is a denial of service against the operator's own instance.

6. **Persist the cursor — one update, after the loop.**
   ```
   repository.update(jobSeed, job.id, {
     [f.rowOffset]:     job.rowOffset + processed,
     [f.insertedRows]:  job.insertedRows + inserted,
     [f.failedRows]:    job.failedRows + failed,
     [f.errorReport]:   appendErrorSamples(job.errors, newErrors),
     [f.state]:         nextState,
   })
   ```
   `nextState` is `'processing'` while work remains. `error.row` is `job.rowOffset + i + 1`
   (1-based over data records, header excluded), so a report read after ten chunks still names the
   line the operator must fix in the original file.

   The update runs **after** the row loop, never inside it: a mid-loop throw is impossible because
   every row is caught, so the only paths that skip the update are a failure in R2 or in the job
   write itself — in which case the cursor is unmoved and the queue's retry redoes the chunk from
   the last confirmed offset. That is the brief's requirement (§2) discharged.

7. **Continue or finish.**
   - Not EOF → `const accepted = await context.queue.enqueue(CONTENT_IMPORT_CHUNK_JOB, { jobId })`.
     `accepted === false` means no transport accepted the message (a `NoOpQueueService`, or a
     rejected Cloudflare enqueue). Finish the job `failed` with a `queue_unavailable` error sample
     rather than leaving it `processing` forever.
   - EOF → finish `completed`.
   - **Finishing** means, in this order: `repository.update(jobSeed, job.id, { job_state, finished_at:
     context.clock.nowSeconds() })`, then `await context.bucket.delete(job.objectKey)` wrapped in
     its own `try/catch` that logs and swallows. Deleting **after** the terminal state is written
     means a crash between the two leaves an orphan object, which the R2 lifecycle rule reaps —
     the reverse order would leave a live job pointing at a deleted file.

**Pre-flight the handler owes the loop.** Before step 4, refuse a target seed that needs a
privacy service: if any branch has `policies.privacy` resolving to `encrypt` or `hash`, finish the
job `failed` with a single `privacy_policy_unsupported` error. Bulk import cannot silently write
plaintext into a column the schema says must be encrypted.

**Registry export:**

```ts
export const contentImportChunkJob: JobHandler<ImportChunkPayload> = async (payload, context) => { /* … */ }

export const contentImportJobs: JobRegistry = {
  [CONTENT_IMPORT_CHUNK_JOB]: contentImportChunkJob,
}
```

---

#### 4.8 `apps/api/src/features/content/index.ts` (modified — exactly two lines)

```ts
import { exportHandler } from './handlers/export'
import { importHandler } from './handlers/import'
import { importJobStatusHandler } from './handlers/import-job-status'

const content = new Hono<AppEnv>()

// A literal path, and it must precede every `/:slug/...` pattern below — `/:slug/:id`
// (registered further down) would otherwise capture 'import-jobs' as a seed slug.
content.get('/import-jobs/:id', importJobStatusHandler)

content.patch('/:slug/:id/kanban-move', kanbanMoveHandler)
// … existing lines unchanged …
content.get('/:slug/export', exportHandler)                         // before /:slug/:id
content.post('/:slug/import', importHandler)                        // before /:slug/:id
content.get('/:slug', listHandler)
// … rest unchanged …
```

---

#### 4.9 `apps/api/src/middleware/permission.middleware.ts` (modified — exactly two rows)

**Row 1** — in the literal-prefix block, immediately after the `stats/storage/sync` row (L115):

```ts
  // Coarse gate only. The exact decision — creator OR holder of content:create on the job's
  // TARGET seed — is made in the handler, because that scope is not in the URL. Same shape as
  // the /api/content/drafts row above.
  { method: 'GET',    pattern: /^\/api\/content\/import-jobs\/[^/]+$/,  requirement: AUTHED },
```

**Row 2** — immediately after the `export` row (L121):

```ts
  { method: 'POST',   pattern: /^\/api\/content\/([^/]+)\/import$/,     requirement: perm('content:create', 'capture1') },
```

Row 1 **must** sit above `GET /^\/api\/content\/([^/]+)\/[^/]+$/` (L138) or every job-status
request is evaluated at scope `import-jobs` and 403s. `permission.middleware.test.ts:L13` is the
gate that catches a missing row; an out-of-order row is caught by the integration suite's
403 assertions.

---

#### 4.10 `apps/api/src/index.ts` (modified — two lines)

```ts
import { semanticSearchHooks, semanticSearchJobs } from './features/search'
import { contentImportJobs } from './features/content/jobs/import-chunk.worker'

const jobs = { ...semanticSearchJobs, ...contentImportJobs }
```

Job names are namespaced (`content_import_chunk` vs `compute_vector`), so the spread cannot
collide.

---

#### 4.11 `docs/reference/internal-content.md` (modified)

Two sections after `## Export Entries` (L62), documenting: the three-step client flow
(`POST /api/upload/presign` → `PUT uploadUrl` → `POST /api/content/:slug/import`); that
`/upload/confirm` is **skipped** on purpose (an import file is not a media asset and must not
enter `media_objects` or the storage counter); that an NDJSON file is presigned as
`application/json` or `text/plain` because `application/x-ndjson` is not in the upload MIME
allowlist, and that the stored content type is ignored — `format` in the import body is the
authority; every status code; the job response shape; and the operator task below.

**Operator task, recorded here because it has no code artifact:** configure an R2 lifecycle rule
expiring objects older than 24 h on the media bucket. The consumer deletes the import file on
every terminal state; the rule exists only for jobs abandoned after the queue exhausts its
`max_retries: 3` (`wrangler.jsonc:L77`).

---

#### 4.12 Tests

**`import-job.test.ts` (unit).** `describe('resolveImportMaxBytes', …)`,
`describe('resolveImportChunkRows', …)`, `describe('appendErrorSamples', …)`,
`describe('toImportJobResponse', …)`. Drive the resolver cases from an array (Rule 1.6): unset,
`''`, `'abc'`, `'0'`, `'-5'`, `'1024'`. `appendErrorSamples` must be proven to stop at
`MAX_JOB_ERROR_SAMPLES` **and** to leave an already-full list untouched. `toImportJobResponse`
must be asserted to omit `objectKey` and `createdBy` — that omission is a contract, and a
`toMatchObject` would not catch a regression that adds them back, so use `Object.keys(...)`.

**`jobs/import-chunk.worker.test.ts` (unit).** Subject: `contentImportChunkJob` against a stubbed
`ContentRepository`, a stubbed `BeechBucket` whose `get` returns a `ReadableStream` built from a
fixture string, and a recording `IQueueService`. `context.env` carries a stub `DB` only so the
`D1SeedRepository` path resolves; a local seam function returning the two `Seed` objects keeps the
test off D1 (Rule 0.2). `FixedClock` from `@beechcms/testing` supplies `finished_at` (Rule 3.11).
Entry ids asserted with `UUID_V4_PATTERN` (Rule 3.6). Cases, one behaviour each:

- a two-record NDJSON file with `IMPORT_CHUNK_ROWS: '1'` leaves `row_offset: 1`, `job_state:
  'processing'`, and one `content_import_chunk` message on the queue
- a second invocation with `row_offset: 1` inserts only the second record — the regression guard
  against re-processing already-inserted rows as duplicate failures (brief §2), named as such in
  the required comment (Rule 6.2.4)
- a `SlugConflictError` from `repository.create` is counted in `failed_rows` with code
  `duplicate_slug` and does **not** abort the chunk
- a malformed NDJSON line is counted failed with code `invalid_json` and the following valid line
  still inserts
- a CSV file whose quoted field contains a newline yields one record, not two — the guard on
  `CsvRowReader`'s cross-chunk quote state
- 150 failing rows with `MAX_JOB_ERROR_SAMPLES` at 100 leave `errors.length === 100` and
  `failed_rows === 150`
- reaching EOF sets `job_state: 'completed'`, a non-null `finished_at`, and calls
  `bucket.delete(objectKey)` exactly once
- a job already `completed` returns without touching the repository or the bucket
- `queue.enqueue` resolving `false` finishes the job `failed` with a `queue_unavailable` sample

**`test/integration/content-import.integration.test.ts` (integration).** Real D1, real R2
(`env.MEDIA_BUCKET` from `cloudflare:test`, passed through `options.env` — `TEST_ENV` does not
carry it), full middleware chain.

```ts
beforeEach(async () => {
  __resetSeedRegistryCache()
  harness = await createTestHarness({
    db: env.DB,
    env: { MEDIA_BUCKET: env.MEDIA_BUCKET, IMPORT_CHUNK_ROWS: '2' },
    createApp: (authProviders) =>
      createBeechApp({ seeds: [], authProviders, jobs: contentImportJobs }),
  })
  // resetContentTables only clears the seeds it is handed, and `import_jobs` comes from the
  // migration rather than from CANONICAL_SEEDS, so its rows would leak between tests in this
  // file — the pool isolates D1 per FILE, not per test (provision.ts:L20).
  await env.DB.prepare('DELETE FROM content_import_jobs').run()
  admin = await harness.asUser('admin')
})
```

- `jobs` **must** be passed to `createBeechApp`; the default harness call omits it and
  `InMemoryQueueService` would log "no handler registered" and return `false`.
- `IMPORT_CHUNK_ROWS: '2'` forces multi-chunk continuation on a small fixture; the value carries
  the comment Rule 6.2.2 requires.
- Upload the fixture with `await env.MEDIA_BUCKET.put(key, body)` in ARRANGE, with the deliberate-
  omission comment Rule 6.2.3 requires: `R2BucketAdapter.presignPut` throws 501 by design
  (`r2-bucket.ts:L17`), so the presign leg is covered in the forks tier by
  `apps/api/test/flow/flow-media-assets.test.ts`, not here.
- Because `createTestClient` passes no `executionCtx`, `InMemoryQueueService` awaits inline, so
  the job — including every self-continuation — is terminal by the time the POST resolves. Assert
  on that directly. **Never** sleep (§7.2).

Cases:

- `POST /api/content/posts/import` with a 5-row NDJSON object and `IMPORT_CHUNK_ROWS: '2'`
  answers `202` with a `Location` header, and the job is `completed` with `insertedRows: 5`,
  `rowsRead: 5`, `failedRows: 0` — proving three chunks ran. Zone 4: `GET /api/content/posts`
  returns the five entries, and `env.MEDIA_BUCKET.head(key)` is `null`.
- a CSV import against the flat canonical seed inserts its rows; a CSV import against a seed with
  a relation branch is `400 content-csv-requires-flat-seed` **and** creates no
  `content_import_jobs` row (Rule 5.6).
- `format: 'xml'` → `400 content-invalid-import-format`.
- an unknown `objectKey` → `404 content-import-object-not-found`, no job row.
- `IMPORT_MAX_BYTES: '10'` against a larger object → `413 content-import-file-too-large`, no job
  row.
- a row whose required branch is absent is counted in `failedRows` with the sibling rows still
  inserted — best-effort, not atomic.
- a row carrying an `id` does not overwrite an existing entry: it is inserted as a new entry with
  a freshly minted UUID (`toImportPayload` drops `id`). Regression guard for insert-only.
- the job-status authorization matrix, driven from an array (Rule 1.6): the creator → 200; a
  second user holding `content:create` on `posts` → 200; a user with no scope on `posts` and who
  did not create it → 403 `content-import-job-forbidden`; an unknown id → 404.

All four zones in order, one ACT per `it()`, result named, status asserted before the body, body
typed at the call site, error paths asserting problem `type` and `errors[].field` rather than
message text.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# 1. Apply the new migration to local D1 and verify the seed landed.
pnpm beech db:reset
pnpm beech db:migrate

# 2. Types across the workspace, then the API package alone.
pnpm type-check
pnpm --filter @beechcms/api run type-check

# 3. Build.
pnpm build

# 4. Tests — unit + integration, then the scoped run.
pnpm --filter @beechcms/api run test:unit
pnpm --filter @beechcms/api run test:integration
pnpm beech test --diff

# 5. Lint and test placement.
pnpm lint
pnpm lint:tests

# 6. Refresh the graph for the next sprint.
graphify update . --force
```

`pnpm type-check` is currently **red for a pre-existing, unrelated reason**: `@beechcms/dashboard`
fails `TS6133 'vi'/'React' unused in src/test/setup.ts` (recorded in
`docs/Sprints/ContentExportStream/review_report.md`). Confirm it is still that failure and only
that failure with `git diff devs -- apps/dashboard/` returning zero lines; do not fix it here.

Manual verification against a live stack, once, for the flow the integration tier cannot reach
(R2 presign needs S3 credentials, which the workers tier does not have):

```bash
pnpm beech dev
# POST /api/upload/presign  { "filename": "posts.ndjson", "mimeType": "application/json", "sizeBytes": <n> }
# PUT   <uploadUrl>          --data-binary @posts.ndjson
# POST  /api/content/posts/import  { "objectKey": "<key>", "format": "ndjson" }   -> 202 + Location
# GET   /api/content/import-jobs/<jobId>                                          -> completed
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

**Boundaries**

- [ ] `git diff devs -- packages/` is **empty**. Zero changes to `@beechcms/core`.
- [ ] `git diff devs -- apps/dashboard/` is **empty**.
- [ ] `git diff devs -- apps/api/wrangler.jsonc` is **empty**.
- [ ] No file under `apps/api/src/features/content/` imports from another `features/*` slice.
      Imports are limited to `@beechcms/core`, `../../../shared/**`, `../../../public/**`,
      `../../../types` and slice-local siblings.
- [ ] No new dependency in any `package.json`.

**Botanical invariant**

- [ ] `grep -nE "D1Database|content_[a-z]+|SELECT |INSERT |UPDATE |CREATE TABLE"` over the four
      new source files returns hits only in doc comments and in the single
      `(context.env)['DB'] as D1Database | undefined` cast the `D1SeedRepository` lookup requires.
- [ ] Every content read/write goes through `ContentRepository`; every imported row passes
      `validateAndSanitizeSeedPayload` before `repository.create`.
- [ ] The migration's `CREATE TABLE` / `CREATE INDEX` statements are byte-identical to
      `planCreateSeed(IMPORT_JOBS_SEED)` output — re-derive and diff before merging.
- [ ] The `import_jobs` definition passes `SeedRegistry` construction: every branch id matches
      `^br_[A-Za-z0-9]+$`, ids are unique, and no alias is in `SQL_RESERVED_WORDS` or
      `AUTOMATION_RESERVED_WORDS`.
- [ ] No FTS artifact is created for `import_jobs`: after `pnpm beech db:migrate`,
      `SELECT name FROM sqlite_master WHERE name LIKE '%import_jobs%'` lists the table and the
      five indexes and **nothing** named `fts_import_jobs` or `content_import_jobs_drafts`.
- [ ] The migration bumps `seed_meta.registry_version`.

**Routing and authorization**

- [ ] `PROTECTED_ROUTES` gains exactly two rows, and the `import-jobs` row is positioned **above**
      `GET /^\/api\/content\/([^/]+)\/[^/]+$/`.
- [ ] `permission.middleware.test.ts` (route-completeness) passes unmodified.
- [ ] `content.get('/import-jobs/:id', …)` is registered **above** `content.get('/:slug/:id', …)`.
- [ ] `OAUTH_SCOPE_ROUTES` is untouched — neither route is an MCP tool, and the table is
      fail-closed.
- [ ] A user who is neither the creator nor a holder of `content:create` on the target seed
      receives `403`, proven by an integration test, not by UI logic.

**Behaviour**

- [ ] `POST /api/content/:slug/import` answers `202` with `{ jobId }` and a `Location` header,
      without reading the file body.
- [ ] CSV against a seed with a relation/repeater/tags/json/multi-file branch is `400
      content-csv-requires-flat-seed`, refused **before** any job row is created.
- [ ] An object larger than `IMPORT_MAX_BYTES` is `413`, refused before any job row is created.
- [ ] A chunk persists `row_offset`, `inserted_rows`, `failed_rows` and the capped
      `error_report` in **one** `repository.update` after its row loop, and re-enqueues itself.
- [ ] A re-delivered message for a terminal job is a no-op — no second `bucket.delete`.
- [ ] The R2 object is deleted on `completed` **and** on `failed`, after the terminal state is
      written.
- [ ] A duplicate unique key is counted in `failed_rows` with code `duplicate_slug`; nothing is
      overwritten and nothing is silently skipped.
- [ ] `error_report` never exceeds `MAX_JOB_ERROR_SAMPLES` entries while `failed_rows` keeps
      counting past it.
- [ ] `GET /api/content/import-jobs/:id` never returns `object_key` or `created_by`.

**Typing and tests**

- [ ] `pnpm --filter @beechcms/api run type-check` is clean.
- [ ] No `any` and no non-null assertion (`!.`) in any new source or test file.
- [ ] Unit files sit beside their source; the integration file sits under
      `features/content/test/integration/`; `pnpm lint:tests` passes.
- [ ] Every new test file carries the BUSL-1.1 SPDX header; every `it()` states a behaviour and an
      outcome and contains no "should".
- [ ] Four-zone anatomy, one ACT per test, ACT result named, status asserted before body, body
      typed at the call site.
- [ ] Every write asserts persisted state; every rejection asserts that nothing was persisted.
- [ ] No `setTimeout`/sleep, no `vi.useFakeTimers()`, no `it.only`/`it.skip`, no snapshot of an
      API response.
- [ ] The resume-from-offset test carries the regression-guard comment naming the
      re-processing-as-duplicates defect.
- [ ] `pnpm beech test --diff` exits `0`.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent **MUST NOT** build, stub, or scaffold any of the following.

**Not in S3, though adjacent**

- Any change to `packages/core/`. Specifically forbidden, both examined and rejected in the VETO
  Audit: a `range` option on `BeechBucket.get` (§5) and an `application/x-ndjson` entry in
  `SUPPORTED_FILE_TYPES` (§6). If a primitive seems missing, it is a sign the handler is doing too
  much — not a licence to edit core.
- Any change to `apps/api/wrangler.jsonc`, including the `queues` block, `max_batch_size`,
  `max_retries` and any `vars` entry. `IMPORT_MAX_BYTES` and `IMPORT_CHUNK_ROWS` are operator
  bindings, deliberately unset by default, exactly like `MAX_UPLOAD_BYTES` and `EXPORT_MAX_ROWS`.
- Any new middleware, and any change to the registration order in `factory.ts`.
- A dedicated import-file MIME check, a virus scan, or a schema pre-flight over the whole file
  before enqueuing. The endpoint must answer without reading the body (brief §4).
- A "system seed" concept in the engine (a `Seed.system` flag, registry-level hiding, or a guard
  in the seeds slice preventing deletion of `import_jobs`). VETO Audit §7 accepts the exposure
  explicitly; inventing an engine feature for one table is the over-engineering rule 1 kills.
- Widening `POST /api/upload/presign` from `content:create` at `global` scope to seed scope. A
  caller holding write scope on one seed only cannot presign today; that is a pre-existing
  property of the upload slice's route rule, and changing it is an upload-slice decision with its
  own blast radius across media uploads. Record it for the roadmap; do not fix it here.
- An `ABSOLUTE_IMPORT_MAX_BYTES` ceiling, a per-role cap, a rate limit, or an idempotency key on
  the import route.
- Resumable uploads, `Range` support, or gzip/`Content-Encoding` negotiation.
- Cancelling a running job, retrying a failed job, or re-submitting only the failed rows.
- Emitting activity-log entries or dispatching automations per imported row. Deliberately omitted
  (§4.7); do not "restore parity with `create.ts`".

**Deferred to S4 — `BulkTransferDashboard`** (roadmap entry S4)

- Every file under `apps/dashboard/`: the export toolbar action, the format picker (including
  disabling CSV with an explanation for a non-flat seed), the import wizard driving
  presign → PUT → `POST /import`, the job progress view polling the status endpoint, and the
  rendering of the capped error report.

**Out of scope for the feature entirely** (discarded during ideation — brief §5; do not
reintroduce under any sprint)

- Atomic/transactional import. Import is best-effort with a report.
- Upsert or update via import. Insert-only; a colliding unique key is a failed row.
- CSV support for relational seeds, and any flattening/serialization heuristic that would force it.
- TTL, expiry or archival of job *records* — retention is indefinite. (The R2 **object** is
  actively deleted; that is in scope and is built here.)
- Routing export through R2. Export streams into the HTTP response (shipped in S2).
- Gating import behind an admin/elevated role. Standard write scope is sufficient.
- Processing a whole import file in one queue invocation.
- Topological ordering or deferred retry of relational references inside an import file. A forward
  reference fails validation like any other invalid FK; ordering parent-before-child is the
  caller's responsibility.
