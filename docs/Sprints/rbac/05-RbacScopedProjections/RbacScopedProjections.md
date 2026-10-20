# Sprint Plan — `RbacScopedProjections`

> Roadmap entry 5 of the Multi-Stakeholder RBAC / Multi-Tenant Portal feature.
> Detailed plan for THIS sprint only. Sprint 6 (`RbacDashboardSurfaces`) exists as a
> roadmap entry and MUST NOT be implemented here.

### Pre-Computation Analysis

**a) God Nodes identified via the CLI**

| Node | Degree | Why it matters here |
|---|---|---|
| `useAuth()` (`apps/dashboard/src/lib/auth-context.tsx:96`) | 19 | Sole auth state seam in the dashboard; every permission-derived UI in sprint 6 hangs off it. `graphify explain "useAuth"` → 19 edges, incl. `ProtectedRoute()`, `RootLayout()`, `AppSidebar`, `SeedBuilderPage()`, `useLoginForm()`. |
| `AppSidebar` (`features/navigation/components/app-sidebar.tsx:27`) | 18 | Every authenticated page imports it (`content-list`, `drafts-list`, `analytics`, `create-new`, `scheduled`, `dashboard-page`, `settings-page`, `widget-lab`, `test-fields`). It is the single navigation projection point. |
| `useSchema()` (`features/shared/hooks/use-schema.ts`) | 30 (`graphify affected "useSchema()" --depth 1`) | The `GET /api/schema` consumer. Filtering that endpoint changes what 15 dashboard call sites see (list below). |
| `resolveEffectivePermissions` (`apps/api/src/shared/rbac/effective-permissions.ts:27`) | 24 | The one memoized authority resolver on the API side; every handler this sprint touches goes through it, never through a second seam. |
| `permissionMiddleware()` (`apps/api/src/middleware/permission.middleware.ts:228`) | — | Owns `PROTECTED_ROUTES`, the fail-closed route table. This sprint adds **no rows**: every route it touches is already listed. |

**b) Architectural boundaries affected**

- `@beechcms/core` — **UNCHANGED**. `hasPermission()`, `permissionsForScope()`,
  `PERMISSIONS`, `Seed`, `EffectivePermissions` are consumed as-is. No new export, no
  new type, no schema change. (Verified: `packages/core/src/rbac/evaluate.ts` already
  exposes every primitive needed; adding a "filter seeds" helper there would be an
  API-tier concern leaking into core.)
- `apps/api` — three slices + one shared module:
  - `src/shared/rbac/` (NEW file `scoped-projection.ts`) — shared, not a slice, because
    three different slices need the same projection and a slice-to-slice import would
    violate VSA. Same rationale that already put `effective-permissions.ts` there.
  - `src/features/settings/settings.handler.ts` — `GET /api/settings/me` gains the
    caller's permission payload (additive).
  - `src/features/schema/schema.handler.ts` — `GET /api/schema` scope-filtered.
  - `src/features/draft/draft.handler.ts` — `GET /api/content/drafts` scope-filtered.
  - `src/features/search/handlers/full-text-search.ts` — `GET /api/search` scope-filtered.
- `apps/dashboard` — **ZERO files touched.** The payload added to `/api/settings/me` is
  additive; `UserProfile` (`features/settings/types/settings.types.ts:12`) keeps
  typechecking untouched. Consumption is sprint 6.
- `apps/api/migrations` — **ZERO**. No table, no column, no index. `db:reset` is not
  required by this sprint.

**c) `graphify affected` impact analysis (breaking-change proof)**

```
$ graphify affected "useSchema()" --depth 1
AppSidebar, useContentList(), useDashboardLayout(), SeedBuilderPage(),
DraftsListPage(), WidgetLabPage(), useActiveSeed(), QuickDraftAdapter(),
BranchAliasSelect(), SeedSelect(), BuilderPaneController(), DashboardBuilderDialog(),
CreateEntryForm(), SetVariableForm(), WebhookForm()  (+ imports/indirect_call edges)
```
→ 15 dashboard call sites observe a **shorter** seed list when the caller is
seed-scoped. None of them break on a short list: `buildContentMenu()` already handles
an empty array, `useActiveSeed()` already returns `undefined` for an unknown slug, and
every selector renders an empty option set. **No signature changes**, so no compile-time
break anywhere.

```
$ graphify affected "useProfile()" --depth 1
AppSidebar (app-sidebar.tsx:31), ProfileTab() (profile-tab.tsx:29), settings/index.ts
```
→ only 2 consumers of `/api/settings/me`. Both read named fields; an added field is
inert for them.

```
$ graphify explain "resolveEffectivePermissions"
<-- permission.middleware.ts, features/rbac/{users,roles,assignments,invitations}.ts,
    features/oauth/authorize.ts, effective-permissions.test.ts
```
→ the new shared projection module calls it, adding a 7th importer. Its memoization
(`effectivePermissions` context Variable, `apps/api/src/types.ts:246`) means the
handlers below add **zero** extra D1 round trips on any route already gated by a
`permission` / `permission-any-scope` rule, and at most 2 on the three `authenticated`
routes (`/api/settings/me`, `/api/schema`) that never resolved authority before.

```
$ grep -c "arbitrate(" / PROTECTED_ROUTES rows touched: 0
```
→ every endpoint modified is already registered in `PROTECTED_ROUTES`
(`/api/settings/me` AUTHED, `/api/schema` AUTHED, `/api/content/drafts`
`content:read@global`, `/api/search` `content:read@global`). No table row is added or
reordered, so the completeness test in `permission.middleware.test.ts` cannot regress.

### VETO Audit

1. **Botanical Invariant — PASS.** No handler in this sprint issues SQL. `/api/schema`
   reads `seedRegistry` + `seedLayoutRepository`; `/api/content/drafts` calls
   `repository.findPendingDrafts(seeds)`; `/api/search` calls
   `searchRepository.search(options, seeds)`. The change in all three is *which seeds
   are passed in*, i.e. an argument narrowing — `apiToDb`/`dbToApi` and the
   `content_{slug}` addressing stay entirely inside `@beechcms/core` and the existing
   repositories. No hardcoded field name, no branch-id bypass.
2. **VSA — PASS.** The projection helper lands in `apps/api/src/shared/rbac/`, imported
   by `features/{settings,schema,draft,search}`. Zero `features/X → features/Y` imports
   are introduced. This is the same precedent `effective-permissions.ts` set in sprint 2
   for exactly this reason (`features/oauth/authorize.ts` needed it off-middleware).
   Gate command in SECTION 5 proves it.
3. **Cloudflare purity — PASS.** Pure in-memory `Array.filter` over an already-hydrated
   registry. No new query, no ORM, no background job, no migration.
4. **YAGNI — PASS, with two deliberate refusals:**
   - No new core export. `hasPermission()` composed at the API tier is enough.
   - No caching layer for the projection. The registry is in memory and the authority is
     already memoized per request.
5. **Developer axis — PRESERVED.** `/api/schema` filtering is by `content:read`, not by
   `users.role`. This is safe because `POST /auth/setup` is the sole producer of
   `role = 'admin'` and it grants `SuperAdmin` at `'*'` in the same request (sprint 2),
   so every developer-axis account holds global `content:read` and sees the full seed
   list the Seed Builder needs. **`isDeveloper` is exposed on `/api/settings/me` as a
   plain boolean mirror of `users.role === 'admin'`** so sprint 6 can gate the Content
   Types / Seed Builder surface without inventing an RBAC permission for it —
   `manage_seeds` does not exist and must never exist (brief §2).
   *Residual risk, accepted and documented:* if a `role='admin'` account's global
   assignment were ever revoked, its Seed Builder would render an empty seed list while
   `/api/seeds/*` still answers. That is a display gap, not an authorization gap, and
   the last-global-admin guardrail (sprint 3) makes reaching it require a second admin.
6. **Scope refinement refusals (VETO on the remaining roadmap-5 inheritance).**
   `/api/upload*`, `/api/automations*` and `/api/dashboard-layout` writes stay
   **global-only**, permanently, not deferred:
   - R2 media has no seed ownership column; partitioning it is a data-model feature, not
     a projection.
   - An automation rule is cross-seed by construction (its trigger seed and its action
     seed can differ); a per-seed scope for it is not expressible without a second
     scoping model.
   - `dashboard-layout` is one global document per installation.
   Adding a scope axis to any of them today would be over-engineering. `ROADMAP.md` is
   amended in the same commit to record this as a decision rather than a debt.

HANDOFF -> caveman_coder

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Roadmap entry 5 bundled two things that must merge sequentially: the API must *emit* a
scope-correct projection before the dashboard can *render* one. This sprint is the API
half; `RbacDashboardSurfaces` (new roadmap entry 6) is the UI half.

The split is not cosmetic. Sprint 2 shipped the enforcement gate, which answers "may
this caller perform this action on this scope?" — a per-request yes/no. It deliberately
left every **listing** coarse: `GET /api/schema` still returns every seed to any
authenticated caller, and `/api/content/drafts` + `/api/search` still require a *global*
`content:read` instead of returning the seed-filtered subset a scoped caller is entitled
to. The consequence today is exactly the failure the brief exists to prevent: a partner
scoped to seed X is refused when they open seed Y's content (correct), but they can
still *enumerate* every seed in the sidebar (brief §2, "isolamento dati a livello di
Seed"), and they get a flat 403 on Drafts and Search rather than their own subset.

Doing this before the UI is what makes the UI honest. If the dashboard hid sections
client-side while `/api/schema` kept returning the full list, visibility would be a
cosmetic filter over a leaking endpoint — the "superficie d'attacco extra" the brief
calls out. The rule this sprint establishes: **a listing returns exactly what the caller
could open one-by-one, never more.** Hiding in sprint 6 then becomes a rendering
decision over an already-correct payload, not a security control.

- **VSA**: the projection helper is `shared/`, consumed by four slices; zero cross-slice
  imports (VETO audit §2).
- **Botanical Engine**: no handler gains SQL. Every change narrows the `Seed[]` argument
  passed into an existing repository call (VETO audit §1).
- **Fail-closed**: `PROTECTED_ROUTES` gains no row. Filtering is *inside* the handler,
  *after* the gate — the gate stays the single authorization boundary; the projection is
  a visibility narrowing on top of it, never a substitute.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Authority resolution (`apps/api`)**

`resolveEffectivePermissions(context)` — `src/shared/rbac/effective-permissions.ts:27` —
memoizes into the `effectivePermissions` context Variable (`src/types.ts:246`). Two D1
reads on first call (`roleAssignmentRepository.listActiveForUser`, then
`roleRepository.findByIds`), zero thereafter. Returns
`{ global: ReadonlySet<Permission>, byScope: ReadonlyMap<Scope, ReadonlySet<Permission>> }`.
Empty authority is `{ global: new Set(), byScope: new Map() }`.

**Middleware registration order on `apiProtected` (unchanged by this sprint)**

`authMiddleware()` → `oauthScopeMiddleware()` → `permissionMiddleware()` → slice router.
`permissionMiddleware()` refuses in this order, all 403: deactivated account
(`account_disabled`) → unregistered route (`route_not_registered`) → missing permission
(`forbidden`). Requirement kinds: `permission` (with `ScopeSource` `'global' | 'capture1'`),
`permission-any-scope`, `authenticated`, `legacy-admin`.

**The four routes this sprint changes — their existing rows in `PROTECTED_ROUTES`**

| Route | Current requirement | After this sprint |
|---|---|---|
| `GET /api/settings/me` | `{ kind: 'authenticated' }` | unchanged (payload grows) |
| `GET /api/schema` | `{ kind: 'authenticated' }` | unchanged (list narrows) |
| `GET /api/content/drafts` | `perm('content:read', 'global')` | **`{ kind: 'authenticated' }`** — see T5 |
| `GET /api/search` | `perm('content:read', 'global')` | **`{ kind: 'authenticated' }`** — see T6 |

The last two rows change requirement kind because a global-permission gate and a
scope-filtered projection are mutually exclusive: a seed-scoped caller must reach the
handler to receive their own subset. The projection inside the handler becomes the
authorization decision for those two routes, and it is strictly *narrower* than the gate
it replaces for every caller. **This is the only edit to `PROTECTED_ROUTES` in this
sprint** — no row is added, removed or reordered.

**Handlers as they exist today**

- `src/features/schema/schema.handler.ts:51` — `schemaApp.get('/')`: `registry.all()`
  enriched with `seedLayoutRepository.getAllAsMap()`, returns a bare `Seed[]` array
  (not wrapped in an object).
- `src/features/draft/draft.handler.ts:24` — `draftApp.get('/drafts')`:
  `seedRegistry.draftEnabled()` → `repository.findPendingDrafts(seeds)` → bare array.
- `src/features/search/handlers/full-text-search.ts:37` — `fullTextSearchHandler`:
  reads `q`, `schema_slug`, `status`, `limit`, `cursor`; `allSeeds = c.get('seedRegistry').all()`;
  `Promise.all([searchRepository.search(opts, allSeeds), searchRepository.count(opts, allSeeds)])`;
  returns `{ items, nextCursor, total } satisfies SearchResponse`.
- `src/features/settings/settings.handler.ts:116` — `settingsApp.get('/me')`: returns
  `{ id, email, name, surname, avatarUrl, notificationPrefs }`. `currentUser` comes from
  `userRepository.findById(userId)` and carries `role` and `isActive`, neither currently
  emitted.

**Core primitives available (no change needed)**

`hasPermission(effective, permission, scope)` — global grant satisfies any scope; a
scoped grant never satisfies `'*'`. `permissionsForScope(effective, scope)` — union of
global + that seed's set. `PERMISSIONS` — 7 entries, `manage_seeds` absent by design.
`GLOBAL_SCOPE = '*'`.

**Dashboard consumers (untouched this sprint, mapped for sprint 6)**

`useSchema()` → 15 call sites (`graphify affected`, listed in Pre-Computation c).
`useProfile()` → `AppSidebar` (`app-sidebar.tsx:31`) and `ProfileTab()`
(`profile-tab.tsx:29`). Navigation is built by `getStaticMenu()` /
`getContentCategoryMenu()` / `getSettingsMenu()` / `buildContentMenu()` in
`src/config/dashboard-menu.ts` and rendered by `AppSidebar`; settings tabs are a static
`groups` array in `features/settings/components/settings-dialog.tsx:100`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**New files (`apps/api`)**

| File | Content |
|---|---|
| `src/shared/rbac/scoped-projection.ts` | `filterSeedsByPermission()`, `serializeEffectivePermissions()`, `EffectivePermissionsPayload` |
| `src/shared/rbac/scoped-projection.test.ts` | Unit tests for both helpers |
| `test/flow-rbac-projections.test.ts` | E2E: a seed-scoped account sees only its own seed across all four endpoints |

**Modified files (`apps/api`)**

| File | Change |
|---|---|
| `src/features/settings/settings.handler.ts` | `GET /me` emits `permissions` + `isDeveloper` |
| `src/features/schema/schema.handler.ts` | `GET /` filters by `content:read` per seed |
| `src/features/draft/draft.handler.ts` | `GET /drafts` filters `draftEnabled()` by `content:read` |
| `src/features/search/handlers/full-text-search.ts` | filters `allSeeds` by `content:read`; empty-set short circuit |
| `src/middleware/permission.middleware.ts` | 2 rows change requirement kind (drafts, search) — nothing added/removed |
| `src/features/settings/__tests__/*` | assertions for the new `/me` fields |
| `src/features/search/handlers/full-text-search.test.ts` | seed-filtering cases |

**Explicitly NOT in this sprint**: any `apps/dashboard/**` file, any `packages/core/**`
file, any file under `apps/api/migrations/`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### T1 — `apps/api/src/shared/rbac/scoped-projection.ts` (NEW)

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { EffectivePermissions, Permission, Scope, Seed } from '@beechcms/core'
import { hasPermission } from '@beechcms/core'

/**
 * The seeds a caller may exercise `permission` on, in registry order.
 *
 * The projection rule for every LISTING endpoint: a list returns exactly what the
 * caller could open one by one, never more. A global grant keeps the list whole; a
 * seed-scoped grant narrows it to that seed. An account with no assignment gets `[]`,
 * which is the zero-trust default (brief §2) rather than an error.
 *
 * Lives in `shared/` because four slices need the identical narrowing and a
 * slice-to-slice import would violate VSA — the same reason `effective-permissions.ts`
 * is here.
 */
export function filterSeedsByPermission(
  seeds: readonly Seed[],
  effective: EffectivePermissions,
  permission: Permission,
): Seed[] {
  if (effective.global.has(permission)) return [...seeds]
  return seeds.filter(seed => hasPermission(effective, permission, seed.slug))
}

/** Wire shape of a caller's authority. Sets/Maps are not JSON-serializable. */
export interface EffectivePermissionsPayload {
  /** Permissions held at `'*'`; they apply to every seed, present and future. */
  global: Permission[]
  /** Permissions held on a specific seed slug, keyed by that slug. */
  byScope: Record<Scope, Permission[]>
}

/**
 * Serializes `EffectivePermissions` for the dashboard.
 *
 * Deterministically sorted so a client may compare two payloads by value (and so the
 * response is cache-stable). Emits the RAW authority — global and scoped kept apart —
 * never a pre-flattened "can I do X" list: flattening would lose the scope asymmetry
 * that `hasPermission()` depends on (a scoped grant never satisfies `'*'`).
 */
export function serializeEffectivePermissions(
  effective: EffectivePermissions,
): EffectivePermissionsPayload {
  const byScope: Record<Scope, Permission[]> = {}
  for (const scope of [...effective.byScope.keys()].sort()) {
    byScope[scope] = [...(effective.byScope.get(scope) ?? [])].sort()
  }
  return { global: [...effective.global].sort(), byScope }
}
```

### T2 — `GET /api/settings/me` payload (`src/features/settings/settings.handler.ts`)

Add imports at the top of the file:

```ts
import { resolveEffectivePermissions } from '../../shared/rbac/effective-permissions'
import { serializeEffectivePermissions } from '../../shared/rbac/scoped-projection'
```

Inside the `settingsApp.get('/me', …)` handler, after the `currentUser` null check and
before the `return`:

```ts
  const effective = await resolveEffectivePermissions(context)
```

Extend the returned object with exactly two new keys (every existing key unchanged):

```ts
  return context.json({
    id: currentUser.id,
    email: currentUser.email,
    name: currentUser.name,
    surname: currentUser.surname,
    avatarUrl,
    notificationPrefs: { /* unchanged */ },
    /** The caller's raw RBAC authority. Sprint 6 derives every UI visibility rule from
     *  this and from nothing else. */
    permissions: serializeEffectivePermissions(effective),
    /** Developer/owner axis (`users.role === 'admin'`), orthogonal to RBAC and NOT a
     *  permission: `manage_seeds` does not exist and must never exist (brief §2). Gates
     *  the Seed Builder surface only. */
    isDeveloper: currentUser.role === 'admin',
  })
```

**Constraints**: additive only — no existing key renamed, removed or retyped; the route
stays `{ kind: 'authenticated' }` (self-service must work for a zero-trust account, which
correctly receives `{ global: [], byScope: {} }`).

### T3 — `GET /api/schema` (`src/features/schema/schema.handler.ts`)

Imports:

```ts
import { resolveEffectivePermissions } from '../../shared/rbac/effective-permissions'
import { filterSeedsByPermission } from '../../shared/rbac/scoped-projection'
```

Replace the body of `schemaApp.get('/', …)`:

```ts
schemaApp.get('/', async (context) => {
  const registry = context.get('seedRegistry')
  const effective = await resolveEffectivePermissions(context)
  // Seed isolation is per-seed, never row-level (brief §2): a caller who cannot read a
  // seed must not learn it exists. `content:read` is the visibility floor — every other
  // content permission is useless without it.
  const visible = filterSeedsByPermission(registry.all(), effective, 'content:read')

  const layouts = await context.get('seedLayoutRepository').getAllAsMap()

  const enriched = visible.map((seed) => {
    const stored = layouts.get(seed.slug)
    if (!stored) return seed
    const result = validateLayoutAgainstSeed(stored, seed)
    return { ...seed, layout: result.cleaned }
  })

  return context.json(enriched)
})
```

The response stays a bare `Seed[]` array — `useSchema()` and its 15 downstream call
sites parse it positionally, so the envelope must not change.

`PUT`/`DELETE /api/schema/:slug/layout` stay `legacy-admin` and are **not touched**.

### T4 — `GET /api/content/drafts` (`src/features/draft/draft.handler.ts`)

Imports:

```ts
import { resolveEffectivePermissions } from '../../shared/rbac/effective-permissions'
import { filterSeedsByPermission } from '../../shared/rbac/scoped-projection'
```

```ts
// GET /drafts — Pending drafts across every draft-enabled seed the caller may read.
draftApp.get('/drafts', async (context) => {
  const effective = await resolveEffectivePermissions(context)
  const seeds = filterSeedsByPermission(
    context.get('seedRegistry').draftEnabled(),
    effective,
    'content:read',
  )
  // No readable draft-enabled seed: answer with an empty list rather than handing the
  // repository an empty seed set.
  if (seeds.length === 0) return context.json([])

  const drafts = await context.get('repository').findPendingDrafts(seeds)
  return context.json(drafts)
})
```

### T5 — `GET /api/search` (`src/features/search/handlers/full-text-search.ts`)

Imports (path is two levels up from `handlers/`):

```ts
import { resolveEffectivePermissions } from '../../../shared/rbac/effective-permissions'
import { filterSeedsByPermission } from '../../../shared/rbac/scoped-projection'
```

Replace the `allSeeds` line and add the short circuit, leaving every other line of the
handler as-is:

```ts
  const effective = await resolveEffectivePermissions(c)
  const readableSeeds = filterSeedsByPermission(
    c.get('seedRegistry').all(),
    effective,
    'content:read',
  )

  // An explicit `schema_slug` outside the caller's perimeter yields an empty result,
  // NOT a 403: search must not become an existence oracle for seeds the caller cannot
  // see (same reasoning as the 404-not-403 rule in features/rbac).
  const searchableSeeds = schemaSlug === null
    ? readableSeeds
    : readableSeeds.filter(seed => seed.slug === schemaSlug)

  if (searchableSeeds.length === 0) {
    return c.json({ items: [], nextCursor: null, total: 0 } satisfies SearchResponse)
  }

  const searchRepository = c.get('searchRepository')
  const searchOptions = { queryText, schemaSlug, statusFilter, limit, cursor }
  const countOptions  = { queryText, schemaSlug, statusFilter }

  const [rawRows, countResult] = await Promise.all([
    searchRepository.search(searchOptions, searchableSeeds),
    searchRepository.count(countOptions, searchableSeeds),
  ])
```

`SearchResponse` is already imported in this file; no new type is introduced.

### T6 — `PROTECTED_ROUTES` requirement change (`src/middleware/permission.middleware.ts`)

Exactly two existing rows change kind. Nothing is added, removed or reordered:

```ts
  { method: 'GET',    pattern: /^\/api\/content\/drafts$/,                 requirement: AUTHED },
  ...
  { method: 'GET',    pattern: /^\/api\/search\/?$/,                       requirement: AUTHED },
```

Update the comment above each to state why: *the handler's scope projection is the
authorization decision for this route and is strictly narrower than a global
`content:read` gate — a caller with no readable seed receives an empty list, a
seed-scoped caller receives their own subset.*

`POST /api/upload*`, `GET|POST|PUT|PATCH|DELETE /api/automations*` and
`PUT|DELETE /api/dashboard-layout*` keep their current global requirements — see
SECTION 7 and VETO audit §6.

### T7 — Tests

**`src/shared/rbac/scoped-projection.test.ts` (NEW)** — pure unit, no D1:
1. `filterSeedsByPermission` with global `content:read` returns every seed, order preserved.
2. Scoped `content:read` on `articles` returns only `articles`.
3. Empty authority returns `[]`.
4. A scoped grant of `content:update` alone does not make the seed visible under `content:read`.
5. `serializeEffectivePermissions` sorts `global`, sorts each scope's array, and sorts scope keys.
6. Empty authority serializes to `{ global: [], byScope: {} }`.

**`src/features/search/handlers/full-text-search.test.ts` (EXTEND)** — reuse the
existing `mockSeedRegistry` harness; add a `roleAssignmentRepository`/`roleRepository`
stub or set `effectivePermissions` directly on the context (the memo makes that the
cheapest seam):
7. Scoped caller: `searchRepository.search` receives only the readable seeds.
8. `schema_slug` naming an unreadable seed → `200 { items: [], total: 0 }`, and the
   repository is never called.

**`test/flow-rbac-projections.test.ts` (NEW)** — real Hono app + `D1TestDatabase`,
following `test/flow-rbac-admin.test.ts` verbatim in structure. Seed users through
`seedTestUsers()` (`test/helpers/seed-fixtures.ts`) — the single authority choke point;
do NOT add a second seeding path:
1. Setup: SuperAdmin at `'*'` (existing helper default) + a second account granted a
   role carrying `content:read` on ONE seed slug only.
2. `GET /api/schema` as SuperAdmin → every seed. As the scoped account → exactly one seed.
3. `GET /api/content/drafts` as the scoped account → 200, and every returned draft
   belongs to its seed. Previously this was a 403; assert 200 explicitly.
4. `GET /api/search?q=…` as the scoped account → 200, zero results from other seeds.
5. `GET /api/search?q=…&schema_slug=<other seed>` → 200 with `items: []` (never 403/404).
6. `GET /api/settings/me` as the scoped account → `permissions.global === []`,
   `permissions.byScope['<slug>']` contains `content:read`, `isDeveloper === false`.
7. `GET /api/settings/me` as the setup admin → `isDeveloper === true` and
   `permissions.global` contains all 7 permissions.
8. A zero-trust account (created, never assigned): `/api/settings/me` → 200 with
   `{ global: [], byScope: {} }`; `/api/schema` → `[]`; `/api/content/drafts` → `[]`;
   `/api/search` → `items: []`. **No 500 anywhere** — this is the regression this sprint
   most needs to pin.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# 1. Core is untouched, but the API compiles against it — build first.
pnpm --filter @beechcms/core run build

# 2. Typecheck. apps/api has a documented pre-existing baseline of 32 errors
#    (search/, rate-limit.middleware.test.ts, api-key-middleware.test.ts,
#    d1-vector.repository.test.ts, packages/client/src/types.ts). The count must not grow
#    and no error may sit in a file this sprint touched.
cd apps/api && npx tsc --noEmit | grep -c "error TS"     # expect 32
cd apps/dashboard && npx tsc --noEmit                    # expect 0 (no dashboard file touched)

# 3. VSA gate — the new shared module must not pull a slice, and no slice may pull another.
grep -rn "features/" apps/api/src/shared/rbac/                       # expect empty
grep -rn "from '\.\./\(oauth\|seeds\|rbac\|content\|settings\)" \
  apps/api/src/features/schema apps/api/src/features/draft \
  apps/api/src/features/search apps/api/src/features/settings        # expect empty

# 4. Botanical gate — no SQL introduced by this sprint.
git diff devs -- apps/api/src/features apps/api/src/shared | grep -iE "SELECT |INSERT |UPDATE |DELETE FROM"   # expect empty

# 5. Migrations untouched.
git diff devs --stat -- apps/api/migrations apps/dashboard          # expect empty

# 6. Targeted suites.
cd apps/api && npx vitest run \
  src/shared/rbac/scoped-projection.test.ts \
  src/features/search/handlers/full-text-search.test.ts \
  src/middleware/permission.middleware.test.ts \
  test/flow-rbac-projections.test.ts \
  test/flow-rbac-enforcement.test.ts test/flow-rbac-admin.test.ts \
  test/flow-rbac-invitations.test.ts test/flow-draft-management.test.ts \
  test/flow-content-management.test.ts test/flow-system-schema.test.ts

# 7. Full workspace suites + lint.
pnpm --filter @beechcms/core test
pnpm --filter @beechcms/api test
pnpm lint

# 8. Runtime smoke (no db:reset needed — this sprint has no DDL).
pnpm beech dev
#   - POST /auth/setup, log in, GET /api/settings/me  → permissions.global has 7 entries,
#     isDeveloper true
#   - POST /api/rbac/users + POST /api/rbac/assignments (a role with content:read on ONE seed)
#   - log in as that account:
#       GET /api/schema          → only that seed
#       GET /api/content/drafts  → 200 (was 403 before this sprint)
#       GET /api/search?q=xx     → only that seed's rows
#       GET /api/settings/me     → permissions.byScope has exactly that slug
```

`pnpm beech db:migrate` / `pnpm beech db:reset` are **not** part of this sprint's
validation: no migration file changes.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `apps/api/src/shared/rbac/scoped-projection.ts` exists, exports exactly
      `filterSeedsByPermission`, `serializeEffectivePermissions`, `EffectivePermissionsPayload`,
      and imports nothing from `apps/api/src/features/**`.
- [ ] `packages/core/**` has zero diff. No new core export was added.
- [ ] `apps/api/migrations/**` has zero diff.
- [ ] `apps/dashboard/**` has zero diff.
- [ ] `GET /api/settings/me` returns every pre-existing key unchanged, plus
      `permissions: { global: Permission[]; byScope: Record<string, Permission[]> }` and
      `isDeveloper: boolean`. Arrays are sorted deterministically.
- [ ] A zero-trust account (no assignment) gets `200` from `/api/settings/me`,
      `/api/schema`, `/api/content/drafts` and `/api/search` — empty payloads, never a
      500 and never a 403.
- [ ] `GET /api/schema` returns a bare array (envelope unchanged) containing only seeds
      the caller holds `content:read` on; a global holder still gets every seed.
- [ ] `GET /api/content/drafts` and `GET /api/search` are `{ kind: 'authenticated' }` in
      `PROTECTED_ROUTES`, and no row was added, removed or reordered in that table.
- [ ] `GET /api/search?schema_slug=<unreadable>` returns `200 { items: [], total: 0 }` —
      never 403 or 404 — and the search repository is not called.
- [ ] `isDeveloper` derives from `users.role === 'admin'` and from nothing else. No new
      permission was added to `PERMISSIONS`; `grep -rn "manage_seeds" packages/core apps/api`
      still matches only comments and tests.
- [ ] `apps/api` typecheck error count is still 32, with zero errors in any file this
      sprint touched; `apps/dashboard` typecheck is 0.
- [ ] `pnpm --filter @beechcms/api test` and `pnpm --filter @beechcms/core test` fully
      green; `pnpm lint` green.
- [ ] `test/flow-rbac-projections.test.ts` covers all 8 steps of T7 and seeds users only
      through `seedTestUsers()`.
- [ ] No production code was weakened to keep a pre-existing test green; any adapted test
      is listed with its reason in `execution_log.md`.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

**Deferred to roadmap entry 6 (`RbacDashboardSurfaces`) — do not build here:**
- Any file under `apps/dashboard/**`: the users / roles / invitations screens, the
  invitation redemption page, permission-derived navigation in `AppSidebar` /
  `dashboard-menu.ts`, settings-tab visibility in `settings-dialog.tsx`, and consumption
  of the new `/api/settings/me` payload. This sprint only *emits* it.
- Any change to `useSchema()`, `useProfile()`, `UserProfile`, or the `auth-context`
  user shape.

**Refused outright (VETO audit §6 — a decision, not a debt; `ROADMAP.md` records it):**
- Seed-scoping `/api/upload*` (R2 media carries no seed ownership), `/api/automations*`
  (a rule is cross-seed by construction) or `/api/dashboard-layout` writes (one global
  document). They keep their current global requirements.

**Also out of scope:**
- Any new permission in `PERMISSIONS`. The vocabulary is closed and complete for this
  feature; `manage_seeds` must never exist (brief §2).
- Any change to `permissionMiddleware()` beyond the two requirement-kind edits in T6 —
  no new row, no new `RouteRequirement` kind, no reordering.
- Row-level data isolation of any kind. Isolation is per-seed (brief §5).
- Scoping `/api/content/stats/*` and `/api/settings/{activity,storage}`: they are
  `view_analytics@global` today and stay that way.
- Any migration, any `ALTER TABLE`, any edit to `0000_v040_base.sql`.
- The `/oauth/authorize/consent` `is_active` gap documented in sprint 2's review — still
  knowingly open, still not this sprint's.
