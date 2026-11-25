# Sprint 1 — DashboardDataScopeClosure

Roadmap: `output/backlog/ROADMAP.md` (entry 1 of 9). Feature brief: `stages/00_ideation/output/feature_brief.md` §2 rules 22–26, §4 "Fase 1".

### Pre-Computation Analysis

Graph refreshed with `graphify update . --force` (28 978 nodes, 41 745 edges) before any query.

**a) God nodes identified via the CLI**

| Node | Source | Why it matters here |
|---|---|---|
| `resolveEffectivePermissions()` | `apps/api/src/shared/rbac/effective-permissions.ts:L27` | Degree 32: the single resolver of the caller's authority, already imported by `draft.handler.ts`, `backrefs.handler.ts`, `settings.handler.ts`, `oauth/authorize.ts`. The stats handler becomes one more consumer. |
| `hasPermission()` | `packages/core/src/rbac/evaluate.ts:L64` | Degree 9: the core evaluator. Every per-scope decision in this sprint goes through it (no re-implemented checks). |
| `filterSeedsByPermission()` | `apps/api/src/shared/rbac/scoped-projection.ts:L20` | The ratified listing projection. `graphify explain` shows callers `draft.handler.ts`, `schema.handler.ts`, `full-text-search.ts`; `stats.handler.ts` is not one yet. |
| `PROTECTED_ROUTES` / `permissionMiddleware()` | `apps/api/src/middleware/permission.middleware.ts:L70`, `L267` | Closed, ordered allowlist; two stats rows (`L113`, `L114`) are the leak's gate. |
| `statsApp` | `apps/api/src/features/stats/stats.handler.ts:L60` | Degree 4: imported by `factory.ts`, `routes.ts`, re-exported by `features/stats/index.ts`. |
| `D1ActivityLogRepository` | `apps/api/src/shared/db/repositories/d1-activity-log.repository.ts:L34` | Methods `.list()`, `.countSince()`; consumed via `repository.middleware.ts`; unit test `d1-activity-log.repository.test.ts`. |

**b) Architectural boundaries affected**

- `@beechcms/core` — `packages/core/src/observability/activity-log.repository.ts`: additive optional
  field on two option interfaces + one new exported interface. Re-exported unchanged by
  `packages/core/src/index.ts:L54` (`export *`). No runtime code in core changes.
- `apps/api` —
  - `middleware/permission.middleware.ts` (route table rows only);
  - `features/stats/stats.handler.ts` (projection inside six handlers);
  - `shared/db/repositories/d1-activity-log.repository.ts` (honours the new filter in SQL);
  - tests inside `features/stats/test/integration/`, `middleware/`, `shared/db/repositories/`.
- `apps/dashboard` — one doc comment in `src/config/dashboard-menu.ts:L34`. Response shapes of all
  nine stats routes are unchanged, so the RPC-inferred types in
  `features/dashboard/types/dashboard.types.ts` and `features/dashboard/api/dashboard.api.ts` need
  no edit.

**c) `graphify affected` impact analysis**

```
graphify affected "statsApp" --depth 2
- factory.ts [imports]          - routes.ts [imports]          - features/stats/index.ts [re_exports]
- factory.csp.test.ts, factory.custom-routes.test.ts, factory.docs-parity.test.ts, index.ts
- 19 apps/api/test/flow/flow-*.test.ts files [imports_from] (they import the app factory, not stats)
- public-add.test.ts [imports_from]

graphify affected "PROTECTED_ROUTES" --depth 2       → No affected nodes found (module-private const)
graphify affected "ActivityLogListOptions" --depth 2 → No affected nodes found
graphify affected "CountSinceOptions" --depth 2      → No affected nodes found
graphify explain  "D1ActivityLogRepository"          → repository.middleware.ts, d1-activity-log.repository.test.ts
graphify path "statsApp" "filterSeedsByPermission"   → statsApp ← routes.ts → schema.handler.ts → filterSeedsByPermission()
                                                       (no direct edge yet; the new import is shared/ → slice, legal)
```

Breaking-change verdict: the core change is additive and optional, so every existing
`IActivityLogRepository` caller (`settings.handler.ts:L341` per-user activity tab,
`stats.handler.ts:L219/L253`) still compiles. Of the flow suites, only `flow-stats.test.ts` hits a
stats route (`setup-checklist`); both its callers are SuperAdmin, so `manage_users@*` still passes.
`stats-media.integration.test.ts` and `stats-recent-activity.integration.test.ts` authenticate as
canonical `admin` (SuperAdmin, global `content:read` + `manage_users`), so their contracts stay
green unchanged. Activity rows the brief calls "not tied to a seed" are, in today's code:
`entityType: 'media'` (`features/upload/index.ts:L151`, `L236`), `entityType: 'seed'`
(`features/seeds/seeds.handler.ts:L265`, `seeds.helpers.ts:L289`, `seeds.destructive.ts:L102`,
`seeds.mcp.ts:L326`) and the honeypot `security_alert` (`public/handlers/public-add.ts:L212`).
None of them set `entitySlug`; every `entityType: 'content'` write does.

### VETO Audit

1. **YAGNI.** Not over-engineered. Every change maps to a brief rule (22–26). The one new core type
   (`ActivityLogVisibility`) is required: filtering after a `LIMIT 15` read would return a short or
   empty feed whenever unreadable rows are newest, so the filter must live in SQL, which means it
   must be part of the repository contract. No new slice, no new shared module. The visibility
   builder stays a module-private function in `stats.handler.ts`: one slice uses it.
2. **Botanical invariant.** No D1 query moves into a handler. The stats handler keeps talking only
   to injected repositories (`widgetRepository`, `activityLogRepository`, `mediaRepository`,
   `setupChecklistRepository`). The only SQL edited is in `D1ActivityLogRepository`, which serves
   `activity_logs`, a structural table with no `content_{slug}` / Branch ID surface. No physical
   content column is named anywhere.
3. **VSA.** Stats imports `resolveEffectivePermissions` and `filterSeedsByPermission` from
   `apps/api/src/shared/rbac/` (the same imports `draft.handler.ts` and `full-text-search.ts`
   use). Zero imports from `features/rbac`, `features/draft` or `features/search`. Tests stay inside
   `features/stats/test/integration/`, fixtures come from `@beechcms/testing`.
4. **Core as the authorization source.** Every decision calls core `hasPermission()` (directly or
   through `filterSeedsByPermission`). No permission arithmetic is duplicated.
5. **Cloudflare purity.** No migration, no new binding, no background job. One bound JSON array
   via `json_each(?)` keeps the query under D1's bound-parameter cap whatever the seed count
   (pattern already in `d1-oauth-consent.repository.ts:L77`).
6. **Fail-closed.** Absent or ambiguous authority yields `[]` / zeros. A null-slug row is visible
   only with `manage_users@*`. A `?slug=` outside the perimeter yields `[]`, never 403 (no
   existence oracle, same rule as `full-text-search.ts:L63-68`).

No violation found. Plan unchanged.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

The brief opens with a verified leak: every `/api/content/stats/*` route is gated by a single
`perm('view_analytics','global')` row (`permission.middleware.ts:L113`) and none of the handlers
narrow by seed. A caller with `content:read` on `posts` plus `view_analytics` reads seed names and
counts (`breakdown`), the global entry total (`total`), the activity log of every seed with user
emails and entry details (`recent-activity`), the slug of the first seed (`setup-checklist`), and
every media file (`media-library`, `unused-media`).

Brief §4 requires this phase to ship first and on its own, so that the closure holds even if
phases 2–6 slip. It changes nothing in the layout contract, the widget registry or the dashboard
UI, so no later sprint blocks it and it blocks none of them.

VSA: the change stays inside the `stats` slice plus the shared RBAC helpers it already may import.
The one cross-tier contract change is additive, in `@beechcms/core`'s activity-log reader
interface, and the D1 implementation sits in `apps/api/src/shared/db/repositories/` where every
repository lives. Botanical invariant: no handler gains SQL; content counts still go through
`widgetRepository.aggregate()` over `Seed` objects.

The model is the one already ratified for drafts and search (RBAC sprint 5): the route gate drops
to `authenticated`, and the handler's projection *is* the authorization decision, strictly
narrower than any global gate.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Mount and middleware order.** `statsApp` is mounted under `/api/content` (wire paths
`/api/content/stats/*`, see `dashboard.api.ts` RPC calls). Requests under `apiProtected` pass
`authMiddleware` → `oauthScopeMiddleware` → `permissionMiddleware()` (`permission.middleware.ts:L251-266`
docblock states the order). `permissionMiddleware` refuses in this order: deactivated account →
unregistered route → missing permission. `authenticated` rows only get the first check.

**Route table today** (`permission.middleware.ts`, first match wins, literal `/api/content/*`
prefixes must precede the `:slug` rows at `L121+`):

| Line | Row | Effect |
|---|---|---|
| `L113` | `GET /^\/api\/content\/stats\/[^/]+$/` → `perm('view_analytics','global')` | Covers all seven single-segment GET stats routes |
| `L114` | `POST /^\/api\/content\/stats\/storage\/sync$/` → `perm('view_analytics','global')` | Storage resync |

**Handlers** (`stats.handler.ts`):

| Route | Line | Data it exposes | Seed narrowing today |
|---|---|---|---|
| `GET /stats/media-library` | `L66` | every tracked upload + every `/api/media/` key referenced by any seed | none |
| `GET /stats/unused-media` | `L122` | tracked uploads not referenced by any seed | none |
| `GET /stats/setup-checklist` | `L153` | `seedsCount`, `firstSeedSlug`, table presence | none |
| `GET /stats/total` | `L203` | sum of live entries over `seedRegistry.all()` (`L211-216`) + `countSince` today/week/month (`L219-224`); time from `SystemClock.nowSeconds()` (`L205`) | none |
| `GET /stats/recent-activity` | `L249` | last 15 `activity_logs` rows with user email/name/details; optional `?slug=` (`L251-256`) | `?slug=` only, not authorization |
| `GET /stats/health` | `L291` | storage bytes, D1 request totals | n/a (infra) |
| `GET /stats/cloudflare` | `L338` | traffic metrics, storage | n/a (infra) |
| `GET /stats/breakdown` | `L408` | `{ slug, label, count }` for every registry seed (`L410-421`) | none |
| `POST /stats/storage/sync` | `L438` | recomputes R2 size | n/a (infra) |

**Ratified projection pattern.**
- `draft.handler.ts:L91-100`: `resolveEffectivePermissions(context)` → `filterSeedsByPermission(registry, effective, 'content:read')` → empty set answers `[]` without touching the repository.
- `full-text-search.ts:L56-72`: same, plus an explicit slug outside the perimeter yields an empty result, not 403.
- Route rows for both carry the comment at `permission.middleware.ts:L109-111` / `L158-160`.

**Context variables used.** `context.get('seedRegistry')`, `'widgetRepository'`,
`'activityLogRepository'`, `'mediaRepository'`, `'contentScanRepository'`,
`'setupChecklistRepository'`, `'clock'` (an `IClock`; the test harness injects `FixedClock`,
`packages/testing/src/harness.ts:L61-71`; already read by `oauth/authorize.ts:L210`).

**Activity-log reader contract** (`packages/core/src/observability/activity-log.repository.ts`):
`ActivityLogListOptions { userId?, entitySlug?, limit }` (`L30`), `CountSinceOptions { action,
entityType, sinceTimestamp }` (`L39`). D1 implementation builds a flat `WHERE` from guard clauses
(`d1-activity-log.repository.ts:L37-65`) and a fixed three-bind `countSince` (`L67-79`).

**Dashboard consumers** (unchanged this sprint): `features/dashboard/api/dashboard.api.ts:L14-34`
(total, cloudflare, recent-activity, health, breakdown, setup-checklist),
`components/widgets/media-gallery-widget.tsx:L189`, `L199` (media-library, unused-media). The
Analytics nav entry stays gated by `canGlobally('view_analytics')`
(`navigation/components/app-sidebar.tsx:L37`); its explanatory comment at
`config/dashboard-menu.ts:L34` claims `/api/content/stats/*` and becomes inaccurate.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Edited:
1. `packages/core/src/observability/activity-log.repository.ts` — `ActivityLogVisibility` + optional `visibility` on both option interfaces.
2. `apps/api/src/shared/db/repositories/d1-activity-log.repository.ts` — SQL honours `visibility`.
3. `apps/api/src/features/stats/stats.handler.ts` — scope projection in `total`, `breakdown`, `recent-activity`; injected clock in `total`.
4. `apps/api/src/middleware/permission.middleware.ts` — the two stats rows become nine explicit rows.
5. `apps/dashboard/src/config/dashboard-menu.ts` — doc comment at `L34` only.

Tests:
6. `apps/api/src/features/stats/test/integration/stats-scope-isolation.integration.test.ts` — NEW (brief rule 26).
7. `apps/api/src/shared/db/repositories/d1-activity-log.repository.test.ts` — new `it()`s for the visibility clauses.
8. `apps/api/src/middleware/permission.middleware.test.ts` — one new matrix `it()` for the stats rows.

No migration. No new file outside the test. No dashboard behaviour change. No docs under
`docs/` (sprint 9). Do not hand-edit `docs/api/**` (generated).

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### T1 — Core contract: `ActivityLogVisibility` (`packages/core/src/observability/activity-log.repository.ts`)

Add, verbatim (exported; other modules and later sprints depend on it):

```ts
/**
 * Which activity rows a caller may see, keyed on the seed each row is tied to.
 * Omitted from an options object = no restriction (the self-service per-user feed).
 */
export interface ActivityLogVisibility {
  /**
   * `'all'`: every row that carries a seed slug.
   * A list: only rows whose `entitySlug` is in it. An empty list matches no slugged row.
   */
  readonly seeds: 'all' | readonly string[]
  /** Whether rows with `entitySlug === null` (media uploads, schema events, security alerts) are visible. */
  readonly includeUnscoped: boolean
}
```

And add to both `ActivityLogListOptions` and `CountSinceOptions`:

```ts
  /** Authorization filter applied in the query, before `limit`. */
  visibility?: ActivityLogVisibility
```

Update the `list()` docblock (`L47-53`): the stats feed is "scope-projected", not "global".
Rules: purely additive; `entitySlug` keeps its meaning (a narrowing the caller asked for, ANDed
with `visibility`). No runtime code in core.

### T2 — D1 repository honours `visibility` (`apps/api/src/shared/db/repositories/d1-activity-log.repository.ts`)

One module-private helper that turns an optional `ActivityLogVisibility` into `{ clause, bindings }`
(or nothing), used by both `list()` and `countSince()`. Keep the flat guard-clause style of
`list()` (`L37-65`); `countSince()` gains the same `whereClauses` array shape so it can append.

The seven cases, exactly:

| `seeds` | `includeUnscoped` | SQL fragment (ANDed) | Bindings |
|---|---|---|---|
| absent `visibility` | — | none | — |
| `'all'` | `true` | none | — |
| `'all'` | `false` | `entity_slug IS NOT NULL` | — |
| non-empty list | `true` | `(entity_slug IN (SELECT value FROM json_each(?)) OR entity_slug IS NULL)` | `JSON.stringify(list)` |
| non-empty list | `false` | `entity_slug IN (SELECT value FROM json_each(?))` | `JSON.stringify(list)` |
| empty list | `true` | `entity_slug IS NULL` | — |
| empty list | `false` | `1 = 0` | — |

Why `json_each(?)`: one bind whatever the list length, so a caller scoped on many seeds never
hits D1's bound-parameter cap. Copy the bind shape from `d1-oauth-consent.repository.ts:L77`.
Invariants: never throws on any visibility value; the clause is inserted before `ORDER BY … LIMIT`
so the limit counts only visible rows; bind order follows clause order (`userId`, `entitySlug`,
visibility, then `limit`).

### T3 — Stats handler projection (`apps/api/src/features/stats/stats.handler.ts`)

Imports to add (same paths as `draft.handler.ts`): `resolveEffectivePermissions` from
`../../shared/rbac/effective-permissions`, `filterSeedsByPermission` from
`../../shared/rbac/scoped-projection`, and `GLOBAL_SCOPE`, `hasPermission`,
`type ActivityLogVisibility`, `type EffectivePermissions`, `type Seed` from `@beechcms/core`.

Module-private helper, signature verbatim:

```ts
function activityVisibility(
  effective: EffectivePermissions,
  readableSeeds: readonly Seed[],
): ActivityLogVisibility
```

Rules:
- `seeds` is `'all'` when `hasPermission(effective, 'content:read', GLOBAL_SCOPE)`, else the slugs
  of `readableSeeds`. Why `'all'` and not the registry slugs: a global reader is entitled to every
  seed present and past, and the existing feed test logs rows for a slug (`pages`) that is not in
  the registry (`stats-recent-activity.integration.test.ts:L47`).
- `includeUnscoped` is `hasPermission(effective, 'manage_users', GLOBAL_SCOPE)` (brief rule 22:
  rows not tied to a seed need `manage_users`; global, because a media or schema row belongs to no
  seed a scoped admin could own).

Per handler (resolve `effective` once per request; `readableSeeds =
filterSeedsByPermission(context.get('seedRegistry').all(), effective, 'content:read')`):

- **`GET /stats/total` (`L203`)**
  - Entry total sums `widgetRepository.aggregate()` over `readableSeeds` only (replace the
    registry list at `L211`).
  - The three `countSince` calls pass `visibility: { ...activityVisibility(...), includeUnscoped: false }`.
    Content-create rows always carry a slug, so unscoped rows never count here.
  - Replace `SystemClock.nowSeconds()` at `L205` with `context.get('clock').nowSeconds()`. Why: the
    isolation suite must place activity rows inside the 24h window with the harness `FixedClock`,
    and testing rules forbid `Date.now()` in fixtures.
  - No readable seed: answer `{ total: 0, today: 0, week: 0, month: 0 }` without calling either
    repository (mirror `draft.handler.ts:L98-100`).
  - The response shape is unchanged.
- **`GET /stats/breakdown` (`L408`)**
  - Map over `readableSeeds` instead of the whole registry.
  - No readable seed returns `[]` without querying.
  - Registry order is preserved, and so is the shape.
- **`GET /stats/recent-activity` (`L249`)**
  - Compute `visibility = activityVisibility(effective, readableSeeds)` and pass it to `list()`
    alongside `entitySlug`.
  - A non-null `?slug=` that the caller cannot read (`seeds` is a list and does not contain it)
    returns `[]` with `200` and `Cache-Control: no-store`, without querying. Never 403: same
    no-oracle rule as `full-text-search.ts:L63-68`.
  - If `seeds` is an empty list and `includeUnscoped` is false, return `[]` without querying.
  - The snake_case reshape (`L261-272`) and the `no-store` header are unchanged.
- **`media-library`, `unused-media`, `setup-checklist`, `health`, `cloudflare`, `storage/sync`**:
  no handler change. Their protection is the route row (T4).

Leave the docblock of each changed route stating that the projection is the authorization
decision (one line, mirroring `permission.middleware.ts:L109-111` wording).

### T4 — Route table (`apps/api/src/middleware/permission.middleware.ts`)

Replace `L113-114` with these rows, verbatim, at the same position (after the drafts row, before
the import-jobs row; still ahead of every `:slug` row):

```ts
  // The handler's scope projection is the authorization decision for these three routes:
  // counts and the activity feed cover only seeds the caller may read (brief: stats leak).
  { method: 'GET',    pattern: /^\/api\/content\/stats\/total$/,           requirement: AUTHED },
  { method: 'GET',    pattern: /^\/api\/content\/stats\/breakdown$/,       requirement: AUTHED },
  { method: 'GET',    pattern: /^\/api\/content\/stats\/recent-activity$/, requirement: AUTHED },
  // Media belongs to no seed: only a global reader may list it; one seed-scoped grant is not enough.
  { method: 'GET',    pattern: /^\/api\/content\/stats\/media-library$/,   requirement: perm('content:read', 'global') },
  { method: 'GET',    pattern: /^\/api\/content\/stats\/unused-media$/,    requirement: perm('content:read', 'global') },
  // Exposes seed slugs and system state: administration only.
  { method: 'GET',    pattern: /^\/api\/content\/stats\/setup-checklist$/, requirement: perm('manage_users', 'global') },
  // Infrastructure, not seed data.
  { method: 'GET',    pattern: /^\/api\/content\/stats\/health$/,          requirement: perm('view_analytics', 'global') },
  { method: 'GET',    pattern: /^\/api\/content\/stats\/cloudflare$/,      requirement: perm('view_analytics', 'global') },
  { method: 'POST',   pattern: /^\/api\/content\/stats\/storage\/sync$/,   requirement: perm('view_analytics', 'global') },
```

Rules:
- There is no catch-all stats row any more. An unknown `GET /api/content/stats/<x>` now falls to
  the `:slug` row at `L143` with scope `stats`. That still refuses everyone but global readers, who
  then get Hono's 404, so it is fail-closed. The completeness guard at
  `permission.middleware.test.ts:L14` keeps every mounted route mapped.
- Update the `L62-64` ORDER comment only if its wording names the old single row (it names the
  `stats` prefix generically, so expect no change).

### T5 — Dashboard comment (`apps/dashboard/src/config/dashboard-menu.ts:L34`)

Change the `viewAnalytics` bullet so it names the routes that still require it:
`/api/content/stats/{health,cloudflare,storage/sync}` and `/api/settings/storage`. Comment only;
`MenuGates` and the sidebar logic are untouched.

### T6 — Tests

**6a. Integration — `apps/api/src/features/stats/test/integration/stats-scope-isolation.integration.test.ts` (NEW)**

- Tier: integration (real D1, full middleware chain). `describe('stats slice — scope isolation (real D1)')`.
- Fixture source: canonical seeds `posts`, `authors`, `categories` and `CANONICAL_USERS` from `@beechcms/testing`. The baseline is copied from `stats-recent-activity.integration.test.ts:L38-49`.
- Roles and assignments are inserted by SQL into structural tables (rule 3.8), with the same shape as `backrefs-permissions.integration.test.ts:L24-27`:
  - role `stats-seed-reader` = {`content:read`} assigned to `viewer` at scope `posts`;
  - role `stats-analytics` = {`view_analytics`} assigned to `viewer` at `*`. This makes `viewer` the brief's "content:read on one seed + view_analytics" caller.
- `beforeEach` also clears `activity_logs`.
- Entries are created through `admin.post('/api/content/<slug>')`, inside the tests that need them.
- Activity rows are inserted by SQL with a local `logActivity(id, entityType, entitySlug | null, createdAt)` helper. Copy the shape from `stats-recent-activity.integration.test.ts:L28-36`. `createdAt` is derived from `harness.clock.nowSeconds()`.
- Required comments: the decay-filter coupling (assignments resolve against the D1 `seeds` table); and, in the media and setup tests, why 403 is correct here while `total` answers 200.

`it()` list:
- `GET /api/content/stats/total` counts only the entries of seeds the caller reads: one `posts` and two `authors` entries give `total` 1 to `viewer` and 3 to `admin`.
- `GET /api/content/stats/total` counts only create events of readable seeds: two `posts` rows and three `authors` rows inside 24h give `today`/`week`/`month` 2 to `viewer`.
- `GET /api/content/stats/breakdown` lists only readable seeds: `viewer` gets exactly `[{ slug: 'posts', … }]`, with no `authors` or `categories` label or count.
- `GET /api/content/stats/recent-activity` omits rows of unreadable seeds: every returned `entity_slug` is `posts`, and no `user_email` or `details` of an `authors` row appears.
- `GET /api/content/stats/recent-activity` hides rows tied to no seed from a caller without global `manage_users`: a `media` row with null slug is absent for `viewer` and present for `admin`.
- `GET /api/content/stats/recent-activity` keeps a global reader without `manage_users` away from unscoped rows. Arrange: `viewer` re-assigned `stats-seed-reader` at `*` instead. Outcome: `posts` and `authors` rows are present and the `media` row is absent.
- `GET /api/content/stats/recent-activity?slug=authors` returns 200 and `[]` to `viewer`, never 403: a slug outside the perimeter is not an existence oracle.
- The feed fills its 15-row limit from visible rows only. Arrange: 15 newer `authors` rows and 1 older `posts` row. Outcome: `viewer` still receives the `posts` row. This guards against post-query filtering.
- A caller with no assignment at all (`editor` stripped of its assignments) gets 200 with zeros from `total`, `[]` from `breakdown` and `[]` from `recent-activity`. This is a matrix over the three routes (rule 1.6).
- `GET /api/content/stats/media-library` and `unused-media` refuse a seed-scoped reader with 403 `forbidden`. This is a matrix; the comment explains that media belongs to no seed.
- `GET /api/content/stats/media-library` serves a global `content:read` holder without `view_analytics` with 200. Arrange: `viewer` holds `stats-seed-reader` at `*` only.
- `GET /api/content/stats/setup-checklist` refuses `viewer` with 403 `forbidden` and serves `admin` with 200.
- `GET /api/content/stats/health` and `cloudflare` still serve `viewer` (who holds `view_analytics@*`) with 200, and refuse with 403 an account holding only `content:read@posts`. This is a matrix.

**6b. Unit — `apps/api/src/shared/db/repositories/d1-activity-log.repository.test.ts` (EDIT)**

- Tier: unit, using the existing mocked `prepare`/`bind` (see `L69-90` for the style).
- New `it()`s:
  - `list` with `visibility { seeds: ['posts'], includeUnscoped: false }` emits the `json_each(?)` clause and binds `'["posts"]'` before the limit.
  - `list` with a slug list and `includeUnscoped: true` ORs `entity_slug IS NULL` inside parentheses.
  - `list` with `seeds: 'all', includeUnscoped: false` emits `entity_slug IS NOT NULL` with no extra binding.
  - `list` with an empty list and `includeUnscoped: false` emits `1 = 0`, and never an empty `IN ()`.
  - `list` with `seeds: 'all', includeUnscoped: true` emits no visibility clause (same SQL as no visibility).
  - `countSince` with a slug-list visibility appends the clause after `created_at >= ?` and binds the JSON array last.
  - `list` combines `entitySlug` and `visibility` with AND, in bind order `entitySlug`, visibility, `limit`.

**6c. Unit — `apps/api/src/middleware/permission.middleware.test.ts` (EDIT)**

- Tier: unit; copy the style of `L23`.
- One matrix `it()`: "every stats route resolves to its own requirement". It is array-driven over the nine rows of T4 and asserts the `resolveRouteRule(method, path)` requirement for each (`authenticated` ×3, `content:read`@global ×2, `manage_users`@global, `view_analytics`@global ×3).

Existing suites that must stay green with no edit:
- `stats-media.integration.test.ts`
- `stats-recent-activity.integration.test.ts`
- `flow-stats.test.ts`
- `settings.handler.test.ts` (the per-user activity tab passes no `visibility`)

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# core contract compiles and is re-exported
cd packages/core && pnpm run build

# api typecheck (core types consumed)
cd apps/api && npx tsc --noEmit

# dashboard typecheck (RPC-inferred stats types unchanged)
cd apps/dashboard && npx tsc --noEmit

# scoped run while iterating, then the full workspace
pnpm beech test --diff
pnpm beech test

pnpm beech lint
```

Manual check (optional, `pnpm beech dev`): sign in as an account holding `content:read` on one
seed + `view_analytics@*`. The dashboard's content-pulse and recent-activity widgets show only that
seed. The media gallery and setup checklist widgets show their error state; hiding them is
sprint 4 (`WidgetPermissionRequirements`).

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `ActivityLogVisibility` is exported from `@beechcms/core` with the exact shape in T1, and `visibility` is optional on `ActivityLogListOptions` and `CountSinceOptions`. Core has zero new runtime code and zero new dependencies.
- [ ] `D1ActivityLogRepository` implements all seven cases of the T2 table. No query ever contains `IN ()`. The visibility filter is applied before `LIMIT`.
- [ ] `stats/total`, `stats/breakdown` and `stats/recent-activity` are `authenticated` rows. Their handlers derive readable seeds only through `resolveEffectivePermissions` + `filterSeedsByPermission` / `hasPermission`.
- [ ] `media-library` / `unused-media` require `content:read@*`. `setup-checklist` requires `manage_users@*`. `health` / `cloudflare` / `storage/sync` require `view_analytics@*`. No catch-all stats row remains.
- [ ] Rows with a null `entity_slug` reach a caller only with `manage_users@*`.
- [ ] An out-of-perimeter `?slug=` gets 200 `[]`, never 403.
- [ ] `stats/total` reads time from `context.get('clock')`. No `SystemClock` remains in that handler.
- [ ] No stats response for the isolation `viewer` contains the slug, label, count, activity row, email or detail of `authors` or `categories` (the brief's cross-cutting criterion 1).
- [ ] All nine stats response shapes are unchanged (the dashboard typechecks with zero edits beyond the T5 comment).
- [ ] `stats.handler.ts` imports nothing from another `features/*` slice. The test file imports nothing from another slice or test file.
- [ ] Every new test follows `testing_conventions.md`:
  - SPDX header;
  - four zones;
  - status asserted first;
  - typed bodies;
  - no `any`;
  - no `Date.now()`;
  - no `it.only`/`skip`.
- [ ] `pnpm run build` (core), `npx tsc --noEmit` (api, dashboard), `pnpm beech test` and `pnpm beech lint` all pass.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executor MUST NOT build or modify:

- Layout tabs with target roles, server-side layout filtering, removal of the `role:*` scopes, the roles endpoint for editors, or the layout write gate. These are ROADMAP entry 2 (`DashboardTabAudienceApi`).
- Any dashboard UI change, including hiding the media and setup-checklist widgets from callers who now get 403. The error state is accepted until ROADMAP entry 4 (`WidgetPermissionRequirements`). The tab model and fallbacks are ROADMAP entry 3.
- `requires` on widget definitions, and default-layout generator exclusion. These are ROADMAP entry 4.
- The `manage_layout` permission, its migration, locked placeholders, and compare-and-swap. These are ROADMAP entries 5–6.
- The `manage_seeds` permission and the `/api/seeds/*` gate. These are ROADMAP entry 7.
- Removing `users.role`, the JWT `role` claim, `requireAdmin`, `isDeveloper`, or the `legacy-admin` kind. These are ROADMAP entry 8. In particular, `ActorContext.role` in `draft.handler.ts:L106-110` stays as it is.
- `GET /api/settings/activity` and `GET /api/settings/storage`. They are self-service or infra, and they are not stats routes.
- Docs under `docs/` (ROADMAP entry 9). Generated `docs/api/**` must not be hand-edited.
- Any new migration, table, index or binding. Any change to `widgetRepository`, `mediaRepository` or `setupChecklistRepository`.
- Moving `activityVisibility` to `shared/`. Only one slice needs it today (YAGNI). It moves when a second slice does.
