# Sprint Plan — ManageLayoutPermissionApi (ROADMAP entry 5)

Feature brief: `stages/00_ideation/output/feature_brief.md` (rules 14–21; §4 "Stati di errore", "Vincoli temporali e di
concorrenza", "Vincoli sui permessi").
Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md`, entry 5. Entries 1–4 are shipped (`30473871`, `b64a39d9`,
`185b13d1`, `9e47d33c`) and archived in `docs/Sprints/DashboardDataScopeClosure/`, `DashboardTabAudienceApi/`,
`DashboardTabAudienceUi/` and `WidgetPermissionRequirements/`.

### Pre-Computation Analysis

Graph refreshed with `graphify update . --force` (29 014 nodes, 41 723 edges) before any query.

**a) God nodes identified via the CLI**

| Node | Source | Degree / reach | Why it matters here |
|------|--------|----------------|---------------------|
| `hasPermission()` | `packages/core/src/rbac/evaluate.ts:L64` | 15 (`graphify explain`) | The single authorization question. Every new decision (editor test, lock predicate, structural gate) is built on it. No second evaluator is introduced. |
| `filterDashboardLayoutForViewer()` | `packages/core/src/dashboard-layout/dashboard-layout-audience.ts:L32` | callers: `refuseIfLocked`, `putLayout`, its test | Gains the editor projection (placeholders) and the full lock predicate. `hiddenWidgetCount` loses its only consumer and is removed. |
| `resolveCoreWidgetRequirement()` | `packages/core/src/dashboard-layout/widget-requirements.ts:L90` | 12 dependents (core layout, audience, dashboard registry, tests) | Becomes part of the server lock predicate, as the sprint-4 plan intended. Its table is unchanged. |
| `D1DashboardLayoutRepository` | `apps/api/src/shared/db/repositories/dashboard-layout.repository.d1.ts:L8` | `repository.middleware.ts`, `createBeechApp()`, its test | `upsert` becomes a compare-and-swap `save`, and `remove` becomes compare-and-swap too. |
| `PERMISSIONS` | `packages/core/src/rbac/permissions.ts:L20` | `permissions.test.ts`, `dashboard-layout.test.ts` | Gains `manage_layout`. The graph misses most dependents (see c). |

**b) Architectural boundaries affected**

- `@beechcms/core` (`packages/core/src/`), pure, zero I/O:
  - `rbac/permissions.ts`: vocabulary entry.
  - `dashboard-layout/widget-requirements.ts`: `LOCKED_WIDGET_TYPE`, `isWidgetLockedFor`, and the projection drops placeholders.
  - `dashboard-layout/dashboard-layout-audience.ts`: `isDashboardLayoutEditor`, editor projection.
  - New `dashboard-layout/dashboard-layout-editing.ts`: structural diff + locked-widget reconciliation.
  - `dashboard-layout/dashboard-layout.repository.ts`: compare-and-swap port.
  - Barrel `index.ts` gains one line.
- `apps/api`:
  - migration `0039`;
  - `features/dashboard-layout/dashboard-layout.handler.ts`;
  - one route row in `middleware/permission.middleware.ts`;
  - `shared/db/repositories/dashboard-layout.repository.d1.ts`;
  - one call site in `features/setup/index.ts:L409`;
  - tests in those places, plus `features/rbac/test/integration/`.
- `apps/dashboard`:
  - `features/dashboard/builder/api/dashboard-layout.api.ts` + `builder/dashboard-builder-dialog.tsx`: send the precondition;
  - `features/rbac/components/permission-metadata.ts` + `permission-groups.ts` + `locales/{en,it}.json`: new permission.
- `docs/reference/dashboard-layout.md`: the contract of the routes this sprint changes.

**c) `graphify affected` impact analysis**

```
graphify affected "dashboard_layout_dashboard_layout_audience_filterdashboardlayoutforviewer" --depth 2
- refuseIfLocked() [calls]   apps/api/src/features/dashboard-layout/dashboard-layout.handler.ts:L45
- putLayout() [calls]        apps/api/src/features/dashboard-layout/dashboard-layout.handler.ts:L79
- dashboard-layout-audience.test.ts [imports]
  → `refuseIfLocked` is deleted; `putLayout` and the GET handler (L116, a graph miss) are rewritten;
    the audience test is updated. Removing `hiddenWidgetCount` breaks nothing else (grep: only L49 reads it).

graphify affected "D1DashboardLayoutRepository" --depth 2
- repository.middleware.ts [imports], createBeechApp() [calls], factory.ts [imports_from]
- dashboard-layout.repository.d1.test.ts [imports], repository-privacy-middleware.test.ts [imports_from]
  → wiring is untouched (constructor signature unchanged). The method rename breaks exactly the
    callers grep finds and the graph misses:
      dashboard-layout.handler.ts:L96 (upsert), L143 (remove)
      features/setup/index.ts:L409 (upsert, demo track)
    All three are updated. `graphify affected "IDashboardLayoutRepository"` returns nothing (graph miss);
    grep confirms no other implementer (the only one is the D1 class; `types.ts:L257` only types the variable).

graphify affected "resolveCoreWidgetRequirement" --depth 2
- widget-registry.ts (widgetRequirementOf, isWidgetDefinitionUsable), use-dashboard-layout.ts,
  dashboard-layout.ts, dashboard-layout-audience.ts, widget-requirements.test.ts, widget-registry.test.ts
  → its signature and table are unchanged. `filterDashboardLayoutByWidgetRequirements` (same module) now also
    drops `core/locked`, which only removes placeholders from the dashboard's view-mode projection.

graphify affected "PERMISSIONS" --depth 2
- permissions.test.ts, dashboard-layout.test.ts
  → the graph misses every exhaustive consumer of the vocabulary; grep finds them:
      apps/dashboard/src/features/rbac/components/permission-metadata.ts:L15  Record<Permission, …>  (type error until filled)
      apps/api/src/features/rbac/rbac.schema.ts:L18  z.enum(PERMISSIONS)  (accepts manage_layout automatically)
      apps/dashboard/src/test/me-payload.ts:L15  FULL_AUTHORITY = [...PERMISSIONS]  (widens automatically)
      packages/core/src/rbac/permissions.test.ts:L9-18           asserts length 7 → 8
      apps/api/src/shared/db/repositories/d1-role.repository.test.ts:L100-120  SuperAdmin has 7 → 8
      apps/api/test/flow/flow-rbac-upgrade.test.ts:L64-66        SuperAdmin list after migrations → + manage_layout
```

`graphify path "dashboardLayoutApp" "roleRepository"` returns a 4-hop chain that passes only through `factory.ts`, the
composition root (`dashboardLayoutApp ← factory.ts → rbacApp ← roles.create.test.ts`). The slice reaches roles only
through the context-injected repository (`handler.ts:L27`, `L81`) and never imports the `rbac` slice.

### VETO Audit

- **Botanical invariant.** The only SQL touched is in system tables with no engine representation: the
  `role_permissions` rebuild and the `dashboard_layouts` compare-and-swap statements. Both live in the migration and in the
  D1 repository behind the core port `IDashboardLayoutRepository`. No `content_*` table and no Branch ID are involved, and
  the handler issues no SQL. **PASS.**
- **VSA.**
  - The new authorization rules are shared by the API (enforcement) and, in sprint 6, by the dashboard (affordances).
    They therefore go to `@beechcms/core` (`dashboard-layout-editing.ts`), not into the slice.
  - The API slice imports `@beechcms/core` and `../../shared/*` only. `resolveIfMatch` comes from
    `shared/utils/occ.ts:L13`, already shared by the content and draft slices.
  - The dashboard changes stay inside `features/dashboard/` and `features/rbac/`, with no import between them.
  - **PASS.**
- **Cloudflare purity.** One numbered migration, rebuilt with the table-copy pattern already used in
  `migrations/_archive/0036_notification_type_success.sql:L6-23`. The concurrency guard is a single conditional statement,
  with no lock table and no background job. **PASS.**
- **YAGNI cuts applied before drafting:**
  1. **No `revision` column.** Strict monotonicity of `updated_at` (`MAX(now, updated_at + 1)` on update) makes the
     timestamp a sufficient version token, so `dashboard_layouts` needs no migration.
  2. **No new route-requirement kind.** PUT uses the existing coarse `anyScope(...)` gate plus the exact global check in
     the slice. This is the documented contract of that kind (`permission.middleware.ts:L28-32`).
  3. **`manage_roles@*` keeps full edit rights** (structure and content), as it has had since sprint 2. Splitting
     content away from it adds a state nobody asked for. Brief rule 16 gives SuperAdmin both anyway.
  4. **No DELETE lock check.** Reset is structural, and brief rule 21 allows it to `manage_roles@*` even over locked
     widgets. The interim 409 disappears entirely instead of being reworked.
  5. **`hiddenWidgetCount` is removed, not extended.** The roadmap planned to reuse it, but reconciliation needs the
     per-widget predicate, so the count has no consumer.
- **Single source of truth.**
  - The lock predicate is defined once (`isWidgetLockedFor`). It is used by the GET projection (placeholder vs drop),
    the reconciliation and, in sprint 6, the builder.
  - The roles UI reuses the existing generic "disabled when not held anywhere" rule (`role-form-dialog.tsx:L222`), so no
    new logic is needed.

No violation remains. HANDOFF → executor.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Since sprint 2, editing the layout is all-or-nothing for `manage_roles@*` holders. As a result:
- delegating dashboard upkeep means handing out role administration (brief rule 14 asks for a narrower permission);
- any editor who cannot read one seed referenced by the layout is refused with the interim 409 `layout-locked`, so a
  mixed tab is uneditable;
- two editors silently overwrite each other (brief rule 18).

This sprint makes the server enforce the split before any UI exposes it:
- `manage_layout` exists and is assignable (vocabulary + migration + SuperAdmin + roles UI);
- the save path tells content edits from structural edits;
- locked widgets travel as opaque placeholders and are re-injected server-side;
- every write is a compare-and-swap.

It must precede ROADMAP entry 6, because the builder affordances there (placeholder card, hidden structural controls,
conflict flow) only project rules that the server must already refuse when violated (brief: "La UI nasconde per cortesia,
il server rifiuta").

VSA and Botanical Engine: the rules live in `@beechcms/core` as pure functions. The API slice applies them through the
injected repositories. The dashboard is touched only where the new HTTP contract would otherwise break saving
(the precondition header), plus the one `Record<Permission, …>` the type system forces.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Request path for `/api/dashboard-layout`.**
- The permission middleware resolves the first matching row of `PROTECTED_ROUTES`
  (`apps/api/src/middleware/permission.middleware.ts:L70`). The dashboard-layout rows are `L102-106`:
  - `GET /` → `AUTHED`;
  - `GET /roles`, `PUT /` and `DELETE /` → `perm('manage_roles','global')`.
- Then the slice app runs (`routes.ts:L66`). PUT's chain is `zodJson(dashboardLayoutSchema, rejectInvalidLayoutBody)`, then
  `putLayout` (`dashboard-layout.handler.ts:L133`).
- The `permission-any-scope` kind exists (`L41`), with its helper `anyScope(...)` (`L54`). It admits a caller holding any
  listed permission on any scope, and the slice must then decide exactly (`L28-32`).

**Handler** (`apps/api/src/features/dashboard-layout/dashboard-layout.handler.ts`)
- `resolveLayoutViewer` (`L25`) builds `{ roleIds, permissions }` from active assignments + `resolveEffectivePermissions`.
- `loadStoredLayout` (`L36`) reads `DEFAULT_DASHBOARD_SCOPE` and returns the layout cleaned against the seed registry
  through `validateDashboardLayout`. It discards `updatedAt`.
- `refuseIfLocked` (`L45`) returns a 409 `layout-locked` when `hiddenWidgetCount > 0`. It is called by PUT (`L92`) and
  DELETE (`L140`).
- `putLayout` (`L79`) runs semantic validation with `seedSlugs` + `roleIds` (422), then the lock check, then
  `upsert` (`L96`). It responds `{ ok, layout: result.cleaned, warnings }`.
- GET (`L110`) answers `{ layout: null }` or `{ layout }` projected by `filterDashboardLayoutForViewer`, with
  `Cache-Control: no-store`.

**Core projection** (`dashboard-layout-audience.ts:L32`)
- `seesAllTabs = manage_roles@*` (`L36`).
- Widgets whose `config.seedSlug` is unreadable are dropped and counted (`L42-51`). Built-in requirements are **not**
  applied server-side.
- Readers also get emptied sections and pages dropped, and lose the `roles` key (`L53-69`).

**Core requirements** (`widget-requirements.ts`)
- `isWidgetRequirementMet` (`L33`), `resolveCoreWidgetRequirement` (`L90`) and `filterDashboardLayoutByWidgetRequirements`
  (`L96`). The last is used by the dashboard view-mode hook (`apps/dashboard/src/features/dashboard/hooks/use-dashboard-layout.ts:L47-50`)
  and by the default generator.

**Repository**
- Port (`packages/core/src/dashboard-layout/dashboard-layout.repository.ts:L16-23`): `get`, `upsert`, `remove`.
- D1 implementation (`dashboard-layout.repository.d1.ts`):
  - `get` returns null when the row is missing or its JSON fails to parse (`L14-30`);
  - `upsert` is an unconditional `INSERT … ON CONFLICT DO UPDATE` stamped with `clock.nowSeconds()` (`L32-46`);
  - `remove` is an unconditional `DELETE` (`L48-53`).
- Table: `dashboard_layouts(scope PK, layout, updated_at INTEGER, updated_by)` (`migrations/0000_v040_base.sql:L313-318`).

**Permissions**
- `PERMISSIONS` has 7 entries (`permissions.ts:L20-28`). The `role_permissions` CHECK mirrors them
  (`migrations/0032_rbac_and_user_activation.sql:L49-61`). SuperAdmin is granted one `INSERT OR IGNORE … WHERE r.name = 'SuperAdmin'` per
  permission (`0032:L110-129`). The last migration is `0038_content_deleted_at.sql`.
- Wrangler picks migrations up by directory (`wrangler.jsonc` `migrations_dir`), and the workers test pool reads the same
  directory (`vitest.workers.config.ts:L11`). There is no list to edit.
- Anti-escalation: `canGrant` (`evaluate.ts:L86`) is vocabulary-agnostic.
  - Assignments refuse with 403 `escalation-refused` (`features/rbac/assignments.ts:L82-89`).
  - Role create/update are bounded by `permissionsHeldAnywhere` (`features/rbac/guards.ts:L66`).
- Roles UI: `PERMISSION_GROUPS` (`features/rbac/components/permission-groups.ts:L17-26`, System group) and
  `PERMISSION_METADATA: Record<Permission, PermissionMeta>` (`permission-metadata.ts:L15-23`). The checkbox of a permission
  not held anywhere is disabled generically (`role-form-dialog.tsx:L222`). Labels live under `rbac.permissions.*`
  (`locales/en.json:L1774-1782`, `it.json` same lines).

**OCC precedent.** `resolveIfMatch(context, body)` (`apps/api/src/shared/utils/occ.ts:L13`) parses `If-Match` (weak or
strong, quoted or bare) into a number, or returns undefined. The content and draft slices treat a stale write as 409
problem+json (`content-update-conflict`, `draft-save-conflict`).

**Dashboard callers**
- `dashboardBuilderApi.saveLayout(layout)` → `$put({ json })`, and `resetLayout()` → `$delete()`
  (`builder/api/dashboard-layout.api.ts:L21-28`).
- The builder dialog fetches `['dashboard-builder-layout']` (`dashboard-builder-dialog.tsx:L41-45`), seeds its draft from
  `data?.layout` (`L47`), saves at `L105` and resets at `L120`.
- `apiFetch` throws `ApiError` on every non-2xx, and the toast shows `detail` (`L111-112`).

**Other writer.** The setup demo track writes a hardcoded layout with `upsert('default', layout as any, 'system')`
(`features/setup/index.ts:L409`).

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Create:
- `apps/api/migrations/0039_manage_layout_permission.sql`
- `packages/core/src/dashboard-layout/dashboard-layout-editing.ts`
- `packages/core/src/dashboard-layout/dashboard-layout-editing.test.ts`

Modify (core):
- `packages/core/src/rbac/permissions.ts`, `permissions.test.ts`
- `packages/core/src/dashboard-layout/widget-requirements.ts`, `widget-requirements.test.ts`
- `packages/core/src/dashboard-layout/dashboard-layout-audience.ts`, `dashboard-layout-audience.test.ts`
- `packages/core/src/dashboard-layout/dashboard-layout.repository.ts`
- `packages/core/src/index.ts` (one export line)

Modify (API):
- `apps/api/src/features/dashboard-layout/dashboard-layout.handler.ts`
- `apps/api/src/features/dashboard-layout/test/integration/dashboard-layout.integration.test.ts`
- `apps/api/src/middleware/permission.middleware.ts` (PUT row + comment), `permission.middleware.test.ts`
- `apps/api/src/shared/db/repositories/dashboard-layout.repository.d1.ts`, `dashboard-layout.repository.d1.test.ts`
- `apps/api/src/shared/db/repositories/d1-role.repository.test.ts`
- `apps/api/src/features/setup/index.ts` (L409 only)
- `apps/api/src/features/rbac/test/integration/roles.integration.test.ts`, `assignments.integration.test.ts`
- `apps/api/test/flow/flow-rbac-upgrade.test.ts` (expected SuperAdmin list only)

Modify (dashboard):
- `apps/dashboard/src/features/dashboard/builder/api/dashboard-layout.api.ts`
- `apps/dashboard/src/features/dashboard/builder/dashboard-builder-dialog.tsx`
- `apps/dashboard/src/features/dashboard/test/unit/dashboard-builder-dialog.test.tsx`
- `apps/dashboard/src/features/rbac/components/permission-metadata.ts`, `permission-groups.ts`
- `apps/dashboard/src/locales/en.json`, `it.json`

Modify (docs): `docs/reference/dashboard-layout.md`.

No builder UI, renderer or widget component changes. No other route row changes.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### T1 — `manage_layout` in the vocabulary (core + migration)

**Approach.** Append `'manage_layout'` as the **last** element of `PERMISSIONS` (`permissions.ts:L20-28`). Appending keeps
every existing index, and the vocabulary order carries no meaning. Add a JSDoc line above the tuple naming it: "edits the
content of every dashboard tab; evaluated at the global scope only (a seed-scoped grant confers nothing on the
dashboard)". Leave the `manage_seeds` paragraph untouched (ROADMAP entry 7 rewrites it).

**Migration** `apps/api/migrations/0039_manage_layout_permission.sql`. The header comment states:
- why the table is rebuilt (SQLite cannot alter a CHECK);
- that nothing references `role_permissions` (so dropping it trips no FK);
- that `manage_seeds` stays absent.

Verbatim body:

```sql
CREATE TABLE IF NOT EXISTS role_permissions_dg_tmp (
    role_id    TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission TEXT NOT NULL CHECK (permission IN (
                   'content:read',
                   'content:create',
                   'content:update',
                   'content:delete',
                   'manage_users',
                   'manage_roles',
                   'view_analytics',
                   'manage_layout'
               )),
    PRIMARY KEY (role_id, permission)
);

INSERT INTO role_permissions_dg_tmp (role_id, permission)
SELECT role_id, permission FROM role_permissions;

DROP TABLE role_permissions;

ALTER TABLE role_permissions_dg_tmp RENAME TO role_permissions;

INSERT OR IGNORE INTO role_permissions (role_id, permission)
SELECT r.id, 'manage_layout' FROM roles r WHERE r.name = 'SuperAdmin';
```

`role_permissions` has no secondary index or trigger in `0032`, so nothing needs recreating.

### T2 — Server lock predicate (core, `widget-requirements.ts`)

**Approach.** Put the predicate next to the requirement evaluator, because it is that evaluator plus the seed check
the server already applied. Exact exports:

```ts
/** Type of the opaque stand-in a layout editor receives for a widget they cannot use. Never persisted. */
export const LOCKED_WIDGET_TYPE = 'core/locked'

/**
 * Whether `permissions` cannot use `widget`, as far as the server can tell: it is a placeholder, its
 * `config.seedSlug` names a seed they may not `content:read`, or it is a built-in whose core requirement
 * is unmet. A custom widget's own `requires` is invisible to the Worker and never locks it here.
 */
export function isWidgetLockedFor(
  widget: Pick<DashboardWidgetInstance, 'type' | 'config'>,
  permissions: EffectivePermissions,
): boolean
```

Rules, evaluated in order (first `true` wins):
1. `type === LOCKED_WIDGET_TYPE`;
2. `config.seedSlug` is a non-empty string and `hasPermission(permissions, 'content:read', seedSlug)` is false;
3. `!isWidgetRequirementMet(resolveCoreWidgetRequirement(widget), permissions, config ?? {})`.

Never throws.

**`filterDashboardLayoutByWidgetRequirements`** (`L96`): `filterColumn` (`L101-106`) also drops every widget whose
`type === LOCKED_WIDGET_TYPE`, whatever `requirementOf` returns. The existing emptied-section and emptied-page rule then
applies unchanged. Effect: an editor's dashboard (view mode) shows what a reader with the same permissions sees, and
placeholders exist only in the builder draft.

### T3 — Editor projection (core, `dashboard-layout-audience.ts`)

**Exact exports** (`DashboardLayoutViewer` unchanged):

```ts
/** Whether the caller edits the dashboard layout: `manage_layout` or `manage_roles`, held at the global scope. */
export function isDashboardLayoutEditor(permissions: EffectivePermissions): boolean

export interface FilteredDashboardLayout {
  readonly layout: DashboardLayout
}
```

`hiddenWidgetCount` is deleted from the interface and the implementation.

**Rules for `filterDashboardLayoutForViewer`.** `editor = isDashboardLayoutEditor(viewer.permissions)` replaces
`seesAllTabs` (`L36`).

- **Editor:**
  - receives every page in stored order, with `roles` intact;
  - every section and column is kept, including empty ones (the builder must see the real structure);
  - each widget for which `isWidgetLockedFor` is true is replaced in place, same index, by exactly
    `{ id: <original id>, type: LOCKED_WIDGET_TYPE, config: {} }`, with no `title` key;
  - every other widget is passed through untouched.
- **Reader:**
  - audience rule unchanged (`L39-40`);
  - widgets for which `isWidgetLockedFor` is true are dropped;
  - sections with no remaining widget are dropped, then pages with no remaining section;
  - `roles` is deleted (`L62`).

This is the sprint-2 reader behaviour, widened only by rule 3 of T2: a reader without `manage_users@*` no longer
receives `core/setup-checklist`, and so on.

Invariants:
- the widget id is the only original datum a placeholder carries; it is a random client UUID and reveals nothing (brief rule 19);
- the projection never mutates its input;
- same input → same output.

### T4 — Structural diff + locked-widget reconciliation (core, new `dashboard-layout-editing.ts`)

**Approach.** These are pure functions in their own module. The API enforces them on save; in sprint 6 the dashboard
uses the same functions to pre-check before sending. Imports: `../rbac/*`, `./widget-requirements.js`, and types from
`./dashboard-layout.js`. Add `export * from './dashboard-layout/dashboard-layout-editing.js'` to `packages/core/src/index.ts`
right after the `widget-requirements.js` line (`L90`).

```ts
/**
 * Whether `next` changes anything a `manage_layout`-only editor may not change: the tab set, their order,
 * or a tab's `id`, `slug`, `label`, `icon` or `roles`. Only `sections` are content. With nothing stored,
 * every save is structural (creating tabs is structural).
 */
export function hasDashboardLayoutStructuralChange(stored: DashboardLayout | null, next: DashboardLayout): boolean

export type LockedWidgetReconciliation =
  | { readonly ok: true; readonly layout: DashboardLayout }
  | { readonly ok: false; readonly errors: readonly string[] }

/**
 * The layout to persist from what an editor sent. Each widget of `stored` that `permissions` cannot use
 * (`isWidgetLockedFor`) is taken back verbatim from `stored`; the client is never trusted on it.
 */
export function reconcileLockedWidgets(
  stored: DashboardLayout | null,
  next: DashboardLayout,
  permissions: EffectivePermissions,
): LockedWidgetReconciliation
```

**`hasDashboardLayoutStructuralChange` rules.** It returns true when any of these holds:
- `stored` is null;
- the page counts differ;
- for some index `i`, `id`, `slug`, `label` or `icon` differ (absent `icon` ≡ `undefined`);
- for some index `i`, the `roles` arrays differ element-wise, where absent ≡ `[]`.

Order matters, because reordering tabs is structural. `sections` are never compared.

**`reconcileLockedWidgets` rules.**
1. Collect the locked widgets of `stored`. These are the widgets with `isWidgetLockedFor(widget, permissions)`, each with
   its location (pageId, sectionId, columnId).
2. Walk every widget of `next`, keeping its location:
   - its id is a locked id and its location equals the stored one → replace it with the stored widget verbatim
     (type, title, config). The index inside the column is free: other widgets may move around it;
   - its id is a locked id at another location → error `Widget '<id>' is locked and cannot be moved.`;
   - otherwise, `isWidgetLockedFor(widget, permissions)` is true → error `Widget '<id>' is not usable by the caller.`.
     This covers a forged placeholder, a new widget on an unreadable seed, and a visible widget re-bound to one;
   - otherwise → keep it as sent.
3. Every locked id never seen in `next`:
   - its page id still exists in `next` → error `Widget '<id>' is locked and cannot be removed.`. This covers deleting its
     section or column, and therefore brief rule 20;
   - its page is gone → it is dropped silently. Deleting a whole tab is structural; the handler checks that authority
     before calling (brief rule 21).
4. Any error → `{ ok: false, errors }`, with every error collected. Otherwise `{ ok: true, layout }`.

Invariants:
- error strings name widget ids only, never a type, title or seed slug;
- `stored === null` means no locked widget, so rule 2 alone applies;
- never throws, never mutates its inputs, deterministic.

### T5 — Compare-and-swap port + D1 implementation

**Port** (`dashboard-layout.repository.ts:L16-23`): replace `upsert` and `remove` with exactly:

```ts
export type DashboardLayoutWriteResult =
  /** Written. `updatedAt` is the row's new version, null after a removal. */
  | { readonly ok: true; readonly updatedAt: number | null }
  /** Refused: the stored version no longer equals the expected one. */
  | { readonly ok: false }

export interface IDashboardLayoutRepository {
  /** Stored layout for a scope, or null if none was ever saved. */
  get(scope: string): Promise<DashboardLayoutRecord | null>
  /** Writes only while the stored `updatedAt` equals `expectedUpdatedAt` (null = no row stored). `updatedAt` strictly increases on every write. */
  save(scope: string, layout: DashboardLayout, updatedBy: string, expectedUpdatedAt: number | null): Promise<DashboardLayoutWriteResult>
  /** Removes the row only while its `updatedAt` equals `expectedUpdatedAt`; with null, succeeds only when no row is stored. */
  remove(scope: string, expectedUpdatedAt: number | null): Promise<DashboardLayoutWriteResult>
}
```

**D1** (`dashboard-layout.repository.d1.ts`): each write is one statement whose effect is read back, so no read-then-write
window exists. Verbatim SQL:

```sql
-- save, expectedUpdatedAt === null: binds (scope, layoutJson, now, updatedBy)
INSERT INTO dashboard_layouts (scope, layout, updated_at, updated_by)
VALUES (?, ?, ?, ?)
ON CONFLICT(scope) DO NOTHING
RETURNING updated_at

-- save, expectedUpdatedAt is a number: binds (layoutJson, now, updatedBy, scope, expectedUpdatedAt)
UPDATE dashboard_layouts
SET layout = ?, updated_at = MAX(?, updated_at + 1), updated_by = ?
WHERE scope = ? AND updated_at = ?
RETURNING updated_at

-- remove, expectedUpdatedAt is a number: binds (scope, expectedUpdatedAt); success iff meta.changes === 1
DELETE FROM dashboard_layouts WHERE scope = ? AND updated_at = ?

-- remove, expectedUpdatedAt === null: binds (scope); success iff no row
SELECT 1 AS present FROM dashboard_layouts WHERE scope = ? LIMIT 1
```

For `save`, a returned row means `{ ok: true, updatedAt: row.updated_at }`, and no row means `{ ok: false }`.
`MAX(now, updated_at + 1)` is what makes the timestamp a safe version: under a frozen or coarse clock, two writes in one
second still produce two versions.

`get` is unchanged. A row whose JSON no longer parses still reads as null. Only out-of-band edits can create one, and it
is not handled (SECTION 7).

**Setup** (`features/setup/index.ts:L409`): replace with
`save('default', layout as any, 'system', null)` and ignore the result. The demo layout is written only when none is
stored and never overwrites one. Add a one-line comment saying so.

### T6 — Handler + route row (API slice)

**Route table** (`permission.middleware.ts:L102-106`). Replace the PUT row and rewrite the `L103` comment:

```ts
  // Coarse gate only: the handler requires `manage_layout` or `manage_roles` at the GLOBAL scope, and
  // refuses structural changes to callers without `manage_roles@*`.
  { method: 'PUT',    pattern: /^\/api\/dashboard-layout\/?$/,             requirement: anyScope('manage_layout', 'manage_roles') },
```

`GET /`, `GET /roles` and `DELETE /` keep their rows. Reset stays structural (`manage_roles@*`).

**Problem types** (all through `publicProblem`; the existing ones are unchanged):

| Status | `type` | When |
|--------|--------|------|
| 403 | `layout-edit-forbidden` | PUT by a caller holding neither `manage_layout@*` nor `manage_roles@*` (e.g. `manage_layout` on one seed only) |
| 428 | `precondition-required` | PUT or DELETE carrying neither a parsable `If-Match` nor `If-None-Match: *` |
| 409 | `layout-conflict` | The stored `updatedAt` differs from the precondition, or the conditional write lost a race |
| 403 | `layout-structure-forbidden` | A caller without `manage_roles@*` sends a structural change (T4), including any save when nothing is stored |
| 422 | `invalid-layout` | Existing semantic errors, plus `reconcileLockedWidgets` errors (joined with `'; '`, as at `L88`) |

`layout-locked` is removed.

**Precondition.** A local `readLayoutPrecondition(context): number | null | undefined`:
- `resolveIfMatch(context, {})` (`shared/utils/occ.ts:L13`) when it yields a number;
- else `null` when `If-None-Match` trimmed equals `*`;
- else `undefined`, which becomes 428.

`If-Match` wins when both headers are present.

**Shared helpers.**
- `loadStoredLayout` becomes `loadStoredRecord(context): Promise<{ layout: DashboardLayout; updatedAt: number } | null>`.
  It is the same cleaning, but keeps `record.updatedAt`.
- Delete `refuseIfLocked`.

**GET `/`.** Answer `{ layout: DashboardLayout | null, updatedAt: number | null }`, both null when nothing is stored. The
layout is projected by `filterDashboardLayoutForViewer(...).layout`. Headers are unchanged.

**PUT `/` (`putLayout`), in this exact order:**
1. `permissions = resolveEffectivePermissions(context)`. `canStructure = hasPermission(permissions, 'manage_roles', GLOBAL_SCOPE)`
   and `canContent = hasPermission(permissions, 'manage_layout', GLOBAL_SCOPE)`. Neither → 403 `layout-edit-forbidden`.
2. Precondition → 428 when undefined.
3. Semantic validation exactly as today (`L80-90`) → 422.
4. `stored = loadStoredRecord`. `(stored?.updatedAt ?? null) !== precondition` → 409 `layout-conflict`.
5. `!canStructure && hasDashboardLayoutStructuralChange(stored?.layout ?? null, cleaned)` → 403 `layout-structure-forbidden`.
6. `reconcileLockedWidgets(stored?.layout ?? null, cleaned, permissions)` → `!ok` → 422 `invalid-layout`.
7. `save(DEFAULT_DASHBOARD_SCOPE, reconciled, userId, precondition)` → `!ok` → 409 `layout-conflict`.
8. 200 `{ ok: true, layout, warnings, updatedAt }`. `layout` is `filterDashboardLayoutForViewer(reconciled, viewer).layout`
   (never the raw reconciled layout: it holds re-injected locked widgets). `warnings` come from step 3.

Steps 2–5 run before any write, and the conditional write in step 7 closes the window between steps 4 and 7.

**DELETE `/`.** Precondition → 428. `remove(DEFAULT_DASHBOARD_SCOPE, precondition)` → `!ok` → 409 `layout-conflict`.
Otherwise 200 `{ ok: true }`. There is no lock check (brief rule 21). With `If-None-Match: *` and nothing stored, the
request succeeds as a no-op.

**JSDoc.** Rewrite the route comments (`L105-108`, `L129-138`) to state the new gates and status codes.

### T7 — Dashboard follow-through

**Builder API** (`builder/api/dashboard-layout.api.ts`):
- `saveLayout(layout: DashboardLayout, updatedAt: number | null)` → `$put({ json: layout }, { headers })`;
- `resetLayout(updatedAt: number | null)` → `$delete(undefined, { headers })`;
- both share a module-private `layoutPrecondition(updatedAt)`, which returns `{ 'If-Match': `"${updatedAt}"` }`, or
  `{ 'If-None-Match': '*' }` when null.

Update the JSDoc gates: save needs `manage_layout@*` or `manage_roles@*`; reset needs `manage_roles@*`.

**Builder dialog** (`dashboard-builder-dialog.tsx`):
- `BuilderPaneControllerProps` gains `readonly updatedAt: number | null`. The dialog passes `data?.updatedAt ?? null` (`L60-65`).
- `handleSave` (`L105`) and `handleReset` (`L120`) forward it.
- On a 409, the existing toast shows the problem `detail`. That is the deliberate interim; the reload-and-reapply flow is
  ROADMAP entry 6.
- No other change, and no new `usePermissions` consumer.

**Roles UI** (`features/rbac/components/`):
- `PERMISSION_METADATA` gains `"manage_layout": { icon: Layout, translationKey: "rbac.permissions.manage_layout", defaultLabel: "Manage dashboard layout" }`.
  Import `Layout` from `@/components/icons` (already exported, used at `view-type-catalogue.ts:L8`).
- `PERMISSION_GROUPS` System group becomes `["manage_users", "manage_roles", "manage_layout", "view_analytics"]`.
- `locales/en.json` gets `"manage_layout": "Manage dashboard layout"` and `it.json` gets
  `"manage_layout": "Gestisci layout dashboard"`, both inserted after `manage_roles` in `rbac.permissions`.

The existing "disabled when not held anywhere" rule (`role-form-dialog.tsx:L222`) covers brief §4 ("disabilitati per chi
non li detiene") with no change.

### T8 — Reference doc

`docs/reference/dashboard-layout.md`:
- rewrite the GET, PUT and DELETE sections (`L9`, `L66`, `L104`) to the T6 contract: the `updatedAt` field, the
  precondition headers, the error table, the placeholder shape, and the gates;
- add `GET /api/dashboard-layout/roles` if it is absent;
- delete the stale "Scoped Dashboard Layout Routes" (`L124`) and "`GET /api/dashboard-layout/scopes`" (`L173`) sections,
  which describe routes removed in sprint 2.

The file must keep existing (`factory.docs-parity.test.ts:L23`).

### T9 — Tests (behaviour lists)

Every file keeps or receives the SPDX header. Core fixtures build authority with the real `buildEffectivePermissions` over
hand-built `RoleRecord`s, because core cannot depend on `@beechcms/testing` (precedent: `dashboard-layout-audience.test.ts:L17-36`).
API integration fixtures follow `dashboard-layout.integration.test.ts:L81-142`: roles and assignments are inserted by
SQL, and the canonical seeds `posts`/`authors` are provisioned by the harness. Neutral widgets in core and API fixtures
switch to `core/text`, a built-in with no requirement, so audience tests stay independent of read authority.

**`packages/core/src/rbac/permissions.test.ts`** (unit, edit)
- `it('lists exactly the eight permissions of the closed vocabulary, manage_layout last')`.

**`packages/core/src/dashboard-layout/widget-requirements.test.ts`** (unit, extend)
- `describe('isWidgetLockedFor')`:
  - a `core/locked` placeholder is locked even for full global authority;
  - a custom widget bound to a seed the caller cannot read is locked;
  - `core/setup-checklist` is locked for a caller without `manage_users@*`;
  - a custom widget with no `seedSlug` is never locked, even for a caller with no permission;
  - `core/recent-content` on a readable seed is not locked.
- `filterDashboardLayoutByWidgetRequirements`: drops a `core/locked` widget even when the lookup returns no requirement,
  together with the section it emptied.

**`packages/core/src/dashboard-layout/dashboard-layout-audience.test.ts`** (unit, edit)
- Remove every `hiddenWidgetCount` assertion. Neutral widgets become `core/text`, and the existing audience behaviours stay
  as they are.
- `describe('isDashboardLayoutEditor')`: true for `manage_layout@*` and for `manage_roles@*`; false for `manage_layout`
  held only on `posts` (matrix, one `it`).
- Behaviours of `filterDashboardLayoutForViewer`:
  - a `manage_layout@*` editor without `content:read@authors` receives every tab with `roles` intact, and the authors
    widget at its index as exactly `{ id, type: 'core/locked', config: {} }`;
  - the serialized editor projection contains neither the locked widget's original type, its title, nor `authors`;
  - an editor keeps a section emptied of visible widgets, where a reader with the same seed reads loses it;
  - a reader without `manage_users@*` loses a `core/setup-checklist` widget, and the section it emptied.

**`packages/core/src/dashboard-layout/dashboard-layout-editing.test.ts`** (unit, new)
- `describe('hasDashboardLayoutStructuralChange')`:
  - returns false when only sections differ;
  - returns true for any save over a null stored layout;
  - returns true for an added tab, a removed tab, and a swapped tab order (matrix);
  - returns true for a changed `slug`, `label`, `icon` or `roles` (matrix);
  - treats an absent `roles` and `roles: []` as equal.
- `describe('reconcileLockedWidgets')`:
  - replaces a placeholder sent back in its column with the stored widget verbatim (type, title, config);
  - accepts a locked widget whose index shifted inside its own column;
  - refuses a locked widget sent in another column, naming only its id;
  - refuses a layout that drops a locked widget while its tab survives (section removed, and widget removed: matrix);
  - drops silently the locked widgets of a tab absent from `next`;
  - refuses a forged `core/locked` widget whose id is not locked in `stored`;
  - refuses a new widget bound to an unreadable seed, and a stored usable widget re-bound to one (matrix);
  - returns `next` unchanged when `stored` is null and every widget is usable;
  - error strings contain no stored widget type, title or seed slug;
  - two calls with the same inputs return deep-equal results.

**`apps/api/src/middleware/permission.middleware.test.ts`** (unit, edit `L51-57`)
- The PUT row now expects `{ kind: 'permission-any-scope', permissions: ['manage_layout', 'manage_roles'] }`. The other
  three rows are unchanged.

**`apps/api/src/shared/db/repositories/dashboard-layout.repository.d1.test.ts`** (unit, rewrite the `upsert`/`remove`
cases on the existing `prepareMock` harness; real SQL behaviour is proven in the integration tier below)
- `save` with null expected prepares the `INSERT … ON CONFLICT(scope) DO NOTHING RETURNING updated_at` statement and maps
  a returned row to `{ ok: true, updatedAt }`;
- `save` with a number prepares the conditional `UPDATE … WHERE scope = ? AND updated_at = ?`, bound in the T5 order, and
  maps no row to `{ ok: false }`;
- `remove` with a number maps `meta.changes === 0` to `{ ok: false }`;
- `remove` with null maps a present row to `{ ok: false }` and an absent one to `{ ok: true, updatedAt: null }`.

**`apps/api/src/shared/db/repositories/d1-role.repository.test.ts`** (existing tier, edit `L100-120`)
- The migration-seeded SuperAdmin role has exactly the 8 permissions, `manage_layout` included.
- New: the CHECK constraint accepts `manage_layout` for a custom role.
- The existing `manage_seeds` rejection test stays unchanged.

**`apps/api/test/flow/flow-rbac-upgrade.test.ts`** (flow, edit `L64-66` only)
- The admin's expected sorted list gains `'manage_layout'` between `content:update` and `manage_roles`. This is an
  expectation change caused by migration `0039`, not a weakened test: say so in the PR.

**`apps/api/src/features/rbac/test/integration/roles.integration.test.ts`** (integration, extend)
- `it('lets SuperAdmin create a role carrying manage_layout, persisted in role_permissions')`: 201, then the row is read
  back from D1.

**`apps/api/src/features/rbac/test/integration/assignments.integration.test.ts`** (integration, extend)
- `it('refuses a manage_users@* + manage_roles@* holder assigning a manage_layout role at * with escalation-refused')`:
  403 `escalation-refused`, and the assignment count is unchanged. Arrangement: the editor gets a SQL-inserted
  `[manage_users, manage_roles]` role at `*`, and the target role `[manage_layout]` is SQL-inserted.

**`apps/api/src/features/dashboard-layout/test/integration/dashboard-layout.integration.test.ts`** (integration, edit)

Arrangement:
- New roles: `ROLE_LAYOUT_EDITOR` (`['manage_layout']`) and `ROLE_SCOPED_LAYOUT` (`['manage_layout']`, assigned at `posts`).
- A local helper `makeViewerLayoutEditorWithoutAuthors()` mirrors `L120-123`: it assigns `ROLE_LAYOUT_EDITOR` at `*` and
  keeps the baseline `content:read@posts`.
- A local `put(client, layout, precondition)` sets `If-Match: "<n>"` or `If-None-Match: *`.
- `storeAsAdmin` reads the current `updatedAt` before writing.
- Fixtures that test locking use widget id `w-locked` bound to `authors`, on tabs whose slugs and ids do not contain
  `authors`.

Removed tests:
- both `409 layout-locked` tests (`L278`, `L387`);
- `succeeds for the same manage_roles@* holder…` (`L293`).

GET:
- nothing stored → 200 `{ layout: null, updatedAt: null }` with `no-store`. This edits `L145` and the legacy-row test at
  `L154`;
- `updatedAt` equals the stored row's `updated_at`;
- a `manage_layout@*` editor without `content:read@authors` receives every tab with roles, and `w-locked` as
  `{ id: 'w-locked', type: 'core/locked', config: {} }`, with no `authors` substring in the body;
- the viewer (no `manage_users@*`) does not receive a `core/setup-checklist` widget, and the tab it emptied is dropped.

PUT (existing cases keep their assertions and only gain the precondition header):
- no precondition header → 428 `precondition-required`, nothing persisted;
- `If-Match` older than the stored `updatedAt` → 409 `layout-conflict`, row byte-unchanged;
- `If-None-Match: *` while a row exists → 409 `layout-conflict`, row byte-unchanged;
- two consecutive admin saves under the harness's frozen clock return strictly increasing `updatedAt`, and replaying the
  first value answers 409;
- `manage_layout` held only on `posts` → 403 `layout-edit-forbidden`, nothing persisted;
- a `manage_layout@*` editor changing only sections of existing tabs → 200, persisted;
- a `manage_layout@*` editor adding a tab, reordering tabs, renaming a label, or changing a tab's roles → 403
  `layout-structure-forbidden`, row byte-unchanged (matrix);
- a `manage_layout@*` editor saving when nothing is stored → 403 `layout-structure-forbidden`, nothing persisted;
- a `manage_layout@*` editor sending `w-locked` back as a placeholder while editing a visible widget → 200. The stored row
  holds `w-locked` with its original type, title and config, and the response shows it as a placeholder;
- the same editor removing the placeholder, or moving it to another column → 422 `invalid-layout`, row byte-unchanged
  (matrix);
- the same editor adding a widget bound to `authors` → 422 `invalid-layout`, row byte-unchanged;
- a `manage_roles@*` holder without `content:read@authors` deleting the whole tab holding `w-locked` → 200, and the tab is
  gone from the stored row.

DELETE:
- admin with the current `If-Match` → 200, row count 0;
- a `manage_roles@*` holder without `content:read@authors`, resetting a layout that holds `w-locked` → 200, row count 0
  (brief rule 21);
- no precondition → 428, row kept;
- stale `If-Match` → 409 `layout-conflict`, row kept;
- `If-None-Match: *` with nothing stored → 200;
- the existing viewer 403 `forbidden` case is kept.

**`apps/dashboard/src/features/dashboard/test/unit/dashboard-builder-dialog.test.tsx`** (unit, edit)
- The mocked `$get` returns `{ layout, updatedAt }`. The existing save assertion (`L123`) now expects
  `({ json }, { headers: { 'If-Match': '"<n>"' } })`.
- New: saving when the builder loaded `{ layout: null, updatedAt: null }` sends `{ 'If-None-Match': '*' }`.
- New: reset sends `If-Match` with the loaded `updatedAt`.
- New: a rejected save with `ApiError(409, { type: 'layout-conflict', detail })` toasts that detail and keeps the dialog
  open.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Before T1, rebuild core and record the API `tsc` baseline (sprint 4 measured 51):
`pnpm run build` in `packages/core/`, then `npx tsc --noEmit | grep -c "error TS"` in `apps/api/`.

1. `pnpm run build` in `packages/core/`: exit 0.
2. `npx vitest run src/dashboard-layout src/rbac` in `packages/core/`: all pass.
3. `npx tsc --noEmit | grep -c "error TS"` in `apps/api/`: equal to the baseline, and 0 errors in
   `dashboard-layout*` / `setup/index.ts` / `permission.middleware*`.
4. `npx vitest run --project unit src/middleware/permission.middleware.test.ts src/shared/db/repositories` in `apps/api/`.
5. `npx vitest run --project flow test/flow/flow-rbac-upgrade.test.ts` in `apps/api/`.
6. `npx vitest run --config vitest.workers.config.ts src/features/dashboard-layout src/features/rbac src/features/stats`
   in `apps/api/` (stats included to prove sprint 1's isolation suite is untouched).
7. `npx tsc --noEmit` in `apps/dashboard/`: no errors.
8. `npx vitest run src/features/dashboard src/features/rbac` in `apps/dashboard/`: all pass.
9. `pnpm beech db:reset`, then
   `npx wrangler d1 execute beech-db --local --command "SELECT p.permission FROM role_permissions p JOIN roles r ON r.id = p.role_id WHERE r.name = 'SuperAdmin' ORDER BY 1"`
   in `apps/api/`: 8 rows, `manage_layout` included.
10. `pnpm beech test --diff`: PASS, including changed-line coverage.
11. `pnpm beech lint`: all tasks successful.
12. Invariant greps (excluding `dist/`, `docs/Sprints/` and `stages/`), each expecting 0 matches:
    - `layout-locked` in `apps/` and `packages/`;
    - `hiddenWidgetCount` in `apps/` and `packages/`;
    - `\.upsert\(` in `apps/api/src/features/dashboard-layout` and `apps/api/src/features/setup`;
    - `features/rbac` in `apps/api/src/features/dashboard-layout`;
    - `features/rbac` in `apps/dashboard/src/features/dashboard`.
13. `graphify update . --force`.

Manual check (`pnpm beech dev`, two browsers, SuperAdmin in both):
- open the builder in both and save in A, then save in B: B toasts the conflict detail;
- reopen B and save: success;
- in the roles UI, "Manage dashboard layout" appears in the System group.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `PERMISSIONS` ends with `'manage_layout'`. Migration `0039` rebuilds `role_permissions` with the 8-value CHECK, keeps
      every existing row, and grants `manage_layout` to SuperAdmin. `manage_seeds` is still rejected at rest.
- [ ] `LOCKED_WIDGET_TYPE`, `isWidgetLockedFor`, `isDashboardLayoutEditor`, `hasDashboardLayoutStructuralChange`,
      `reconcileLockedWidgets`, `LockedWidgetReconciliation` and `DashboardLayoutWriteResult` are exported from
      `@beechcms/core` with the T2–T5 signatures. `FilteredDashboardLayout` has no `hiddenWidgetCount`.
- [ ] `dashboard-layout-editing.ts` imports only `../rbac/*`, `./widget-requirements.js` and types from
      `./dashboard-layout.js`. There is no I/O in any touched core module.
- [ ] The GET projection follows T3:
  - [ ] editors get every tab with roles, and locked widgets as exact placeholders;
  - [ ] readers lose locked widgets (built-in requirements included) and emptied sections and tabs.
- [ ] `filterDashboardLayoutByWidgetRequirements` drops `core/locked`.
- [ ] `IDashboardLayoutRepository` exposes `get` / `save` / `remove` as in T5. The D1 statements are the T5 SQL.
      `updated_at` strictly increases on every save.
- [ ] PUT:
  - [ ] the route row is `anyScope('manage_layout', 'manage_roles')`;
  - [ ] the handler follows T6 steps 1–8 in order, with the T6 problem types;
  - [ ] the response layout is projected.
- [ ] DELETE stays `manage_roles@*`, requires the precondition, and has no lock check. `layout-locked` no longer exists.
- [ ] A `manage_layout`-only caller cannot change the tab set, order, metadata or roles, nor save over nothing, even with
      a hand-crafted request.
- [ ] Nobody can move, remove, or forge a locked widget, or add an unusable one, through PUT. Locked widgets are
      persisted verbatim from the stored layout.
- [ ] The setup demo track uses `save(..., null)` and never overwrites a stored layout.
- [ ] The dashboard builder sends `If-Match` / `If-None-Match: *` on save and reset. The roles UI lists `manage_layout` in
      the System group, with metadata and en/it labels.
- [ ] Anti-escalation is proven for `manage_layout` (assignment refused without holding it).
- [ ] `docs/reference/dashboard-layout.md` matches the T6 contract, with no scoped-route sections.
- [ ] Every SECTION 5 command passes, and every T9 test exists and passes. The `flow-rbac-upgrade` and `d1-role`
      expectation changes are explained in the PR.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- **Builder UX for the new model** (ROADMAP entry 6):
  - opening the builder to `manage_layout@*` (the edit button stays on `canGlobally('manage_roles')`);
  - an opaque card for `core/locked` (until then it renders as an unknown widget in the builder);
  - non-removable or immovable placeholders and sections;
  - hiding structural controls;
  - the 409 reload-and-reapply flow;
  - `SeedSelect` filtering and builder-preview projection.

  The builder must not be modified beyond T7.
- **`manage_seeds`** (ROADMAP entry 7). It is not added to the CHECK, and the vocabulary comment about it is not touched.
- **Legacy axis** (ROADMAP entry 8): `users.role`, `requireAdmin`, `legacy-admin` rows, and `core/dashboard-layout/layout-permissions.ts`
  (entry-editor gate, brief §5).
- **Docs beyond the route reference** (ROADMAP entry 9): `docs/api-reference.md`, `docs/reference/rbac-api.md`,
  `docs/manage/roles-permissions.md`, and `06-role-based-dashboards.md`.
- **No change to `stats/*` or any other data route** (brief §4: phases 2–4 do not touch phase 1). `GET /roles` stays
  `manage_roles@*`.
- **No per-seed meaning for `manage_layout`.** No refusal to assign it on a seed scope, since such a grant simply confers
  nothing (brief §4, reserved for the entry editor).
- **No `revision` column or other `dashboard_layouts` migration.** No `ETag` response header. No handling of a row whose
  JSON fails to parse. No hardening of the existing `validateDashboardLayout` seed warnings.
- **No custom-widget requirement on the server.** `requires` from `@beechcms/widget-sdk` stays client-only (sprint 4
  decision).
