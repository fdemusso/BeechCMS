# Sprint Plan — `ContentExportStream`

Feature: Bulk Data Transfer (Export / Import) — Sprint 2 of 4.
Roadmap: `output/backlog/ROADMAP.md`. Previous sprint: `docs/Sprints/BulkTransferCorePrimitives/` (merged, review verdict PASS).

---

### Pre-Computation Analysis

#### a) God Nodes identified via the CLI

Degrees read from `graphify explain` against the current graph (regenerated after S1 — it already
indexes `packages/core/src/transfer/`).

| Node | ID | Degree | Why it matters here |
|---|---|---|---|
| `publicProblem()` | `apps_api_src_public_problem_details_publicproblem` | **77** | Every error path in every slice funnels through it. S2 must widen its `status` union (see §c) — the single highest-fan-in edit in this sprint. |
| `createBeechApp()` | `apps_api_src_factory_createbeechapp` | **66** | Composition root; owns middleware order and mounts `contentFeature` at `factory.ts:L19/L279`. Not edited by S2, but it is what makes the new route reachable and what the route-completeness test instantiates. |
| `content/index.ts` | `apps_api_src_features_content_index` | **33** | The `content` slice router. S2 adds exactly one line to it. Its reverse edges (§c) are the full regression surface. |

Secondary nodes actually read or rewritten by this sprint:

- `listHandler()` — `apps_api_src_features_content_handlers_list_listhandler`, degree **10**,
  `apps/api/src/features/content/handlers/list.ts:L92`. The pattern S2 copies for slug/seed
  resolution, filter parsing and `applyVisibility`; **not modified**.
- `resolveRouteRule()` — `apps_api_src_middleware_permission_middleware_resolverouterule`,
  degree **3**, `apps/api/src/middleware/permission.middleware.ts:L174`. Consumer of
  `PROTECTED_ROUTES`, which gains one row.
- `checkFormatCompatibility()` — degree **1** (its own unit test only). S1 shipped it unconsumed;
  S2 is its first production caller. Same for `exportColumns`, `toCsvCells`, `encodeCsvRow`,
  `encodeNdjsonLine`, `DEFAULT_EXPORT_MAX_ROWS`, `DEFAULT_EXPORT_PAGE_SIZE`.

`graphify explain "Seed"` / `"ContentRepository"` still return **Ambiguous** (the graph indexes
`docs/api/**` typedoc Markdown as nodes alongside source); resolved by passing full node ids, as
the CLI instructs.

#### b) Architectural boundaries affected

| Package | Touched in S2? | Exactly what |
|---|---|---|
| `@beechcms/core` | **NO** | Zero files. Every primitive S2 needs shipped in S1. If the executing agent finds itself editing `packages/core/`, it has gone off-plan — the one permitted exception is none. |
| `apps/api` | **YES — one slice + two shared files** | New: `features/content/export-stream.ts` (producer), `features/content/handlers/export.ts` (handler), their tests. Modified: `features/content/index.ts` (one route line), `features/content/constants.ts` (three error strings), `middleware/permission.middleware.ts` (one `PROTECTED_ROUTES` row), `public/problem-details.ts` (add `413` to the status union), `types.ts` (one optional `Env` var). |
| `apps/dashboard` | **NO** | Untouched. UI is S4. |
| `docs/` | **YES — reference only** | One new section in `docs/reference/internal-content.md`. |

**Vertical Slice boundaries.** All new code lives inside the `content` slice. It imports from
`@beechcms/core` (transfer primitives, engine types), from `apps/api/src/shared/**`
(`query-utils`, `apply-policies` — shared infrastructure, not a slice) and from
`apps/api/src/public/problem-details` (the repo-wide error vehicle, already imported by 31 files
across 12 slices). It imports **nothing** from `features/upload/`, `features/search/`,
`features/seeds/` or any other sibling slice.

#### c) `graphify affected` impact analysis

```
$ graphify affected "content/index.ts" --depth 2
- src/factory.ts                        [imports_from] apps/api/src/factory.ts:L19
- factory.csp.test.ts                   [imports_from] apps/api/src/factory.csp.test.ts:L6
- factory.custom-routes.test.ts         [imports_from] apps/api/src/factory.custom-routes.test.ts:L15
- factory.docs-parity.test.ts           [imports_from] apps/api/src/factory.docs-parity.test.ts:L6
- content-management.integration.test.ts  .../content/test/integration/...:L18
- soft-delete.integration.test.ts         .../content/test/integration/...:L17
- bulk-edit.scale.test.ts / content-pagination.scale.test.ts / relations.scale.test.ts
- authorize.test.ts / consents.test.ts / revoke.test.ts / token.test.ts       (oauth slice)
- assignments.test.ts / invitations.test.ts / roles.test.ts / users.test.ts   (rbac slice)
- full-text-search.scale.test.ts / seed-ownership.integration.test.ts
- api/src/index.ts                      [imports_from] apps/api/src/index.ts:L5
- permission.middleware.test.ts         [imports_from] .../permission.middleware.test.ts:L6
- public-add.test.ts                    [imports_from] apps/api/src/public/public-add.test.ts:L7

$ graphify affected "listHandler" --depth 2
- list.test.ts       [imports]        apps/api/src/features/content/handlers/list.test.ts:L6
- content/index.ts   [indirect_call]  apps/api/src/features/content/index.ts:L29
- src/factory.ts     [imports_from]   apps/api/src/factory.ts:L19

$ graphify affected "checkFormatCompatibility" --depth 2
- flat-seed.test.ts  [imports]  packages/core/src/transfer/flat-seed.test.ts:L7

$ graphify affected "publicProblem" --depth 1
77 connections; 31 importing modules across content, dashboard-layout, draft, rbac,
rotate-field, schema, seeds, setup, stats, and the whole of src/public/.

$ graphify affected "findMany" --depth 2
No affected nodes found.

$ graphify path "listHandler" "D1ContentRepository"
No directed path found.
$ graphify path "listHandler" "uploadRoutes"
No directed path found.
```

**Reading of the result, including its limits — two separate blind spots, both closed by hand.**

1. **`affected "content/index.ts"` is an over-count, not an under-count.** The 20+ test files it
   lists import `createBeechApp`, not the content router; they appear because the graph collapses
   the factory's transitive imports. Adding a route to `content/index.ts` cannot break them
   *unless* the route is unmapped in `PROTECTED_ROUTES` — which is precisely what
   `permission.middleware.test.ts:13` asserts, and it is on that list. That test is the real
   regression gate, and it is why the `PROTECTED_ROUTES` row is not optional polish.

2. **`affected "findMany"` returning nothing is the barrel limit already documented in S1.**
   `apps/api` reaches `ContentRepository` through the `@beechcms/core` barrel, so the reverse
   traversal terminates at `core/src/index.ts`. The graph also does not model a widened TypeScript
   *union member* as an edge, so `affected "publicProblem"` cannot tell us whether adding `413` to
   `PublicProblemInput['status']` breaks anything. Direct inspection settles both:

   - `PublicProblemInput.status` (`apps/api/src/public/problem-details.ts:L84`) is a closed union
     `400 | 401 | 403 | 404 | 405 | 409 | 422 | 429 | 500 | 501` in an **input** (contravariant)
     position. Adding `413` widens what callers may pass and narrows nothing. `grep -rn "413"
     apps/api/src` returns only UUID substrings in `shared/demo-data-sql.ts` — no call site, no
     test, asserts on the union today. Blast radius: **zero**, verified, not assumed.
   - `ContentRepository.findMany(seed, options)` (`packages/core/src/content/content.repository.ts:L136`)
     is **read** by S2, never changed. Its D1 implementation
     (`apps/api/src/shared/db/repositories/content.repository.d1.ts:L320`) already issues the
     `COUNT(*)` companion query inside the same `database.batch()`, which is what makes the
     pre-flight row count cheap enough to run before opening the stream.

   The complete set of files S2 edits is therefore seven, all in `apps/api`, all listed in
   SECTION 3, and all covered by `pnpm --filter @beechcms/api run type-check`.

3. **New leaf code has no reverse edges.** `export-stream.ts` and `handlers/export.ts` are new;
   nothing can break from them.

---

### VETO Audit

Proposed boundaries evaluated against `_config/ponytail_arch.md`.

**1. THE BOTANICAL INVARIANT — does anything bypass `@beechcms/core`?**
No. The export producer holds a `ContentRepository` and calls `findMany(seed, options)`; it never
sees a `D1Database`, never builds a SQL string, never names a physical table. Every column it
emits comes from `exportColumns(seed)`, which is `EXPORT_SYSTEM_COLUMNS` plus
`seed.branches[].alias` — the engine's own vocabulary. Row values reach the wire only after
`applyVisibility(item, seed, actor)` → `filterEntryForActor` (`engine/policies.ts:L146`), so a
branch with `policies.visibility: 'masked' | 'hidden'` is masked in a CSV exactly as it is in a
JSON list response. Soft-delete is respected by omission: `SelectOptions.trashed` defaults to
`'active'` at the engine's single SQL chokepoint (`engine/query.ts:L69`), so a trashed row cannot
reach an export file. **PASS.**

**2. Branch IDs vs hardcoded field names.**
The only literal column names in the sprint are `'id'` — used as the keyset cursor and as a
`type: 'system'` filter column, both of which `SYSTEM_COLUMNS` (`engine/ddl.ts:54`) defines — and
the members of `EXPORT_SYSTEM_COLUMNS`, which S1 already shipped and which the review passed.
Branch data is addressed by `branch.alias`, which `engine/types.ts:82` defines as *the SQL column
name and the API payload key*; a CSV header is API-payload surface, so the alias is the correct
handle, exactly as argued and accepted in the S1 audit. No `br_XX` id is needed here because no
artifact of this sprint survives an alias rename — an export file is a point-in-time wire format.
**PASS.**

**3. VSA ENFORCEMENT — cross-feature imports.**
Zero. Verified with `graphify path "listHandler" "uploadRoutes"` → `No directed path found`: the
`content` slice does not reach the `upload` slice today, and S2 adds no edge that would let it.
The new files import only: `@beechcms/core`, `../../../shared/utils/query-utils`,
`../../../shared/policies/apply-policies`, `../../../public/problem-details`, `../../../types`
and slice-local siblings. `shared/` and `public/` are repo-wide infrastructure, not slices — 31
modules across 12 slices already import `publicProblem`, so this is the established boundary, not
a new one.

**The one genuine VSA question, and its answer.** Should `export-stream.ts` live in
`@beechcms/core` instead of the slice? Rule 3's trigger is *two slices need the same logic*. It is
not met: S3's import consumer reads an R2 object and writes through the repository — the opposite
direction, a different transport, no shared code path beyond the codecs S1 already centralised.
Putting a `ReadableStream` producer in core now would be speculative generality, and rule 1 kills
it. It stays in the slice, and if S3 ever proves otherwise it moves then, with a real second
caller to shape it. **PASS.**

**4. CLOUDFLARE PURITY.**
Edge-native throughout. `ReadableStream` + `TextEncoder` are Workers globals; no dependency is
added to `apps/api/package.json`, no CSV library, no stream polyfill, no Node built-in. The whole
result set is never materialised: the producer emits one page at a time and holds at most
`DEFAULT_EXPORT_PAGE_SIZE` (500) rows in memory. Paging uses a **keyset cursor on `id`**, not
`LIMIT/OFFSET` — see §6, which is also a correctness matter, not only a performance one. No
background job, no stateful process, no R2 round-trip (the brief rules the latter out explicitly).
**PASS.**

**5. YAGNI — what was cut.**
- *`sortBy` / `sortDir` query params.* Cut. Export order is `id ASC`, always, because that is what
  makes chunked paging correct (§6). A caller-chosen sort on an export file is decoration; `id`
  order is a contract. Supporting both would mean a compound cursor, which is real complexity in
  service of nothing.
- *`page` / `limit` query params.* Cut. An export is the whole matching set by definition; a
  paginated export is `GET /api/content/:slug` with a different Content-Type.
- *An `ABSOLUTE_EXPORT_MAX_ROWS` ceiling mirroring `ABSOLUTE_MAX_UPLOAD_BYTES`
  (`features/upload/index.ts:15`).* Cut, and the asymmetry is deliberate: the upload ceiling exists
  because the size is **attacker-supplied**, so an operator misconfiguration becomes a DoS vector.
  The export cap is bounded by the operator's own stored data and is chosen by the operator; a
  second ceiling above their setting would only make the knob lie.
- *Adding the route to `OAUTH_SCOPE_ROUTES`.* Cut. That table maps MCP tools
  (`oauth-scope.middleware.ts:L41`); bulk export is not one, and the table is fail-closed, so
  leaving it out refuses OAuth tokens rather than accidentally admitting them — the safe default.

**6. The adjustment this audit forced: paging must not use `LIMIT/OFFSET`.**
The obvious implementation pages with `pagination: { limit, offset }` and an increasing offset.
It is wrong here. `buildSelectQuery` defaults to `ORDER BY <table>.created_at DESC`
(`engine/query.ts:L138`) and `created_at` is **unix seconds**, not unique — a bulk import writes
thousands of rows inside one second. Under a non-unique sort key, successive `LIMIT/OFFSET` pages
may repeat a row and silently skip another: SQLite is free to order ties differently per query.
The defect would be invisible in a small test fixture and would corrupt exactly the large exports
this endpoint exists for. It also degrades to an O(n²) table scan at 50 000 rows.

Adjustment applied to the plan before drafting: the producer orders by `id ASC` and carries a
**keyset cursor**, appending `{ column: 'id', type: 'system', conditions: [{ op: 'gt', value:
lastId }] }` to the caller's filter groups on every page after the first. Verified reachable with
the primitives that already exist: `isValidColumn` accepts `id` via `SYSTEM_COLUMNS`
(`engine/query.ts:L86`), `type: 'system'` passes the value through `normalizeFilterValue`
unchanged (`:L186`), and `gt` compiles to `content_x.id > ?` (`:L275`). Top-level groups are ANDed
by default (`:L109`, `filterLogic` defaults to `'AND'`), so the cursor never widens a caller's
filter.

**7. Scope gate.** S2 is one sprint: one slice, one route, no migration, no core change, no UI. It
does not need splitting. Everything deferred appears in SECTION 7 against its roadmap entry.

**Verdict: APPROVED.** Proceeding to the linear Sprint Plan.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

S1 shipped the primitives; nothing consumes them. S2 is the sprint that turns
`packages/core/src/transfer/` from dead code into a contract, and it must come before S3 for three
reasons that are architectural, not scheduling convenience.

**1. Export is the cheap half, and it proves the expensive half's assumptions.** Export and import
share one predicate (`checkFormatCompatibility`), one column projection (`exportColumns`) and one
codec pair. Export exercises all three with **no persisted state, no queue, no R2 and no
migration** — a pure read path whose entire failure surface is one HTTP response. If
`exportColumns` emits the wrong header, or `encodeCsvRow` mis-quotes an embedded newline, S2's
integration tests fail loudly against real D1 and the fix costs one file. Discovering the same
defect inside S3's chunked consumer means debugging it through a queue, a job record and an R2
object. Validating the flat/relational rule and the codecs on the read path first is the ordering
that makes S3's failures be about S3.

**2. `content:read` vs `content:write` are separate gates and must be validated separately.** The
brief makes export a read-scope operation and import a write-scope one. Landing them together
would put one `PROTECTED_ROUTES` change and two permission regimes in a single reviewable diff,
against a fail-closed gate whose completeness test (`permission.middleware.test.ts:13`) is the
repo's loudest safety net. One route, one rule, one sprint.

**3. The streaming envelope is a boundary decision, not an implementation detail.** "Never
materialise the result set" is a constraint the Workers runtime enforces with a CPU-time limit,
and the only way to know the producer respects it is to ship it and stream against real D1. S2
settles the row-order contract (`id ASC`, keyset), the cap semantics (`413` before the first byte,
never a truncated file) and the header contract
(`Content-Type` / `Content-Disposition` / `Cache-Control`) once, for a surface S4's dashboard will
consume verbatim.

**Botanical adherence.** The handler resolves the seed through `context.get('getSeed')`, reads
through `ContentRepository.findMany`, filters fields through `applyVisibility`, and derives every
emitted column from `seed.branches`. It contains no SQL, no table name and no `D1Database`. Soft
delete is honoured by using the engine's default `trashed: 'active'` rather than by a predicate of
its own.

**VSA adherence.** One slice (`content`), one new route, zero cross-slice imports. The two shared
files it touches (`public/problem-details.ts`, `middleware/permission.middleware.ts`) are
repo-wide infrastructure that every slice already depends on, and each takes a strictly additive
one-line change.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**The `content` slice router — `apps/api/src/features/content/index.ts`**

```ts
const content = new Hono<AppEnv>()

L21  content.patch('/:slug/:id/kanban-move', kanbanMoveHandler)
L22  content.patch('/:slug/:id/kanban-position', kanbanPositionHandler)
L23  content.get('/:slug/view-config', getViewConfigHandler)
L24  content.put('/:slug/view-config', putViewConfigHandler)
L25  content.get('/:slug/trash', trashListHandler)                   // "NEW — before /:slug/:id"
L26  content.post('/:slug/trash/bulk-restore', bulkRestoreHandler)
L27  content.post('/:slug/trash/bulk-purge', bulkPurgeHandler)
L28  content.post('/:slug/trash/reconcile', reconcilePurgesHandler)
L29  content.get('/:slug', listHandler)
L30  content.get('/:slug/facets', facetsHandler)
L31  content.get('/:schema_slug/by-slug/:entry_slug', getBySlugHandler)
L32  content.post('/:slug/:id/restore', restoreHandler)
L33  content.get('/:slug/:id', getByIdHandler)                       // ← the swallower
L34  content.post('/:slug', createHandler)
...
export default content
```

Mounted at `apps/api/src/factory.ts:L279` — `apiProtected.route('/content', contentFeature)` —
after `notificationsApp`, `statsApp`, `rotateFieldApp`, `draftApp`, `backrefsApp`, which own the
literal `/api/content/...` prefixes. The slice's own convention, stated in its comments, is that a
two-segment literal route MUST be registered **above** `content.get('/:slug/:id', …)` at L33.

**Middleware registration order — `apps/api/src/factory.ts` (`createBeechApp`, L117)**

```
L129  app.use('*', repositoryMiddleware({...}))      // 1. first — everything below needs it
L143  app.use('*', seedRegistryMiddleware())         // hydrates seedRegistry + getSeed from D1
L146  app.use('*', storageMiddleware({...}))
L150  app.use('*', queueMiddleware(config.jobs ?? {}))
L152  app.use('*', authProvidersMiddleware(...))
L153  app.use('*', rateLimiterMiddleware(...))
L154  app.use('*', observabilityMiddleware())
L157  app.use('*', cors(...))
L196  app.use('*', <security headers — runs AFTER next()>)
L211  app.use('/api/*', <analytics — runs AFTER next(), reads context.res.status only>)
...
L239  apiProtected.use('*', authMiddleware({ acceptOAuth: true }))
L242  apiProtected.use('*', oauthScopeMiddleware())  // must stay immediately after authMiddleware
L246  apiProtected.use('*', permissionMiddleware())
L279  apiProtected.route('/content', contentFeature)
L293  app.route('/api', apiProtected)
```

Two post-`next()` middlewares (security headers, analytics) read only `context.res.status` and set
response headers; neither consumes the body. A streamed body therefore passes through the chain
untouched — no buffering, no `text()`/`json()` call anywhere in the pipeline. **S2 adds no
middleware and changes no ordering.**

**RBAC gate — `apps/api/src/middleware/permission.middleware.ts`**

`PROTECTED_ROUTES` (L69) is a closed, order-significant allowlist; first match wins; anything
under `/api/*` not listed is refused `403 route_not_registered` for every caller. Relevant rows:

```ts
L115  { method: 'GET',  pattern: /^\/api\/content\/([^/]+)\/view-config$/, requirement: perm('content:read',   'capture1') },
L117  { method: 'GET',  pattern: /^\/api\/content\/([^/]+)\/facets$/,      requirement: perm('content:read',   'capture1') },
L119  { method: 'GET',  pattern: /^\/api\/content\/([^/]+)\/trash$/,       requirement: perm('content:read',   'capture1') },
...
L132  { method: 'GET',  pattern: /^\/api\/content\/([^/]+)\/[^/]+$/,       requirement: perm('content:read',   'capture1') },   // ← the swallower
L135  { method: 'GET',  pattern: /^\/api\/content\/([^/]+)$/,              requirement: perm('content:read',   'capture1') },
```

`'capture1'` means capture group 1 of the pattern IS the `seeds.slug` the permission is checked
against (`ScopeSource`, L23). The completeness guard is
`apps/api/src/middleware/permission.middleware.test.ts:13` — it walks `app.routes`, substitutes
`x` for every `:param`, and asserts every `/api` route resolves to a rule.

**OAuth allowlist — `apps/api/src/middleware/oauth-scope.middleware.ts:L41`**
`OAUTH_SCOPE_ROUTES` lists five MCP-tool routes under `/api/seeds` and `/api/schema` only. Not
listing a route means OAuth tokens are refused on it. No change in S2.

**Error vehicle — `apps/api/src/public/problem-details.ts`**

```ts
L74   export interface PublicProblemDetailItem { field: string; expected: string; received: string; message: string }
L84   type PublicProblemInput = {
        type: string; title: string
        status: 400 | 401 | 403 | 404 | 405 | 409 | 422 | 429 | 500 | 501    // ← no 413
        detail: string
        errors?: PublicProblemDetailItem[]
        headers?: Record<string, string>
      }
L111  export function publicProblem(c: Context, input: PublicProblemInput): Response
```

`normalizeProblemType` (L96) expands a bare slug to `https://beechcms.dev/problems/<slug>`, so
handlers pass `type: 'content-seed-not-found'`, not a URL. Every field of
`PublicProblemDetailItem` is required.

**Read path — `ContentRepository.findMany`**

```ts
// packages/core/src/content/content.repository.ts:L136
findMany(seed: Seed, options: SelectOptions): Promise<{ items: Record<string, any>[]; total: number }>

// packages/core/src/engine/types.ts:L316
interface SelectOptions {
  filters?: FilterGroup[]              // groups ANDed by default (filterLogic)
  filterLogic?: 'AND' | 'OR'
  orderBy?: { column: string; dir: 'ASC' | 'DESC' }
  pagination?: { limit: number; offset: number }
  status?: string | null
  trashed?: TrashedMode                // defaults to 'active'
  search?: string
  fields?: string[]                    // empty = SELECT *
  kanbanOrder?: { seedSlug: string; axisBranchId: string }
  isCount?: boolean
}

// packages/core/src/engine/types.ts:L298
interface FilterGroup { column: string; type: FilterType; conditions: FilterCondition[] }
//                                      ^ 'text'|'number'|'date'|'boolean'|'tags'|'select'|'system'|'json'
```

`D1ContentRepository.findMany` (`apps/api/src/shared/db/repositories/content.repository.d1.ts:L320`)
runs the row query **and** its `COUNT(*)` companion in one `database.batch()`, then maps each row
through `rowToData` (L177), which returns a **flat** record: `id`, `slug`, `status`, `created_at`,
`updated_at` at the top level (plus `deleted_at` only when non-null), then one key per branch
alias. Multi-relation branches are attached as arrays by `attachMultiRelationRows`. This flat shape
is exactly what `exportColumns` / `toCsvCells` / `encodeNdjsonLine` expect — no unwrapping needed.

`buildSelectQuery` facts that constrain the producer (`packages/core/src/engine/query.ts`):

- L131–138: `ORDER BY <orderBy.column>` when the column is valid, **else `ORDER BY <table>.created_at DESC`** — non-unique, hence the keyset decision in the VETO Audit §6.
- L86 / `isValidColumn`: `id`, `slug`, `status`, `created_at`, `updated_at` accepted as system columns.
- L109: multiple filter groups are joined by `' AND '` unless `filterLogic === 'OR'`.
- L186: `normalizeFilterValue` passes a `type: 'system'` value through unchanged (UUID strings survive).
- L275: `gt` compiles to `<col> > ?`.
- L69: `trashed` defaults to `'active'` on a `softDelete` seed.

**Visibility — `apps/api/src/shared/policies/apply-policies.ts:L58`**
`applyVisibility(data, seed, actor)` delegates to `filterEntryForActor`
(`packages/core/src/engine/policies.ts:L146`), which passes system fields through untouched, drops
branches whose resolved visibility is `hidden` for the actor, and masks the rest per policy. The
`content` slice's own idiom for building the actor is `list.ts:L180-185`:
`context.get('actor') ?? { type: 'authenticated', userId: jwtPayload?.sub, role: jwtPayload?.role }`.

**Query parsing — `apps/api/src/shared/utils/query-utils.ts`**
Exports `cleanStr` (L53), `parsePositiveInt` (L70), `parseQueryFilters` (L114, dashboard
`QueryFilterGroup[]` from the `filters` query param) and `toEngineFilters` (L135, → engine
`FilterGroup[]`). Shared infrastructure; already imported by `list.ts:L6`.

**Env var precedent — `apps/api/src/features/upload/index.ts:L18`**
`resolveMaxUploadBytes(env)` reads an **optional** `env.MAX_UPLOAD_BYTES` string, parses it, and
falls back to a module constant. `MAX_UPLOAD_BYTES` is declared on `Env`
(`apps/api/src/types.ts:L67`) and appears in **no** `wrangler.jsonc` `vars` block — only in a
comment listing optional dev/prod vars (`wrangler.jsonc:L32`). S2 follows this precedent exactly.

**Transfer primitives available from `@beechcms/core` (shipped in S1, currently unconsumed)**

```
checkFormatCompatibility(seed, format) -> { compatible: true } | { compatible: false, code: 'csv_requires_flat_seed', offendingBranches: Array<{ alias, type }> }
isTransferFormat(value) -> value is 'csv' | 'ndjson'
exportColumns(seed) -> string[]          // EXPORT_SYSTEM_COLUMNS + scalar branch aliases, in order
EXPORT_SYSTEM_COLUMNS = ['id','slug','status','created_at','updated_at']
toCsvCells(record, columns) -> Array<string | null>
encodeCsvRow(cells) -> string            // RFC 4180, CRLF-terminated
encodeNdjsonLine(record) -> string       // JSON.stringify + '\n'
DEFAULT_EXPORT_MAX_ROWS = 50_000
DEFAULT_EXPORT_PAGE_SIZE = 500
```

**Testing tiers in this slice.** Integration suites live at
`apps/api/src/features/content/test/integration/*.integration.test.ts` and build their world with
`createTestHarness({ db: env.DB, seeds, env, createApp })` from `@beechcms/testing`
(`packages/testing/src/harness.ts:L60`). `HarnessOptions.env` merges over `TEST_ENV`, so a suite
can set an env var for one test. `TestClient` methods return a raw `Response`
(`packages/testing/src/client/test-client.ts`), so a streamed body is readable with
`await response.text()`. Canonical fixtures: `CANONICAL_SEEDS` — `categories` (flat, one `text`
branch), `authors` (flat, one `text` branch), `posts` (**non-flat**: `tags`, two `relation`, one
`relation multiple: true`). Canonical users: `admin`, `editor`, and `viewer` — an editor-shaped
account deliberately given **no RBAC role assignment**, which is the fixture for a 403.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**New files — `apps/api` only, zero new dependencies**

| File | Contents |
|---|---|
| `apps/api/src/features/content/export-stream.ts` | `ExportStreamOptions`, `createContentExportStream()` — the keyset-paged `ReadableStream<Uint8Array>` producer. No Hono, no D1, no `Context`. |
| `apps/api/src/features/content/handlers/export.ts` | `resolveExportMaxRows()`, `exportHandler` — slug/seed resolution, format validation, compatibility refusal, pre-flight row count and `413`, response headers. |

**New test files**

| File | Tier | Why here |
|---|---|---|
| `apps/api/src/features/content/export-stream.test.ts` | **unit** | Subject is a pure producer over a stubbed `ContentRepository`. A faked repository means unit tier by Rule 0.1; colocated with its source, per the slice's existing `handlers/*.test.ts` idiom. |
| `apps/api/src/features/content/test/integration/content-export.integration.test.ts` | **integration** | The HTTP contract through the full middleware chain against real D1: status codes, headers, body bytes, RBAC. |

**Modified files**

| File | Change |
|---|---|
| `apps/api/src/features/content/index.ts` | one line: `content.get('/:slug/export', exportHandler)`, registered **above** L33 |
| `apps/api/src/features/content/constants.ts` | three entries added to `CONTENT_ERRORS` |
| `apps/api/src/middleware/permission.middleware.ts` | one `PROTECTED_ROUTES` row, inserted after the `facets` row (L117) |
| `apps/api/src/public/problem-details.ts` | add `413` to the `PublicProblemInput['status']` union |
| `apps/api/src/types.ts` | add optional `EXPORT_MAX_ROWS?: string` to `Env` |
| `docs/reference/internal-content.md` | new `## Export Entries` section |

**Explicitly NOT produced in this sprint:** no file under `packages/core/`, no file under
`apps/dashboard/`, no migration, no `wrangler.jsonc` change, no `OAUTH_SCOPE_ROUTES` entry, no
import route, no job handler. See SECTION 7.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

**D1 migrations: none in this sprint.** No `CREATE TABLE`, no `CREATE INDEX`, no
`apps/api/migrations/` file, no `apps/api/wrangler.jsonc` entry. The `import_jobs` system seed is
S3. Do not run `pnpm beech db:migrate`.

Every new file in `apps/api` opens with the BUSL header used throughout the app
(`testing_conventions.md` §1.2) — **not** the MIT header `packages/core` uses:

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.
```

Quote style: single quotes, no semicolons — match the surrounding files. Do not reformat a file you
are only adding a line to.

---

#### 4.1 `apps/api/src/public/problem-details.ts` — widen the status union

One character class. Locate the `PublicProblemInput` type at L84 and add `413` between `409` and
`422`, keeping the ascending order the union already uses:

```ts
type PublicProblemInput = {
  type: string
  title: string
  status: 400 | 401 | 403 | 404 | 405 | 409 | 413 | 422 | 429 | 500 | 501
  detail: string
  errors?: PublicProblemDetailItem[]
  headers?: Record<string, string>
}
```

Change nothing else in this file. This is an input-position union: widening it can break no
existing caller (VETO Audit / Pre-Computation §c2).

---

#### 4.2 `apps/api/src/types.ts` — one optional binding

In `interface Env`, immediately after the `MAX_UPLOAD_BYTES?: string` entry (L67), add:

```ts
  /**
   * Maximum rows a single synchronous export may stream. Optional; falls back to
   * `DEFAULT_EXPORT_MAX_ROWS` from @beechcms/core. Deliberately absent from
   * wrangler.jsonc `vars`, exactly like MAX_UPLOAD_BYTES: an operator sets it per
   * deployment, and an unset binding must mean "use the default", not "no limit".
   */
  EXPORT_MAX_ROWS?: string
```

---

#### 4.3 `apps/api/src/features/content/constants.ts` — three error strings

Add to the existing `CONTENT_ERRORS` object, keeping its `as const`:

```ts
  INVALID_EXPORT_FORMAT: 'Unsupported export format',
  CSV_REQUIRES_FLAT_SEED: 'CSV cannot represent relation, repeater, tags or json fields — request format=ndjson',
  EXPORT_TOO_LARGE: 'Export exceeds the synchronous row limit — narrow the filter or search range',
```

These are `detail` copy. The contract is the problem `type` slug and the HTTP status, not this
text (`testing_conventions.md` Rule 5.4).

---

#### 4.4 `apps/api/src/features/content/export-stream.ts` — the producer

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import {
  DEFAULT_EXPORT_PAGE_SIZE,
  encodeCsvRow,
  encodeNdjsonLine,
  exportColumns,
  toCsvCells,
  type ActorContext,
  type ContentRepository,
  type FilterGroup,
  type Seed,
  type TransferFormat,
} from '@beechcms/core'
import { applyVisibility } from '../../shared/policies/apply-policies'

/**
 * Everything the producer needs. It takes the repository PORT, never a D1Database and never a
 * Hono Context — which is what lets the unit tier drive it with a stub and what keeps the
 * Botanical Invariant intact (no SQL is ever built here).
 */
export interface ExportStreamOptions {
  repository: Pick<ContentRepository, 'findMany'>
  seed: Seed
  format: TransferFormat
  /** Field-visibility is resolved per row, exactly as the list endpoint resolves it. */
  actor: ActorContext
  /** Caller-supplied filter groups, already converted to engine shape by `toEngineFilters`. */
  filters: FilterGroup[]
  search?: string
  /** Rows per repository round-trip. Defaults to DEFAULT_EXPORT_PAGE_SIZE. */
  pageSize?: number
}

/**
 * Streams a content type as CSV or NDJSON, one page at a time.
 *
 * Paging is KEYSET on `id`, not LIMIT/OFFSET. The engine's default sort is
 * `ORDER BY created_at DESC` (packages/core/src/engine/query.ts:L138) and `created_at` is unix
 * SECONDS, so a bulk-inserted table has thousands of ties; under a non-unique sort key two
 * successive OFFSET pages may repeat one row and drop another, producing a file that is the
 * right length and the wrong contents. Ordering by `id` — unique, indexed as the primary key —
 * removes the ambiguity and also avoids the O(n²) scan that deep OFFSET costs at 50k rows.
 *
 * The stream never holds more than one page in memory. It is the caller's job to have already
 * refused an over-cap export (413) and an incompatible format (400): once the first byte is
 * written the status is committed, and a failure past that point can only truncate the file.
 */
export function createContentExportStream(options: ExportStreamOptions): ReadableStream<Uint8Array> {
  const { repository, seed, format, actor, filters, search } = options
  const pageSize = options.pageSize ?? DEFAULT_EXPORT_PAGE_SIZE
  const columns = exportColumns(seed)
  const encoder = new TextEncoder()

  let cursor: string | null = null
  let exhausted = false

  const pageFilters = (): FilterGroup[] =>
    cursor === null
      ? filters
      : // ANDed with the caller's groups: filterLogic defaults to 'AND'
        // (packages/core/src/engine/query.ts:L109), so the cursor can only narrow.
        [...filters, { column: 'id', type: 'system', conditions: [{ op: 'gt', value: cursor }] }]

  const encodeRow = (record: Record<string, unknown>): string =>
    format === 'csv'
      ? encodeCsvRow(toCsvCells(record, columns))
      : encodeNdjsonLine(record)

  return new ReadableStream<Uint8Array>({
    start(controller) {
      // A CSV file without a header row is not importable by the other half of this feature.
      // NDJSON is self-describing and gets no preamble.
      if (format === 'csv') controller.enqueue(encoder.encode(encodeCsvRow([...columns])))
    },

    async pull(controller) {
      if (exhausted) {
        controller.close()
        return
      }

      const { items } = await repository.findMany(seed, {
        filters: pageFilters(),
        orderBy: { column: 'id', dir: 'ASC' },
        pagination: { limit: pageSize, offset: 0 },
        ...(search ? { search } : {}),
      })

      if (items.length === 0) {
        controller.close()
        return
      }

      let chunk = ''
      for (const item of items) {
        chunk += encodeRow(applyVisibility(item, seed, actor))
      }
      controller.enqueue(encoder.encode(chunk))

      cursor = String(items[items.length - 1]?.id ?? '')
      // A short page is the last page; closing here saves one empty round-trip per export.
      if (items.length < pageSize) exhausted = true
    },
  })
}
```

> Executing agent, three notes.
> 1. Do **not** add a `cancel()` that swallows errors. If `findMany` throws inside `pull`, the
>    stream errors and the client sees a broken transfer — which is the honest outcome, and is why
>    the cap check in §4.5 happens before the first byte.
> 2. Do **not** wrap `pull` in try/catch to emit a partial "error row". A half-file that parses is
>    worse than a half-file that does not.
> 3. `applyVisibility` is imported from `shared/policies/`, not reimplemented. A second field-filter
>    in this slice is the exact drift `ponytail_arch.md` rule 3 forbids.

---

#### 4.5 `apps/api/src/features/content/handlers/export.ts` — the handler

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Context } from 'hono'
import {
  DEFAULT_EXPORT_MAX_ROWS,
  checkFormatCompatibility,
  isTransferFormat,
  type ActorContext,
  type TransferFormat,
} from '@beechcms/core'
import { cleanStr, parseQueryFilters, toEngineFilters } from '../../../shared/utils/query-utils'
import { publicProblem } from '../../../public/problem-details'
import { CONTENT_ERRORS } from '../constants'
import { AppEnv } from '../../../types'
import { createContentExportStream } from '../export-stream'

/** NDJSON is the universal format (brief §2), so an omitted `format` can never 400. */
const DEFAULT_FORMAT: TransferFormat = 'ndjson'

const CONTENT_TYPES: Record<TransferFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  ndjson: 'application/x-ndjson; charset=utf-8',
}

const FILE_EXTENSIONS: Record<TransferFormat, string> = { csv: 'csv', ndjson: 'ndjson' }

/**
 * Resolves the synchronous export cap. Mirrors `resolveMaxUploadBytes`
 * (features/upload/index.ts:L18): an unset or unparseable binding means "use the default",
 * never "no limit". No absolute ceiling above the operator's value — unlike an upload size,
 * this bound is over the operator's own stored rows, not over attacker-supplied input.
 */
export function resolveExportMaxRows(env: { EXPORT_MAX_ROWS?: string }): number {
  const raw = env.EXPORT_MAX_ROWS
  if (!raw) return DEFAULT_EXPORT_MAX_ROWS
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_EXPORT_MAX_ROWS
  return parsed
}

export async function exportHandler(context: Context<AppEnv>) {
  const slug = context.req.param('slug')
  if (!slug) {
    return publicProblem(context, {
      type: 'content-invalid-slug',
      title: 'Bad Request',
      status: 400,
      detail: CONTENT_ERRORS.INVALID_SLUG,
    })
  }

  const seed = context.get('getSeed')(slug)
  if (!seed) {
    return publicProblem(context, {
      type: 'content-seed-not-found',
      title: 'Not Found',
      status: 404,
      detail: CONTENT_ERRORS.SEED_NOT_FOUND,
    })
  }

  const requestedFormat = cleanStr(context.req.query('format'))
  if (requestedFormat !== null && !isTransferFormat(requestedFormat)) {
    return publicProblem(context, {
      type: 'content-invalid-export-format',
      title: 'Bad Request',
      status: 400,
      detail: CONTENT_ERRORS.INVALID_EXPORT_FORMAT,
      errors: [{
        field: 'format',
        expected: 'csv | ndjson',
        received: requestedFormat,
        message: CONTENT_ERRORS.INVALID_EXPORT_FORMAT,
      }],
    })
  }
  const format: TransferFormat = requestedFormat ?? DEFAULT_FORMAT

  // Single authority, shared with the import endpoint in S3, so the two can never disagree
  // about which seeds are CSV-representable.
  const compatibility = checkFormatCompatibility(seed, format)
  if (!compatibility.compatible) {
    return publicProblem(context, {
      type: 'content-csv-requires-flat-seed',
      title: 'Bad Request',
      status: 400,
      detail: CONTENT_ERRORS.CSV_REQUIRES_FLAT_SEED,
      errors: compatibility.offendingBranches.map((branch) => ({
        field: branch.alias,
        expected: 'a scalar branch type',
        received: branch.type,
        message: CONTENT_ERRORS.CSV_REQUIRES_FLAT_SEED,
      })),
    })
  }

  const search = cleanStr(context.req.query('search')) ?? ''
  const filters = toEngineFilters(parseQueryFilters(context.req.query('filters')))
  const repository = context.get('repository')

  try {
    // Pre-flight count. `findMany` runs its COUNT(*) companion in the same D1 batch
    // (content.repository.d1.ts:L339), so a one-row probe is the cheapest way to learn `total`.
    // It MUST happen before the stream opens: past the first byte the status is already 200 and
    // the only way to refuse is to truncate the file, which is the failure mode the cap exists
    // to prevent.
    const { total } = await repository.findMany(seed, {
      filters,
      fields: ['id'],
      pagination: { limit: 1, offset: 0 },
      ...(search ? { search } : {}),
    })

    const maxRows = resolveExportMaxRows(context.env)
    if (total > maxRows) {
      return publicProblem(context, {
        type: 'content-export-too-large',
        title: 'Payload Too Large',
        status: 413,
        detail: CONTENT_ERRORS.EXPORT_TOO_LARGE,
        errors: [{
          field: 'rows',
          expected: `<= ${maxRows}`,
          received: String(total),
          message: CONTENT_ERRORS.EXPORT_TOO_LARGE,
        }],
      })
    }

    const jwtPayload = context.get('jwtPayload')
    const actor: ActorContext = context.get('actor') ?? {
      type: 'authenticated',
      userId: jwtPayload?.sub,
      role: jwtPayload?.role,
    }

    const stream = createContentExportStream({ repository, seed, format, actor, filters, search: search || undefined })

    return context.body(stream, 200, {
      'Content-Type': CONTENT_TYPES[format],
      'Content-Disposition': `attachment; filename="${seed.slug}.${FILE_EXTENSIONS[format]}"`,
      // An export is a point-in-time dump of mutable data; a cached copy is a wrong copy.
      'Cache-Control': 'no-store',
    })
  } catch (error) {
    console.error('Content export error:', error)
    return publicProblem(context, {
      type: 'content-database-error',
      title: 'Internal Server Error',
      status: 500,
      detail: CONTENT_ERRORS.DATABASE_ERROR,
    })
  }
}
```

**Deliberately unsupported query params, and why.** `sortBy` / `sortDir` (the export order is
`id ASC` so chunked paging is correct — VETO Audit §6), `page` / `limit` (an export is the whole
matching set; a paginated one is `GET /api/content/:slug`), `kanbanAxis` (a board ordering has no
meaning in a flat file). An unknown query param is ignored, exactly as `listHandler` ignores one —
do not add a strict-param rejection.

---

#### 4.6 `apps/api/src/features/content/index.ts` — register the route

Add the import beside the others:

```ts
import { exportHandler } from './handlers/export'
```

and the route immediately after the trash group (L28), keeping it **above**
`content.get('/:slug/:id', getByIdHandler)` at L33, which would otherwise swallow it:

```ts
content.get('/:slug/export', exportHandler)                         // before /:slug/:id
```

Change nothing else in this file.

---

#### 4.7 `apps/api/src/middleware/permission.middleware.ts` — one route rule

Insert immediately after the `facets` row (L117), inside the
`--- /api/content per-seed: capture group 1 IS the scope ---` block. It must precede the generic
`GET /^\/api\/content\/([^/]+)\/[^/]+$/` row at L132, which matches first otherwise:

```ts
  { method: 'GET',    pattern: /^\/api\/content\/([^/]+)\/export$/,        requirement: perm('content:read',   'capture1') },
```

`content:read` on `capture1`, per the brief: export requires read scope on the target seed and no
elevated role. The completeness guard at `permission.middleware.test.ts:13` substitutes `x` for
`:slug`, so it tests `/api/content/x/export` against this pattern — it matches. **No new test is
needed for the completeness guard; it already covers the new route by construction.**

Do **not** touch `OAUTH_SCOPE_ROUTES`.

---

#### 4.8 `docs/reference/internal-content.md` — document the endpoint

Add a `## Export Entries — \`GET /api/content/:seed/export\`` section after the
`## List Entries` section (which ends at L58). `factory.docs-parity.test.ts:43` only asserts that
the `/api/content` prefix is documented somewhere in this file, so this section cannot break the
test — it is written because an undocumented endpoint is an unusable one. Cover, at minimum:

- The two formats, and that `format` defaults to `ndjson`.
- The flat-seed rule: CSV is refused with `400 content-csv-requires-flat-seed` for a seed with any
  `relation`, `repeater`, `tags` or `json` branch, or any `file` branch with `multiple: true`; the
  `errors[]` array names every offending branch.
- The `413 content-export-too-large` cap, that it is governed by `EXPORT_MAX_ROWS` with a default
  of 50 000, and that the refusal happens before any bytes are sent.
- The supported query params (`format`, `search`, `filters` — same `filters` encoding as the list
  endpoint) and the unsupported ones (`sortBy`, `sortDir`, `page`, `limit`), with the row order
  stated as a contract: **`id` ascending**.
- That trashed entries are never exported, and that field-visibility policies apply exactly as on
  the list endpoint (a `masked` branch is masked in the file).
- The response headers: `Content-Type`, `Content-Disposition: attachment; filename="<seed>.<ext>"`,
  `Cache-Control: no-store`.
- Permission: `content:read` on the target seed. Not reachable with an OAuth token.

---

#### 4.9 `apps/api/src/features/content/export-stream.test.ts` — unit tier

Tier: **unit** (Rule 0.1 — the subject is driven with a stubbed `ContentRepository`; Rule 0.2 —
no D1, no network, no filesystem). Placement: colocated with its source in the `content` slice,
matching `handlers/list.test.ts`. `describe('createContentExportStream', …)`. `it()` states
behaviour + outcome, no "should" (Rule 1.5). Four zones, one ACT, ACT result named (§2). No `any`
(§7.1). No snapshots (§7.9). BUSL header (Rule 1.2).

**Fixtures.** `CANONICAL_SEEDS` from `@beechcms/testing` is the fixture source (Rule 3.5):
`categories` is the canonical **flat** seed (one `text` branch, `name`) and `posts` the canonical
**non-flat** one (`tags`, `relation`, `relation multiple: true`). A hand-rolled `Seed` is permitted
only if a shape neither covers is genuinely needed; if one is, build it with `defineSeed()` so the
`br_[A-Za-z0-9]+` branch-id rule (`engine/seed-registry.ts:L63`) holds. Entry ids in stub rows
carry the production UUIDv4 format (Rule 3.6) — they are the keyset cursor, so a fake `'row-1'`
shape would test an ordering that production never produces.

A local `stubRepository(pages)` helper (Rule 3.12) returns
`{ findMany: vi.fn() }` resolving successive pages, and a local `readAll(stream)` drains the
`ReadableStream` to a string.

Required coverage, at minimum:

- CSV emits the `exportColumns(seed)` header row first, CRLF-terminated, before any data row.
- NDJSON emits **no** header and one `JSON.stringify` line per row, `\n`-terminated.
- Paging: with `pageSize: 2` and 5 rows spread over 3 stub pages, the output contains all 5 rows
  once, in page order, and `findMany` was called 3 times.
- **The keyset regression guard** (Rule 6.2.4 — name the defect in a comment): the second
  `findMany` call receives the caller's filter groups **plus** one
  `{ column: 'id', type: 'system', conditions: [{ op: 'gt', value: <last id of page 1> }] }` group,
  and `orderBy` is `{ column: 'id', dir: 'ASC' }` on every call. Comment must state that
  LIMIT/OFFSET over the engine's default `created_at DESC` sort repeats and drops rows on ties.
- A short page ends the stream: `findMany` is not called again after a page smaller than
  `pageSize`.
- An empty result set yields the CSV header alone, and an empty string for NDJSON.
- Field visibility: a row whose seed declares a `policies.visibility: 'hidden'` branch does not
  carry that value in the output (assert the emitted line, not that `applyVisibility` was called —
  Rule 5.8).
- CSV escaping end to end: a row value containing a comma, a double quote and an embedded newline
  round-trips into one quoted field, proving the producer feeds `encodeCsvRow` rather than joining
  strings itself.
- `findMany` rejecting on page 2 surfaces as a stream error: `await expect(readAll(stream)).rejects.toThrow()`
  (Rule §7.5 — assert the rejection, never try/catch the act).

---

#### 4.10 `apps/api/src/features/content/test/integration/content-export.integration.test.ts`

Tier: **integration** (real Hono, real middleware chain, real D1 from `cloudflare:test`; only
`IClock` and `ITokenService` faked, via the harness — Rule 0.3). Placement:
`<slice>/test/integration/`, filename `<subject>.integration.test.ts` (Rule 1.3).
`describe('content slice — export integration (real D1)', …)` with a nested
`describe('GET /api/content/:slug/export', …)` (Rule 1.4). File-level docblock under the SPDX
header stating tier and scope (Rule 6.4).

Baseline in `beforeEach` (Rule 3.1/3.2/3.4):

```ts
beforeEach(async () => {
  __resetSeedRegistryCache()
  harness = await createTestHarness({
    db: env.DB,
    createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
  })
  admin = await harness.asUser('admin')
})
```

Entries are seeded through the real `POST /api/content/:slug` route (Rule 3.8), never by
`INSERT INTO content_*`. Default seeds are `CANONICAL_SEEDS`, giving `categories` (flat) and
`posts` (non-flat) without inventing anything.

Required coverage, at minimum:

- **NDJSON happy path.** Three `categories` entries → `200`; `Content-Type` starts with
  `application/x-ndjson`; the body splits into exactly 3 non-empty lines; each line parses to an
  object carrying `id`, `slug`, `status`, `created_at`, `updated_at` and `name`; the three `id`
  values match `UUID_V4_PATTERN` and equal the ids the create route returned (Rule 3.6).
- **Row order is `id` ascending.** Assert the emitted ids equal the created ids sorted ascending —
  the ordering is the contract this endpoint publishes, and the guard against a future
  "use the caller's sort" change.
- **CSV happy path on a flat seed.** `?format=csv` on `categories` → `200`; `Content-Type` starts
  with `text/csv`; `Content-Disposition` is `attachment; filename="categories.csv"`;
  `Cache-Control` is `no-store`; the first CRLF-terminated line equals
  `id,slug,status,created_at,updated_at,name`; one data row per entry.
- **CSV on a non-flat seed is refused.** `?format=csv` on `posts` → `400`, problem `type` ends with
  `content-csv-requires-flat-seed`, and `errors[]` names `tags`, `author_id`, `category_id` and
  `related_posts` (assert the set of `field` values, not the message text — Rule 5.4).
- **NDJSON on the same non-flat seed succeeds** → `200`, proving the refusal is format-specific and
  not a seed-level block.
- **Unknown format.** `?format=json` → `400`, type `content-invalid-export-format`.
- **Unknown seed.** `GET /api/content/not-a-seed/export` → `404`, type `content-seed-not-found`.
- **The cap.** A suite-local harness built with `env: { EXPORT_MAX_ROWS: '2' }` (HarnessOptions.env
  merges over TEST_ENV) and 3 entries → `413`, type `content-export-too-large`, `Content-Type`
  `application/problem+json`. Arrange this inside the test, not in `beforeEach` (Rule 3.1).
  Comment required (Rule 6.2.2) explaining that `'2'` is a per-test override of
  `DEFAULT_EXPORT_MAX_ROWS`, not a magic number.
- **The cap refuses before streaming.** In the same test, assert the body is a problem document and
  contains no exported row — a truncated 200 is the defect this endpoint's design exists to
  prevent (Rule 5.6, and a regression-guard comment per Rule 6.2.4).
- **Trashed entries never appear.** On a `softDelete` seed, create two entries, `DELETE` one, then
  export → the body carries only the surviving entry.
- **Field visibility holds in the file.** Export `posts` as NDJSON as a non-admin actor and assert
  a branch declared `policies: { public: false }` / masked behaves in the file exactly as it does
  on `GET /api/content/posts`. If the canonical seeds make this awkward, declare a local
  `defineSeed()` with an explicit `policies.visibility: 'masked'` branch — this is the deliberate
  shape exception Rule 3.5 allows, and the soft-delete suite's `trashSeed` is the precedent.
- **RBAC.** `harness.asUser('viewer')` (an account with no role assignment) on
  `GET /api/content/categories/export` → `403`. Comment why `viewer` is the right fixture
  (Rule 6.2.1): it is editor-shaped but deliberately unassigned, so the refusal comes from the
  permission gate and not from the `users.role` CHECK.
- **Unauthenticated.** `harness.anonymous().get('/api/content/categories/export')` → `401`.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run in this order from the repo root. Each command must pass before the next.

```bash
# 1. apps/api type-check — catches the widened problem-details union, the new Env field,
#    and every import in the two new modules.
pnpm --filter @beechcms/api run type-check

# 2. Whole-workspace type-check and build
pnpm type-check
pnpm build

# 3. The slice's unit suites, including the new producer suite
pnpm --filter @beechcms/api run test

# 4. Workspace tests, scoped to what changed
pnpm beech test --diff

# 5. Test-placement linter (enforces testing_conventions.md tier/placement)
pnpm lint:tests

# 6. Lint
pnpm lint
```

Full-suite fallback if `--diff` selects nothing: `pnpm beech test`.

**Runtime verification is required for this sprint** — unlike S1, this one changes user-visible
behaviour, and a streaming response is exactly the kind of thing a test harness can get right while
the real edge gets wrong:

```bash
pnpm beech dev
# then, with a dashboard admin token:
curl -sD- 'http://localhost:8787/api/content/<a flat seed>/export?format=csv' -H 'Authorization: Bearer <token>'
curl -s   'http://localhost:8787/api/content/<any seed>/export'               -H 'Authorization: Bearer <token>' | head -3
```

Confirm on the CSV call: `200`, `Content-Type: text/csv; charset=utf-8`,
`Content-Disposition: attachment; filename="<seed>.csv"`, `Cache-Control: no-store`, and a header
row followed by data rows. Confirm the NDJSON call emits one JSON object per line.

**No database command is required.** Do not run `pnpm beech db:migrate` or `pnpm beech db:reset` —
S2 adds no migration, and a reset would only mask an unrelated local-state problem as a green
result.

**Known pre-existing failure, not caused by this branch.** `pnpm type-check` across the workspace
fails on `@beechcms/dashboard` with TS6133 (unused `vi` and `React` in
`apps/dashboard/src/test/setup.ts`). It was present on `devs` before S1 and this sprint touches
zero dashboard files. Verify with `git diff devs -- apps/dashboard/` (must be empty) rather than
assuming, and report it as pre-existing rather than fixing it — that file is out of scope.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

**Contract & typing**

- [ ] `PublicProblemInput['status']` includes `413`; nothing else in `problem-details.ts` changed.
- [ ] `Env.EXPORT_MAX_ROWS` is declared **optional** (`?: string`); `resolveExportMaxRows` returns `DEFAULT_EXPORT_MAX_ROWS` for an unset, empty, non-numeric or non-positive value and never throws.
- [ ] `createContentExportStream` takes `Pick<ContentRepository, 'findMany'>`, never a `D1Database`, and never a Hono `Context`.
- [ ] No `any` in either new module or either new test file. No non-null assertion (`!`) introduced.
- [ ] `pnpm --filter @beechcms/api run type-check` passes.

**Botanical & VSA invariants**

- [ ] `packages/core/` is **unchanged**. `git diff devs -- packages/` is empty.
- [ ] No new dependency: `apps/api/package.json` and `packages/core/package.json` are unchanged.
- [ ] Neither new file contains a SQL string, a `content_*` table name, or a reference to `D1Database`.
- [ ] Every emitted column comes from `exportColumns(seed)`; the only literal column name in the sprint is `'id'`, used as the keyset cursor.
- [ ] Neither new file imports from `apps/api/src/features/<any other slice>/`.
- [ ] Field filtering goes through the existing `applyVisibility`; no second field-filter is written in this slice.

**Behaviour**

- [ ] `format` omitted defaults to `ndjson` and never 400s, for any seed.
- [ ] `?format=csv` on a seed with any `relation`, `repeater`, `tags` or `json` branch, or any `file` branch with `multiple: true`, returns `400 content-csv-requires-flat-seed` with one `errors[]` entry per offending branch.
- [ ] `?format=json` (or any non-`csv`/`ndjson` value) returns `400 content-invalid-export-format`.
- [ ] An unknown seed slug returns `404 content-seed-not-found`.
- [ ] When the matching row count exceeds the cap, the response is `413 content-export-too-large` with `Content-Type: application/problem+json` and **zero exported rows in the body**.
- [ ] The export stream orders by `id ASC` and pages with a keyset cursor; **no `offset` greater than 0 is ever passed to `findMany`**.
- [ ] The keyset filter group is ANDed with the caller's filter groups and never replaces them.
- [ ] CSV output begins with the `exportColumns` header row; NDJSON output has no header.
- [ ] An empty result set returns `200` — the CSV header alone, or an empty NDJSON body.
- [ ] Trashed entries never appear in an export (the engine's default `trashed: 'active'` is relied on; no explicit `trashed` option is passed).
- [ ] Response headers on success: `Content-Type` per format, `Content-Disposition: attachment; filename="<seed>.<ext>"`, `Cache-Control: no-store`.
- [ ] `GET /api/content/:slug/export` requires `content:read` on the seed named by the slug; a caller without it receives `403`, and an unauthenticated caller `401`.

**Tests**

- [ ] `export-stream.test.ts` is unit tier, colocated, SPDX header present; `content-export.integration.test.ts` is integration tier under `<slice>/test/integration/`. `pnpm lint:tests` passes.
- [ ] The integration suite builds its world through `createTestHarness`, seeds entries through `POST /api/content/:slug`, and never writes `INSERT INTO content_*` or `CREATE TABLE content_*`.
- [ ] Fixtures come from `CANONICAL_SEEDS` / `CANONICAL_USERS`; any hand-rolled `Seed` is built with `defineSeed()`, carries valid `br_XX` ids, and exists only for a shape the canonical set does not cover.
- [ ] Stub entry ids in the unit suite carry the production UUIDv4 format.
- [ ] Error-path tests assert status + problem `type` (and `errors[].field` where relevant), never message text.
- [ ] The keyset-paging test carries a comment naming the defect it guards against (LIMIT/OFFSET over a non-unique `created_at DESC` sort repeats and drops rows).
- [ ] The `EXPORT_MAX_ROWS: '2'` override carries a comment explaining the value.
- [ ] Every `it()` passes in isolation (`vitest run -t '<name>'`); no ordering dependency.
- [ ] No `it.only` / `it.skip` / `describe.skip` committed. No `try/catch` around an act; the stream-error case uses `rejects.toThrow`.

**Scope discipline**

- [ ] `git diff --stat` touches only the eight files listed in SECTION 3 (two new source, two new test, five modified — `index.ts`, `constants.ts`, `permission.middleware.ts`, `problem-details.ts`, `types.ts` — plus `docs/reference/internal-content.md`).
- [ ] Zero files under `packages/`. Zero files under `apps/dashboard/`. Zero files under `apps/api/migrations/`. Zero changes to `apps/api/wrangler.jsonc`.
- [ ] `OAUTH_SCOPE_ROUTES` is unchanged.
- [ ] Exactly one row added to `PROTECTED_ROUTES`, positioned above the generic `GET /^\/api\/content\/([^/]+)\/[^/]+$/` rule.
- [ ] Exactly one route added to `content/index.ts`, positioned above `content.get('/:slug/:id', …)`.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent **MUST NOT** build, stub, or scaffold any of the following. Each is owned by a
named roadmap entry in `output/backlog/ROADMAP.md` and will be planned in detail when its sprint
comes up, against the graph as it exists then.

**Not in S2, though adjacent**

- Any change to `packages/core/`. Every primitive this sprint needs shipped in S1 and passed
  review. If something seems missing, it is a sign the handler is doing too much — not a licence
  to edit core.
- `sortBy` / `sortDir` / `page` / `limit` / `kanbanAxis` on the export route. Row order is `id`
  ascending, by contract (VETO Audit §6).
- An `ABSOLUTE_EXPORT_MAX_ROWS` ceiling, a per-role cap, or a rate limit on the export route.
- An `OAUTH_SCOPE_ROUTES` entry. Export is not an MCP tool; the table is fail-closed and leaving it
  out is the correct, safe outcome.
- An `ETag`, a `Last-Modified`, resumable/`Range` export, or gzip/`Content-Encoding` negotiation.
- Any new middleware, or any change to the middleware registration order in `factory.ts`.

**Deferred to S3 — `ContentImportJobs`**

- The `import_jobs` system seed: its `Seed` definition, the `apps/api/migrations/XXXX_*.sql` that
  bootstraps it with `seeds.source = 'code'`, and the `apps/api/wrangler.jsonc` entry.
  **Do not write a migration in this sprint.**
- `POST /api/content/:slug/import`, `GET /api/content/import-jobs/:id`, and the
  creator-or-same-seed-write-scope authorization rule.
- The `content_import_chunk` job handler, its `JobRegistry` entry, its registration in
  `apps/api/src/index.ts`, the offset cursor, the partial report, the R2 object cleanup on a
  terminal state, and the R2 lifecycle rule for orphans.
- Any consumer of `JobContext.queue`, and any use of `parseNdjsonLine`, `LineReader`,
  `CsvRowReader`, `fromCsvCells`, `toImportPayload`, `DEFAULT_IMPORT_CHUNK_ROWS` or
  `MAX_JOB_ERROR_SAMPLES`. Those S1 exports stay unconsumed after S2; that is intended, not an
  oversight to be "fixed".
- Reuse of the `/api/upload/presign` flow for import files.

**Deferred to S4 — `BulkTransferDashboard`**

- Every file under `apps/dashboard/`: the export toolbar action, the format picker (including
  disabling CSV with an explanation for a non-flat seed), the import wizard, the job progress view,
  and error-report rendering.

**Out of scope for the feature entirely** (discarded during ideation — brief §5; do not reintroduce
under any sprint)

- Atomic/transactional import. Import is best-effort with a report.
- Upsert or update via import. Insert-only; a colliding unique key is a failed row.
- CSV support for relational seeds, and any flattening/serialization heuristic that would force it.
- TTL, expiry or archival of job *records* — retention is indefinite.
- Routing export through R2 (upload-then-download). Export streams into the HTTP response.
- Gating export or import behind an admin/elevated role. Standard read/write scope is sufficient.
- A synchronous export with no size limit. The cap plus `413` is the settled design.
- Topological ordering or deferred retry of relational references inside an import file.
