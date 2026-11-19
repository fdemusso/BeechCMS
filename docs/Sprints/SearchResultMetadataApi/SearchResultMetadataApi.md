# Sprint Plan — SearchResultMetadataApi (BeechPal sprint 3 of 9)

Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md`, entry 3.
Feature brief: `stages/00_ideation/output/feature_brief.md`, rule 8 ("the secondary information of
search results (status, author, date) appears as the row's description") and §4 *Ricerca*.
Previous sprints shipped (archives): `docs/Sprints/BeechPalProviderEngine/`, `docs/Sprints/BeechPalLocalTools/`.
Both were dashboard-only, so this sprint starts from an API that sprints 1–2 did not touch.

---

### Pre-Computation Analysis

Graph rebuilt first with `graphify update . --force` → 30112 nodes, 44021 edges, 2947 communities.

**a) God nodes on the path (via `graphify explain`)**

| Node | Source | Degree | Role here |
|------|--------|--------|-----------|
| `fullTextSearchHandler()` | `apps/api/src/features/search/handlers/full-text-search.ts:L42` | 7 | The only producer of `SearchResponse`. Calls `resolveEffectivePermissions()`, `filterSeedsByPermission()`, `loadDisplayLocaleConfig()`, `encodeCursor()`. |
| `D1SearchRepository` | `apps/api/src/shared/db/repositories/d1-search.repository.ts:L28` | 6 | `ISearchRepository` implementation, wired by `repository.middleware.ts`. |
| `mapSearchResultRow()` | `apps/api/src/features/search/utils/search-utils.ts:L124` | 4 | Repository row → wire item. Imported by the handler and its unit test. |
| `resolveEffectivePermissions()` / `filterSeedsByPermission()` | `apps/api/src/shared/rbac/` | hub | The RBAC projection. Reused unchanged. |
| `repositoryMiddleware` | `apps/api/src/middleware/repository.middleware.ts:L140,L143` | hub | Already sets both `activityLogRepository` and `searchRepository` on every request. |

The `IActivityLogRepository` / `D1ActivityLogRepository` symbols are ambiguous in the graph
(`No unique node match`), so their consumers were listed by grep instead. There is exactly one
implementation (`apps/api/src/shared/db/repositories/d1-activity-log.repository.ts:L35`) and one wiring
point (`repository.middleware.ts:L140`). The only test double is a partial object in
`apps/api/src/features/settings/settings.handler.test.ts:L58`, which is not typed against the interface.

**b) Architectural boundaries affected**

- `@beechcms/core` (contracts only, no logic):
  - `packages/core/src/search/search.repository.ts`: `SearchResultRow` gains `updatedAt`.
  - `packages/core/src/observability/activity-log.repository.ts`: `IActivityLogRepository` gains one
    read method, `lastContentWriters`, and its record type `ContentLastWriter`.
  - Both files are star-exported from `packages/core/src/index.ts:L54,L59`, so no barrel edit is needed.
- `apps/api` shared layer (D1 adapters): `d1-search.query.ts`, `d1-search.repository.ts`,
  `d1-activity-log.repository.ts`. These are the only files that issue SQL.
- `apps/api` search slice: `types.ts`, `utils/search-utils.ts`, `handlers/full-text-search.ts`.
- `apps/api/migrations/0043_activity_entity_index.sql`: a new index only, no table change.
- `apps/dashboard`: **no edit**. `_parts/search-results-view.tsx` reads the response through
  `rpc.api.search.$get` (Hono `AppType`), and the new fields are additive, so the dashboard still
  compiles. Sprint 4 (`BeechPalContentSearch`) is the consumer.

**c) `graphify affected` impact analysis**

```
graphify affected "SearchResultItem" --depth 2
- index.ts [re_exports]               apps/api/src/features/search/index.ts
- search-utils.ts [imports]           apps/api/src/features/search/utils/search-utils.ts
- factory.ts / index.ts / public-routes.ts / routes.ts [imports_from]   (barrel consumers, type-only)
- full-text-search.test.ts / full-text-search.ts / search-utils.test.ts [imports_from]

graphify affected "fullTextSearchHandler()" --depth 2
- full-text-search.test.ts [imports]  - search.ts [imports]  - index.ts [re_exports]

graphify affected "SearchResultRow" --depth 2
- No affected nodes found.  (Type-only use. Grep lists them: d1-search.query.ts,
  d1-search.repository(.test).ts, search-utils(.test).ts, full-text-search(.test).ts, search/types.ts)

graphify path "fullTextSearchHandler()" "D1Database"
- 5 hops via resolveEffectivePermissions() → stats.handler.ts → SYSTEM_TABLES → init.ts → createD1Database()
  (a shared-import chain, not a call chain: the handler holds no D1 handle and issues no SQL)
```

Breaking-change result: `SearchResultItem` and `SearchResultRow` only gain fields, so no external
consumer breaks. Two internal callers break at compile time and are handled by this plan: the
production-dead `mapFtsRow` (plus its duplicate `FtsRow` in `features/search/types.ts`), and the
`SearchResultRow` literals in two test files. Adding a method to `IActivityLogRepository` breaks no
implementer, because the only one is updated here.

**Facts established during research (the executor does not need to re-check these):**

1. `content_{slug}` has **no author column**. Its system columns are `id, slug, status, created_at,
   updated_at, deleted_at` (`packages/core/src/engine/ddl/ddl.ts:L54,L189-191`). `updated_at` is unix
   seconds, and the dashboard already renders it as `updated_at * 1000`
   (`pending-drafts-widget.tsx:L142`).
2. The FTS query selects `entry_id, schema_slug, slug, status, title, excerpt, rank` and **not**
   `updated_at` (`d1-search.query.ts:L159-166`).
3. `content_event_log` exists (`0000_v040_base.sql:L202`), but **nothing in `apps/api/src` writes to
   it**. It is not a usable source.
4. The author trail is `activity_logs` (`0000_v040_base.sql:L139-150`), which denormalises
   `user_name` and `user_email` so they survive user deletion. Content writers log `entity_type =
   'content'` with the entry id as `entity_id`:
   - create, update, trash and restore: `features/content/handlers/helpers.ts:L31` (`logContentActivity`)
   - publish, discard_draft and draft-save `update`: `features/draft/draft.handler.ts:L64`
   - kanban `update`: `features/content/handlers/kanban-move.ts:L95`
   - public create and update, actor name `'Public API'`: `public/handlers/public-add.ts:L447`,
     `public-edit.ts:L250`
   - `bulk_update` logs the **seed slug** as `entity_id` (`bulk.handler.ts:L185`), so it never matches
     an entry id.
5. The public handlers write the **entry** slug into `entity_slug` (`public-edit.ts:L254`,
   `public-add.ts:L450`), so `entity_slug` cannot be trusted as the seed slug. The lookup keys on
   `entity_id` alone. Entry ids are UUIDv4, unique across seeds.
6. `activity_logs` is indexed only on `user_id` and `created_at` (`0000_v040_base.sql:L152-153`). A
   per-id lookup on this append-only, ever-growing table would be a full scan on every palette
   keystroke. Hence migration `0043`.
7. Migrations are discovered through `"migrations_dir": "migrations"` (`apps/api/wrangler.jsonc:L25`)
   and through `readD1Migrations` in `apps/api/vitest.workers.config.ts:L11`. `_config/database_workflow.md`
   step 2 ("register in wrangler.jsonc") is outdated: adding the file is enough.
8. In the test harness, the activity logger runs inline (the harness passes no `executionCtx`,
   `packages/testing/src/client/test-client.ts:L24`, `observability.middleware.ts:L33-39`). The JWT
   carries `name: CANONICAL_USERS.<key>.name` (`packages/testing/src/harness.ts:L83`), so a real
   create made by `admin` logs `user_name = 'Canonical Admin'`.

---

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

| Rule | Verdict | Evidence |
|------|---------|----------|
| 1. YAGNI | PASS | Two wire fields, both required by brief rule 8 and consumed by sprint 4. One index, needed by fact 6. One read method. No new route, no new table, no backfill, no new column. The dead `mapFtsRow` is **deleted**, not extended. |
| 2. Botanical invariant | PASS | All SQL stays in `apps/api/src/shared/db/repositories/*` behind `@beechcms/core` contracts (`ISearchRepository`, `IActivityLogRepository`). The handler issues no SQL (graph path above). `ce.updated_at` is a **system column** (`SYSTEM_COLUMNS`, `ddl.ts:L54`), not a branch field, so no hardcoded field name is introduced. The title stays on `seed.displayNameAlias`, as it is today. |
| 3. VSA | PASS | The search slice imports nothing from another feature. It reaches `activityLogRepository` through `AppEnv.Variables` (`apps/api/src/types.ts:L214`), which `repositoryMiddleware` injects, exactly as `stats.handler.ts:L252` and `settings.handler.ts:L359` already do. The new core type is shared through `@beechcms/core`. |
| 4. Cloudflare purity | PASS | One D1 statement per search page (bound with `json_each(?)`, so it stays under D1's bound-parameter cap). One additive `CREATE INDEX IF NOT EXISTS` through the numbered migration workflow. No background job. |
| RBAC (brief rule 3) | PASS | The projection is unchanged. Writers are looked up **only** for entry ids that already passed `filterSeedsByPermission(…, 'content:read')`. The data exposed (the last writer's name or email for a readable entry) is already disclosed by `GET /api/content/stats/recent-activity` for the same readable seeds (`stats.handler.ts:L310-321`). |

No violation found. No plan adjustment needed.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 4 (`BeechPalContentSearch`) renders each content hit as a palette row whose description is
"status · author · date" (brief rule 8). Today `GET /api/search` returns the status, but no date and
no author, so the dashboard has nothing to render. The roadmap orders "API before UI, per server
change": the server contract lands and is validated alone, and the dashboard sprint then only
projects it.

VSA: the change stays inside the search slice plus the shared D1 adapters it already depends on. The
author lookup goes through the existing `IActivityLogRepository` contract in `@beechcms/core`, which
gains one narrowly typed read. It does not go through a cross-slice import, and it does not add an
`activity_logs` JOIN inside the FTS SQL.

Botanical Engine: no seed DDL changes. `updated_at` is a system column that the engine already
creates on every `content_{slug}` table. FTS tables and triggers are untouched.

Why two queries instead of one JOIN: a correlated author subquery in each `UNION ALL` arm would be
evaluated for **every** matching row before `ORDER BY rank … LIMIT`. A second statement that resolves
only the ≤ 50 page ids costs a handful of index seeks (with `0043`), whatever the match count.

Decision on "author": `author_name` is the **last writer**, the actor of the most recent `create`,
`update` or `publish` activity on the entry. This pairs it with `updated_at` in the row ("Published
· Jane Doe · 2 days ago"). The original creator would contradict the date shown next to it.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

Request path for `GET /api/search`:

1. `factory.ts` global middleware, in order: `repositoryMiddleware` (L117, sets
   `searchRepository` and `activityLogRepository`) → `seedRegistryMiddleware` (L135) →
   `storageMiddleware` (L138) → `queueMiddleware` (L142) → `authProvidersMiddleware` (L144) →
   `rateLimiterMiddleware` (L145) → `observabilityMiddleware` (L146, sets `activityLogger`) → … →
   `apiProtected.use('*', permissionMiddleware())` (L234).
2. Route-table row: `{ method: 'GET', pattern: /^\/api\/search\/?$/, requirement: AUTHED }`
   (`middleware/permission.middleware.ts:L177`). **Unchanged.**
3. Mounted by `routes.ts:L81` `.route('/search', searchRouter)`. `searchRouter` = `authMiddleware()` →
   `zodQuery(fullTextSearchQuerySchema)` → `fullTextSearchHandler` (`features/search/search.ts:L27-30`).
4. Handler (`full-text-search.ts:L42-103`): it parses and clamps the query, then
   `resolveEffectivePermissions` → `filterSeedsByPermission(…, 'content:read')`. An explicit
   unreadable `schema_slug` gets an empty 200. It then runs `search` and `count` in parallel, slices
   `limit + 1` for the cursor, returns early when the page is empty, and finally calls
   `loadDisplayLocaleConfig` → `mapSearchResultRow` with the localized title.

Existing contracts:

- `SearchResultRow` (core, `search.repository.ts:L14-22`): `entryId, schemaSlug, slug, status,
  title, excerpt, rank`.
- `SearchResultItem` (wire, `features/search/types.ts:L43-61`): `id, schema_slug, slug, status,
  title, excerpt, data`.
- `FtsRow` is declared twice: in `shared/db/repositories/d1-search.query.ts:L18` (the live one) and in
  `features/search/types.ts:L20` (used only by the dead `mapFtsRow`, `search-utils.ts:L102`, which
  only `search-utils.test.ts` calls).
- `IActivityLogRepository` (core, `activity-log.repository.ts:L69-88`): `list`, `countSince`. Its
  D1 adapter binds slug lists as one JSON array through `json_each(?)` (`d1-activity-log.repository.ts:L53,L122`).
  This is the pattern to copy.

Context variables used (all already in `AppEnv.Variables`, `apps/api/src/types.ts`):
`searchRepository` (L222), `activityLogRepository` (L214), `seedRegistry`, `siteSettingsRepository`,
`effectivePermissions`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Create:
- `apps/api/migrations/0043_activity_entity_index.sql`
- `apps/api/src/features/search/test/integration/search-result-metadata.integration.test.ts`

Edit:
- `packages/core/src/search/search.repository.ts`: `SearchResultRow.updatedAt`.
- `packages/core/src/observability/activity-log.repository.ts`: `ContentLastWriter`,
  `IActivityLogRepository.lastContentWriters`.
- `apps/api/src/shared/db/repositories/d1-search.query.ts`: `FtsRow.updated_at`, both SELECTs,
  `mapFtsRowToResultRow`.
- `apps/api/src/shared/db/repositories/d1-activity-log.repository.ts`: `lastContentWriters`.
- `apps/api/src/features/search/types.ts`: `SearchResultItem.updated_at` and `author_name`. Delete the
  slice-local `FtsRow`.
- `apps/api/src/features/search/utils/search-utils.ts`: `authorDisplayName`, new
  `mapSearchResultRow` signature. Delete `mapFtsRow` and the `FtsRow` re-export.
- `apps/api/src/features/search/handlers/full-text-search.ts`: the writer lookup.
- Tests: `features/search/utils/search-utils.test.ts`, `features/search/handlers/full-text-search.test.ts`,
  `shared/db/repositories/d1-search.repository.test.ts`, `shared/db/repositories/d1-activity-log.repository.test.ts`.

Not touched: anything in `apps/dashboard`, the route table, `search.schema.ts`, `search.ts`, the
public search router and its semantic jobs, the FTS DDL and triggers, `content_event_log`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — Index migration `0043`

File `apps/api/migrations/0043_activity_entity_index.sql`. Copy the header-banner style of
`0042_purge_orphan_seed_layouts_views.sql` (a comment block that says why). Verbatim DDL:

```sql
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_logs(entity_id, created_at);
```

The banner states the reason: search resolves the last writer of each result entry by `entity_id` on
every query. Do not add a `wrangler.jsonc` entry (fact 7). Do not touch `0000_v040_base.sql`.
Consequence for the roadmap: sprint 8's `ui_prefs` migration moves to `0044` (already updated in
ROADMAP.md).

### Task 2 — Core contracts

`packages/core/src/search/search.repository.ts`: add to `SearchResultRow`, after `status`:

```ts
  /** Unix seconds of the live row's last write (`content_{slug}.updated_at`). */
  updatedAt: number
```

`packages/core/src/observability/activity-log.repository.ts`: add after `CountSinceOptions`:

```ts
/** The actor of the most recent authoring activity recorded for one content entry. */
export interface ContentLastWriter {
  /** The content entry id (`activity_logs.entity_id`). */
  entryId: string
  userName: string | null
  userEmail: string
}
```

and to `IActivityLogRepository`:

```ts
  /**
   * For each id in `entryIds`, the actor of its most recent `create`, `update` or `publish` row with
   * `entityType = 'content'`. Ids with no such row are absent from the result; order is unspecified.
   * Keyed on the entry id alone: public-API writes store the entry slug, not the seed slug, in
   * `entitySlug`. An empty `entryIds` resolves to `[]`.
   */
  lastContentWriters(entryIds: readonly string[]): Promise<ContentLastWriter[]>
```

No logic in core. Core stays zero-dependency (type additions only).

### Task 3 — FTS query projects `updated_at`

`apps/api/src/shared/db/repositories/d1-search.query.ts`:
- `FtsRow` (L18): add `updated_at: number` after `status`.
- Per-seed SELECT (L160): add `ce.updated_at` right after `ce.status`. Column order in the arm must
  match the empty sentinel, because `UNION ALL` is positional.
- Empty-result sentinel SQL (L117): add `NULL as updated_at` in the same position.
- `mapFtsRowToResultRow` (L202): map `updatedAt: row.updated_at`.
- The count SQL, cursor, `ORDER BY` and binds are unchanged.

`d1-search.repository.ts` needs no edit beyond what the type flow forces (none expected).

### Task 4 — `D1ActivityLogRepository.lastContentWriters`

File `apps/api/src/shared/db/repositories/d1-activity-log.repository.ts`. Add a module-private constant
next to the row interface:

```ts
const CONTENT_AUTHORING_ACTIONS = ['create', 'update', 'publish'] as const satisfies readonly ActivityAction[]
```

Rules for the method:
- An empty `entryIds` returns `[]` **without** calling `prepare`.
- One statement. Bind the ids as **one** JSON array through `entity_id IN (SELECT value FROM json_each(?))`,
  the same idiom as `buildVisibilityFilter` (L122). Bind `CONTENT_AUTHORING_ACTIONS` the same way
  (`action IN (SELECT value FROM json_each(?))`). `entity_type = 'content'` is a literal in the SQL.
- **No** `entity_slug` predicate (fact 5).
- Latest row per `entity_id`: order by `created_at DESC, rowid DESC`. The `rowid` tie-break makes the
  later insert win when two writes land in the same second (`created_at` has 1-second resolution).
  Use `ROW_NUMBER() OVER (PARTITION BY entity_id ORDER BY created_at DESC, rowid DESC)` and keep rank 1.
- Select only `entity_id, user_name, user_email`. Map to `ContentLastWriter` camelCase. A local
  row interface goes beside `ActivityLogRow`.
- Excluded on purpose: `trash`, `restore`, `purge` and `discard_draft` (they do not author content);
  `bulk_update` (its `entity_id` is a seed slug); `delete` (legacy).
- Known approximation, documented in the JSDoc only: a draft save logs `update` (`draft.handler.ts:L64`),
  so the last writer can be someone whose draft is not yet live. Accepted: "who last worked on it"
  is what the palette row needs.

### Task 5 — Wire type and mapper

`apps/api/src/features/search/types.ts`:
- Delete the slice-local `FtsRow` (L14-35). Its only consumer, `mapFtsRow`, is deleted in this task.
  `FtsQueryParams` stays: it is re-exported by the barrel.
- Add to `SearchResultItem`, after `status`:

```ts
  /** Unix seconds of the entry's last write to its live row. */
  updated_at:  number
  /**
   * Display name of whoever last created, updated or published the entry (user name, or e-mail when
   * the account has no name); `null` when no such activity is recorded.
   */
  author_name: string | null
```

`apps/api/src/features/search/utils/search-utils.ts`:
- Delete `mapFtsRow` (L93-112) and remove `FtsRow` from the import and re-export on L13/L15. Update
  `mapSearchResultRow`'s JSDoc, which references `mapFtsRow`.
- New exported pure helper, placed above `mapSearchResultRow`:

```ts
export function authorDisplayName(writer: ContentLastWriter): string
```

  Rule: return `writer.userName` trimmed when it is non-empty after trimming, else `writer.userEmail`.
- New signature:

```ts
export function mapSearchResultRow(row: SearchResultRow, authorName: string | null): SearchResultItem
```

  It maps `updated_at: row.updatedAt` and `author_name: authorName`. The excerpt sanitisation and
  title defaulting are unchanged. Replace the inline `import('@beechcms/core').SearchResultRow` type
  with a top-level `import type`.

### Task 6 — Handler composes the writer lookup

`apps/api/src/features/search/handlers/full-text-search.ts`. Data flow after the existing empty-page
early return (L91-93):

- Run in parallel (`Promise.all`): the existing `loadDisplayLocaleConfig(…)`, and a module-private
  `loadAuthorNames(repository, entryIds)` that returns `Map<string, string>` (entry id → display name).
- `entryIds` = the ids of `pageRows` only, never the `limit + 1` has-more sentinel.
- `loadAuthorNames` calls `c.get('activityLogRepository').lastContentWriters(entryIds)` and maps each
  writer with `authorDisplayName`. If the call **rejects**, it logs with `console.error`, using the
  `'<context>: <what failed>'` prefix style of `log-activity.ts:L57`, and returns an empty map. Search
  never fails because the audit trail is unreadable: author data is decorative, and activity logging
  is observability by design (`log-activity.ts:L46-49`).
- Each item becomes `mapSearchResultRow(localizedRow, authorNames.get(row.entryId) ?? null)`.
- No change to the RBAC projection, the 400 path, the empty-perimeter path, the cursor, `total`, or
  status codes. The empty-page path does **not** call `lastContentWriters`.
- Update the module docblock: it now delegates to two injected repositories, and it still contains no SQL.

### Task 7 — Tests

All files open with the SPDX header. Single quotes (`apps/api`). No `any` in **new** code: where an
existing file's `createTestApp` uses `as any`, do not widen that pattern to the new mocks. Type the
new mock as `Pick<IActivityLogRepository, 'lastContentWriters'>`. Fixture ids in new unit cases are
UUIDv4 literals (testing_conventions 3.6). Existing literals like `'e-1'` in untouched cases stay as they are.

**7a. Unit — `apps/api/src/features/search/utils/search-utils.test.ts`** (existing file)
- Delete the `describe('mapFtsRow')` block (L235-300).
- In `describe('mapSearchResultRow')`, update the two existing cases for the new signature and fields.
  Then port the four excerpt cases from the deleted block, keeping their `#610` regression-guard
  comments, because the sanitiser is still live through this mapper:
  - strips HTML tags from the excerpt but keeps bare `<mark>`/`</mark>`
  - strips attributes from `<mark>` instead of passing them through
  - strips attributes from `</mark>`
  - collapses whitespace runs
- New `it()`s:
  - `mapSearchResultRow` copies `updatedAt` into `updated_at` and the given name into `author_name`.
  - `mapSearchResultRow` with a `null` name yields `author_name: null`.
- New `describe('authorDisplayName')`, as a three-row array-driven matrix with one cause (name
  presence): a non-blank name is returned trimmed; an empty name falls back to the e-mail; a
  whitespace-only name falls back to the e-mail. A `null` name falls back to the e-mail (fourth row).

**7b. Unit — `apps/api/src/features/search/handlers/full-text-search.test.ts`** (existing file)
- `createTestApp` gains an option `writersFn` (default: `vi.fn().mockResolvedValue([])`). It sets
  `activityLogRepository` to an object exposing `lastContentWriters: writersFn`, and returns
  `writersMock` alongside the others.
- Every existing `SearchResultRow` literal gains `updatedAt`. The expected object in "maps result rows
  to wire format SearchResultItem" (L202) gains `updated_at` and `author_name: null`.
- New `it()`s:
  - each item carries the display name of its writer, and a row without a writer carries `author_name: null`.
  - `lastContentWriters` receives exactly the ids of the returned page, never the has-more sentinel
    row (arrange `limit=1` with two repository rows, assert the single-id call).
  - an empty page answers 200 without calling `lastContentWriters`.
  - a rejecting `lastContentWriters` still answers 200, with `author_name: null` on every item and the
    other fields intact. Silence `console.error` with `vi.spyOn(console, 'error').mockImplementation(() => {})`
    and restore it in `afterEach`.

**7c. Unit — `apps/api/src/shared/db/repositories/d1-search.repository.test.ts`** (existing file)
- "maps FtsRow to camelCase SearchResultRow" (L30): the stub row gains `updated_at`, and the
  expectation gains `updatedAt`.
- New `it()`: the per-seed SELECT and the empty sentinel both project `updated_at` in the same
  column position. Assert on the `prepare` SQL string, as the file already does.

**7d. Unit — `apps/api/src/shared/db/repositories/d1-activity-log.repository.test.ts`** (existing file;
copy its `prepareMock` idiom)
- New `describe('lastContentWriters')`:
  - an empty id list resolves to `[]` and never calls `prepare`.
  - binds the ids as one JSON array via `json_each`, restricts to `entity_type = 'content'` and binds
    the authoring actions `["create","update","publish"]`. Assert the bind values and the SQL fragments.
  - the SQL has no `entity_slug` predicate. Add a regression-guard comment naming the mechanism
    (public writes store the entry slug in `entity_slug`).
  - orders each entry's rows by `created_at DESC, rowid DESC` and keeps one row per `entity_id`
    (SQL fragment assertion).
  - maps `entity_id / user_name / user_email` rows to `ContentLastWriter` records.

**7e. Integration — `apps/api/src/features/search/test/integration/search-result-metadata.integration.test.ts`** (new)
- Tier: integration. Real D1 through `createTestHarness`, default `CANONICAL_SEEDS`. The canonical
  `posts` title is FTS-indexable (public text branch), so no custom seed is needed. Shape the file like
  `search-localization.integration.test.ts`. `describe('search slice — result metadata (real D1)')`,
  nested `describe('GET /api/search')`.
- Fixture source: entries are created through `admin.post('/api/content/posts', { title, slug })` in
  ARRANGE. Extra activity rows use direct SQL on `activity_logs`, which rule 3.8 allows for a
  structural table and which `stats-recent-activity.integration.test.ts:L28-36` already does. Their
  `created_at` is `(SELECT MAX(created_at) FROM activity_logs WHERE entity_id = ?) + 1`, so they sort
  after the real create row without `Date.now()`. Comment this: the real create row's `created_at`
  comes from D1's `unixepoch()` wall clock, not from the harness `FixedClock`.
- `it()`s:
  - a freshly created entry carries the creator's name and the live row's `updated_at`.
    `author_name === CANONICAL_USERS.admin.name`. `updated_at` equals
    `SELECT updated_at FROM content_posts WHERE id = ?` (a system column, rule 3.7 compliant).
  - a later `update` row by another account makes that account the author. Insert a row with the
    editor's id, email and name, action `update`; expect `author_name === CANONICAL_USERS.editor.name`.
  - a later `trash` row does not change the author. Insert action `trash` by the editor; the author
    stays `CANONICAL_USERS.admin.name`.
  - a writer with no name is shown by e-mail. Insert a later `update` row with `user_name` NULL;
    expect the editor's e-mail.
  - an entry with no create, update or publish activity carries `author_name: null`. In ARRANGE, run
    `DELETE FROM activity_logs WHERE entity_id = ?` after the create, with a comment that this
    simulates entries imported or seeded before activity logging existed.
- Status asserted first; body typed at the call site as
  `{ items: { id: string; updated_at: number; author_name: string | null }[] }`. Find the item by
  `id`, never by position. These are read-only tests, so zone 4 is not applicable. The RBAC projection
  of search is covered by `apps/api/test/flow/flow-rbac-projections.test.ts`; add a §6.2(3)
  deliberate-omission comment saying so.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repo root unless stated.

1. `pnpm run build` in `packages/core/` (the API consumes the built core types).
2. `npx tsc --noEmit` in `apps/api/`.
3. `npx tsc --noEmit -p apps/dashboard/tsconfig.app.json` (proves the additive `AppType` change does
   not break `search-results-view.tsx`).
4. `pnpm beech lint`
5. `cd apps/api && npx vitest run src/features/search src/shared/db/repositories/d1-search.repository.test.ts src/shared/db/repositories/d1-activity-log.repository.test.ts src/features/settings/settings.handler.test.ts`
6. `cd apps/api && npx vitest run --config vitest.workers.config.ts src/features/search src/features/stats`
   (integration tier, real D1. Migrations, including `0043`, are applied by the harness setup file.)
7. `cd apps/api && npx vitest run --project flow test/flow/flow-rbac-projections.test.ts`
8. `pnpm beech db:reset`, then `pnpm beech db:migrate`. `0043` applies cleanly on a fresh local D1, and
   `PRAGMA index_list('activity_logs')` lists `idx_activity_entity`.
9. `pnpm beech test --diff`
10. Dead-code grep: `grep -rn "mapFtsRow\b" apps/api/src` → no matches (`mapFtsRowToResultRow` in
    `d1-search.query.ts` is the live mapper and stays).
11. `graphify update . --force`, then `graphify affected "mapSearchResultRow()" --depth 2` → only
    files in `apps/api/src/features/search`.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `SearchResultRow.updatedAt`, `ContentLastWriter`, `IActivityLogRepository.lastContentWriters`,
      `SearchResultItem.updated_at`/`author_name`, `authorDisplayName` and the new `mapSearchResultRow`
      signature match SECTION 4 verbatim.
- [ ] Core changes are type-only. `packages/core` gains no runtime code and no dependency.
- [ ] `0043_activity_entity_index.sql` holds exactly the one `CREATE INDEX IF NOT EXISTS` (plus its
      comment banner). No `wrangler.jsonc` edit, and no applied migration is edited.
- [ ] Every `GET /api/search` item carries `updated_at` (unix seconds of the live row) and `author_name`.
- [ ] `author_name` is the last `create`/`update`/`publish` writer: the user name, the e-mail when the
      name is blank, or `null` when no such row exists. `trash`, `restore`, `purge`, `discard_draft`
      and `bulk_update` never change it.
- [ ] The writer lookup keys on `entity_id` only, uses one statement with `json_each` binds, and runs
      only for the returned page ids (never the sentinel row, never on an empty page).
- [ ] A failing writer lookup degrades to `author_name: null`. Search still answers 200.
- [ ] The RBAC projection, the 400 / empty-perimeter paths, the cursor, `total` and the route-table row
      are unchanged.
- [ ] No SQL outside `apps/api/src/shared/db/repositories/`. No import from another feature slice.
- [ ] `mapFtsRow` and the slice-local `FtsRow` are gone. The `#610` excerpt regression tests now run
      against `mapSearchResultRow`.
- [ ] No file under `apps/dashboard` is modified. The dashboard `tsc` still passes.
- [ ] All SECTION 5 commands pass. The new tests follow `_config/testing_conventions.md` (tier,
      placement, four zones, typed bodies, no `any` in new code, required §6.2 comments).

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- **Any dashboard change.** Rendering "status · author · date", the async provider lane, the abort on
  keystroke, removing the `search-results` sub-page and the row submenu are ROADMAP entry 4
  (`BeechPalContentSearch`). Do not edit `search-results-view.tsx`.
- New query parameters, sorting by date, or filtering by author on `GET /api/search`.
- Filling `SearchResultItem.data` (it stays `{}`).
- Writing to, or repairing, `content_event_log`; fixing the public handlers' `entity_slug` value
  (`public-add.ts:L450`, `public-edit.ts:L254`). The lookup is designed to be immune to it. File a
  separate issue if desired.
- An author column on `content_{slug}`, a `created_by`/`updated_by` system column, or any backfill.
- Retention or pruning of `activity_logs`.
- The public/semantic search surface (`public-search.router.ts`, `jobs/semantic-search.*`).
- `UiPreferencesApi` (ROADMAP entry 8, now migration `0044`) and everything else in entries 5–9.
