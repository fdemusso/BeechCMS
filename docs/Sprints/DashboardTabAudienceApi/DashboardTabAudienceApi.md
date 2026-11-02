# Sprint 2 — DashboardTabAudienceApi

Roadmap: `output/backlog/ROADMAP.md` (entry 2 of 9). Feature brief: `stages/00_ideation/output/feature_brief.md`
§2 rules 1–8, 12–13, 15, §4 "Fase 2", "Stato intermedio e coerenza".
Previous sprint: `docs/Sprints/DashboardDataScopeClosure/` (shipped as `30473871`, review PASS).

### Pre-Computation Analysis

Graph refreshed with `graphify update . --force` (28 822 nodes, 41 360 edges) before any query.

**a) God nodes identified via the CLI**

| Node | Source | Why it matters here |
|---|---|---|
| `resolveEffectivePermissions()` | `apps/api/src/shared/rbac/effective-permissions.ts:L27` | Degree 33. The one resolver of the caller's authority, memoized per request. The layout GET becomes one more consumer; the PUT/DELETE lock guard reuses the memoized value that `permissionMiddleware` already computed. |
| `hasPermission()` | `packages/core/src/rbac/evaluate.ts:L64` | Degree 10. The core evaluator. Every decision in the new core filter (tab audience bypass, widget seed check) calls it. Nothing is re-implemented. |
| `PROTECTED_ROUTES` / `resolveRouteRule()` | `apps/api/src/middleware/permission.middleware.ts:L70`, `L197` | The closed allowlist. The three dashboard-layout rows (`L100-102`) carry the wildcard `(\/.*)?` and the `manage_users@*` write gate that this sprint replaces. |
| `dashboardLayoutApp` | `apps/api/src/features/dashboard-layout/dashboard-layout.handler.ts:L115` | Degree 5: `factory.ts`, `routes.ts` (mounted at `/dashboard-layout`, `L66`), `index.ts` re-export, the handler unit test. |
| `validateDashboardLayout()` | `packages/core/src/dashboard-layout/dashboard-layout.ts:L223` | Degree 4. Callers: `saveLayout()`, `putDefaultLayout()`, `putScopedLayout()`, core test. This is the extension point for the role-id check. |
| `D1DashboardLayoutRepository` | `apps/api/src/shared/db/repositories/dashboard-layout.repository.d1.ts:L8` | Degree 8. Has methods `.get/.listScopes/.upsert/.remove`. `.listScopes()` loses its only caller (`/scopes`, handler `L147`). |
| `canEditDashboard()` | `packages/core/src/dashboard-layout/dashboard-permissions.ts:L9` | Degree 4: `requireDashboardEditPermission()` (API) and `DashboardPage()` (dashboard). The API caller goes away this sprint; the dashboard caller stays until sprint 3. |

**b) Architectural boundaries affected**

- `@beechcms/core`:
  - `dashboard-layout/dashboard-layout.ts`: optional `roles` on `DashboardPageLayout` and its Zod schema, a new constant, and an optional `roleIds` on `DashboardLayoutContext` that `validateDashboardLayout` honours.
  - `dashboard-layout/dashboard-layout-audience.ts` (NEW): the pure viewer filter.
  - `dashboard-layout/dashboard-scopes.ts` (DELETED). `DEFAULT_DASHBOARD_SCOPE` survives and moves to `dashboard-layout.repository.ts`.
  - `dashboard-layout/dashboard-layout.repository.ts`: `listScopes` removed.
  - `index.ts:L89`: the export line is swapped.
- `apps/api`:
  - `features/dashboard-layout/dashboard-layout.handler.ts`: rewritten around the single `default` scope.
  - `middleware/permission.middleware.ts`: the dashboard-layout rows.
  - `shared/db/repositories/dashboard-layout.repository.d1.ts`: drops `listScopes`.
  - Tests: new integration suite; the handler unit test is deleted.
- `apps/dashboard` (contract follow-through only, forced by the removed routes and core exports):
  - `builder/api/dashboard-layout.api.ts` and `builder/dashboard-builder-dialog.tsx`: scope selector removed.
  - `hooks/use-dashboard-layout.ts`: `scope` dropped.
  - `renderer/dashboard-layout-renderer.tsx`: zero-page guard.
  - `locales/{en,it}.json`: `dashboard.builder.scope.*` removed.
  - Three unit tests adjusted.

**c) `graphify affected` impact analysis**

```
graphify explain  "dashboardLayoutApp"                 → factory.ts, routes.ts, index.ts [re_exports], dashboard-layout.handler.test.ts
graphify affected "KNOWN_DASHBOARD_ROLES" --depth 2    → dashboard-scopes.test.ts
graphify affected "roleScope()" --depth 2              → dashboard-scopes.test.ts, resolveDashboardScopeChain()
graphify explain  "resolveDashboardScopeChain()"       → dashboard-scopes.test.ts; calls roleScope()   (API caller missed by AST, see below)
graphify explain  "canEditDashboard()"                 → DashboardPage(), requireDashboardEditPermission(), dashboard-layout.test.ts
graphify affected "validateDashboardLayout()" --depth 2 → saveLayout(), putDefaultLayout(), putScopedLayout(), dashboard-layout.test.ts
graphify affected "DashboardPageLayout" --depth 2      → No affected nodes found
graphify affected "dashboardPageSchema" --depth 2      → No affected nodes found
graphify affected "IDashboardLayoutRepository" --depth 2 → No affected nodes found
graphify explain  "D1DashboardLayoutRepository"        → repository.middleware.ts, dashboard-layout.repository.d1.test.ts
graphify path "dashboardLayoutApp" "resolveEffectivePermissions()"
                                                       → dashboardLayoutApp ← factory.ts → permission.middleware.ts → resolveEffectivePermissions()
                                                         (no direct edge yet; the new import is shared/ → slice, legal)
```

The AST graph under-reports imports from `@beechcms/core` across packages, so I confirmed them with grep.
Every consumer of a symbol this sprint deletes or reshapes:

| Symbol | Consumers outside core |
|---|---|
| `KNOWN_DASHBOARD_ROLES`, `roleScope` | `dashboard-layout.handler.ts:L13-14`, `dashboard-builder-dialog.tsx:L11-12,L36-42` |
| `isValidDashboardScope`, `resolveDashboardScopeChain` | `dashboard-layout.handler.ts:L11-12` only |
| `DEFAULT_DASHBOARD_SCOPE` | handler, `dashboard-builder-dialog.tsx:L10` (kept exported) |
| `listScopes` | handler `L147`, D1 repo + its test `L85-100`, handler unit stubs |
| `/:scope` and `/scopes` routes (RPC `AppType`) | `builder/api/dashboard-layout.api.ts:L11-26`, `dashboard-builder-dialog.test.tsx:L18-23` |
| GET `/` response field `scope` | `use-dashboard-layout.ts:L19-20,L40`, `use-dashboard-layout.test.ts:L42,L81` (mock shape) |

Breaking-change verdict:
- The core changes are additive except for the deletion of `dashboard-scopes.ts` and `listScopes`. Every consumer of those is edited in this sprint.
- No flow suite (`apps/api/test/flow/*`) and no other slice calls `/api/dashboard-layout`; grep finds no hit.
- `oauth-scope.middleware.test.ts:L75` lists `GET /api/dashboard-layout`, and that path is unchanged.
- `factory.docs-parity.test.ts:L53` checks only the `/api/dashboard-layout` prefix, which survives.
- The renderer crashes today on `pages: []` (`activePage.sections` at `dashboard-layout-renderer.tsx:L49`, with `activePage` coming from `L22`). The new server filter can produce that state, so the guard is mandatory, not polish.

### VETO Audit

1. **YAGNI.**
   - One new core module, the filter. It exists because the server must filter (rule 6), and sprints 3–5 reuse it: the builder's orphan display, the `requires` hook point, and the `manage_layout` lock decision.
   - No new table, migration, binding or slice.
   - `listScopes`, the scope chain, the known-role list, `/scopes` and `/:scope` are deleted, not deprecated: the brief drops all compatibility (§5).
   - The interim lock guard (409 `layout-locked`) is the smallest code that keeps the new filter from making a save destructive. Without it, a `manage_roles@*` holder who cannot read seed X would silently delete X's widgets on the next save. It is replaced by re-injection in ROADMAP entry 5.
2. **Botanical invariant.**
   - No handler gains SQL. The slice talks only to the injected repositories: `dashboardLayoutRepository`, `roleRepository`, `roleAssignmentRepository`.
   - `dashboard_layouts`, `roles` and `user_role_assignments` are structural tables with no Branch surface.
   - No content column is named. A widget's seed reference stays the opaque `config.seedSlug` key that core already documents (`dashboard-layout.ts:L11-13`).
3. **VSA.**
   - The slice imports `resolveEffectivePermissions` from `apps/api/src/shared/rbac/`, the same import `draft.handler.ts:L33` and `rbac/roles.ts:L6` use.
   - Role data reaches the slice through the injected `roleRepository`, never through `features/rbac/*`. The roles endpoint is a new route of the `dashboard-layout` slice (brief "Confini invalicabili").
   - Dashboard edits stay inside `features/dashboard/`.
   - Tests live in `features/dashboard-layout/test/integration/` and `packages/core/src/dashboard-layout/`.
4. **Core as the authorization source.**
   - The visibility rules live once, in core: `filterDashboardLayoutForViewer` calling `hasPermission`. The API only assembles the viewer, and sprint 3's UI imports the same function.
   - The write gate moves entirely into the route table. The split today (`manage_users@*` in middleware plus `canEditDashboard(jwt.role)` in the handler, brief §1 problem 2) disappears from the API.
5. **Cloudflare purity.** Two extra D1 reads per layout GET (`listActiveForUser`, which `resolveEffectivePermissions` already issues, plus the layout row). One `roles` read per PUT. No background work.
6. **Fail-closed.**
   - An orphan role id matches no active assignment, so it confers nothing (rule 13).
   - A tab with a non-empty `roles` list is hidden unless the caller holds one of those roles or `manage_roles@*`.
   - A seed-scoped `manage_roles` never satisfies the global check.
   - Unknown role ids at save are a 422 and are never stripped (rule 12).
   - Removed per-scope URLs fall out of the allowlist and answer 403 `route_not_registered`.
   - Legacy `role:*` rows are never read.

No violation found. Plan unchanged.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 1 closed the stats leak. The layout itself still leaks and still runs on the legacy axis:
- `GET /api/dashboard-layout` serves the whole stored layout to any authenticated caller. That includes widget configs that name seeds the caller cannot read (brief rule 6).
- The audience model is `users.role` (`resolveDashboardScopeChain(jwt.role)`, handler `L123-124`), so real RBAC roles are invisible (brief §1 problem 2).
- The write gate is split between the route table (`manage_users@*`, `permission.middleware.ts:L101-102`) and the handler (`canEditDashboard(jwt.role)`, `L28-39`).

This sprint establishes the server contract that every later dashboard sprint projects:
- one `default` layout;
- tabs that carry role ids;
- a server-side filter, defined once in core;
- a single RBAC write gate;
- a roles endpoint for editors.

It must land before sprint 3 (the UI renders and edits exactly this payload), sprint 4 (`requires` plugs into the same filter) and sprint 5 (the lock decision reuses `hiddenWidgetCount`). Brief §4: phases 2–4 must not touch phase-1 routes, and this sprint does not.

VSA: server work stays in the `dashboard-layout` slice plus the `shared/rbac` resolver it may import. Dashboard edits are confined to `features/dashboard/` and only delete what the server no longer serves. Botanical: no new SQL outside repositories, and no content columns.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Mount and middleware order.**
- `dashboardLayoutApp` is mounted at `routes.ts:L66` (`.route('/dashboard-layout', …)`), so wire paths are `/api/dashboard-layout/*`.
- Requests pass `authMiddleware` → `oauthScopeMiddleware` → `permissionMiddleware()`. The order is stated at `permission.middleware.ts:L262-278`.
- `permissionMiddleware` refuses in this order: deactivated → unregistered → missing permission. It memoizes `effectivePermissions` in the context (`effective-permissions.ts:L28-29`, `L44`), so a handler calling `resolveEffectivePermissions` after a `perm` row issues no extra read.

**Route table today** (`permission.middleware.ts`):

| Line | Row |
|---|---|
| `L100` | `GET /^\/api\/dashboard-layout(\/.*)?$/` → `AUTHED` |
| `L101` | `PUT /^\/api\/dashboard-layout(\/.*)?$/` → `perm('manage_users','global')` |
| `L102` | `DELETE /^\/api\/dashboard-layout(\/.*)?$/` → `perm('manage_users','global')` |

**Handler today** (`dashboard-layout.handler.ts`):

| Route | Line | Behaviour |
|---|---|---|
| `GET /` | `L122-137` | Walks `resolveDashboardScopeChain(jwt.role)` and returns the first stored `{ scope, layout }`, auto-cleaned by `validateDashboardLayout`. No filtering. |
| `GET /scopes` | `L143-150` | Gate: `canEditDashboard(jwt.role)`. Returns the closed scope list plus a `stored` flag. |
| `GET /:scope` | `L156-169` | Gate: `canEditDashboard`. Returns the raw stored layout of any scope. |
| `PUT /` | `L175` | Chain: `requireDashboardEdit` → `zodJson(dashboardLayoutSchema, rejectInvalidLayoutBody)` → `saveLayout` (`L86-102`). |
| `DELETE /` | `L180-186` | Gate: `canEditDashboard`, then `remove('default')`. |
| `PUT /:scope` | `L191` | `requireValidScope` + the same chain as `PUT /`. |
| `DELETE /:scope` | `L196-205` | `canEditDashboard` + scope validation, then remove. |

Problem helper: `publicProblem` (`../../public/errors/problem-details`). Errors in use: `forbidden` (403), `invalid-scope` (400), `invalid-json` (400), `invalid-layout` (422).

**Core layout contract** (`packages/core/src/dashboard-layout/dashboard-layout.ts`):
- `DashboardPageLayout` (`L38-46`) has no audience field. Its schema is `dashboardPageSchema` (`L96-102`), and `ID_MAX = 64` (`L72`).
- `validateDashboardLayout(layout, ctx)` (`L223-301`):
  - auto-strips widgets whose `config.seedSlug` is not registered (warning);
  - errors on duplicate page slugs, bad spans, duplicate widget ids and oversize configs;
  - always returns `cleaned`.
- `DashboardLayoutContext` (`L206-212`) is `{ seedSlugs, knownWidgetTypes? }`.

**Scope helpers** (`dashboard-scopes.ts`): `KNOWN_DASHBOARD_ROLES = ['admin','editor']`, `DEFAULT_DASHBOARD_SCOPE = 'default'`, `roleScope`, `isValidDashboardScope`, `resolveDashboardScopeChain`. They are re-exported at `index.ts:L89`.

**Repository** (`dashboard-layout.repository.ts`): `get(scope)`, `listScopes()`, `upsert(scope, layout, updatedBy)`, `remove(scope)`. The table is keyed by `scope` (migration `0000_v040_base.sql`). Legacy `role:admin` / `role:editor` rows may exist in local DBs.

**RBAC data available to a slice through the context:**
- `roleAssignmentRepository.listActiveForUser(userId)`: decay-filtered, returns `PermissionAssignment[]` with `roleId`.
- `roleRepository.listAll()`: `RoleRecord[]` ordered by name, with `id`, `name`, `icon`, `permissions`, …
- Both are already read by `features/setup/index.ts` and `shared/rbac/effective-permissions.ts`.
- Role ids are UUIDv4 (`d1-role.repository.ts:L77`, migration `0032:L93-99`).

**Dashboard consumers:**
- `dashboard.api.ts:L9-10`: `rpc.api['dashboard-layout'].$get()`.
- `use-dashboard-layout.ts`: `layout ?? generatedDefault`, `scope`.
- `dashboard-builder-dialog.tsx`: scope selector `L36-42`, `L48-97`, `L106-122`; three queries `L63-77`; save/reset with `scope` `L192`, `L207`.
- `builder/api/dashboard-layout.api.ts`: `getLayout(scope)`, `getScopes`, `saveLayout(scope, …)`, `resetLayout(scope)`.
- `dashboard-page.tsx:L22`: `canEditDashboard(user?.role)`. Unchanged this sprint.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Core:
1. `packages/core/src/dashboard-layout/dashboard-layout.ts`: EDIT (T1). Adds `roles`, `MAX_ROLES_PER_PAGE` and `roleIds` validation.
2. `packages/core/src/dashboard-layout/dashboard-layout-audience.ts`: NEW (T2). Contains `filterDashboardLayoutForViewer`.
3. `packages/core/src/dashboard-layout/dashboard-scopes.ts` and `dashboard-scopes.test.ts`: DELETE (T3).
4. `packages/core/src/dashboard-layout/dashboard-layout.repository.ts`: EDIT (T3). Gains `DEFAULT_DASHBOARD_SCOPE`, loses `listScopes`.
5. `packages/core/src/index.ts`: EDIT (T3). Swaps the export line.

API:
6. `apps/api/src/features/dashboard-layout/dashboard-layout.handler.ts`: REWRITE (T4).
7. `apps/api/src/middleware/permission.middleware.ts`: EDIT (T5). Changes the dashboard-layout rows.
8. `apps/api/src/shared/db/repositories/dashboard-layout.repository.d1.ts`: EDIT (T3). Removes `listScopes`.

Dashboard (contract follow-through, T6):
9. `apps/dashboard/src/features/dashboard/builder/api/dashboard-layout.api.ts`
10. `apps/dashboard/src/features/dashboard/builder/dashboard-builder-dialog.tsx`
11. `apps/dashboard/src/features/dashboard/hooks/use-dashboard-layout.ts`
12. `apps/dashboard/src/features/dashboard/renderer/dashboard-layout-renderer.tsx`
13. `apps/dashboard/src/locales/en.json`, `apps/dashboard/src/locales/it.json`

Tests (T7):
14. `packages/core/src/dashboard-layout/dashboard-layout-audience.test.ts`: NEW.
15. `packages/core/src/dashboard-layout/dashboard-layout.test.ts`: EDIT.
16. `apps/api/src/features/dashboard-layout/test/integration/dashboard-layout.integration.test.ts`: NEW.
17. `apps/api/src/features/dashboard-layout/dashboard-layout.handler.test.ts`: DELETE. Its contracts are ported to 16.
18. `apps/api/src/middleware/permission.middleware.test.ts`: EDIT.
19. `apps/api/src/shared/db/repositories/dashboard-layout.repository.d1.test.ts`: EDIT. Drop the `listScopes` describe.
20. Dashboard unit tests, EDIT: `dashboard-builder-dialog.test.tsx`, `use-dashboard-layout.test.ts`, `dashboard-layout-renderer.test.tsx`.

The sprint ships no migration and no `docs/` edit (sprint 9). Do not hand-edit `docs/api/**`, which is generated.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### T1 — Tab audience in the layout contract (`packages/core/src/dashboard-layout/dashboard-layout.ts`)

Add to `DashboardPageLayout` (`L38-46`), verbatim:

```ts
  /** Ids (not names) of the roles this tab targets. Absent or empty = every caller.
   *  Non-empty = callers holding at least one of them through an active assignment, at any scope. */
  roles?: string[]
```

Add next to `MAX_WIDGETS_PER_COLUMN` (`L71`), verbatim:

```ts
export const MAX_ROLES_PER_PAGE = 32
```

In `dashboardPageSchema` (`L96-102`), add
`roles: z.array(z.string().min(1).max(ID_MAX)).max(MAX_ROLES_PER_PAGE).optional()`.

Add to `DashboardLayoutContext` (`L206-212`), verbatim:

```ts
  /** Optional: ids of every existing role. When provided, a page naming an id outside this set
   *  is an ERROR (never stripped: emptying the list would make the tab public). */
  roleIds?: ReadonlySet<string>
```

Rules for `validateDashboardLayout`:
- When `ctx.roleIds` is provided, each unknown id in a page's `roles` pushes the error ``Page '${page.slug}': unknown role id '${id}'.``. Check it in the existing page loop (`L255`).
- When `ctx.roleIds` is absent, `roles` is not checked. This is the GET path and the dashboard client: orphans survive in storage and confer nothing.
- `cleaned` keeps `roles` byte-identical. Auto-cleanup never touches it.
- `generateDefaultDashboardLayout` is unchanged: its single page has no `roles`.

### T2 — Viewer filter (`packages/core/src/dashboard-layout/dashboard-layout-audience.ts`, NEW)

File header: MIT SPDX, same two lines as `dashboard-layout.ts:L1-2`.

Imports:
- `GLOBAL_SCOPE` from `'../rbac/permissions.js'`;
- `hasPermission` from `'../rbac/evaluate.js'`;
- `type EffectivePermissions` from `'../rbac/types.js'`;
- layout types from `'./dashboard-layout.js'`.

Add these exports, verbatim:

```ts
/** Who is looking at the dashboard, as resolved for one request. */
export interface DashboardLayoutViewer {
  /** Ids of the roles the caller holds through at least one active (decay-filtered) assignment, at any scope. */
  readonly roleIds: ReadonlySet<string>
  /** The caller's effective authority. */
  readonly permissions: EffectivePermissions
}

export interface FilteredDashboardLayout {
  readonly layout: DashboardLayout
  /** Widgets removed because their `config.seedSlug` names a seed the viewer may not `content:read`. */
  readonly hiddenWidgetCount: number
}

/**
 * The part of a layout one viewer may receive. The layout is never the authority: this
 * projection is applied by the server before serving, and data routes enforce RBAC on their own.
 */
export function filterDashboardLayoutForViewer(
  layout: DashboardLayout,
  viewer: DashboardLayoutViewer,
): FilteredDashboardLayout
```

Rules, applied in this order. Every check goes through `hasPermission`:
1. **Structural viewer.** `seesAllTabs = hasPermission(viewer.permissions, 'manage_roles', GLOBAL_SCOPE)`. A seed-scoped `manage_roles` never qualifies, because of the core asymmetry (`evaluate.ts:L60-71`).
2. **Tab audience** (only when `!seesAllTabs`):
   - A page whose `roles` is non-empty and shares no id with `viewer.roleIds` is dropped whole.
   - Absent or empty `roles` passes.
   - The union of the caller's roles applies, with no priority between them (rule 7).
3. **Seed-bound widgets** (every viewer):
   - A widget whose `config.seedSlug` is a non-empty string and fails `hasPermission(permissions, 'content:read', seedSlug)` is removed and counted in `hiddenWidgetCount`.
   - Widgets with no `seedSlug` always pass. `requires` arrives in sprint 4 and plugs in here.
   - Only widgets of pages that survive step 2 are counted.
4. **Pruning** (only when `!seesAllTabs`; rule 5):
   - A section whose columns are all empty after step 3 is dropped.
   - A page left with zero sections is dropped.
   - Columns are never dropped (spans stay parallel).
5. **Editor view** (`seesAllTabs`): no page, section or column is dropped, and `roles` is kept so the builder can show audiences and orphans (sprint 3). Only step 3 applies.
6. **Minimal disclosure:** for `!seesAllTabs`, `roles` is omitted from every served page. A reader never learns the role ids of a tab.
7. The result may have `pages: []`.
8. The function is pure and deterministic. It never mutates its input and never throws. `version` is preserved, as are order and every other field.

Run it on the output of `validateDashboardLayout(...).cleaned`, never on raw storage. That way a widget on a *deleted* seed is cleaned and stays out of `hiddenWidgetCount`, and only *unreadable* seeds count as hidden.

### T3 — Remove the per-role scope machinery (core + D1)

- Delete `packages/core/src/dashboard-layout/dashboard-scopes.ts` and `dashboard-scopes.test.ts`.
- Move `export const DEFAULT_DASHBOARD_SCOPE = 'default'` into `dashboard-layout.repository.ts` with the doc line "Storage key of the one dashboard layout. Rows under any other key are ignored." Its consumers are the handler and the builder dialog.
- Remove `listScopes()` from `IDashboardLayoutRepository` (`dashboard-layout.repository.ts:L16-17`) and from `D1DashboardLayoutRepository` (`dashboard-layout.repository.d1.ts:L32-37`). `get`, `upsert` and `remove` keep their `scope` parameter. Why: the table stays keyed by scope, and changing the signature buys nothing.
- `packages/core/src/index.ts:L89`: replace the `dashboard-scopes.js` line with `export * from './dashboard-layout/dashboard-layout-audience.js'`.
- `canEditDashboard` / `ROLES_ALLOWED_TO_EDIT_DASHBOARD` (`dashboard-permissions.ts`) stay as they are. The dashboard page still reads them, and sprint 3 removes them.
- No migration. Legacy `role:*` rows are left in place and never read (brief rule 3, §5 no compat).

### T4 — Handler rewrite (`apps/api/src/features/dashboard-layout/dashboard-layout.handler.ts`)

Imports:
- From `@beechcms/core`: `dashboardLayoutSchema`, `validateDashboardLayout`, `filterDashboardLayoutForViewer`, `DEFAULT_DASHBOARD_SCOPE`, `type DashboardLayout`, `type DashboardLayoutViewer`.
- `resolveEffectivePermissions` from `'../../shared/rbac/effective-permissions'`.
- Remove: `canEditDashboard`, `isValidDashboardScope`, `resolveDashboardScopeChain`, `roleScope`, `KNOWN_DASHBOARD_ROLES`, `requireDashboardEditPermission`, `requireDashboardEdit`, `invalidScopeProblem`, `requireValidScope`, `putScopedLayout`.
- Keep: `rejectInvalidLayoutBody` (`L68-83`) and the one-method-chain registration (`L112-115` comment, so the route types reach `AppType`).

Module-private helpers, signatures verbatim:

```ts
/** The caller as the core filter sees them: active role ids at any scope + effective authority. */
async function resolveLayoutViewer(context: AppContext): Promise<DashboardLayoutViewer>

/** The stored layout, auto-cleaned against the seed registry, or null when nothing is stored. */
async function loadStoredLayout(context: AppContext): Promise<DashboardLayout | null>

/** 409 `layout-locked` when the stored layout holds widgets this caller cannot read, else undefined. */
async function refuseIfLocked(context: AppContext): Promise<Response | undefined>
```

How each helper behaves:
- `resolveLayoutViewer`:
  - `roleIds` = the set of `roleId` from `context.get('roleAssignmentRepository').listActiveForUser(sub)`. Use an empty set when `sub` is absent.
  - `permissions` = `await resolveEffectivePermissions(context)`.
  - The assignment read duplicates the one inside the resolver. That is accepted: one indexed read, and widening the god node's contract for one consumer is not worth it.
- `loadStoredLayout`:
  - reads only `DEFAULT_DASHBOARD_SCOPE`;
  - runs `validateDashboardLayout(record.layout, { seedSlugs })` with `seedSlugs` from `seedRegistry.all()`, the same as today's `L131-132`;
  - returns `cleaned`.
- `refuseIfLocked`:
  - stored null → undefined;
  - otherwise `filterDashboardLayoutForViewer(stored, viewer).hiddenWidgetCount > 0` → the problem below, else undefined.

Error code (new), verbatim:

```ts
{ type: 'layout-locked', title: 'Layout locked', status: 409,
  detail: 'The stored layout contains widgets on seeds you cannot read; saving or resetting it would remove them.' }
```

Routes, in this order inside the chain:

- **`GET /`** (any authenticated caller):
  - `stored = await loadStoredLayout(context)`.
  - If null, answer `200 { layout: null }`.
  - Otherwise answer `200 { layout: filterDashboardLayoutForViewer(stored, await resolveLayoutViewer(context)).layout }`.
  - Both answers carry `Cache-Control: no-store`, because the body is a per-caller authorization projection (same header as `stats/recent-activity`).
  - The `scope` field is gone from the response. Type the null branch as `null as DashboardLayout | null`, as at `L136`, so RPC inference stays a union.
- **`GET /roles`** (route gate `manage_roles@*`, T5):
  - Answer `200` with `(await roleRepository.listAll()).map(r => ({ id: r.id, name: r.name, icon: r.icon ?? null }))` and `Cache-Control: no-store`.
  - Repository order (by name) is kept.
  - No `permissions`, `description` or `isSystem` leaves the server.
  - Wire shape, verbatim (sprint 3 consumes it via RPC inference): `Array<{ id: string; name: string; icon: string | null }>`.
- **`PUT /`** (route gate `manage_roles@*`): chain `zodJson(dashboardLayoutSchema, rejectInvalidLayoutBody)` → `putLayout`. `putLayout` steps:
  1. `validateDashboardLayout(body, { seedSlugs, roleIds })`, where `roleIds = new Set((await roleRepository.listAll()).map(r => r.id))`. Failure → 422 `invalid-layout` with `errors.join('; ')` (existing shape, `L89-96`).
  2. `refuseIfLocked` → 409.
  3. `upsert(DEFAULT_DASHBOARD_SCOPE, cleaned, sub ?? 'unknown')`.
  4. Answer `200 { ok: true, layout: cleaned, warnings }`. The shape is unchanged.
- **`DELETE /`** (route gate `manage_roles@*`): `refuseIfLocked` → 409. Then `remove(DEFAULT_DASHBOARD_SCOPE)` → `200 { ok: true }`.

Rules:
- The handler makes **no** authorization check of its own for PUT/DELETE/`roles`. The route row is the gate (brief §1 problem 2 resolved). The 409 is a data-integrity precondition, not a permission.
- Order inside PUT: body errors (400/422) come before 409, so a bad body is diagnosed whatever the stored state.
- `jwtPayload.role` is no longer read anywhere in the slice.
- Docblock of each route: one or two lines, stating who may call it and that `GET /` is a scope projection (mirror the wording at `permission.middleware.ts:L109-111`).

### T5 — Route table (`apps/api/src/middleware/permission.middleware.ts`)

Replace `L99-102` with these rows, verbatim, at the same position:

```ts
  // --- dashboard layout --------------------------------------------------------
  // The handler's projection is the authorization decision for the read: tabs outside the
  // caller's role audience and widgets on seeds they cannot read never leave the server.
  { method: 'GET',    pattern: /^\/api\/dashboard-layout\/?$/,             requirement: AUTHED },
  // Editing is structural (tab audiences) until `manage_layout` exists: `manage_roles@*` only.
  { method: 'GET',    pattern: /^\/api\/dashboard-layout\/roles$/,         requirement: perm('manage_roles', 'global') },
  { method: 'PUT',    pattern: /^\/api\/dashboard-layout\/?$/,             requirement: perm('manage_roles', 'global') },
  { method: 'DELETE', pattern: /^\/api\/dashboard-layout\/?$/,             requirement: perm('manage_roles', 'global') },
```

Rules:
- The `(\/.*)?` wildcard is gone. `/api/dashboard-layout/scopes` and `/api/dashboard-layout/<anything>` now answer 403 `route_not_registered` (fail-closed), which is the intended state for the removed per-scope URLs.
- The completeness guard (`permission.middleware.test.ts:L14-21`) keeps the three mounted routes mapped. Hono reports the bare route as `/api/dashboard-layout` or with a trailing slash, and the patterns accept both.

### T6 — Dashboard contract follow-through (`apps/dashboard/src/features/dashboard/`)

Only what stops compiling or calls a removed route. No new UI: tab audiences, the roles picker, the empty state and the edit-gate change are sprint 3.

- **`builder/api/dashboard-layout.api.ts`**:
  - `getLayout()` → `rpc.api['dashboard-layout'].$get()`;
  - `saveLayout(layout)` → `.$put({ json: layout })`;
  - `resetLayout()` → `.$delete()`;
  - delete `getScopes`;
  - update the docblocks (the editor's view is the filtered GET, which for `manage_roles@*` keeps every tab).
- **`builder/dashboard-builder-dialog.tsx`**:
  - Delete `SCOPE_OPTIONS` (`L36-42`), the `scope` / `pendingScope` state and the scope-change handlers (`L48-59`, `L85-97`).
  - Delete the default-scope and scopes queries (`L68-77`), the `Select` and `Badge` header block (`L105-123`) and the discard `ConfirmDialog` (`L145-156`). It only guarded scope switches.
  - Keep one query, `['dashboard-builder-layout']` → `dashboardBuilderApi.getLayout()`, enabled when `open`.
  - `draftSource = data?.layout ?? generatedDefault ?? initialLayout`.
  - `BuilderPaneController` loses the `scope` prop and `onScopeMutated` becomes `refetch` of that one query.
  - Drop the now-unused imports: `DEFAULT_DASHBOARD_SCOPE`, `roleScope`, `KNOWN_DASHBOARD_ROLES`, `Select*`, `Badge`, `ConfirmDialog`.
  - Delete `isDirty` state, the open-reset idiom (`L52-59`), the `onDirtyChange` prop and its effect (`L178-180`). Why: their only purpose was the scope-switch discard prompt.
- **`hooks/use-dashboard-layout.ts`**: remove `scope` from `UseDashboardLayoutResult` (`L19-20`) and from the returned object (`L40`). No other consumer reads it (grep-verified).
- **`renderer/dashboard-layout-renderer.tsx`**:
  - When `layout.pages.length === 0`, render nothing: return `null` before the `Tabs` and section markup. The `useSearchParams` hook call stays above the guard (rules of hooks).
  - Why: the server can now serve `pages: []` and `L49` would dereference `undefined`. The explicit empty state is sprint 3.
- **`locales/en.json`, `locales/it.json`**: delete the `dashboard.builder.scope` object (en `L266-272`, it at the same block). Keep both files in parity.
- `dashboard-page.tsx`: no change. The `canEditDashboard(user?.role)` button gate is sprint 3. In this interim, a legacy-admin user without `manage_roles@*` sees the button and gets a save error toast (403). This is accepted. Canonical admins hold SuperAdmin.

### T7 — Tests

**7a. Unit — `packages/core/src/dashboard-layout/dashboard-layout-audience.test.ts` (NEW)**

- Tier: unit (pure).
- Fixtures: layout literals in the style of `dashboard-layout.test.ts`, with seed slugs `posts` / `authors` (the canonical seed names) and role ids as UUIDv4 literals declared once as named constants.
- `EffectivePermissions` is built with core `buildEffectivePermissions(assignments, roles)` (`evaluate.ts:L16`), never as hand-made Sets. Rule 3.10: call the pure function.

`describe('filterDashboardLayoutForViewer')`:
- A tab with no `roles` reaches a viewer with no assignment, provided it holds a widget with no `seedSlug`.
- A tab targeted at role A is absent for a viewer holding only role B.
- A tab targeted at `[A, B]` is present for a viewer holding B at a seed scope. Any scope counts.
- A tab whose only role id is held by nobody (orphan) is absent for every non-`manage_roles@*` viewer.
- A `manage_roles@*` viewer receives every tab with its `roles` preserved, audience tabs included.
- A viewer holding `manage_roles` only on `posts` is filtered like any reader. A scoped grant never satisfies the global check.
- A widget whose `seedSlug` is `authors` is removed for a `content:read@posts` viewer, and `hiddenWidgetCount` is 1.
- A widget on `posts` is kept for the same viewer.
- A section whose widgets were all removed is dropped, and a tab left with no section is dropped, for a reader.
- For a `manage_roles@*` viewer lacking `content:read@authors`:
  - the emptied section, the authored-empty section and the tab all remain;
  - only the widget is removed;
  - `hiddenWidgetCount` is 1.
- A reader's served pages carry no `roles` key.
- The input layout is deep-equal before and after the call, and two calls return deep-equal results.

**7b. Unit — `packages/core/src/dashboard-layout/dashboard-layout.test.ts` (EDIT)**

- Keep the `canEditDashboard` describe (`L394-402`) unchanged. The symbol survives until sprint 3.
- New `it()`s:
  - `dashboardPageSchema` accepts `roles` with UUID strings and rejects `MAX_ROLES_PER_PAGE + 1` entries and an empty-string id.
  - `validateDashboardLayout` with `roleIds` errors on an unknown id, naming the page slug and the id, and keeps `cleaned.pages[0].roles` intact.
  - `validateDashboardLayout` without `roleIds` accepts an unknown id with no error and no warning.
  - `validateDashboardLayout` with `roleIds` containing every listed id returns `ok: true`.

**7c. Integration — `apps/api/src/features/dashboard-layout/test/integration/dashboard-layout.integration.test.ts` (NEW)**

Setup:
- Tier: integration (real D1, full middleware chain). `describe('dashboard-layout slice — integration (real D1)')`.
- Fixtures: canonical seeds `posts`, `authors` and `CANONICAL_USERS` from `@beechcms/testing`. The baseline is copied from `stats-scope-isolation.integration.test.ts:L68-86`.
- Roles and assignments are inserted by SQL into structural tables (rule 3.8), with UUIDv4 ids declared as constants:
  - role `layout-reader` = {`content:read`};
  - role `layout-audience` = {} (no permission: it exists only to be targeted by a tab);
  - role `layout-role-manager` = {`manage_roles`};
  - role `layout-user-manager` = {`manage_users`}.
- `beforeEach`:
  - deletes `dashboard_layouts` rows;
  - deletes `viewer`'s assignments;
  - assigns `viewer` `layout-reader` at `posts`.
- Stored layouts are arranged through `admin.put('/api/dashboard-layout', …)`; admin is SuperAdmin.
- A local `layoutWith(pages)` helper builds bodies.
- The legacy-row test is the one SQL insert into `dashboard_layouts` (no route can write a `role:*` row any more).

Required comments:
- the decay-filter coupling (the `posts` scope resolves only because the harness provisions the seed row);
- why the 409 exists, citing the ROADMAP entry 5 replacement;
- why removed URLs answer `route_not_registered`, not 404.

`it()` list:
- `GET /api/dashboard-layout` returns 200 `{ layout: null }` with `Cache-Control: no-store` when nothing is stored.
- `GET /api/dashboard-layout` ignores a legacy `role:editor` row: with only that row stored, `viewer` and `admin` both get `{ layout: null }`.
- `GET /api/dashboard-layout` omits a tab targeted at `layout-audience` for `viewer`, and serves it once `viewer` is also assigned `layout-audience` at `posts`. Two `it()`s.
- `GET /api/dashboard-layout` serves `viewer` the `posts` widget and not the `authors` widget of a shared tab. The raw response text contains no `authors` substring (rule 6, minimal disclosure).
- `GET /api/dashboard-layout` drops for `viewer` a tab whose every widget is bound to `authors`.
- `GET /api/dashboard-layout` serves `admin` every tab with `roles` intact, including a tab targeted at a role `admin` does not hold.
- A tab served to `viewer` carries no `roles` key.
- `PUT /api/dashboard-layout` with a known role id persists it: 200, and `admin`'s GET returns the tab with that `roles` array.
- `PUT /api/dashboard-layout` with an unknown role id answers 422 `invalid-layout` and persists nothing (row count 0).
- `PUT /api/dashboard-layout` refuses with 403 `forbidden`, persisting nothing, these callers (matrix, rule 1.6): `viewer`, and `viewer` re-assigned `layout-user-manager` at `*`. The latter is the regression guard: the old gate was `manage_users@*`.
- `PUT /api/dashboard-layout` answers 409 `layout-locked` to a `manage_roles@*` holder without `content:read@authors` when the stored layout holds an `authors` widget. The stored row is byte-unchanged.
- `PUT /api/dashboard-layout` succeeds (200) for the same `manage_roles@*` holder when the stored layout has no seed-bound widget they cannot read.
- `DELETE /api/dashboard-layout` removes the row for `admin`: 200, row count 0.
- `DELETE /api/dashboard-layout` answers 409 `layout-locked` to the locked holder above, and the row still exists.
- `DELETE /api/dashboard-layout` refuses `viewer` with 403 `forbidden`, and the row still exists.
- `GET /api/dashboard-layout/roles` serves `admin` every role as exactly `{ id, name, icon }`, SuperAdmin included, with no `permissions` key.
- `GET /api/dashboard-layout/roles` refuses `viewer` with 403 `forbidden`.
- The removed per-scope URLs answer 403 `route_not_registered` to `admin` (matrix): `GET /scopes`, `GET /role:editor`, `PUT /role:editor`, `DELETE /role:editor`.
- Ported from the deleted unit file, one `it()` each, `admin` as caller:
  - malformed JSON → 400 `invalid-json`;
  - `{ version: 2, pages: [] }` → 422 `invalid-layout`;
  - above `MAX_DASHBOARD_LAYOUT_BYTES` → 422, nothing persisted;
  - duplicate widget ids → 422, with the detail naming the id;
  - a widget on an unregistered seed is stripped, with a warning, and the cleaned layout is persisted;
  - an unknown widget type is persisted unchanged with no warning.

**7d. Unit — `apps/api/src/middleware/permission.middleware.test.ts` (EDIT)**

- Add one matrix `it()`, "every dashboard-layout route resolves to its own requirement", array-driven like `L31-48`:
  - `GET /api/dashboard-layout` → authenticated;
  - `GET …/roles`, `PUT /api/dashboard-layout`, `DELETE /api/dashboard-layout` → `manage_roles`@global.
- Add one `it()`: `resolveRouteRule` returns `null` for `GET /api/dashboard-layout/scopes` and `PUT /api/dashboard-layout/role:editor`.

**7e. Unit — `apps/api/src/shared/db/repositories/dashboard-layout.repository.d1.test.ts` (EDIT)**

- Delete the `listScopes` describe (`L85-100`). Nothing else changes.

**7f. Dashboard unit tests (EDIT)**

- `dashboard-builder-dialog.test.tsx`:
  - The rpc mock (`L12-23`) becomes `"dashboard-layout": { $get, $put, $delete }`. `$get` resolves `{ json: async () => ({ layout: null }) }`.
  - Assertions change to `$put` called with `{ json: objectContaining({ version: 1 }) }` (`L102-105`) and `$delete` called once with no argument (`L145`).
  - The three existing `it()`s keep their names and outcomes.
- `use-dashboard-layout.test.ts`: the mock bodies at `L42`, `L81` become `{ layout: … }` (no `scope`). The existing `it()`s are otherwise unchanged.
- `dashboard-layout-renderer.test.tsx`: new `it()` — a layout with `pages: []` renders no tab list and no section, and does not throw.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# core contract compiles; dashboard-scopes is gone from the barrel
cd packages/core && pnpm run build

# api + dashboard typecheck (RPC AppType changed)
cd apps/api && npx tsc --noEmit
cd apps/dashboard && npx tsc --noEmit

# scoped run while iterating, then the full workspace
pnpm beech test --diff
pnpm beech test

pnpm beech lint

# no consumer of the deleted scope machinery may survive (expect no output outside docs/ and dist/)
rg -n "KNOWN_DASHBOARD_ROLES|roleScope|isValidDashboardScope|resolveDashboardScopeChain|listScopes|builder\.scope\." apps packages -g '!**/dist/**' -g '!**/node_modules/**'

graphify update . --force
```

`apps/api` `tsc` carries 51 known errors in untouched test files (sprint 1 review, note 2). The criterion is **no new error** in any file this sprint touches. Compare against that baseline.

Manual check (optional, `pnpm beech dev`):
- Sign in as SuperAdmin, open the builder, save. The scope selector is gone and the save succeeds.
- Sign in as an account holding only `content:read` on one seed. The dashboard shows only widgets on that seed, or nothing at all (blank, no crash) when no widget survives.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `DashboardPageLayout.roles?: string[]`, `MAX_ROLES_PER_PAGE = 32`, `DashboardLayoutContext.roleIds?` and the T2 exports (`DashboardLayoutViewer`, `FilteredDashboardLayout`, `filterDashboardLayoutForViewer`) exist in `@beechcms/core` with the exact T1/T2 shapes. Core gains no dependency.
- [ ] `dashboard-scopes.ts` is deleted. `DEFAULT_DASHBOARD_SCOPE` is still exported. `listScopes` exists nowhere. The `rg` in SECTION 5 prints nothing outside `docs/` and `dist/`.
- [ ] `filterDashboardLayoutForViewer` decides every case through core `hasPermission`. The API contains no copy of the audience or seed rule.
- [ ] `GET /api/dashboard-layout`:
  - reads only the `default` row;
  - serves `{ layout }` filtered for the caller, with `Cache-Control: no-store`;
  - never includes a tab outside the caller's audience (unless `manage_roles@*`), a widget on an unreadable seed, or a reader-facing `roles` key.
- [ ] An unknown role id at save is a 422 `invalid-layout`, and nothing is persisted. Orphan ids in storage confer nothing.
- [ ] `PUT`/`DELETE /api/dashboard-layout` and `GET /api/dashboard-layout/roles` are gated by `perm('manage_roles','global')` in the route table only. The slice reads neither `jwtPayload.role` nor `canEditDashboard`.
- [ ] PUT/DELETE answer 409 `layout-locked`, writing nothing, when the stored layout holds widgets the caller cannot read.
- [ ] `GET /api/dashboard-layout/roles` returns exactly `{ id, name, icon }` per role, ordered by name.
- [ ] Every former per-scope URL answers 403 `route_not_registered`.
- [ ] `dashboard-layout.handler.ts` imports nothing from another `features/*` slice (in particular not `features/rbac`). The new test file imports nothing from another slice or test file.
- [ ] Dashboard:
  - the builder has no scope selector and calls only `GET`/`PUT`/`DELETE /api/dashboard-layout`;
  - `useDashboardLayout` has no `scope`;
  - the renderer survives `pages: []`;
  - the `dashboard.builder.scope` keys are gone from both locales.
- [ ] Every new or edited test follows `testing_conventions.md`:
  - SPDX header;
  - four zones;
  - status first;
  - typed bodies;
  - no `any`;
  - no `Date.now()`;
  - no `it.only`/`skip`;
  - the §6.2 comments.

  The deleted `dashboard-layout.handler.test.ts` (which used `as any`) has every contract re-covered in 7c.
- [ ] `pnpm run build` (core), `npx tsc --noEmit` (dashboard; api: no new error), `pnpm beech test` and `pnpm beech lint` pass.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executor MUST NOT build or modify:

- Any builder UI for tab audiences:
  - the multi-select role picker;
  - the "ruolo eliminato" orphan chip;
  - the explicit empty state;
  - the fallback to the first visible tab when `?page=` names a hidden one (today's renderer already falls back to `pages[0]`);
  - layout-query invalidation when assignments change;
  - consuming `GET /api/dashboard-layout/roles`.

  All of these are ROADMAP entry 3 (`DashboardTabAudienceUi`).
- The dashboard edit gate: `canEditDashboard`, `ROLES_ALLOWED_TO_EDIT_DASHBOARD`, `user.role` in `dashboard-page.tsx`, and the dashboard protected-routes table. These are ROADMAP entry 3. They stay exported from core.
- `requires` on widget definitions, renderer/palette filtering, and default-generator exclusion. These are ROADMAP entry 4. The generator stays as it is.
- `manage_layout`, the content-vs-structure save diff, opaque locked placeholders, server-side re-injection of locked widgets, and compare-and-swap on `updated_at`. These are ROADMAP entries 5–6. The 409 `layout-locked` guard is the interim, and entry 5 replaces it.
- Any change to `/api/content/stats/*` (sprint 1 routes, brief §4).
- `manage_seeds`, `/api/seeds/*`, the entry-editor `/api/schema/:slug/layout` rows, and the removal of `users.role`, the JWT `role` claim, `requireAdmin` or `isDeveloper`. These are ROADMAP entries 7–8.
- A migration, or deletion of legacy `role:*` rows. They are ignored, per brief rule 3.
- A cleanup hook on role deletion (brief §5, discarded).
- Moving `resolveLayoutViewer` to `shared/`, or extending `resolveEffectivePermissions` to expose role ids. One consumer only (YAGNI).
- Docs under `docs/` (`docs/reference/dashboard-layout.md` included). These are ROADMAP entry 9. Generated `docs/api/**` must not be hand-edited.
