# Sprint Plan — WidgetPermissionRequirements (ROADMAP entry 4)

Feature brief: `stages/00_ideation/output/feature_brief.md` (rules 5, 9, 10, 11; §4 "Stato intermedio": default generator).
Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md`, entry 4. Entries 1–3 are shipped
(`30473871`, `b64a39d9`, `185b13d1`) and archived in `docs/Sprints/DashboardDataScopeClosure/`,
`docs/Sprints/DashboardTabAudienceApi/` and `docs/Sprints/DashboardTabAudienceUi/`.

### Pre-Computation Analysis

Graph refreshed with `graphify update . --force` (28 983 nodes, 41 601 edges) before any query.

**a) God nodes identified via the CLI**

| Node | Source | Degree | Why it matters here |
|------|--------|--------|---------------------|
| `usePermissions()` | `apps/dashboard/src/features/shared/hooks/use-permissions.ts:L62` | 52 | The single UI authority source. Every new UI decision in this sprint reads `effective` from it, and no other permission path is added. |
| `hasPermission()` | `packages/core/src/rbac/evaluate.ts:L64` | 12 | The single authorization question. The new core evaluator delegates to it and to `hasPermissionAnywhere()` (`evaluate.ts:L123`). |
| `getWidgetDefinition()` | `apps/dashboard/src/features/dashboard/registry/widget-registry.ts:L47` | 9 | Consumed by the widget host, chip, config sheet and builder hook. The new requirement lookup sits beside it in the same module. |
| `filterDashboardLayoutForViewer()` | `packages/core/src/dashboard-layout/dashboard-layout-audience.ts:L32` | 4 | The server-side projection. This sprint deliberately leaves it **unchanged**, so its behaviour stays as sprint 2 shipped it. |

**b) Architectural boundaries affected**

- `@beechcms/core` (`packages/core/src/dashboard-layout/`). A new pure module `widget-requirements.ts` holds:
  - the requirement vocabulary;
  - the evaluator;
  - the built-in requirement table;
  - the layout projection.

  `generateDefaultDashboardLayout` gains a mandatory `permissions` argument. Zero I/O, and no new dependency (it imports only `../rbac/*`, as `dashboard-layout-audience.ts:L4-6` already does).
- `@beechcms/widget-sdk` (`packages/widget-sdk/src/`). `WidgetDefinition` gains an optional, additive `requires`, and the SDK re-exports the `WidgetRequirement` type from core.
- `apps/dashboard` (`src/features/dashboard/` only). The changes:
  - registry: requirement lookup and usability check;
  - layout hook: projection, permission-aware default, combined loading flag;
  - page: no render while loading;
  - builder dialog, builder pane and widget picker: `permissions` threaded down, palette filtered.
- `apps/api`: **not touched**. No handler, route row, repository or migration changes.

**c) `graphify affected` impact analysis**

```
graphify affected "dashboard_layout_dashboard_layout_audience_filterdashboardlayoutforviewer" --depth 2
- refuseIfLocked() [calls]  apps/api/src/features/dashboard-layout/dashboard-layout.handler.ts:L45
- dashboard-layout-audience.test.ts [imports]
- putLayout() [calls]       apps/api/src/features/dashboard-layout/dashboard-layout.handler.ts:L79
  → untouched by this sprint; the API's GET/PUT/DELETE behaviour is byte-identical.

graphify affected "dashboard_layout_dashboard_layout_generatedefaultdashboardlayout" --depth 2
- dashboard-layout.test.ts [imports]
  → the graph misses the two barrel-import callers, verified by grep:
    apps/dashboard/src/features/dashboard/hooks/use-dashboard-layout.ts:L33
    apps/dashboard/src/features/dashboard/builder/dashboard-builder-dialog.tsx:L35
  → the signature change (new mandatory `permissions`) breaks exactly these 2 callers + the
    core test file; all three are updated in this sprint. No API caller exists.

graphify affected "src_widget_definition_widgetdefinition" --depth 3
- define-widget.ts, define-widget.test.ts [imports]; index.ts [re_exports]
  → `requires` is optional and additive: no existing definition (built-in or test) fails to type-check.

graphify affected "builder_widget_picker_dialog_widgetpickerdialog" --depth 2
- builder-pane.tsx, dashboard-builder-dialog.tsx, widget-picker-dialog.test.tsx, empty-column-drop.test.tsx
- schema-form-shell.tsx (entry-editor)  ← FALSE POSITIVE: it imports the entry-editor slice's own
  `../builder/builder-pane` (name collision), verified at schema-form-shell.tsx:L35.
  → the new required props (`permissions` on WidgetPickerDialog and BuilderPane) break exactly
    builder-pane.tsx (mount), dashboard-builder-dialog.tsx (mount), and the two test files; all updated.
```

`graphify path "WidgetPickerDialog" "hasPermission"` finds only a 6-hop chain through unrelated UI
(`DialogContent` → `settings-dialog.tsx` → … → `createInvitationHandler`). There is no direct authorization path today,
so the picker's new filtering adds the first one, through core.

### VETO Audit

- **Botanical invariant.** Zero D1 access anywhere in the sprint. The only database-adjacent code touched is pure core logic. No field
  names are hardcoded: the evaluator reads the opaque `config.seedSlug` key. Core already reserves that key
  (`dashboard-layout.ts:L11-13`), and the server filter (`dashboard-layout-audience.ts:L45`) and the validator
  (`dashboard-layout.ts:L246`) already read it. **PASS.**
- **VSA.** Every dashboard change stays inside `apps/dashboard/src/features/dashboard/`. The only imports added from
  outside the slice are `@/features/shared/hooks/use-permissions` (already imported by `dashboard-page.tsx:L11`) and
  `@beechcms/core`. Requirement evaluation is shared logic, so it lives in `@beechcms/core`, not in the slice. The
  dashboard and, in sprint 5, the API therefore call the same function (brief: "Nessuna logica di autorizzazione
  viene reimplementata nella UI"). No `features/rbac` import. **PASS.**
- **Cloudflare purity.** No runtime, binding or migration change. **PASS.**
- **YAGNI cuts applied here.** These were adjusted before drafting:
  1. **No server-side requirement filtering.** It was rejected for this sprint. The brief assigns requirement evaluation
     to the renderer (rule 10). Custom-widget requirements are invisible to the Worker, so the client must
     evaluate them anyway. Data routes already enforce RBAC (sprint 1). Changing `filterDashboardLayoutForViewer` now
     would also change sprint 2's interim 409 `layout-locked` trigger, which is ROADMAP entry 5's job.
  2. **No function-valued `requires` in the SDK.** Custom widgets get the static union only. The one built-in whose
     requirement depends on its config (`core/stat`) is resolved inside core, so no public callback contract is needed.
  3. **No `SeedSelect` filtering, no builder-preview projection, no locked-widget placeholder.** Each adds a
     `usePermissions` consumer to shared builder fields, or overlaps ROADMAP entry 6. All three are deferred there (SECTION 7).
- **Single source of truth.** The built-in requirement table lives in core, not in the dashboard registry. The core
  default generator must exclude built-ins without knowing dashboard definitions, and ROADMAP entry 5's server lock
  decision needs the same table. Built-in registrations in `builtin-widgets.tsx` therefore carry **no** `requires`.

No violation remains. HANDOFF → executor.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprints 1–3 made the server authoritative: data routes project by scope, and the layout is audience-filtered.
The dashboard still renders every widget it is served. As a result:
- a `content:read@posts`-only reader still gets the setup checklist, system health, storage and media gallery widgets,
  each of which then fails with a 403 from its data route;
- the builder palette offers those widgets to an author who could never see them (brief rule 11);
- the default layout, generated client-side when nothing is stored, always contains them (§4 "Stato intermedio").

This sprint gives every widget a declared, optional requirement (brief rule 9) and evaluates it with the core
evaluator in exactly three places: renderer projection, palette and default generator (rules 10–11). It must land
before ROADMAP entry 5, because the `manage_layout` lock decision ("can this author use this widget?") is exactly this
evaluation. Doing entry 5 first would invent a second authorization path.

VSA: everything UI-side stays in the `dashboard` slice and reads authority only through `usePermissions()`. The rules
themselves are in `@beechcms/core` (pure, framework-free, already depended on by the SDK and the dashboard), so the API
can reuse them in sprint 5 without importing a dashboard slice. Botanical Engine: untouched. No query, no schema, no
migration.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Core layout contract** (`packages/core/src/dashboard-layout/dashboard-layout.ts`)
- `DashboardWidgetInstance { id, type, title?, config }` (`L14-19`). `config.seedSlug` is the only key core reads.
- `generateDefaultDashboardLayout(seeds, opts?: { newId })` (`L127`) builds one `overview` page:
  - setup-checklist (`L146-150`);
  - a status row: site-status, storage, publication-stats, plus quick-draft when `seeds.length > 0` (`L153-165`);
  - when seeds exist, a content row (recent-content, pending-drafts) and a media row (media-gallery,
    activity-feed), bound to `articoli` or else the first seed (`L167-191`).

  It never consults permissions.
- Barrel: `packages/core/src/index.ts:L88-89` re-exports `dashboard-layout.js` and `dashboard-layout-audience.js`.

**Core RBAC** (`packages/core/src/rbac/`)
- `hasPermission(effective, permission, scope)` (`evaluate.ts:L64`). A global grant satisfies any scope, and a scoped grant
  never satisfies `GLOBAL_SCOPE`. An empty-string scope is satisfied only by a global grant.
- `hasPermissionAnywhere(effective, permission)` (`evaluate.ts:L123`).
- `GLOBAL_SCOPE = '*'` (`permissions.ts:L37`), `Permission` (`permissions.ts:L31`).

**Server projection** (`packages/core/src/dashboard-layout/dashboard-layout-audience.ts:L32`). It drops tabs outside the
audience and widgets whose `config.seedSlug` is unreadable. It drops empty sections/pages for non-`manage_roles@*` callers and
strips `roles`. Called by `GET /api/dashboard-layout` and `refuseIfLocked` (`dashboard-layout.handler.ts:L45,L116`).
**Unchanged by this sprint.**

**Widget contract** (`packages/widget-sdk/src/widget-definition.ts:L16-33`). `WidgetDefinition<TConfig>` has `type`,
`labelKey`, `descriptionKey?`, `icon?`, `category`, `configSchema`, `defaultConfig`, `component`, `minColumnSpan?` and
`ConfigPanel?`. There is no requirement field. The SDK barrel re-exports core types at `src/index.ts:L12-20`.

**Dashboard slice** (`apps/dashboard/src/features/dashboard/`)
- Registry (`registry/widget-registry.ts`):
  - `registerWidget` (`L21`);
  - `isWidgetDisabled` (`L43`);
  - `getWidgetDefinition` (`L47`);
  - `listWidgetDefinitions` (`L52`);
  - `knownWidgetTypes` (`L60`).

  Built-ins are registered in `registry/builtin-widgets.tsx` (21 types, `L113-430`).
- Data source per built-in. Verified against the route table in `apps/api/src/middleware/permission.middleware.ts:L116-166`:

  | Built-in type | Data route(s) | Route gate |
  |---|---|---|
  | `core/setup-checklist` | `stats/setup-checklist` | `manage_users@*` |
  | `core/system-health`, `core/site-status`, `core/storage` | `stats/health`, `stats/cloudflare` | `view_analytics@*` |
  | `core/media-gallery` | `stats/media-library`, `stats/unused-media` | `content:read@*` |
  | `core/publication-stats`, `core/content-pulse`, `core/recent-activity` | `stats/total`, `stats/breakdown`, `stats/recent-activity` | authenticated, scope-projected |
  | `core/activity-feed` | `stats/recent-activity?slug=` | authenticated, scope-projected |
  | `core/recent-content`, `core/pending-drafts`, `core/quick-draft` | `/api/content/:slug` | `content:*@slug` |
  | `core/line-chart`, `core/bar-chart`, `core/area-chart`, `core/pie-chart`, `core/data-table` | `/api/widget/*/:seed` | `content:read@seed` |
  | `core/stat` | `/api/widget/aggregate/:seed` when `seedSlug` is set; otherwise `stats/total` (`statKey` `total`) or `stats/cloudflare` (`visitors`/`traffic`/`storage`) | see the requirement table |
  | `core/text`, `core/quick-actions`, `core/ai-insights` | none | — |
- Layout hook `hooks/use-dashboard-layout.ts:L22-42`. The stored layout query uses `staleTime: 0`. It returns `stored ?? generatedDefault`.
  The generated default is memoized on `[seeds]` (`L33`). `isLoading` covers only the layout query.
- Page `pages/dashboard-page.tsx`: `useDashboardLayout()` (`L20`), `usePermissions().canGlobally("manage_roles")` gate
  (`L22-24`), and the renderer is always mounted (`L70`).
- Renderer `renderer/dashboard-layout-renderer.tsx:L23`. Its active page falls back to the first served page, and it shows the empty state when
  there are no pages. Presentational, no permission reads, **unchanged**.
- Builder:
  - `builder/dashboard-builder-dialog.tsx`: generator call `L35`, builder layout query `L37-41`, loader branch `L51`, `BuilderPaneController` `L73-125` mounting `<BuilderPane …>` at `L124`.
  - `useDashboardBuilder` seeds its draft once from `initialLayout` (`use-dashboard-builder.ts:L114`), so whatever
    `initialLayout` is at mount time is final.
  - `builder/builder-pane.tsx`: `BuilderPaneProps` `L28-34`, `WidgetPickerDialog` mount `L225-234`.
  - `builder/widget-picker-dialog.tsx`: props `L23-27`; groups every registered definition `L34-43`; disabled types are rendered disabled (`L60-66`).
- Authority: `usePermissions()` returns `{ effective, can, canAnywhere, canGlobally, isLoading, … }`
  (`features/shared/hooks/use-permissions.ts:L39-77`). With no `/me` payload it returns `NO_AUTHORITY` (empty sets).
  `hydrateEffectivePermissions` (`L24`) is exported for tests.
- Shared dashboard test helpers live in `apps/dashboard/src/test/` (precedent: `widget-client.ts`).
  `dashboard-page.test.tsx:L36-48` has a local `meBody(permissions)` builder.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Create:
- `packages/core/src/dashboard-layout/widget-requirements.ts`
- `packages/core/src/dashboard-layout/widget-requirements.test.ts`
- `apps/dashboard/src/test/me-payload.ts` (shared `/me` fixture for dashboard unit tests)

Edit:
- `packages/core/src/index.ts`: barrel line for `widget-requirements.js`.
- `packages/core/src/dashboard-layout/dashboard-layout.ts`: `generateDefaultDashboardLayout` signature + filtering.
- `packages/core/src/dashboard-layout/dashboard-layout.test.ts`: update existing calls, add generator cases.
- `packages/widget-sdk/src/widget-definition.ts`: `requires?` field.
- `packages/widget-sdk/src/index.ts`: re-export the `WidgetRequirement` type.
- `apps/dashboard/src/features/dashboard/registry/widget-registry.ts`: `widgetRequirementOf`, `isWidgetDefinitionUsable`.
- `apps/dashboard/src/features/dashboard/hooks/use-dashboard-layout.ts`: projection + permission-aware default + loading.
- `apps/dashboard/src/features/dashboard/pages/dashboard-page.tsx`: renderer mounted only when not loading.
- `apps/dashboard/src/features/dashboard/builder/dashboard-builder-dialog.tsx`: permissions to generator and pane; wait for `/me`.
- `apps/dashboard/src/features/dashboard/builder/builder-pane.tsx`: new `permissions` prop, passed to the picker.
- `apps/dashboard/src/features/dashboard/builder/widget-picker-dialog.tsx`: new `permissions` prop, palette filtered.
- Dashboard tests: `widget-registry.test.ts`, `widget-picker-dialog.test.tsx`, `use-dashboard-layout.test.ts`,
  `dashboard-page.test.tsx`, `builder-pane.test.tsx`, `dashboard-builder-dialog.test.tsx`, `empty-column-drop.test.tsx`.
- `docs/build/custom-widgets.md`: one subsection documenting `requires`.

Not touched: anything under `apps/api/`, `builtin-widgets.tsx`, the renderer components, `config-fields.tsx`,
`filterDashboardLayoutForViewer`, locales (no new user-visible string).

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### T1 — Core: requirement vocabulary, evaluator, built-in table, projection

**File:** `packages/core/src/dashboard-layout/widget-requirements.ts` (MIT header, as `dashboard-layout-audience.ts:L1-2`).
**Approach:** one pure module beside the audience filter, importing `hasPermission`, `hasPermissionAnywhere`,
`GLOBAL_SCOPE` and types from `../rbac/*`, and **types only** from `./dashboard-layout.js`. That keeps the T2 import of this module into
`dashboard-layout.ts` free of a runtime cycle. Reason: the dashboard renderer, the dashboard palette, the core
generator and (in sprint 5) the API all need the same answer.

Exported building blocks (verbatim):

```ts
/** What a widget needs to be usable. Absent = usable by every caller. */
export type WidgetRequirement =
  /** `permission` held at the global scope (`'*'`). */
  | { readonly kind: 'global-permission'; readonly permission: Permission }
  /** `content:read` on `config.seedSlug`; a config naming no seed needs `content:read` on at least one seed. */
  | { readonly kind: 'seed-read' }
  /** `content:read` on at least one scope. */
  | { readonly kind: 'any-seed-read' }

/** Resolves the requirement of one placed widget; undefined = no requirement. */
export type WidgetRequirementLookup = (
  widget: Pick<DashboardWidgetInstance, 'type' | 'config'>,
) => WidgetRequirement | undefined

export function isWidgetRequirementMet(
  requirement: WidgetRequirement | undefined,
  permissions: EffectivePermissions,
  config: Readonly<Record<string, unknown>>,
): boolean

/** The requirement of a built-in `core/` widget, from the table below. Undefined for any other type. */
export const resolveCoreWidgetRequirement: WidgetRequirementLookup

/** Removes the widgets `permissions` cannot use, then the sections and pages that removal emptied. */
export function filterDashboardLayoutByWidgetRequirements(
  layout: DashboardLayout,
  permissions: EffectivePermissions,
  requirementOf: WidgetRequirementLookup,
): DashboardLayout
```

`isWidgetRequirementMet` rules:
- `undefined` → `true`.
- `global-permission` → `hasPermission(permissions, requirement.permission, GLOBAL_SCOPE)`. A seed-scoped grant of the
  same permission never satisfies it (that is exactly brief rule 25 for the media library).
- `seed-read`: when `config.seedSlug` is a non-empty string, the result is `hasPermission(permissions, 'content:read', seedSlug)`.
  Otherwise it is `hasPermissionAnywhere(permissions, 'content:read')`. An unbound widget names no seed and reveals none, and its
  data route is scope-projected or shows its own "configure me" state, which is consistent with the server filter
  treating an empty `seedSlug` as visible (`dashboard-layout-audience.ts:L46`).
- `any-seed-read` → `hasPermissionAnywhere(permissions, 'content:read')`.
- Never throws. A non-string `seedSlug` is treated as absent.

Built-in requirement table (verbatim contract; `resolveCoreWidgetRequirement` implements exactly this. Any type
not listed, including unknown `core/*` types and every non-`core/` type, resolves to `undefined`):

| Type | Requirement |
|---|---|
| `core/setup-checklist` | `{ kind: 'global-permission', permission: 'manage_users' }` |
| `core/system-health`, `core/site-status`, `core/storage` | `{ kind: 'global-permission', permission: 'view_analytics' }` |
| `core/media-gallery` | `{ kind: 'global-permission', permission: 'content:read' }` |
| `core/line-chart`, `core/bar-chart`, `core/area-chart`, `core/pie-chart`, `core/data-table`, `core/recent-content`, `core/pending-drafts`, `core/activity-feed` | `{ kind: 'seed-read' }` |
| `core/publication-stats`, `core/content-pulse`, `core/recent-activity`, `core/quick-draft` | `{ kind: 'any-seed-read' }` |
| `core/stat` | non-empty string `config.seedSlug` → `{ kind: 'seed-read' }`; else `config.statKey` ∈ `visitors`/`traffic`/`storage` → `{ kind: 'global-permission', permission: 'view_analytics' }`; else (`total` or absent) → `{ kind: 'any-seed-read' }` |
| `core/text`, `core/quick-actions`, `core/ai-insights` | `undefined` |

The `core/stat` branch order mirrors `StatWidgetAdapter` (`registry/builtin/stat-adapters.tsx:L108`): `seedSlug` wins over
`statKey`. Keep the static rows in one module-level `ReadonlyMap`/record, with `core/stat` handled before the lookup.

`filterDashboardLayoutByWidgetRequirements` rules:
- A widget is kept iff `isWidgetRequirementMet(requirementOf(widget), permissions, widget.config ?? {})`. Order of the remaining
  widgets is preserved.
- A section is dropped iff it had ≥ 1 widget before and 0 after. A section the author left empty stays as it is (no behaviour
  change for what the server already serves).
- A page is dropped iff it had ≥ 1 section before and 0 after. A layout can therefore come back with `pages: []`, and the
  renderer already shows its empty state for that (`dashboard-layout-renderer.tsx:L40-50`).
- Pure: never mutates the input, never throws, same input → deep-equal output. `version` and every page/section field
  other than the filtered arrays are carried over unchanged (including `roles` when present).
- Copy the column → section → page mapping shape of `filterDashboardLayoutForViewer`
  (`dashboard-layout-audience.ts:L42-69`). Do not call it or alter it.

**Barrel:** add `export * from './dashboard-layout/widget-requirements.js'` to `packages/core/src/index.ts` directly
after `L89`.

### T2 — Core: permission-aware default generator

**File:** `packages/core/src/dashboard-layout/dashboard-layout.ts`, `generateDefaultDashboardLayout` (`L127`).
**Approach:** `permissions` becomes a **mandatory** second positional argument. Fail-closed: a caller cannot forget
it, and there are exactly two production callers. New signature (verbatim):

```ts
export function generateDefaultDashboardLayout(
  seeds: Seed[],
  permissions: EffectivePermissions,
  opts?: { newId: () => string },
): DashboardLayout
```

Rules:
- Work from `readableSeeds`: the seeds for which `hasPermission(permissions, 'content:read', seed.slug)`. Every existing
  `seeds.length > 0` branch (`L158`, `L167`) and the binding choice (`L168`: `articoli` if present, else the first seed) use
  `readableSeeds` instead of `seeds`. A caller who reads no seed gets no quick-draft and no content/media rows.
- Build the layout exactly as today from `readableSeeds`, then return
  `filterDashboardLayoutByWidgetRequirements(built, permissions, resolveCoreWidgetRequirement)`. Reuse the one projection,
  don't duplicate per-widget checks. This removes `setup-checklist`, `site-status`, `storage` and `media-gallery` for callers
  lacking the global permission, and drops rows left empty.
- When nothing survives, the result is `{ version: 1, pages: [] }`. This is intentionally outside `dashboardLayoutSchema`
  (`min(1)`): the generated default is only ever rendered, and the builder never saves it unmodified (see T6 edge case).
- `newId` is still called for widgets that are later dropped. Ids stay unique, and no test may assert specific id values of dropped
  widgets.
- Update the JSDoc (`L124-126`) to state that the default contains only what `permissions` can use.

### T3 — Widget SDK: `requires` on custom widget definitions

**Files:** `packages/widget-sdk/src/widget-definition.ts`, `packages/widget-sdk/src/index.ts`.
**Approach:** additive optional field on `WidgetDefinition`, static union only (YAGNI cut 2). Add after `ConfigPanel?` (`L32`), verbatim:

```ts
  /** What a caller needs to use this widget, evaluated with `@beechcms/core`'s `isWidgetRequirementMet`.
   *  Absent = every caller. The dashboard hides a widget whose requirement is unmet, and the builder
   *  palette does not offer it. Ignored for built-in `core/` types, whose requirement core resolves. */
  requires?: WidgetRequirement
```

Import `WidgetRequirement` as a type from `@beechcms/core`. In `src/index.ts`, add `WidgetRequirement` to the existing
`export type { … } from '@beechcms/core'` list (`L12-20`). `defineWidget` is unchanged and does not validate `requires`:
the type system already constrains it.

### T4 — Dashboard registry: requirement lookup and usability

**File:** `apps/dashboard/src/features/dashboard/registry/widget-registry.ts`.
**Approach:** two exported helpers beside `getWidgetDefinition`. Every UI decision then goes through one lookup, and
built-ins are never annotated in `builtin-widgets.tsx` (the single source stays in core). Signatures, verbatim:

```ts
/** Built-in `core/` types resolve through core's table; any other type through its registered `requires`. */
export const widgetRequirementOf: WidgetRequirementLookup

/** Whether a freshly placed instance of `definition` (its `defaultConfig`) is usable by `permissions`. */
export function isWidgetDefinitionUsable(definition: WidgetDefinition, permissions: EffectivePermissions): boolean
```

Rules:
- `widgetRequirementOf(widget)`: if `widget.type` starts with `core/`, return `resolveCoreWidgetRequirement(widget)`. Otherwise return
  `getWidgetDefinition(widget.type)?.requires`. An unregistered custom type → `undefined`, so the host keeps rendering
  its existing "unknown widget" placeholder (`dashboard-widget-host.tsx:L32-41`). That placeholder reveals only the type name the
  layout already carries.
- `isWidgetDefinitionUsable`: evaluate `widgetRequirementOf({ type, config })` with `isWidgetRequirementMet`, where
  `config` is `definition.defaultConfig` when it is a non-null object, else `{}`. Built-in seed widgets default to
  `seedSlug: ""`, so they are offered to anyone who reads at least one seed. The author then picks a seed in the config panel.

### T5 — Layout hook + page: projection, permission-aware default, no premature render

**Files:** `hooks/use-dashboard-layout.ts`, `pages/dashboard-page.tsx`.
**Approach:** the hook is the single place that decides "what this caller sees". It reads `usePermissions()` once.
Reason: the page and its test already consume the hook, and the renderer stays presentational.

Rules for `useDashboardLayout` (return type `UseDashboardLayoutResult` unchanged, docblocks updated):
- `const { effective, isLoading: permissionsLoading } = usePermissions()`.
- Generated default: `generateDefaultDashboardLayout(seeds, effective)`, memoized on `[seeds, effective]`
  (`effective` is memo-stable inside `usePermissions`, `use-permissions.ts:L65-76`).
- `layout`: `filterDashboardLayoutByWidgetRequirements(stored ?? generatedDefault, effective, widgetRequirementOf)`,
  memoized on `[stored, generatedDefault, effective]`. The projection is idempotent on the generated default, and is
  what hides built-in and custom widgets in a stored layout.
- `isStored` is unchanged. `isLoading` = `layoutQuery.isLoading || permissionsLoading`.
- The projection runs on what the server already filtered. It never re-adds anything, and it is cosmetic: data routes
  remain the enforcement point (keep the comment style of `use-permissions.ts:L58-60`).

Rules for `DashboardPage`:
- Destructure `isLoading` from `useDashboardLayout()` (`L20`). Mount `<DashboardLayoutRenderer layout={layout} />` (`L70`)
  only when `!isLoading`, and render nothing in its place otherwise (no spinner, no new string). Without this, the
  zero-authority default (`pages: []`) would flash the empty state while `/me` loads. Sprint 3's "the generator always
  emits a page" assumption no longer holds.
- `initialLayout={layout}` passed to the builder dialog (`L77`) stays as is. It is the dialog's last-resort fallback only.

### T6 — Builder: permissions to the generator, the pane and the palette

**Files:** `builder/dashboard-builder-dialog.tsx`, `builder/builder-pane.tsx`, `builder/widget-picker-dialog.tsx`.
**Approach:** `DashboardBuilderDialog` is the only builder component that calls `usePermissions()`. Everything below it
receives `permissions` as a prop. Reason: `BuilderPane` and `WidgetPickerDialog` are rendered directly by unit tests
without a `/me` round-trip, and a prop keeps them deterministic.

Props, verbatim additions:

```ts
export interface BuilderPaneProps {
  // …existing fields unchanged…
  /** The author's authority; the widget palette offers only widgets it can use. */
  readonly permissions: EffectivePermissions
}

export interface WidgetPickerDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onSelect: (type: string) => void
  /** Definitions this authority cannot use are not offered. */
  readonly permissions: EffectivePermissions
}
```

Rules:
- `DashboardBuilderDialog`:
  - `const { effective, isLoading: permissionsLoading } = usePermissions()`;
  - generator call at `L35` becomes `generateDefaultDashboardLayout(seeds, effective)`, memoized on `[seeds, effective]`;
  - the loader branch (`L51`) also shows while `permissionsLoading`, so `BuilderPaneController` mounts only once both the builder layout query and
    `/me` have resolved (`useDashboardBuilder` seeds its draft once, `use-dashboard-builder.ts:L114`);
  - pass `effective` to `BuilderPaneController` (new `permissions` prop on its private props interface), which forwards it to `<BuilderPane>` (`L124`).
- `BuilderPane`: forward `permissions` to `<WidgetPickerDialog>` (`L225`). Nothing else in the pane reads it.
- `WidgetPickerDialog`: inside the `grouped` memo (`L34-43`), skip definitions for which
  `isWidgetDefinitionUsable(def, permissions) === false`, and add `permissions` to the memo deps. Unusable widgets are
  **absent**, not disabled (brief rule 11: "offre solo i widget che può usare"). A category with no usable definition
  loses its heading through the existing `grouped.has(cat)` filter (`L52`). The disabled-type behaviour (`L60-66`) is
  unchanged and orthogonal: a disabled but usable type still shows disabled.
- The builder's **draft** is not projected. The draft is what gets saved, and hiding widgets in it would delete them on save.
  Editors already receive the server's seed-filtered payload, and locked-widget handling is ROADMAP entries 5–6.
- Edge case: an author who can use none of the generated widgets opens the builder on a draft with zero pages. The
  existing add-page control in `page-tabs-manager.tsx` stays usable. No new UI.

### T7 — Docs: custom widget requirements

**File:** `docs/build/custom-widgets.md`. Add a `#### Permission requirements` subsection at the end of
`### 1. Define Settings Schema & Widget` (before `### 2.`, `L96`):
- the three `WidgetRequirement` kinds and what each means;
- that an unmet requirement hides the widget and removes it from the builder palette;
- that this is cosmetic, and the widget's data routes must still enforce RBAC server-side (consistent with the existing
  `## Security Model` section).

Show one `requires: { kind: 'seed-read' }` line inside the existing `defineWidget` example. No other doc changes
(ROADMAP entry 9 owns the RBAC docs).

### T8 — Tests (behaviour lists; bodies follow `_config/testing_conventions.md`)

All files are **unit tier**, SPDX header, four zones. No `any`, no fake timers. Quote style: single quotes in
`packages/*`, double in `apps/dashboard`.

**Shared fixture (new):** `apps/dashboard/src/test/me-payload.ts`, imported as `@/test/me-payload` (precedent `@/test/widget-client`).
Exports:
- `meResponseBody(permissions: { global: string[]; byScope: Record<string, string[]> })`: the `/api/settings/me` JSON shape.
  Move it verbatim from `dashboard-page.test.tsx:L36-48`, with the same UUIDv4 user id, and migrate that file to import it.
- `FULL_AUTHORITY: { global: string[]; byScope: Record<string, string[]> }`: `global` is `[...PERMISSIONS]` from `@beechcms/core`.

Prop-based tests hydrate it with `hydrateEffectivePermissions` from `@/features/shared/hooks/use-permissions` (real
code, never a hand-built `Set` shape). Every file that mocks `@/lib/rpc` and now reaches `useMe` adds
`settings: { me: { $get } }` to its existing mock, answering `meResponseBody(...)`.

**`packages/core/src/dashboard-layout/widget-requirements.test.ts`** (new). Fixtures: build `EffectivePermissions` via
`buildEffectivePermissions` with role/assignment builders shaped like `dashboard-layout-audience.test.ts:L17-37`, with
UUIDv4 role-id constants. Seed slugs `posts` and `authors` match the canonical seed slugs (core cannot depend on
`@beechcms/testing`; say so in a comment).
- `describe('isWidgetRequirementMet')`:
  - an absent requirement is met by a caller with no authority;
  - `global-permission` is met by the global grant and not by the same permission granted only on `posts` (matrix over `manage_users`, `view_analytics`, `content:read`);
  - `seed-read` is met for `seedSlug: 'posts'` by `content:read@posts`, and not by `content:read@authors`;
  - `seed-read` with an empty or absent `seedSlug` is met by `content:read` on any one seed, and not by a caller with none;
  - `any-seed-read` is met by `content:read@posts` alone, and not by `view_analytics@*` alone;
  - a non-string `seedSlug` (number) is treated as absent.
- `describe('resolveCoreWidgetRequirement')`:
  - every built-in type in the T1 table resolves to its row (one table-driven `it`);
  - `core/stat` resolves `seed-read` when `seedSlug` is set even if `statKey` is `visitors`, `view_analytics` for `visitors`/`traffic`/`storage`, and `any-seed-read` for `total` or no `statKey`;
  - an unknown `core/` type and a custom `@acme/x` type resolve to undefined.
- `describe('filterDashboardLayoutByWidgetRequirements')`:
  - drops only the widgets whose requirement is unmet, keeping order;
  - drops a section the projection emptied, but keeps a section that was already empty;
  - drops a page all of whose sections were emptied, and leaves other pages and their `roles` untouched;
  - returns `pages: []` when nothing survives;
  - leaves the input deep-equal to its pre-call clone, and returns deep-equal output for the same input twice;
  - consults the supplied lookup for custom types (a lookup returning `global-permission manage_users` for `@acme/x` hides it).

**`packages/core/src/dashboard-layout/dashboard-layout.test.ts`** (edit).
- Every existing `generateDefaultDashboardLayout(...)` call (`L81`, `L112`, `L143`, `L160`, `L166`, `L452`) gains a
  full-authority `EffectivePermissions` second argument: `global` = all `PERMISSIONS`, declared once as a named constant
  with a one-line why-comment. Existing assertions are unchanged; this is an arrangement change forced by the new
  mandatory parameter, not a weakened expectation.
- New `it`s in `describe('generateDefaultDashboardLayout')`:
  - a caller with only `content:read@posts` (seeds `posts`, `articoli`) gets no setup-checklist, site-status, storage or media-gallery, and every seed-bound widget is bound to `posts`;
  - a caller with `content:read@*` and `view_analytics@*` but no `manage_users` gets everything except the setup-checklist, and the setup section is gone;
  - a caller with no authority gets `pages: []`;
  - a caller reading no seed gets no quick-draft, even when seeds exist.

**`apps/dashboard/src/features/dashboard/test/unit/widget-registry.test.ts`** (edit; register test-only custom types
as `dashboard-layout-renderer.test.tsx:L26-51` does):
- `widgetRequirementOf` returns core's requirement for `core/setup-checklist`;
- `widgetRequirementOf` returns a registered custom definition's `requires`;
- `widgetRequirementOf` returns undefined for an unregistered custom type;
- `isWidgetDefinitionUsable` is false for `core/setup-checklist` without `manage_users@*`, and true for `core/text` with no authority;
- `isWidgetDefinitionUsable` offers `core/line-chart` (default `seedSlug: ""`) to a `content:read@posts` caller.

**`.../test/unit/widget-picker-dialog.test.tsx`** (edit). Existing `it`s pass `permissions` hydrated from `FULL_AUTHORITY`
(arrangement only). New:
- a caller with only `content:read@posts` is not offered "Setup checklist" or "Media gallery", but is offered "Text";
- a caller with no authority sees no "Stats" heading, and still sees "Text".

**`.../test/unit/use-dashboard-layout.test.ts`** (edit). Add `settings.me` to the rpc mock. Existing `it`s answer
`FULL_AUTHORITY` (the "2 sections" fallback assertion stays valid). New:
- with nothing stored, a `content:read@posts`-only caller's generated default contains no setup-checklist, site-status, storage or media-gallery widget;
- a stored page holding `core/setup-checklist` and `core/text` is returned with only `core/text` to a caller without `manage_users@*`;
- a stored page holding only `core/setup-checklist` is removed for that caller (`pages: []`);
- `isLoading` stays true while `/me` is unresolved, even after the layout query settles (me mocked as a never-settling promise).

**`.../test/unit/dashboard-page.test.tsx`** (edit). Import `meResponseBody` from `@/test/me-payload`, delete the local
`meBody`. New:
- while `/me` is unresolved, the empty-state title is not rendered.

**`.../test/unit/builder-pane.test.tsx`**, **`.../test/unit/dashboard-builder-dialog.test.tsx`** (edit). Add `settings.me` →
`meResponseBody(FULL_AUTHORITY)` to the rpc mock, with a comment explaining that the builder now waits for `/me`, and that its
generated draft and palette depend on it. No assertion changes. New, in `dashboard-builder-dialog.test.tsx`:
- with nothing stored, a caller holding `manage_roles@*` and `content:read@*` but not `manage_users@*` saves a layout containing no `core/setup-checklist` widget (assert the PUT body).

**`.../test/unit/empty-column-drop.test.tsx`** (edit). Pass `permissions` hydrated from `FULL_AUTHORITY` to both
`<BuilderPane>` renders (`L58`, `L131`). No assertion changes.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run in order. Every command must exit 0 unless noted.

1. `pnpm run build` in `packages/core/`, then `pnpm run build` in `packages/widget-sdk/`. The SDK and the dashboard consume
   core's `dist`.
2. `npx vitest run src/dashboard-layout` in `packages/core/`.
3. `npx vitest run` in `packages/widget-sdk/`.
4. `npx tsc --noEmit` in `apps/dashboard/`.
5. `npx vitest run src/features/dashboard` in `apps/dashboard/`.
6. `npx tsc --noEmit | grep -c "error TS"` in `apps/api/`. Must equal the pre-sprint baseline: record it before the first edit (sprint 3's
   review measured 51). The API is untouched, so any delta means a core export broke it.
7. `pnpm beech test --diff`.
8. `pnpm beech lint`.
9. Invariant greps (repo root), each expecting **0** matches:
   - `rg "requires" apps/dashboard/src/features/dashboard/registry/builtin-widgets.tsx`
   - `rg "features/rbac" apps/dashboard/src/features/dashboard`
   - `rg "usePermissions" apps/dashboard/src/features/dashboard/builder/builder-pane.tsx apps/dashboard/src/features/dashboard/builder/widget-picker-dialog.tsx`
   - `git diff --stat -- apps/api`
10. `graphify update . --force`.

Manual check (`pnpm beech dev`, two browsers):
- A SuperAdmin with nothing stored sees the full default (checklist, status row, content, media).
- An account holding only `content:read@posts` sees:
  - no checklist, site-status, storage or media gallery;
  - seed widgets bound to `posts`;
  - no 403 in the network panel from those widgets' data routes.
- A SuperAdmin saves a page containing only a setup checklist, targeted to nobody. The `content:read@posts` account
  no longer sees that tab.
- In the builder, a `manage_roles@*` + `content:read@*` author without `manage_users` is not offered "Setup checklist".

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `WidgetRequirement`, `WidgetRequirementLookup`, `isWidgetRequirementMet`, `resolveCoreWidgetRequirement` and
      `filterDashboardLayoutByWidgetRequirements` are exported from `@beechcms/core` with the exact signatures of T1.
- [ ] `resolveCoreWidgetRequirement` implements the T1 table exactly. `core/stat` follows the `seedSlug` → `statKey` order.
- [ ] `widget-requirements.ts` imports nothing beyond `../rbac/*` and types from `./dashboard-layout.js`. No React, no zod,
      no I/O.
- [ ] `generateDefaultDashboardLayout(seeds, permissions, opts?)`:
  - [ ] `permissions` is mandatory;
  - [ ] the output contains only widgets `permissions` can use;
  - [ ] seed bindings use readable seeds only;
  - [ ] `pages: []` when nothing survives.
- [ ] `WidgetDefinition.requires?: WidgetRequirement` exists, and `WidgetRequirement` is re-exported by `@beechcms/widget-sdk`.
      No built-in registration sets `requires`.
- [ ] The dashboard renders only widgets whose requirement is met:
  - [ ] a section or tab emptied by that hiding is not rendered;
  - [ ] fallback to the first visible tab and the empty state behave as in sprint 3;
  - [ ] nothing renders until both the layout and `/me` have resolved.
- [ ] The builder palette omits widgets the author cannot use. A category with none left has no heading.
- [ ] The builder draft is never projected (no widget disappears from a stored layout on save because of this sprint).
- [ ] Every UI requirement decision goes through `widgetRequirementOf` + core `isWidgetRequirementMet`. No permission
      logic is re-implemented in the dashboard.
- [ ] Zero changes under `apps/api/`. The API `tsc` error count equals the pre-sprint baseline.
- [ ] `filterDashboardLayoutForViewer` and its tests are byte-identical.
- [ ] Every SECTION 5 command passes. Every test in T8 exists and passes in isolation.
- [ ] Changed test arrangements (added `/me` mocks, the full-authority generator argument) change no existing assertion.
- [ ] `docs/build/custom-widgets.md` documents `requires`.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executor MUST NOT build or modify:

- **Server-side requirement filtering.** This covers:
  - `filterDashboardLayoutForViewer`;
  - the `GET`/`PUT`/`DELETE /api/dashboard-layout` handlers;
  - the interim 409 `layout-locked` trigger (`refuseIfLocked`).

  The API keeps filtering by audience and seed only. Feeding `resolveCoreWidgetRequirement` into the server lock decision is
  ROADMAP entry 5 (`ManageLayoutPermissionApi`).
- **Locked-widget placeholders in the builder, and projection of the builder draft or preview.** ROADMAP entry 6
  (`ManageLayoutPermissionUi`).
- **Filtering `SeedSelect` (`config-fields.tsx`) to readable seeds.** It is deferred to ROADMAP entry 6. The server
  already strips widgets on unreadable seeds from an editor's payload, and the builder field components stay
  permission-agnostic until then.
- **Function-valued or config-dependent `requires` for custom widgets.**
- **Annotating `builtin-widgets.tsx` with `requires`.** The single source is core's table.
- **`manage_layout`, compare-and-swap, any migration.** ROADMAP entries 5–6.
- **`manage_seeds`, `users.role`, `isDeveloper` removal.** ROADMAP entries 7–8. `PermissionsApi.isDeveloper` stays untouched.
- **RBAC docs** (`06-role-based-dashboards.md`, `api-reference.md`, `rbac-api.md`, `roles-permissions.md`) and regenerating
  `docs/api/` (typedoc). ROADMAP entry 9 and the maintainer's regeneration commit.
- **`StatWidgetAdapter`'s unconditional double fetch** (`useDashboardStats` + `useCloudflareStats`,
  `stat-adapters.tsx:L105-106`). It produces a harmless 403 on `stats/cloudflare` for a `total` stat viewed without
  `view_analytics`. It is pre-existing data-hook behaviour, not a requirement concern.
- **Re-enabling any widget in `DISABLED_WIDGET_TYPES`** (`widget-registry.ts:L34-41`), new locale strings, any change to the
  renderer components.
