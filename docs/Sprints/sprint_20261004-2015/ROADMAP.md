# ROADMAP — Saved Views (View Types → View Instances + View Harness)

Source brief: `stages/00_ideation/output/feature_brief.md` (Table/Gallery/Kanban become View Types, each instantiable
N times as named, shared, persisted views; a View Harness standardises Seed ↔ toolbar ↔ renderer and the shared
"Element" contract; Gallery moves to the Entry Editor).
Planned: 2026-10-03. Graph state at planning time: 24 117 nodes, 35 666 edges, 2 247 communities.

The feature crosses three boundaries that must merge in order: persistence contract + storage (`@beechcms/core` +
`apps/api`) → dashboard data plumbing (instances replace fixed views) → dashboard harness/UX → universal Element
formatting. The Gallery/Entry Editor unification is independent of the views series and is ordered last only to avoid
merge conflicts inside `features/content-gallery`. Only the sprint marked **NEXT** has a detailed plan. The others stay
roadmap entries until their turn, and their Task Details will be written against the codebase that exists then.
Re-planned 2026-10-03 at Sprint 3 (graph: 24 570 nodes, 36 278 edges, 2 296 communities): the original §3
`ViewHarnessSwitcher` was split into §3 `ViewSwitcherRedesign` and §4 `ViewHarnessContract`, and the series is now six
sprints.
Sprint 4 PASS archived 2026-10-04. Sprint 5 planned the same day.
Sprint 5 PASS archived 2026-10-04. Sprint 6 planned the same day (graph: 24 639 nodes, 36 619 edges, 2 296
communities).

Rollout invariant across the whole series: until Sprint 2 ships, the dashboard keeps rendering the three fixed views
from `resolveAuthorizedViews` and the legacy `GET/PUT /api/content/:slug/view-config` endpoints stay untouched. The new
`/views` API exists but has no UI consumer, so a half-shipped state is invisible to editors.

---

## 1. `ContentViewsPersistence` — **DONE** (PASS; archived in `docs/Sprints/ContentViewsPersistence/`)

- **Goal:** a view instance is a persisted, shared, ordered record per seed, with a validated configuration that
  references branches by Branch ID only.
- **Deliverables summary:** core `content-view.ts` (`ContentView`, `ContentViewConfig` zod schema — filters, sort,
  groupBy, appearance, conditional formats with view-neutral `element | field` targets, kanban/card sub-config —
  `validateViewConfigAgainstSeed`, `projectContentViews`) and `IContentViewRepository`; migration
  `0033_seed_views.sql`; `D1ContentViewRepository` wired in `repositoryMiddleware`; content-slice routes
  `GET/POST /api/content/:slug/views`, `PATCH/DELETE /api/content/:slug/views/:viewId`,
  `PUT /api/content/:slug/views/order` with RBAC rules; lazy bootstrap of one default instance per authorized type on
  a seed with zero views; atomic "last Table view" delete guard; canonical `posts` seed authorizes `table` + `gallery`.
- **Depends on:** nothing.

## 2. `ViewInstancesDashboard` — **DONE** (PASS; archived in `docs/Sprints/ViewInstancesDashboard/`)

- **Goal:** the content page renders persisted view instances instead of three fixed views, and every per-view setting
  survives a reload and is shared.
- **Deliverables summary:** dashboard `/views` client + React Query hooks; `ContentListPage` driven by instances
  (`activeViewId` = instance id, `?view=` and localStorage keyed by instance id, fallback to the first Table
  instance); alias ↔ `br_XX` mapping between toolbar state and `ContentViewConfig` (filters, sort, groupBy + date
  precision, density, hidden columns, page size, conditional formats `row|cell` ↔ `element|field`); Kanban axis/sort/
  card config read from and written to the instance (`useKanbanViewConfig` deleted, no migration of the old blob, per
  brief §4); minimal create / rename / delete wired to the existing toolbar callbacks (`onCreateView`,
  `onRenameView`); management actions hidden without `content:update`. Legacy removal: `GET/PUT /view-config`
  handlers + permission rows, `seedViewConfigSchema`, `ISeedLayoutRepository.getViewConfig/setViewConfig`, and a
  migration dropping `seed_layouts.view_config`.
- **Depends on:** Sprint 1 (`/views` API, `ContentViewConfig`).
- **Planning notes (2026-10-03):** per-view state is hydrated once at mount of a workspace keyed by instance id
  (no hydration effects) and written back by a debounced autosave that flushes on unmount. The alias ↔ `br_XX`
  mapping lives in a new dashboard slice `features/content-views`. `buildFilterableColumns` moves to
  `@/lib/filter-dsl` so that slice needs no cross-slice import. The `?status=` URL prefilter is never persisted.
  The legacy column is dropped by migration `0034_drop_seed_layouts_view_config.sql`.

## 3. `ViewSwitcherRedesign` — **DONE** (PASS; archived in `docs/Sprints/ViewSwitcherRedesign/`)

- **Goal:** the switcher, the "Add view" picker and the "New" button look and behave as in the brief's mockups, and
  tab order is user-defined, persisted and shared.
- **Deliverables summary:** sortable switcher tabs (icon + custom title, `@dnd-kit` already a dependency) →
  `PUT /views/order` through an optimistic `useReorderContentViews`; "+" revealed on hover, in line with the toolbar
  tools, opening a picker that lists every View Type (Table/Gallery/Kanban + the reserved, **dashboard-only**
  `RESERVED_VIEW_TYPES` in `features/shared/view-registry.ts`), enabled iff authorized by the seed and the user has
  `content:update`; centred `ViewEmptyState` after the last instance of a non-Table type is deleted; "New" split
  button with a No-Op templates menu. Server side: core `mergeContentViewOrder` so a reorder keeps hidden rows in
  their slot and compacts every position (Sprint 1 review finding 1).
- **Depends on:** Sprint 2 (instances in the dashboard).
- **Planning notes (2026-10-03):** the old §3 `ViewHarnessSwitcher` was split. The switcher/shell UX and the
  renderer/settings harness rewrite the same two files (`content-list.tsx` shell vs. `ContentViewWorkspace` /
  `SettingsMenu`) from different directions, so they are validated separately. Rename/delete stay in the settings
  menu (no tab context menu). Reorder is pointer-only (no keyboard sensor), matching the dashboard builder. The empty
  state is page-session state, not a URL.

## 4. `ViewHarnessContract` — **DONE** (PASS; archived in `docs/Sprints/ViewHarnessContract/`)

- **Goal:** adding a View Type means registering one definition, and every View Type renders inside the same page
  grid.
- **Deliverables summary:** `ViewDefinition` grows into the harness contract: renderer component with one uniform
  props contract (seed + query state + entry open/create callbacks), per-type settings section contributed to the
  universal settings menu (the `activeViewType === …` branches of `SettingsMenu` move to their slices), and
  `enabledTools`. The composition root (`view-registry.bootstrap.ts`) registers Table/Gallery/Kanban through it.
  `ContentViewWorkspace` renders `definition.Renderer` instead of hardcoded `view.type` branches, inside one shared
  content viewport (same grid and margins for every View Type, brief §2).
- **Depends on:** Sprint 3 (final switcher and shell, so the workspace restructure does not collide with them).
- **Planning notes (2026-10-03, graph: 24 602 nodes, 36 389 edges, 2 295 communities):**
  - Only Kanban gets a type-owned `SettingsSection`. Table/Gallery blocks stay universal in the toolbar, opted into by
    a declarative `ViewDefinition.settings` list (same idiom as `enabledTools`). Moving them out would need
    toolbar-internal state across slices.
  - The registry moves to the page-level composition root `pages/view-registry.ts`. This removes two existing
    cross-slice imports: `content-toolbar → gallery/kanban`, and `ContentListModals → CardConfigDialog`.
  - The kanban card dialog is hosted by its renderer through a generic `configDialog`. The save sync goes through
    `entries.subscribeSaved`.
  - Persisted appearance state moves out of `useContentTableConfig` into `content-views`' `useViewLayoutState`.
  - The shared viewport is the toolbar's existing children wrapper, named `data-slot="view-viewport"`.
  - Gallery drops its inert Density control.

## 5. `UniversalElementFormatting` — **DONE** (PASS; archived in `docs/Sprints/UniversalElementFormatting/`)

- **Goal:** a conditional-format rule means the same thing on a Table row, a Gallery card and a Kanban card.
- **Deliverables summary:** the harness Element contract (defined here, where its first consumer lands), and rule
  evaluation moved out of `useContentTableConfig` into one pure evaluator consumed through that contract (`element` →
  row/card tint + text style, `field` → the matching cell / card slot). Gallery card and Kanban card apply it, and
  the conditional-formats editor is enabled for every View Type.
- **Depends on:** Sprint 4 (renderer contract on the harness).
- **Planning notes (2026-10-04, graph: 24 624 nodes, 36 525 edges, 2 292 communities):**
  - The Element contract is data, not a component: `ElementFormat` (`element` style + `fields` per column id),
    produced by `compileElementFormatter(rules)` in `lib/conditional-format.ts`. The workspace compiles it once, and
    every renderer receives it as `ViewRendererProps.formatElement`.
  - Gallery/Kanban evaluate where their display models are built (one memo / once per fetch), and the cards only map
    styles to classes. Table keeps `getRowStyles` through a `toTableRowStyles` adapter in its renderer.
  - The dashboard rule target is renamed `row|cell` → `element|field` (the persisted vocabulary). The mapping becomes a
    pass-through, and the editor labels become "Whole item"/"Field".
  - `getEntryValueForColumn` moves to `lib/filter-dsl.ts`, so the shared evaluator imports no slice.
  - Not formatted: cover image, category folder card, kanban media slot, drag overlay.

## 6. `GalleryEntryEditorUnification` — **NEXT** (detailed plan: `../GalleryEntryEditorUnification.md`, planned 2026-10-04)

- **Goal:** every View Type opens the same Entry Editor, and the default editor layout gives a single cover image its
  own full-width section at the top.
- **Deliverables summary:** remove `GalleryPeekPanel` / `gallery-peek-*` and route card clicks to the existing
  `modals.handleEdit`; readonly parity for users without `content:update` through the editor shell (already wired via
  `ContentListModals.readonly`); core `generateDefaultLayout` places a single non-gallery `file` image branch in a
  dedicated full-width first section (no change when a custom layout exists).
- **Depends on:** nothing in this series. Must start after the in-flight `fix/gallery-categories-review` branch has
  merged (it rewrites the same gallery files), and after Sprints 4–5 if either is in flight (both touch the gallery
  renderer and `gallery-card.tsx`).
- **Planning notes (2026-10-04):**
  - `fix/gallery-categories-review` is already an ancestor of `HEAD`. Sprints 1–5 are still uncommitted, and the plan
    requires them committed before execution.
  - No new entry-open callback. Card clicks reuse `entries.handleEdit`, as Table and Kanban do. Read-only stays decided
    once, by `content-view-workspace.tsx:219`. The gallery slice ends with no permission logic.
  - Deleted with the panel: `gallery-peek-sections`, `gallery-richtext-readonly`, `gallery-detail-tags`,
    `gallery-detail-branches`, `gallery-peek-title`, the unused `content-gallery/shared.ts` barrel, and the peek-only
    `gallery.*` locale keys.
  - Cover = the single main (non-SEO) `file` branch that is not a gallery and has `fileOptions.accept === 'image'`.
    `'any'` (the default) does not qualify.
  - The rule lives only in `generateDefaultLayout`, through a module-private predicate. `isFullWidthBranch` and the
    validator are unchanged, so custom layouts and the Layout Builder keep their constraints. For zero or several
    candidates, the output is byte-identical to the previous implementation.

---

## Decisions recorded at planning time (apply to every sprint)

- **Persistence lives in a system table, `seed_views`**, not in `seed_layouts.view_config`. One row per instance makes
  create/rename/delete/reorder independent writes, so two editors who touch different views never overwrite each
  other. The name avoids the `content_{slug}` namespace (a seed slugged `views` would own `content_views`).
- **Persisted configs reference branches by `br_XX` only** (Botanical invariant). Aliases exist only in the dashboard,
  which maps them at the boundary (Sprint 2). Unknown branch ids are stripped on write and on read, the same
  auto-cleanup `validateCardConfigAgainstSeed` already applies.
- **Conditional-format targets are stored view-neutral** (`element` / `field`) from day one, so Sprint 4 does not
  need a data migration.
- **Allow-list changes never delete rows.** Views whose type a seed no longer authorizes are hidden by the API and
  reappear if the type is re-authorized.
- **Concurrency is last-write-wins per view row.** No `If-Match` on views (VETO in Sprint 1 audit).
- **Orphans on seed hard-delete are tolerated**, with the same policy `seed_layouts` already has. A recreated seed
  with the same slug sees its old views, with configs cleaned against the new branches.
