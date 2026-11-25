# Sprint Plan — ManageLayoutPermissionUi (ROADMAP entry 6)

Feature brief: `stages/00_ideation/output/feature_brief.md` (rules 11, 14–21; §3 user stories on `manage_layout`, locked
widgets and concurrent editors; §4 "Stati di errore": "L'editor deve poter ricaricare e riapplicare le proprie modifiche").
Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md`, entry 6. Entries 1–5 have shipped (`30473871`, `b64a39d9`,
`185b13d1`, `9e47d33c`, `5441a90d`). They are archived in `docs/Sprints/DashboardDataScopeClosure/`, `DashboardTabAudienceApi/`,
`DashboardTabAudienceUi/`, `WidgetPermissionRequirements/` and `ManageLayoutPermissionApi/`.

Branch: cut `feature/manage-layout-permission-ui` from `feature/manage-layout-permission-api` (`5441a90d`). `devs` lacks
sprints 1–5, which is the same deviation sprints 4 and 5 recorded.

### Pre-Computation Analysis

The graph was refreshed with `graphify update . --force` (29 047 nodes, 41 813 edges) before any query.

**a) God nodes identified via the CLI**

| Node | Source | Degree / reach | Why it matters here |
|------|--------|----------------|---------------------|
| `usePermissions()` | `apps/dashboard/src/features/shared/hooks/use-permissions.ts:L62` | 56 (`graphify explain`) | The only UI source of authority. The edit gate, the structure gate and the `SeedSelect` filter all read it. No second evaluator is added. |
| `hasPermission()` | `packages/core/src/rbac/evaluate.ts:L64` | 18 | `isDashboardLayoutEditor`, `can()` and `canGlobally()` all resolve to it. The path `DashboardBuilderDialog → … → hasPermission ← isDashboardLayoutEditor` is confirmed with `graphify path`. |
| `useDashboardBuilder()` | `apps/dashboard/src/features/dashboard/builder/use-dashboard-builder.ts:L113` | 13 | Draft ops. `duplicateSection` and `setColumnPreset` must stop producing drafts that the server refuses because of locked widgets. |
| `isDashboardLayoutEditor()` | `packages/core/src/dashboard-layout/dashboard-layout-audience.ts:L25` | callers: `filterDashboardLayoutForViewer`, `putLayout` | Becomes the dashboard's edit-button gate, so the UI and the PUT gate share one function. |
| `filterDashboardLayoutByWidgetRequirements()` | `packages/core/src/dashboard-layout/widget-requirements.ts:L119` | 4 (plus `useDashboardLayout`, a graph miss) | Already drops `core/locked`. It becomes the builder-preview projection. |

**b) Architectural boundaries affected**

- `@beechcms/core`: **no change.** The sprint consumes the existing exports `isDashboardLayoutEditor`,
  `LOCKED_WIDGET_TYPE`, `filterDashboardLayoutByWidgetRequirements` and `hasPermission`/`GLOBAL_SCOPE`. All of them are
  already re-exported from `packages/core/src/index.ts:L89-91`.
- `apps/api`: **no change.** The sprint uses the sprint-5 contract unchanged:
  - route rows `permission.middleware.ts:L102-107`: GET `/` authenticated, GET `/roles` `manage_roles@*`,
    PUT `anyScope(manage_layout, manage_roles)`, DELETE `manage_roles@*`;
  - problem types `layout-conflict` (409), `layout-structure-forbidden` (403), `invalid-layout` (422) and
    `precondition-required` (428).
- `apps/dashboard`, inside `src/features/dashboard/` only:
  - `pages/dashboard-page.tsx`;
  - `builder/` files: `dashboard-builder-dialog.tsx`, `builder-pane.tsx`, `page-tabs-manager.tsx`, `section-card.tsx`,
    `widget-chip.tsx`, `use-dashboard-builder.ts`, `use-layout-roles.ts`, `config-fields.tsx`, and the new
    `locked-widgets.ts`;
  - `locales/{en,it}.json` (keys under `dashboard.builder`);
  - the slice's unit tests.

**c) `graphify affected` impact analysis**

```
graphify affected "useDashboardBuilder()" --depth 2
- builder-pane.tsx, BuilderPaneProps, dashboard-builder-dialog.tsx (DashboardBuilderDialog, BuilderPaneController)
- builder/index.ts, features/dashboard/index.ts [re_exports]; dashboard-page.tsx [imports_from]
- tests: use-dashboard-builder.test.ts, empty-column-drop.test.tsx (Harness L60, CapturingHarness L132),
  builder-pane.test.tsx, section-card.test.tsx, dashboard-builder-dialog.test.tsx
  → The op signatures are unchanged, and only the behaviour of two ops changes. The new required
    BuilderPane prop `hasStoredLayout` breaks the two harnesses in empty-column-drop.test.tsx (L62, L135).
    Both are updated.

graphify affected "SeedSelect()" --depth 2
- 8 adapters import it: activity-feed, data-table, media-gallery, pending-drafts, pie-chart, recent-content,
  stat, timeseries-chart (registry/builtin/*-adapters.tsx); builtin-widgets.tsx
- tests: config-fields.test.tsx, builtin-widgets.test.tsx (+ fallback/chip/sheet/picker/registry via the barrel)
  → The props are unchanged, so no adapter is edited. With the filter, a test that renders SeedSelect without a
    `/api/settings/me` mock sees zero seeds (usePermissions is zero-trust). config-fields.test.tsx (L155) and
    builtin-widgets.test.tsx (L64-67) gain the `settings.me` mock. This is a fixture change; their assertions stay the same.

graphify affected "useLayoutRoles()" --depth 2
- BuilderPaneController() L81, PageAudiencePicker() L64, page-audience-picker.test.tsx
  → The new optional `enabled` parameter defaults to true, so PageAudiencePicker and its test are unaffected.

graphify affected "WidgetChip()" --depth 2      → column-stack.tsx, section-card.tsx, widget-chip.test.tsx, column-stack.test.tsx
graphify affected "PageTabsManager()" --depth 2 → builder-pane.tsx, page-tabs-manager.test.tsx, empty-column-drop.test.tsx
  (the schema-form-shell.tsx edge is a name collision with the entry editor's own component: grep finds no import
  of features/dashboard outside the slice except App.tsx)
  → The new required PageTabsManager prop `canEditStructure` breaks page-tabs-manager.test.tsx (L48), which is updated.
    WidgetChip/SectionCard props are unchanged.

graphify affected "isDashboardLayoutEditor()" --depth 2
- filterDashboardLayoutForViewer(), putLayout(), dashboard-layout-audience.test.ts
  → The sprint only adds a read-only caller (dashboard-page.tsx). Nothing breaks.

graphify path "config-fields.tsx" "use-permissions.ts"
- config-fields.tsx → features/shared/index.ts → use-permissions.ts (2 hops): the shared layer, not a sibling slice.
```

The grep for `features/rbac` in `apps/dashboard/src/features/dashboard` finds 0 matches today, and that must still hold.

### VETO Audit

- **Botanical invariant.** No D1 statement, repository, migration, route or `content_*`/Branch-ID code is touched. The
  sprint is client-only and renders a server contract that already goes through `@beechcms/core` and the D1 repository
  behind the core port. No query bypasses core, because the sprint adds no query.
- **VSA.** Every edit lives in `apps/dashboard/src/features/dashboard/`. Authority comes from `@/features/shared`
  (`usePermissions`, already imported by the builder dialog) and `@beechcms/core`. No import of `features/rbac`. Roles
  still come only from `GET /api/dashboard-layout/roles` (brief "Confini invalicabili"). The new `locked-widgets.ts`
  is builder-local layout geometry, not authorization, and only this slice uses it, so it does not belong in core.
- **No divergent authorization in the UI** (brief §4 "Criteri trasversali"):
  - The edit gate is core `isDashboardLayoutEditor`, the same function `putLayout` uses.
  - The structure gate is `hasPermission(…, 'manage_roles', GLOBAL_SCOPE)`, the same check as `putLayout:L107`.
  - The `SeedSelect` filter is `can('content:read', slug)`, i.e. core `hasPermission`.
  - The builder never recomputes which widgets are locked. It trusts the server's `core/locked` placeholder, which is
    the only lock signal.
- **YAGNI cuts made here:**
  - No automatic merge or rebase of a stale draft. "Reload" refetches and rebuilds the draft. The brief asks that the
    editor *can* reload and reapply, not that the client merges.
  - No client-side `hasDashboardLayoutStructuralChange` pre-check. With the controls hidden, the draft cannot change
    structure, and the server's 403 stays the backstop.
  - No new dialog component. The existing `ConfirmDialog` covers the conflict prompt.
  - No core export and no API change.
- **Cloudflare purity.** Not applicable (no Worker change).

No violation remains. HANDOFF → executor.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 5 made the server enforce the `manage_layout` / `manage_roles` split. The builder still assumes `manage_roles@*`,
which causes four problems:
- **Gate.** A `manage_layout@*`-only holder never sees the "Customize" button (`dashboard-page.tsx:L24`), so the
  permission sprint 5 shipped is unusable.
- **Placeholders.** If such a holder got in, the builder would render the server's `core/locked` placeholders as editable
  "unknown" chips (`widget-chip.tsx:L74-90`). Every way of touching them (remove, move, duplicate a section, shrink
  columns, remove a section) produces a draft that the server answers with 422.
- **Structure and roles.** The structural controls (add/rename/delete/reorder tab, audience, reset) and the `GET /roles`
  fetch (`dashboard-builder-dialog.tsx:L86`, gated `manage_roles@*`) would yield only 403s.
- **Conflicts.** A 409 `layout-conflict` is a dead end. The toast says "reload", but nothing reloads. The builder query
  inherits the global 5-minute `staleTime` (`lib/query-client.ts:L10`), so reopening the builder can send a stale
  `If-Match`, a guaranteed 409.

This sprint makes the builder project the sprint-5 contract (brief rules 14–21). It also closes the two items sprint 4
deferred here (rule 11): `SeedSelect` offers only readable seeds, and the builder preview applies the requirement
projection. It must come after sprint 5 because every behaviour here mirrors a server refusal that only exists since
`5441a90d`. It must come before entries 7–8 because those touch platform-wide authorization and are planned apart
(brief §4).

VSA: one slice, no cross-slice import, authority through `usePermissions()` and core. Botanical Engine: untouched.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Server contract consumed (sprint 5, unchanged here)**
- `GET /api/dashboard-layout` returns `{ layout, updatedAt }` with `no-store`.
  - An editor (`isDashboardLayoutEditor`: `manage_layout@*` or `manage_roles@*`) receives every tab with its `roles`.
    Each widget they cannot use comes back in place as exactly `{ id, type: 'core/locked', config: {} }`
    (`dashboard-layout-audience.ts:L49-53`).
  - Nothing stored: `{ layout: null, updatedAt: null }`.
- `PUT` (`dashboard-layout.handler.ts:L105-164`) checks, in this order:
  1. 403 `layout-edit-forbidden`;
  2. 428;
  3. 422 validation;
  4. 409 `layout-conflict` (`L134`);
  5. 403 `layout-structure-forbidden` for a non-`manage_roles@*` caller changing the tab set, order, `id`, `slug`,
     `label`, `icon` or `roles`, or saving when nothing is stored (`L136-143`);
  6. `reconcileLockedWidgets` (`dashboard-layout-editing.ts:L48-93`).
- `reconcileLockedWidgets` returns 422 when a locked widget:
  - leaves its `(pageId, sectionId, columnId)` (index inside the column is free);
  - is missing while its page still exists;
  - appears with an unknown id, which is a forged placeholder (`L66-67`, `L74-76`, `L86-89`).

  Removing a whole page that holds locked widgets is allowed (`L87`).
- `DELETE` is `manage_roles@*` with a precondition (`L209-217`). The client problem code is read with `problemCode(err)`
  (`lib/http/api-error.ts`), which returns `'layout-conflict'`.

**Dashboard today**
- `dashboard-page.tsx:L22-24`: `canEdit = canGlobally("manage_roles")` gates the button (`L62`) and the dialog mount (`L76`).
- `dashboard-builder-dialog.tsx`:
  - query `['dashboard-builder-layout']` with `enabled: open` and no `staleTime`, so it gets the global 5 minutes (`L41-45`);
  - loader on `isLoading || permissionsLoading` (`L55`);
  - `draftSource = data?.layout ?? generatedDefault ?? initialLayout` (`L47`);
  - `BuilderPaneController` (`L81-142`) calls `useLayoutRoles()` unconditionally (`L86`);
  - `handleSave` validates with `roleIds` when loaded (`L91-103`), PUTs with `updatedAt` (`L107`) and toasts
    `detail ?? title` on failure (`L112-114`);
  - `handleReset` toasts a generic error on any failure (`L120-130`).
- `use-layout-roles.ts:L16-23`: `useLayoutRoles()` takes no argument and has `staleTime: 0`.
- `builder-pane.tsx`:
  - `BuilderPaneProps` (`L29-37`) carries `permissions`;
  - page drag at `L140-141`;
  - `PageTabsManager` at `L156-163`;
  - `PageAudiencePicker` in edit mode at `L166-168`;
  - preview renders the raw `activePage` (`L170-171`);
  - `canRemove = sections.length > 1` (`L183`);
  - Reset at `L219-221`, Save at `L222`.
- `page-tabs-manager.tsx`:
  - add button at `L71-74`;
  - each pill is sortable (`L110`), with a rename/delete dropdown at `L155-174`.
- `section-card.tsx`:
  - column presets at `L137-146`, duplicate at `L148`, remove at `L152-159`;
  - `canRemove` comes from the pane.
- `column-stack.tsx:L51-61` maps each widget to `WidgetChip`. The column droppable is active only when empty (`L39-42`).
- `widget-chip.tsx:L45-127`:
  - sortable grip (`L65-72`);
  - an unknown type shows `AlertTriangle` plus the "Unavailable" badge, and the label falls back to `widget.type`
    (`L57`, `L74-85`);
  - seed badge (`L86-90`);
  - configure/move/remove menu (`L92-124`).
- `use-dashboard-builder.ts`:
  - `duplicateSection` clones every widget with fresh ids (`L222-239`);
  - `setColumnPreset` folds overflow columns' widgets into the last kept column (`L242-265`).
- `config-fields.tsx:L158-179`: `SeedSelect` lists every seed from `useSchema()`.
- `@dnd-kit/sortable` `^10.0.0`: `useSortable({ disabled: { draggable: true } })` disables dragging while keeping the
  item a drop target.
- The icon `Lock` is exported by `reicon-react` (via `@/components/icons`).
- `ConfirmDialog` (`components/ui/confirm-dialog.tsx:L18-25`) takes `{ open, onOpenChange, title, description,
  confirmVariant?, onConfirm }`, with `common.cancel` / `common.confirm` buttons.
- Test fixtures:
  - `@/test/me-payload` (`FULL_AUTHORITY`, `meResponseBody(permissions)`);
  - the `@/lib/rpc` mock shape in `dashboard-builder-dialog.test.tsx:L12-31`;
  - the dropdown-menu mock in `page-tabs-manager.test.tsx:L16` and `section-card.test.tsx:L14`.

There is no middleware order relevant to this sprint, because the API is untouched.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Production (all under `apps/dashboard/src/`):
- `features/dashboard/pages/dashboard-page.tsx`: edit gate becomes `isDashboardLayoutEditor`.
- `features/dashboard/builder/locked-widgets.ts` (**new**): two pure helpers.
- `features/dashboard/builder/use-layout-roles.ts`: optional `enabled` parameter.
- `features/dashboard/builder/dashboard-builder-dialog.tsx`: query freshness, conflict dialog and reload, roles query
  gated, `hasStoredLayout` forwarded.
- `features/dashboard/builder/builder-pane.tsx`: structure gate, first-save block, preview projection.
- `features/dashboard/builder/page-tabs-manager.tsx`: `canEditStructure` prop.
- `features/dashboard/builder/widget-chip.tsx`: opaque locked card.
- `features/dashboard/builder/section-card.tsx`: lock-aware remove and column presets.
- `features/dashboard/builder/use-dashboard-builder.ts`: lock-aware `duplicateSection` / `setColumnPreset`.
- `features/dashboard/builder/config-fields.tsx`: `SeedSelect` lists readable seeds only.
- `locales/en.json`, `locales/it.json`: five keys under `dashboard.builder`.

Tests (dashboard unit tier, `features/dashboard/test/unit/`): see T9.

Excluded: any file in `packages/`, `apps/api/`, `docs/` (entry 9), `features/rbac/`, `features/shared/`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### T1 — Edit gate (`pages/dashboard-page.tsx`)

Replace `canGlobally("manage_roles")` (`L22-24`) with core `isDashboardLayoutEditor(effective)`, taking `effective` from
`usePermissions()`. Reason: it is the function `putLayout` gates with, so the button cannot diverge from the server.
Rewrite the `L23` comment: it mirrors the PUT gate (`manage_layout` or `manage_roles` at `*`), and the server enforces.
The button (`L62`) and the dialog mount (`L76`) keep reading `canEdit`. A seed-scoped `manage_layout` confers nothing, and
core already encodes that.

### T2 — Locked-widget helpers (`builder/locked-widgets.ts`, new)

Builder-local, pure, no React. Copy the SPDX header from `use-dashboard-builder.ts:L1-3`. Exact exports:

```ts
import type { DashboardSection, DashboardWidgetInstance } from '@beechcms/core'

/** Whether `widget` is the server's opaque stand-in for a widget the author cannot use (`LOCKED_WIDGET_TYPE`). */
export function isLockedWidget(widget: Pick<DashboardWidgetInstance, 'type'>): boolean

/**
 * The fewest columns `section` may keep so that every locked widget stays in its own column:
 * the index of the last column holding one, plus one. 0 = the section holds no locked widget.
 */
export function lockedColumnFloor(section: DashboardSection): number
```

Rules:
- `isLockedWidget` compares against core's `LOCKED_WIDGET_TYPE` and never re-evaluates permissions. The server's
  placeholder is the only lock signal.
- A section is locked-for-removal iff `lockedColumnFloor(section) > 0`. Every editor is bound by these rules, including
  `manage_roles@*`, because `reconcileLockedWidgets` refuses everyone alike.

### T3 — Draft ops respect locks (`builder/use-dashboard-builder.ts`)

- `duplicateSection` (`L222-239`): the clone omits every widget for which `isLockedWidget` is true. Columns keep their
  count and spans, and only unlocked widgets get fresh ids. Reason: a cloned placeholder has a new id the server
  treats as forged (422). The original section is unchanged.
- `setColumnPreset` (`L242-265`): when `spans.length < lockedColumnFloor(section)`, the op is a no-op and the draft is
  unchanged. Reason: the overflow fold would move a locked widget into another column (422 "cannot be moved"). Growing,
  or shrinking above the floor, behaves exactly as today.
- No other op changes:
  - `moveWidget` / `moveWidgetToPage` are never invoked on a locked widget (T4 removes its handles);
  - moving other widgets around a locked one inside its column is allowed (index is free server-side);
  - `removePage` on a page with locked widgets stays allowed (server `L87`).

### T4 — Opaque placeholder and lock-aware section (`builder/widget-chip.tsx`, `builder/section-card.tsx`)

**`WidgetChip`** (no prop change): when `isLockedWidget(widget)` the chip renders a distinct, non-interactive card:
- `Lock` icon in the grip's place, then the label `t('dashboard.builder.widget.locked')`, with
  `title={t('dashboard.builder.widget.lockedHint')}` on the card;
- no grip button, no seed badge, no "Unavailable" badge, no configure button, no dropdown menu;
- `onConfigure`, `onRemove` and `onMoveToPage` can never fire;
- `useSortable` is still called (hooks order) with `disabled: { draggable: true }`, so the card stays a drop target and
  other widgets can be ordered around it;
- muted styling (`bg-muted`, dashed border) distinguishes it from the "unknown type" chip, which keeps today's rendering
  for non-locked unknown types.

Brief rule 19: the card reveals neither type, seed nor config. The placeholder carries none, and the chip never prints
`widget.type` for it.

**`SectionCard`** (no prop change):
- derives `floor = lockedColumnFloor(section)`;
- the Remove item renders only when `canRemove && floor === 0` (brief rule 20);
- each column-preset item with `preset.length < floor` renders `disabled`, the same guard as T3, so the menu never
  offers a refused op;
- Duplicate stays enabled (T3 makes it safe);
- rename, hide label and collapsible are content and stay.

### T5 — Structure gate, first save, preview (`builder/builder-pane.tsx`, `builder/page-tabs-manager.tsx`)

**`BuilderPaneProps`** gains exactly:

```ts
  /** False when nothing is stored yet: the first save is structural (server 403 for non-`manage_roles@*`). */
  readonly hasStoredLayout: boolean
```

Inside `BuilderPane`, derive `canEditStructure = hasPermission(permissions, 'manage_roles', GLOBAL_SCOPE)` (core). No new
prop: `permissions` is already passed, and the derivation is the server's `L107` check verbatim. When
`canEditStructure` is false:
- `PageTabsManager` receives `canEditStructure={false}`;
- `PageAudiencePicker` is not rendered (`L166-168`), so it never mounts `useLayoutRoles`;
- the Reset button (`L219-221`) is not rendered, because DELETE is `manage_roles@*`;
- `onDragEnd` ignores the `page:` branch (`L140-141`), as defence in depth;
- when also `!hasStoredLayout`:
  - Save is disabled regardless of `isDirty`;
  - the footer shows `t('dashboard.builder.firstSaveNeedsRoles')` as muted text on the left of the button row.

  The draft stays editable for preview, but cannot be saved.

`manage_roles@*` holders see everything exactly as today.

**Preview** (`L170-171`): render `filterDashboardLayoutByWidgetRequirements({ version: 1, pages: [activePage] },
permissions, widgetRequirementOf)`, memoized on `activePage` and `permissions`. `widgetRequirementOf` comes from
`../registry/widget-registry`. The projection already drops `core/locked` and unusable widgets, so the preview equals
what the author will see on the dashboard (sprint-4 deferral). An emptied page renders the renderer's empty state.

**`PageTabsManagerProps`** gains exactly:

```ts
  /** `manage_roles@*`: add, rename, delete and reorder tabs. Otherwise tabs can only be selected. */
  readonly canEditStructure: boolean
```

When false:
- no "Add Page" button (`L71-74`);
- no per-pill dropdown (`L155-174`), so no rename and no delete;
- each pill's `useSortable` gets `disabled: true`;
- clicking a pill, or Enter/Space on it, still calls `onSetActive`.

### T6 — `SeedSelect` lists readable seeds (`builder/config-fields.tsx`)

Filter `seeds` (`L160`) to those where `usePermissions().can('content:read', seed.slug)` holds. Reason: this is the core
evaluator, and it stops an author from binding a widget the server would refuse as unusable (422) or that they could
never see (rule 11).

Rules:
- the current `value` is passed through unchanged even when not listed, and no `onChange` fires;
- props are unchanged, so none of the eight adapters is edited;
- `BranchAliasSelect` / `FormulaEditor` are unchanged, because they read the seed already chosen.

### T7 — Roles query, freshness, conflict reload (`builder/use-layout-roles.ts`, `builder/dashboard-builder-dialog.tsx`)

**`useLayoutRoles`** signature becomes exactly:

```ts
export function useLayoutRoles(enabled = true): UseQueryResult<LayoutRole[]>
```

`enabled` is forwarded to `useQuery`.

In `BuilderPaneController`, call it with `hasPermission(permissions, 'manage_roles', GLOBAL_SCOPE)`, so a
`manage_layout`-only author never requests `GET /roles` (403). `handleSave` already omits `roleIds` when `roles` is
undefined (`L94`).

**Builder layout query** (`L41-45`):
- add `staleTime: 0`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`;
- the loader condition (`L55`) becomes `isFetching || permissionsLoading`.

Reason: every opening, and every reload, fetches the current version behind the loader and mounts a fresh controller
from it. The draft therefore always starts from the version it will echo as `If-Match`. Focus and reconnect refetches
are off because they would unmount the controller and discard the draft.

**Conflict flow.**
- `BuilderPaneControllerProps` gains `readonly onConflict: () => void`.
- `BuilderPaneController` forwards `hasStoredLayout={updatedAt !== null}` to `BuilderPane`.
- In `handleSave`'s catch (`L112-114`) and in `handleReset`'s catch (`L127-129`): when
  `problemCode(err) === 'layout-conflict'`, call `onConflict()` and do not toast. Otherwise keep the current toasts.
  `handleReset` gains `err` in its catch for this.
- `DashboardBuilderDialog` owns `conflictOpen` state and renders one `ConfirmDialog`:
  - `title={t('dashboard.builder.conflictTitle')}`;
  - `description={t('dashboard.builder.conflictDesc')}`;
  - default variant.
- **Confirm (reload):**
  1. close the prompt;
  2. `invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.layout() })`;
  3. `refetch()`.

  The `isFetching` loader unmounts the controller, and the fetched version remounts it with a fresh draft. The user
  reapplies their edits by hand. No merge is attempted (VETO Audit).
- **Cancel:** closes the prompt and keeps the draft untouched. A later Save conflicts again.
- The builder dialog stays open in both cases.

### T8 — Locales (`locales/en.json`, `locales/it.json`)

Add under `dashboard.builder.widget`:

| Key | en | it |
|-----|----|----|
| `locked` | `Widget unavailable` | `Widget non disponibile` |
| `lockedHint` | `You cannot see this widget's data. It stays where it is.` | `Non puoi vedere i dati di questo widget. Resta al suo posto.` |

Add under `dashboard.builder`:

| Key | en | it |
|-----|----|----|
| `firstSaveNeedsRoles` | `Only someone who manages roles can create the first dashboard layout.` | `Solo chi gestisce i ruoli può creare il primo layout della dashboard.` |
| `conflictTitle` | `The layout was changed by someone else` | `Il layout è stato modificato da qualcun altro` |
| `conflictDesc` | `Another editor saved the dashboard after you opened it. Reload the latest version, then apply your changes again. Your unsaved edits will be lost.` | `Un altro editor ha salvato la dashboard dopo che l'hai aperta. Ricarica l'ultima versione e riapplica le tue modifiche. Le modifiche non salvate andranno perse.` |

The existing `widget.unavailable` stays (unknown types).

### T9 — Tests (dashboard unit tier, `apps/dashboard/src/features/dashboard/test/unit/`)

Every file is dashboard unit tier, jsdom (the existing component idiom), double quotes, SPDX header, with
`vi.clearAllMocks()` in `beforeEach`. Mock only `@/lib/rpc`, `sonner` and the dropdown-menu primitive, as the files
already do. Authority always comes from `meResponseBody(…)` (`@/test/me-payload`) through the `settings.me` mock.
Layout fixtures are local `makeLayout`-style builders, where a locked widget is the literal
`{ id: "widget-locked", type: "core/locked", config: {} }`.

**`dashboard-page.test.tsx`** (extend; existing `manage_roles` tests stay):
- `it("shows the Customize button once me reports manage_layout in global")`
- `it("never shows the Customize button when me reports manage_layout only under a seed scope")`

**`dashboard-builder-dialog.test.tsx`:**
- **Replace** `L150` ("toasts the problem detail … 409 layout-conflict") with:
  - `it("opens the conflict prompt and toasts nothing when the save is refused with 409 layout-conflict")`: the prompt
    title is visible, `toast.error` is not called and the dialog is not closed.
- **Add:**
  - `it("reloading from the conflict prompt refetches the layout and the next save sends the new version as If-Match")`:
    getLayout resolves version A then version B, and the second PUT carries `If-Match: "B"`.
  - `it("reloading from the conflict prompt discards the unsaved draft")`: the section added before the conflict is gone.
  - `it("keeps the draft when the conflict prompt is cancelled")`: the added section is still rendered and no second GET
    is made.
  - `it("opens the conflict prompt when the reset is refused with 409 layout-conflict")`
  - `it("refetches the stored layout on every opening instead of reusing the cached version")`: close, reopen, and
    getLayout is called twice.
  - `it("never requests GET /roles for an author holding manage_layout but not manage_roles")`
  - `it("saves a manage_layout-only author's content edit with the loaded version as If-Match")`
  - `it("sends a locked placeholder back unchanged at its original column when saving")`: the PUT body holds the exact
    placeholder in `col-1`.

**`builder-pane.test.tsx`** (via `DashboardBuilderDialog`, with `meResponseBody` for a `manage_layout`-only author):
- `it("hides Add Page, the Visible to picker and Reset from an author without manage_roles")`
- `it("disables Save and shows the first-save notice for a manage_layout-only author when nothing is stored")`
- `it("keeps Save enabled for a manage_roles author when nothing is stored")`
- `it("previews only the widgets the author can use, never the locked placeholder")`: a page with `core/locked` and
  `core/text` previews only the text.

**`empty-column-drop.test.tsx`**: fixture-only change. Pass `hasStoredLayout` to both harnesses (`L62`, `L135`).

**`page-tabs-manager.test.tsx`**: existing renders get `canEditStructure`. Add:
- `it("renders neither the add button nor any tab menu when canEditStructure is false")`
- `it("still selects a tab on click when canEditStructure is false")`

**`widget-chip.test.tsx`:**
- `it("renders a locked placeholder as 'Widget unavailable' without type, seed badge, grip or menu")`
- `it("never calls onConfigure when the locked placeholder is clicked")`
- `it("keeps the unknown-type rendering for an unregistered type that is not core/locked")`

**`section-card.test.tsx`:**
- `it("omits Remove for a section holding a locked widget even when canRemove is true")`
- `it("disables only the column presets with fewer columns than the last locked column")`: a locked widget in column 2
  of 3 disables `[12]` and enables `[6, 6]` and `[4, 4, 4]`.

**`use-dashboard-builder.test.ts`:**
- `it("duplicateSection omits locked placeholders from the clone and keeps them in the original")`
- `it("setColumnPreset below the locked column floor leaves the draft unchanged")`
- `it("setColumnPreset at the locked column floor folds only unlocked overflow widgets")`

**`locked-widgets.test.ts`** (new; pure unit, `// @vitest-environment node`):
- `describe("isLockedWidget")`: `it("is true only for the core/locked type")`
- `describe("lockedColumnFloor")`, driven from one array:
  - `it("returns 0 without locked widgets and last-locked-column index plus one otherwise")`

**`config-fields.test.tsx`:**
- Add `settings.me` to the rpc mock (`FULL_AUTHORITY` in `beforeEach`).
- Add:
  - `it("SeedSelect lists only the seeds the caller may content:read")`: `byScope: { posts: ["content:read"] }` lists
    Posts, not Pages.
  - `it("SeedSelect lists no seed while the caller holds no content:read")`

**`builtin-widgets.test.tsx`**: fixture-only change. Add `settings.me` with `FULL_AUTHORITY` to its rpc mock, so the seed
pick at `L64-67` still finds "Posts".

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

1. `pnpm run build` in `packages/core/`: exit 0 (no core change, but the dashboard type-checks against it).
2. `npx tsc --noEmit` in `apps/dashboard/`: no errors.
3. `npx vitest run src/features/dashboard src/features/rbac` in `apps/dashboard/`: all pass.
4. `pnpm beech test --diff`: PASS, including changed-line coverage.
5. `pnpm beech lint`: all tasks successful.
6. Invariant greps (excluding `dist/`, `docs/Sprints/` and `stages/`), each expecting 0 matches:
   - `features/rbac` in `apps/dashboard/src/features/dashboard`;
   - `canGlobally\("manage_roles"\)` in `apps/dashboard/src/features/dashboard/pages`;
   - `user\.role|isDeveloper` in `apps/dashboard/src/features/dashboard` (non-test files);
   - `git diff --stat feature/manage-layout-permission-api -- packages apps/api` is empty.
7. `graphify update . --force`.

Manual check (`pnpm beech dev`). Setup:
- Browser A: SuperAdmin.
- Browser B: a user whose role holds `manage_layout@*` and `content:read@posts` only.
- As A, save a layout with two tabs, where the second tab mixes a `posts` widget and an `articoli` widget.

Steps:
- **B opens the builder:**
  - "Customize" is visible;
  - no Add Page, tab menu, "Visible to" or Reset;
  - the `articoli` widget is a "Widget unavailable" card that cannot be dragged and has no menu;
  - its section has no Remove;
  - the `[12]` preset is disabled if the card sits in column 2+;
  - the network panel shows no `GET /api/dashboard-layout/roles`.
- **B edits and saves:** B adds a widget, binds it via a SeedSelect that lists only `posts`, and saves. The save
  succeeds, and A's dashboard still shows the `articoli` widget.
- **Concurrent save:** A and B open the builder, and A saves. B saves and gets the conflict prompt. B clicks Confirm,
  the builder reloads with A's version, and B's next save succeeds.
- **Preview:** B's preview never shows the card.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] The Customize button and the builder mount are gated by core `isDashboardLayoutEditor`. A seed-scoped
      `manage_layout` does not open them.
- [ ] A non-`manage_roles@*` author:
  - [ ] sees no add, rename, delete or reorder tab control, no audience picker and no Reset;
  - [ ] never requests `GET /api/dashboard-layout/roles`;
  - [ ] cannot save when nothing is stored, and sees `firstSaveNeedsRoles`.
- [ ] A `manage_roles@*` author keeps every control and behaviour shipped by sprints 3–5.
- [ ] A `core/locked` widget renders as an opaque card that cannot be dragged, configured, removed or moved, and shows
      no type, seed or config.
- [ ] A section holding a locked widget cannot be removed. No column preset or draft op moves a locked widget out of
      its column. A duplicated section contains no placeholder.
- [ ] The builder preview equals `filterDashboardLayoutByWidgetRequirements` of the active page, and never shows a
      placeholder.
- [ ] `SeedSelect` lists only seeds the author may `content:read`, via `usePermissions().can`.
- [ ] A 409 `layout-conflict` on save or reset opens the conflict prompt:
  - [ ] Confirm refetches and rebuilds the draft from the new version;
  - [ ] Cancel keeps the draft.
- [ ] Every opening of the builder fetches the current version. Focus and reconnect never discard a draft.
- [ ] `isLockedWidget` / `lockedColumnFloor` match the T2 signatures, and `useLayoutRoles` / `BuilderPaneProps` /
      `PageTabsManagerProps` match T5/T7 exactly.
- [ ] No file under `packages/` or `apps/api/` changes. No import of `features/rbac` from the dashboard slice. No
      authorization rule is re-implemented in the UI.
- [ ] The five locale keys exist in both `en.json` and `it.json`.
- [ ] Every SECTION 5 command passes, and every T9 test exists and passes. The fixture-only changes
      (`config-fields`, `builtin-widgets`, `empty-column-drop`, `page-tabs-manager` renders) and the replaced `L150`
      conflict test are explained in the PR.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- **Any API or core change.** No route, route row, problem type, permission, migration, core export, or
  `docs/reference/dashboard-layout.md` edit. Sprint 5's contract is final for this sprint.
- **Automatic merge or rebase of a stale draft**, a diff view between versions, or an "overwrite anyway" action. Reload
  rebuilds the draft and the author reapplies by hand.
- **Client-side lock computation** (`isWidgetLockedFor` in the dashboard) and a client-side structural pre-check
  (`hasDashboardLayoutStructuralChange`). The server's placeholder and 403 are the authority.
- **Locking custom widgets whose `requires` is unmet.** The server cannot see `requires` (sprint-4 decision), so they are
  not placeholders, and this stays a known limitation.
- **Tab icon or slug editing UI**, audience indicators on tab pills, or any new structural capability.
- **`manage_seeds`** (ROADMAP entry 7). **Legacy axis** removal, including `PermissionsApi.isDeveloper` and
  `users.role` (entry 8).
- **RBAC docs** (`06-role-based-dashboards.md`, `api-reference.md`, `rbac-api.md`, `roles-permissions.md`) and typedoc
  regeneration (entry 9).
- **Pre-existing gaps:** the query cache is not cleared on logout, and `StatWidgetAdapter`'s double fetch.
- **The roles-UI entry for `manage_layout`.** It already shipped in sprint 5. Do not touch `features/rbac/`.
