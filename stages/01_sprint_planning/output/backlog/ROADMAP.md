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

Rollout invariant across the whole series: until Sprint 2 ships, the dashboard keeps rendering the three fixed views
from `resolveAuthorizedViews` and the legacy `GET/PUT /api/content/:slug/view-config` endpoints stay untouched. The new
`/views` API exists but has no UI consumer, so a half-shipped state is invisible to editors.

---

## 1. `ContentViewsPersistence` — **NEXT** (detailed plan: `../ContentViewsPersistence.md`)

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

## 2. `ViewInstancesDashboard`

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

## 3. `ViewHarnessSwitcher`

- **Goal:** adding a View Type means registering one definition, and the switcher/toolbar look and behave as in the
  brief's mockups.
- **Deliverables summary:** `ViewDefinition` grows into the harness contract (renderer component, per-type settings
  section in the universal settings menu, `enabledTools`, the Element contract handed to the renderer); the
  composition root (`view-registry.bootstrap.ts`) registers Table/Gallery/Kanban through it; the reserved View Type
  catalogue (Chart, Board, List, Calendar, Map, Timeline, Feed, Form, Dashboard) as **dashboard-only** identifiers
  shown disabled in the "Add view" picker; switcher redesign (custom titles, "+" on hover in line with the toolbar
  tools, drag-and-drop reorder → `PUT /views/order`, delete); centred empty state "create your first view" when the
  requested type has no instance; one shared page grid/margins for every View Type; "New entry" split button with a
  template submenu that renders and closes and does nothing else (No-Op).
- **Depends on:** Sprint 2 (instances in the dashboard).

## 4. `UniversalElementFormatting`

- **Goal:** a conditional-format rule means the same thing on a Table row, a Gallery card and a Kanban card.
- **Deliverables summary:** move rule evaluation out of `useContentTableConfig` into one pure evaluator consumed
  through the harness Element contract (`element` → row/card tint + text style, `field` → the matching cell / card
  slot); Gallery card and Kanban card apply it; the conditional-formats editor is enabled for every View Type.
- **Depends on:** Sprint 3 (Element contract on the harness).

## 5. `GalleryEntryEditorUnification`

- **Goal:** every View Type opens the same Entry Editor, and the default editor layout gives a single cover image its
  own full-width section at the top.
- **Deliverables summary:** remove `GalleryPeekPanel` / `gallery-peek-*` and route card clicks to the existing
  `modals.handleEdit`; readonly parity for users without `content:update` through the editor shell (already wired via
  `ContentListModals.readonly`); core `generateDefaultLayout` places a single non-gallery `file` image branch in a
  dedicated full-width first section (no change when a custom layout exists).
- **Depends on:** nothing in this series. Must start after the in-flight `fix/gallery-categories-review` branch has
  merged (it rewrites the same gallery files), and after Sprint 4 if that one is in flight (both touch
  `gallery-card.tsx`).

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
