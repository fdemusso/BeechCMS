# Sprint: ViewInstancesDashboard

Sprint 2 of 5 of **Saved Views** (roadmap: `backlog/ROADMAP.md`). Sprint 1 (`ContentViewsPersistence`) is archived in
`docs/Sprints/ContentViewsPersistence/` with a PASS verdict.

Sprint 1 shipped the backend half: the `seed_views` table, the `ContentView` / `ContentViewConfig` contract in
`@beechcms/core`, and five RBAC-gated routes under `/api/content/:slug/views`. Nothing consumes them yet.
`ContentListPage` still builds one in-memory `UserViewInstance` per authorized type with `id === type`. Titles and
conditional formats live in a `useState` overlay that resets on reload. Filters, sort, grouping, density, hidden columns
and page size live in `useState` inside `useContentListQuery` / `useContentTableConfig` and are shared by every "view".
The only persisted per-view state is the Kanban blob behind `GET/PUT /view-config`.

This sprint switches the content page over to persisted instances. The page renders whatever `GET /views` returns.
Every per-view setting is hydrated from the instance when the view opens and autosaved back to it. Editors with
`content:update` can create, rename and delete instances. The legacy `/view-config` chain is then deleted end to end,
from the dashboard hook down to the D1 column.

> **Precondition.** At planning time the Sprint 1 code is still uncommitted in the working tree of
> `feature/content-views-persistence` (`git status`: `0033_seed_views.sql`, `handlers/views.ts`,
> `content-view.ts`, …). This sprint builds on it. The executor must start from a tree where Sprint 1 is committed
> (merged to `master`, or at least committed on the branch this sprint forks from). It must not re-implement any
> Sprint 1 file.

---

### Pre-Computation Analysis

The graph was refreshed first with `graphify update . --force` (24 168 nodes, 35 805 edges, 2 253 communities). The
refresh includes the uncommitted Sprint 1 files.

#### a) God Nodes identified via CLI

| Node | Degree | Source | Role in this sprint |
|------|--------|--------|---------------------|
| `useContentToolbar()` | **18** | `apps/dashboard/src/features/content-toolbar/use-content-toolbar.ts:L17` | **Not modified.** It already resolves `activeView` by id and reads `activeView.conditionalFormats` / `enabledTools`. Instance ids (UUIDs) flow through it unchanged. |
| `ContentListPage()` | **17** | `apps/dashboard/src/pages/content-list.tsx:L59` | **Rewritten.** It becomes the shell: seed, instance list, active-instance resolution, create/rename/delete. The per-view body moves to a keyed child, `ContentViewWorkspace`. |
| `D1SeedLayoutRepository` | 10 | `apps/api/src/shared/db/repositories/seed-layout.repository.d1.ts:L8` | Loses `getViewConfig` / `setViewConfig`. `get/getAllAsMap/upsert/remove` are untouched. |
| `ContentToolbar()` | 8 | `apps/dashboard/src/features/content-toolbar/content-toolbar.tsx:L25` | Passes `activeView.type` (not `activeViewId`) to `SettingsMenu`. Forwards three new optional props. |
| `useKanbanViewConfig()` | 6 | `apps/dashboard/src/features/content-kanban/hooks/use-kanban-view-config.ts:L7` | **Deleted.** It is the only consumer of `/view-config`. |
| `buildFilterableColumns()` | 6 | `apps/dashboard/src/features/content-toolbar/shared.ts:L123` | **Moved** to `@/lib/filter-dsl` so the new slice can use it without a cross-slice import. `shared.ts` re-exports it, so all 12 current importers keep compiling. |
| `useKanbanEntrySync()` | 5 | `apps/dashboard/src/features/content-kanban/hooks/use-kanban-entry-sync.ts:L14` | Takes `axisBranchId` as a parameter instead of reading it from `useKanbanViewConfig`. |
| `SettingsMenu()` | 4 | `apps/dashboard/src/features/content-toolbar/toolbar-components/settings-menu.tsx:L94` | Prop `activeViewId` → `activeViewType`. Six comparisons today read a *type* out of an *id*. Gains the "Delete view" item. |
| `resolveAuthorizedViews()` | 4 | `packages/core/src/dashboard-layout/view-authorization.ts:L24` | Consumed unchanged. It gives the set of creatable types. |
| `useContentTableConfig()` | 3 | `apps/dashboard/src/features/content-management/hooks/use-content-table-config.ts:L45` | Accepts `initial` state and plain `conditionalFormats` instead of `activeView: UserViewInstance`. |
| `ViewSwitcher()` | 2 | `apps/dashboard/src/features/content-toolbar/toolbar-components/view-switcher.tsx:L27` | Gains the "+" create menu. Today it receives `onCreateView` and ignores it. |
| `ContentListModals()` | 2 | `apps/dashboard/src/features/content-management/components/ContentListModals.tsx:L42` | Prop `activeViewId` → `activeViewType`. |

#### b) Architectural boundaries affected

| Boundary | Touched? | Exact surface |
|----------|----------|---------------|
| `@beechcms/core` — `dashboard-layout/` | **Yes (removal only)** | `seed-layout.ts` drops `seedViewConfigSchema` / `SeedViewConfig`. `seed-layout.repository.ts` drops `getViewConfig` / `setViewConfig`. `seed-layout.test.ts` loses the two `seedViewConfigSchema` blocks and retargets the card tests to `kanbanCardConfigSchema`. `kanban/kanban.ts` gets a one-line doc-comment fix. `content-view.ts` is **not** modified. |
| `apps/api/migrations` | **Yes** | New `0034_drop_seed_layouts_view_config.sql`. `wrangler.jsonc` uses `migrations_dir` and needs no edit. |
| `apps/api/src/features/content` | **Yes (removal only)** | Delete `handlers/view-config.ts` and `handlers/view-config.handler.test.ts`. Remove one import and two routes from `index.ts`. |
| `apps/api/src/middleware` | **Yes (removal only)** | `permission.middleware.ts` loses the two `/view-config` rows. No middleware is added, removed or reordered. |
| `apps/api/src/shared/db/repositories` | **Yes (removal only)** | `seed-layout.repository.d1.ts` and its unit test lose the view-config methods. |
| `apps/dashboard/src/features/content-views` | **New slice** | API client, React Query hooks, alias ↔ `br_XX` mapping, active-view resolver, autosave hook, unit tests. |
| `apps/dashboard/src/features/content-management` | **Yes** | `useContentListQuery` and `useContentTableConfig` accept initial state. `useContentTableConfig` stops importing `UserViewInstance` from `content-toolbar`. `ContentListModals` prop rename. |
| `apps/dashboard/src/features/content-toolbar` | **Yes** | `types.ts`, `content-toolbar.tsx`, `view-switcher.tsx`, `settings-menu.tsx`, `shared.ts` (re-export), tests. |
| `apps/dashboard/src/features/content-kanban` | **Yes** | Delete `use-kanban-view-config.ts`. Change the `useKanbanEntrySync` signature. Update `index.ts`. |
| `apps/dashboard/src/lib` | **Yes** | `filter-dsl.ts` receives `buildFilterableColumns`. `content-api.ts` drops the two view-config functions. |
| `apps/dashboard/src/pages` | **Yes** | `content-list.tsx` is rewritten. New `content-view-workspace.tsx`. |
| `apps/dashboard/src/locales` | **Yes** | `en.json` and `it.json` get `content.list.kanban` and `content.views.*`. |
| `apps/dashboard/package.json` | **Yes** | devDependency `@beechcms/testing` (canonical seed fixtures, Rule 3.5). |
| `@beechcms/testing`, `client`, `api-client`, `mcp`, `cli` | **No** | Zero files. `packages/cli/src/commands/init.ts` embeds `0000_v040_base.sql` only and keeps creating the column, which `0034` then drops (see §7). |

#### c) `graphify affected` impact analysis (breaking-change proof)

```
$ graphify affected "useKanbanViewConfig" --depth 2
  use-kanban-entry-sync.ts, useKanbanEntrySync(), content-kanban/index.ts, content-list.tsx,
  ContentListPage(), ContentListModals.tsx, view-registry.bootstrap.ts, App.tsx
```
→ There are two direct callers: `useKanbanEntrySync` (Task 13) and `ContentListPage` (Task 17). The rest is barrel
fan-out through `content-kanban/index.ts`. `ContentListModals.tsx` and `view-registry.bootstrap.ts` import *other*
symbols from that barrel, so removing this one export does not affect them.

```
$ graphify affected "fetchSeedViewConfig" --depth 2
  use-kanban-view-config.ts, use-kanban-entry-sync.ts, content-kanban/index.ts
$ graphify affected "getViewConfigHandler" --depth 2
  view-config.handler.test.ts, content/index.ts, factory.ts
$ graphify affected "seedViewConfigSchema" --depth 2
  seed-layout.test.ts
$ graphify affected "ISeedLayoutRepository" --depth 2
  No affected nodes found.
$ graphify affected "D1SeedLayoutRepository" --depth 2
  repository.middleware.ts, seed-layout.repository.d1.test.ts, factory.ts, createBeechApp(),
  repository-privacy-middleware.test.ts
```
→ The legacy chain is closed. No node outside the files deleted or edited in Tasks 1–5 and 12–13 reaches it. A grep
confirms what the graph says: `view_config` / `SeedViewConfig` / `getViewConfig` appear only in those files, the
generated `docs/api/**` pages, the archived `_archive/0034_kanban_foundation.sql`, the immutable
`0000_v040_base.sql` + its legacy fixture copy, and `packages/cli/src/commands/init.ts`. `D1SeedLayoutRepository`'s
dependents use `get/getAllAsMap/upsert/remove` only. `repository.middleware.ts` constructs it without calling
view-config methods.

```
$ graphify affected "UserViewInstance" --depth 2
  use-content-table-config.ts, UseContentTableConfigOptions, content-toolbar/index.ts, use-view-name.ts,
  content-toolbar/types.ts, ContentToolbarProps, content-list.tsx, drafts-list.tsx, view-switcher.tsx,
  ViewSwitcherProps, UseViewNameProps, content-management/index.ts, use-content-list-query.ts, barrels.test.ts,
  content-toolbar.tsx, use-content-toolbar.ts, use-automation.ts, App.tsx, toolbar-hooks.test.ts, useContentToolbar()
```
→ **`UserViewInstance` is not modified.** Instance ids are opaque strings to the toolbar already. `drafts-list.tsx`
keeps building its single `{ id: "table", type: "table" }` instance and is unaffected. The one change is that
`use-content-table-config.ts` stops importing the type (Task 10), which removes a `content-management →
content-toolbar` edge.

```
$ graphify affected "buildFilterableColumns()" --depth 2
  use-content-list-query.ts, content-toolbar/index.ts, content-list.tsx, use-toolbar-filters.ts,
  content-management/index.ts, use-content-table-config.ts, barrels.test.ts, drafts-list.tsx, App.tsx,
  use-toolbar-filters.test.ts, conditional-formats-editor.tsx, use-conditional-formats.ts, use-content-toolbar.ts
```
→ It is **moved, not changed**. `content-toolbar/shared.ts` re-exports it from `@/lib/filter-dsl` under the same
name, so every importer above resolves the same function.

```
$ graphify affected "useContentListQuery" --depth 2
  content-list.tsx, ContentListPage(), App.tsx
$ graphify affected "ContentListModals()" --depth 1
  content-list.tsx
```
→ Each has a single production caller, the page this sprint rewrites. The new parameter on `useContentListQuery` is
optional and the new return field is additive.

```
$ graphify path "useKanbanEntrySync" "useContentListModals"
  useKanbanEntrySync() <--calls-- ContentListPage() --calls--> useContentListModals()
```
→ `content-kanban` and `content-management` meet only in the page, which is the composition root. After the rewrite
they meet only in `pages/content-view-workspace.tsx`, which is also a page module.

---

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

1. **YAGNI (rule 1).**
   - *Considered and vetoed:* a "views" layer in `@beechcms/core` for the alias ↔ Branch-ID mapping. Only the dashboard
     consumes it. Core already exposes everything the mapping needs (`findBranchById`, `VIEW_SYSTEM_COLUMNS`,
     `viewColumnRefSchema`, `MAX_VIEW_CONDITIONS`). **VETO: one consumer, the dashboard; core stays unchanged.**
   - *Considered and vetoed:* `PUT /views/order` client + drag-and-drop. **VETO: Sprint 3 owns reorder; no caller yet.**
     The API client in this sprint has four functions, not five.
   - *Considered and vetoed:* migrating the old per-slug Kanban blob into the seed's Kanban instance. **VETO: brief §4
     explicitly discards it.**
   - *Considered and vetoed:* mapping legacy `?view=table` / localStorage `"gallery"` values to "first instance of that
     type". Nothing in the codebase produces `?view=` (grep), and a stale localStorage value falls back to the first
     Table instance anyway. **VETO: no producer exists.**
   - *Considered and vetoed:* `If-Match` / version checks on the autosave PATCH. **VETO: last-write-wins per row, recorded
     in the roadmap.**
   - *Kept:* the debounced autosave with flush-on-unmount. Without it, every keystroke in a filter pill would issue a
     PATCH, and switching views inside the debounce window would drop the last change.
   - *Kept:* dropping `seed_layouts.view_config`. Leaving a dead column with a dead schema in core is the drift the
     roadmap's removal step exists to prevent.

2. **Botanical invariant (rule 2).** No D1 query is added anywhere. The dashboard speaks to storage only through
   `/api/content/:slug/views`, whose handlers (Sprint 1) persist through `IContentViewRepository` after
   `validateViewConfigAgainstSeed` in core. **Every persisted column reference is a Branch ID (`br_XX`) or one of the four
   engine system columns.** `toContentViewConfig` (Task 7) converts alias → `branch.id` and drops any reference that does
   not resolve or that `viewColumnRefSchema` rejects. `toViewToolbarState` converts `br_XX` → `branch.alias` through
   `findBranchById` and drops unknown ids. No alias is ever written to `seed_views.config`, so renaming a branch alias
   cannot break a saved view. The migration in Task 2 is a numbered file in `apps/api/migrations/` and follows
   `_config/database_workflow.md`.

3. **VSA (rule 3).**
   - The new slice `features/content-views` imports only `@beechcms/core`, `@/lib/*`, `@/components/ui/*`,
     `@/features/shared` and third-party packages. **It imports no other feature.** It needs `buildFilterableColumns`,
     which lives in `content-toolbar` today. Rule 3 says shared logic moves to a shared lib, so Task 6 moves it to
     `@/lib/filter-dsl` (next to `FilterGroupType`, which it already returns) and leaves a re-export behind.
   - `content-management` loses one cross-slice edge (`use-content-table-config.ts → content-toolbar`, Task 10) and
     gains none.
   - `content-toolbar` gains no feature import. `ViewSwitcher` receives labels from its caller instead of reading
     another slice's registry.
   - `content-kanban` gains no import. `useKanbanEntrySync` receives the axis as an argument.
   - Multi-slice composition (`content-views` + `content-management` + `content-toolbar` + `content-gallery` +
     `content-kanban`) happens only in `pages/content-list.tsx` and `pages/content-view-workspace.tsx`. Pages are the
     composition layer today.
   - *Pre-existing edges not introduced here and left alone:* `content-management → content-toolbar`
     (`use-content-list-query.ts`), `content-management → content-kanban` (`ContentListModals.tsx →
     CardConfigDialog`), `content-management → automations`. Fixing them is out of scope (§7).

4. **Cloudflare purity (rule 4).** No new runtime, binding, queue or background job. The single schema change is
   `ALTER TABLE … DROP COLUMN` in a numbered migration. D1 runs SQLite ≥ 3.35, which supports it in place. The column
   has no index, trigger, view, foreign key, `UNIQUE` or `PRIMARY KEY` constraint, so SQLite does not need a table rebuild.

5. **Minimalist blueprint (rule 5).** core: 0 new files. api: 1 new file (the migration), 2 deleted. dashboard: 1 new
   slice (4 source files + 1 barrel + 4 unit tests), 1 new page module. Everything else is an edit.

**No violation found. Plan proceeds.** HANDOFF -> caveman_coder.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprints 3 (switcher redesign, drag-and-drop, empty state, View Harness) and 4 (universal Element formatting) both assume
the content page already renders **instances**: `activeViewId` is an instance id, every per-view setting comes from
`ContentView.config`, and a setting change is a write to one `seed_views` row. None of that exists today. Until this
sprint lands, the Sprint 1 API has no consumer and the brief's first two user stories ("several named views of the same
type", "shared with colleagues") are unmet. Any harness work done first would be built on the `id === type` assumption
this sprint removes.

The legacy removal belongs here because its last consumer, `useKanbanViewConfig`, is deleted in this sprint. Keeping
the endpoint one sprint longer would leave a writable Kanban config that nothing reads.

**VSA.** The instance lifecycle (fetch, create, update, delete, autosave, mapping) is one new vertical slice,
`features/content-views`. It has no inbound or outbound feature imports. The page composes it with the existing slices.
Existing slices change only at their public edges: hook parameters, component props, one prop rename.

**Botanical Engine.** The dashboard is alias-native (rows arrive keyed by alias, and toolbar column ids are aliases). The
persisted config is Branch-ID-native. The mapping is the single crossing point, it runs on both read and write, and it
is unit-tested against the canonical `posts` seed. Server-side, Sprint 1's `validateViewConfigAgainstSeed` cleans the
config again before the repository stores it.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**API (Sprint 1, uncommitted at planning time; see Precondition).** Routes in
`apps/api/src/features/content/index.ts`, all registered before `/:slug/:id`:

```
content.get('/:slug/views', listViewsHandler)            // content:read  — bootstraps defaults on an empty seed
content.post('/:slug/views', createViewHandler)          // content:update — 201 ContentView
content.put('/:slug/views/order', reorderViewsHandler)   // content:update — not consumed this sprint
content.patch('/:slug/views/:viewId', updateViewHandler) // content:update — { title?, config? }, whole-config replace
content.delete('/:slug/views/:viewId', deleteViewHandler)// content:update — 204 | 409 content-view-last-table
content.get('/:slug/view-config', getViewConfigHandler)  // legacy — removed this sprint
content.put('/:slug/view-config', putViewConfigHandler)  // legacy — removed this sprint
```

Error identities the dashboard handles: `404 content-view-not-found`, `409 content-view-last-table`,
`422 content-invalid-view`. Problem bodies are RFC 9457 objects with a `type` field (`publicProblem`).

Context variables used (`AppEnv.Variables`, `apps/api/src/types.ts`): `contentViewRepository: IContentViewRepository`
(Sprint 1) and `seedLayoutRepository: ISeedLayoutRepository` (loses two methods here). **Middleware registration order
is unchanged by this sprint.** No middleware is added, removed or reordered. The only edit under `middleware/` is
deleting two rows from the `PROTECTED_ROUTES` table:

```ts
// apps/api/src/middleware/permission.middleware.ts — current lines 119–120 (deleted)
{ method: 'GET', pattern: /^\/api\/content\/([^/]+)\/view-config$/, requirement: perm('content:read',   'capture1') },
{ method: 'PUT', pattern: /^\/api\/content\/([^/]+)\/view-config$/, requirement: perm('content:update', 'capture1') },
```

After removal, `/api/content/:slug/view-config` matches the generic per-seed rows (`GET|PUT /^\/api\/content\/([^/]+)\/[^/]+$/`)
and reaches the entry handlers with id `view-config`. Those handlers 404 on it. This is the same fall-through any
unknown entry id gets, and no permission is widened.

**Core contract consumed (unchanged).** `packages/core/src/dashboard-layout/content-view.ts` exports `ContentView`,
`ContentViewConfig`, `VIEW_SYSTEM_COLUMNS = ['slug','status','created_at','updated_at']`, `viewColumnRefSchema`
(`VIEW_SYSTEM_COLUMNS | /^br_[A-Za-z0-9]+$/`), `MAX_VIEW_CONDITIONS = 3`, and the config shape:

```ts
{ filters: { columnRef, conditions: { op, value }[] /*1..3*/ }[] /*≤50*/,
  sort: { columnRef, desc } | null,
  groupBy: { columnRef, datePrecision?: { year, month, day } } | null,
  appearance: { density?: 'compact'|'normal'|'comfortable', hiddenColumns?: ref[] /*≤200*/, pageSize?: 1..100 },
  conditionalFormats: { id /*≤64*/, enabled, priority /*0..1000*/, label? /*≤60*/, columnRef, conditions /*1..3*/,
                        tone, target: 'element'|'field', textStyles }[] /*≤50*/,
  kanban?: KanbanViewConfig, card?: KanbanCardConfig }   // kanban-only
```

Filter-condition `value`: `string (≤500) | number | boolean | null`. `findBranchById` is exported from
`@beechcms/core` (`engine/seeds/seed-registry.js`).

**Dashboard today** (`apps/dashboard/src/pages/content-list.tsx`):

- `activeViewId` is the view **type** (`useState(() => getStoredActiveView(slug) ?? "table")`). localStorage key is
  `beech_content_view_${slug}`. `?view=` is read as a type and checked with `isViewAuthorized`.
- `views` = `resolveAuthorizedViews(seed).map(type => ({ id: type, … }))` plus an in-memory `viewOverlays` record for
  `label` / `conditionalFormats`. The TODO at line 118 marks the persistence gap.
- Per-view state owners, all `useState`, all shared across views:
  - `useContentListQuery` (`features/content-management/hooks/use-content-list-query.ts:L57`): `pageSize` (default 10),
    `sorting: SortingState` (single sort), `toolbarFilters: ToolbarFiltersState` (keyed by alias; seeded from
    `?status=` with condition id `"status-prefilter"`), plus non-persisted `pageIndex` and `tableSearch`.
  - `useContentTableConfig` (`…/use-content-table-config.ts:L45`): `groupBy` (alias | `"status"`),
    `dateGroupPrecision`, `columnVisibility` (default hides `id`, `slug`, `created_at` and JSON branches whose alias
    contains `metadata`/`metadati`), `columnSizing` (not persisted), `density`. It reads
    `activeView?.conditionalFormats`, typed as `UserViewInstance` imported from `content-toolbar`.
  - `useKanbanViewConfig(slug)` (`features/content-kanban/hooks/use-kanban-view-config.ts`): React Query on
    `['seed-view-config', slug]` → `GET/PUT /content/:slug/view-config`. `useKanbanEntrySync` calls it a second time
    just to read `axisBranchId`.
- Comparisons that treat the id as a type: `content-list.tsx` L309/325/331/370/380/428, `ContentListModals.tsx:L87`,
  `settings-menu.tsx` L267/337/445/580/617/620.
- `ViewSwitcher` declares `onCreateView` and never renders anything for it. `useViewName` commits a trimmed,
  non-empty, changed name through `onRenameView`. There is no delete affordance.
- `viewRegistry` (`features/content-toolbar/view-registry.ts`, filled by `view-registry.bootstrap.ts`, imported in
  `main.tsx:L25`) maps type → `{ labelKey, enabledTools }`. Label keys: `content.list.table`, `content.list.gallery`,
  `content.list.kanban` (the last one is missing from both locale files today and renders through `defaultValue`).
- The conditional-format rule (`@/lib/conditional-format`) is
  `{ id, enabled, priority, label?, columnId /*alias*/, group: ToolbarFilterGroup, tone, target: 'row'|'cell', textStyles? }`.
- `ConfirmDialog` exists at `@/components/ui/confirm-dialog`. `DropdownMenuItem` supports `variant="destructive"`.
- The canonical `posts` seed (`packages/testing/src/seeds/canonical.seeds.ts`) authorizes `['table', 'gallery']` and has
  `br_01 title (text)`, `br_05 view_count (number)`, `br_07 tags (tags)`, … No `@beechcms/testing` dependency exists in
  the dashboard today.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**Core (`packages/core`)**
1. `src/dashboard-layout/seed-layout.ts`: remove `seedViewConfigSchema`, `SeedViewConfig`.
2. `src/dashboard-layout/seed-layout.repository.ts`: remove `getViewConfig`, `setViewConfig`, and the `SeedViewConfig` import.
3. `src/dashboard-layout/seed-layout.test.ts`: remove `describe('seedViewConfigSchema')`. Replace
   `describe('seedViewConfigSchema — card extension')` with `describe('kanbanCardConfigSchema')`.
4. `src/dashboard-layout/kanban/kanban.ts`: doc comment at L27 only.

**API (`apps/api`)**
5. `migrations/0034_drop_seed_layouts_view_config.sql` (new).
6. `src/features/content/handlers/view-config.ts`: **delete**.
7. `src/features/content/handlers/view-config.handler.test.ts`: **delete**.
8. `src/features/content/index.ts`: remove the import and the two `/view-config` routes.
9. `src/middleware/permission.middleware.ts`: remove the two `/view-config` rows.
10. `src/shared/db/repositories/seed-layout.repository.d1.ts`: remove `getViewConfig`, `setViewConfig`, and their imports.
11. `src/shared/db/repositories/seed-layout.repository.d1.test.ts`: remove `describe('getViewConfig')` and `describe('setViewConfig')`.

**Dashboard (`apps/dashboard`)**
12. `package.json`: devDependency `"@beechcms/testing": "workspace:^0.8.0"`.
13. `src/lib/filter-dsl.ts`: receives `FilterableColumn` + `buildFilterableColumns` (moved verbatim).
14. `src/features/content-toolbar/shared.ts`: replace the two definitions with a re-export from `@/lib/filter-dsl`.
15. `src/features/content-views/api/content-views.api.ts` (new).
16. `src/features/content-views/hooks/use-content-views.ts` (new).
17. `src/features/content-views/hooks/use-view-config-autosave.ts` (new).
18. `src/features/content-views/lib/view-config-mapping.ts` (new).
19. `src/features/content-views/lib/resolve-active-view.ts` (new).
20. `src/features/content-views/index.ts` (new).
21. `src/features/content-views/test/unit/view-config-mapping.test.ts` (new).
22. `src/features/content-views/test/unit/resolve-active-view.test.ts` (new).
23. `src/features/content-views/test/unit/content-views.api.test.ts` (new).
24. `src/features/content-views/test/unit/use-view-config-autosave.test.tsx` (new).
25. `src/features/content-management/hooks/use-content-list-query.ts`: `initial` param, `persistableFilters`.
26. `src/features/content-management/hooks/use-content-table-config.ts`: `initial` + `conditionalFormats` params.
27. `src/features/content-management/components/ContentListModals.tsx`: `activeViewId` → `activeViewType`.
28. `src/features/content-kanban/hooks/use-kanban-view-config.ts`: **delete**.
29. `src/features/content-kanban/hooks/use-kanban-entry-sync.ts`: `axisBranchId` parameter.
30. `src/features/content-kanban/index.ts`: drop the `useKanbanViewConfig` export.
31. `src/lib/content-api.ts`: remove `fetchSeedViewConfig`, `updateSeedViewConfig`, and the `SeedViewConfig` import.
32. `src/features/content-toolbar/types.ts`, `content-toolbar.tsx`, `toolbar-components/view-switcher.tsx`,
    `toolbar-components/settings-menu.tsx`: create menu, delete item, `activeViewType`.
33. `src/features/content-toolbar/test/unit/settings-menu.test.tsx`, `content-toolbar.test.tsx`: prop rename + delete-item test.
34. `src/features/content-toolbar/test/unit/view-switcher.test.tsx` (new).
35. `src/pages/content-list.tsx`: rewritten as the shell.
36. `src/pages/content-view-workspace.tsx` (new).
37. `src/test/cross-slice/content-list.test.tsx`: instance ids, `content-views` mock, fallback + create tests.
38. `src/locales/en.json`, `src/locales/it.json`: new keys.

Nothing else. `drafts-list.tsx`, `content-gallery`, `entry-editor`, `@beechcms/testing` sources, and every Sprint 1
file stay byte-identical.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

Quote style: single quotes in `packages/*` and `apps/api`, double quotes in `apps/dashboard` (match each file you edit).
Every new file opens with the header of its sibling files: MIT for `packages/core/src`, BUSL for everything else:

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.
```

---

### Task 1 — `packages/core/src/dashboard-layout/seed-layout.ts`

Delete these lines and nothing else (`kanbanViewConfigSchema`, `kanbanCardConfigSchema`,
`validateCardConfigAgainstSeed` stay, because `content-view.ts` imports them):

```ts
export const seedViewConfigSchema = z.object({
  kanban: kanbanViewConfigSchema.optional(),
  card: kanbanCardConfigSchema.optional(),
}).passthrough()
export type SeedViewConfig = z.infer<typeof seedViewConfigSchema>
```

Rename the section banner `// View config — per-seed, per-view dashboard preferences (KB-S02)` to
`// Kanban view config — embedded in ContentViewConfig.kanban (seed_views)`. Rename
`// Kanban card layout (view_config.card)` to `// Kanban card layout — embedded in ContentViewConfig.card (seed_views)`.

### Task 2 — `packages/core/src/dashboard-layout/seed-layout.repository.ts`

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { FormLayout } from './seed-layout.js'

export interface SeedLayoutRecord {
  slug: string
  layout: FormLayout
  updatedAt: number
  updatedBy: string
}

export interface ISeedLayoutRepository {
  /** Return the stored layout for a seed, or null if none was ever saved. */
  get(slug: string): Promise<SeedLayoutRecord | null>
  /** Return all stored layouts, keyed by slug — used by GET /api/schema to enrich. */
  getAllAsMap(): Promise<Map<string, FormLayout>>
  /** Upsert. `updatedBy` is the writer's user id. */
  upsert(slug: string, layout: FormLayout, updatedBy: string): Promise<void>
  /** Remove the stored row — used by the "Reset" action. */
  remove(slug: string): Promise<void>
}
```

### Task 3 — `packages/core/src/dashboard-layout/seed-layout.test.ts`

- Remove `seedViewConfigSchema` from the import list and add `kanbanCardConfigSchema` if it is not imported yet.
- Delete `describe('seedViewConfigSchema', …)` entirely (4 tests).
- Replace `describe('seedViewConfigSchema — card extension', …)` with:

```ts
describe('kanbanCardConfigSchema', () => {
  it('accepts a card whose slots reference Branch IDs', () => {
    const result = kanbanCardConfigSchema.safeParse({
      version: 1, header: { branchId: 'br_01' }, subtitle: { branchId: 'br_02' }, metadata: [],
    })

    expect(result.success).toBe(true)
  })

  it('rejects a slot that references an alias instead of a Branch ID', () => {
    const result = kanbanCardConfigSchema.safeParse({
      version: 1, header: { branchId: 'not-a-branch-id' }, metadata: [],
    })

    expect(result.success).toBe(false)
  })
})
```

### Task 4 — `packages/core/src/dashboard-layout/kanban/kanban.ts`

At L27, change the `KanbanConfig` doc comment's `seed_layouts.view_config (KB-S02)` to
`seed_views.config.kanban (one per Kanban view instance)`. Do not change any code.

### Task 5 — `apps/api/migrations/0034_drop_seed_layouts_view_config.sql` (new)

```sql
-- =============================================================================
-- DROP seed_layouts.view_config — superseded by seed_views (0033)
--
--     The per-seed Kanban blob is discarded by product decision (Saved Views
--     brief §4): every seed restarts from the default Kanban instance that
--     seed_views bootstraps. No data is copied.
--
--     The column has no index, trigger, view, foreign key, UNIQUE or PRIMARY
--     KEY constraint, so SQLite (>= 3.35, which D1 runs) drops it in place
--     without a table rebuild.
-- =============================================================================

ALTER TABLE seed_layouts DROP COLUMN view_config;
```

No `wrangler.jsonc` edit (`"migrations_dir": "migrations"`). Do not edit `0000_v040_base.sql`, its fixture copy in
`test/fixtures/legacy-migrations/`, or `_archive/`. `base-migration-upgrade.test.ts` replays every file after 0030 on
top of the legacy base, which also has the column. Both the upgraded path and the fresh path therefore drop it, and the
schemas stay equal.

### Task 6 — API legacy removal

- **Delete** `apps/api/src/features/content/handlers/view-config.ts` and `view-config.handler.test.ts`.
- `apps/api/src/features/content/index.ts`: delete
  `import { getViewConfigHandler, putViewConfigHandler } from './handlers/view-config'` and the two lines
  `content.get('/:slug/view-config', …)` / `content.put('/:slug/view-config', …)`. Leave the `/views` block and every
  other route where it is.
- `apps/api/src/middleware/permission.middleware.ts`: delete exactly the two `view-config` rows quoted in §2.
  `OAUTH_SCOPE_ROUTES` has no view-config entry and is untouched.
- `apps/api/src/shared/db/repositories/seed-layout.repository.d1.ts`: delete `getViewConfig` and `setViewConfig`.
  The import becomes:
  ```ts
  import type { ISeedLayoutRepository, SeedLayoutRecord, FormLayout } from '@beechcms/core'
  ```
- `apps/api/src/shared/db/repositories/seed-layout.repository.d1.test.ts`: delete `describe('getViewConfig', …)` and
  `describe('setViewConfig', …)` (from `describe('getViewConfig'` through the end of the
  `describe('setViewConfig'` block). Keep the outer `describe('D1SeedLayoutRepository')` closing brace and every
  `get/getAllAsMap/upsert/remove` test unchanged. Do not "fix" the pre-existing `vi.useFakeTimers()` in that file;
  it is outside this sprint's scope.
- `CONTENT_ERRORS` has no view-config entry (the handler used a literal). Nothing to remove there.

### Task 7 — Dashboard: `package.json` + move `buildFilterableColumns`

`apps/dashboard/package.json` → `devDependencies` add `"@beechcms/testing": "workspace:^0.8.0"`, then run
`pnpm install` at the root.

`apps/dashboard/src/lib/filter-dsl.ts`: add at the top (after the existing import):

```ts
import { resolvePolicies, type Seed } from "@beechcms/core"
```

Then add, after the `FilterOperator` type, the interface and function **moved byte-for-byte** from
`features/content-toolbar/shared.ts` (the body is unchanged; only the location moves):

```ts
export interface FilterableColumn {
  columnId: string
  label: string
  type: FilterGroupType
  selectOptions?: string[]
}

export function buildFilterableColumns(
  seed: Seed,
  availableStatusOptions: string[] = []
): FilterableColumn[] {
  /* body moved verbatim from content-toolbar/shared.ts */
}
```

`apps/dashboard/src/features/content-toolbar/shared.ts`: delete the `FilterableColumn` interface and the
`buildFilterableColumns` function. In their place add:

```ts
export { buildFilterableColumns, type FilterableColumn } from "@/lib/filter-dsl"
```

Remove `resolvePolicies` from the `@beechcms/core` import in `shared.ts` if nothing else there uses it (keep `Seed`,
which `getGroupableColumns` still uses). `content-toolbar/index.ts` keeps re-exporting both names from `./shared`.

### Task 8 — `features/content-views/api/content-views.api.ts` (new)

```ts
import { isAxiosError } from "axios"
import { api } from "@/lib/api"
import type { ContentView, ContentViewConfig, DashboardView } from "@beechcms/core"

export interface CreateContentViewBody {
  type: DashboardView
  title?: string | null
}

/** Whole-config replacement on the server, never a deep merge. */
export interface UpdateContentViewBody {
  title?: string | null
  config?: ContentViewConfig
}

export async function fetchContentViews(slug: string): Promise<ContentView[]> {
  const { data } = await api.get<ContentView[]>(`/content/${slug}/views`)
  return data
}

export async function createContentView(slug: string, body: CreateContentViewBody): Promise<ContentView> {
  const { data } = await api.post<ContentView>(`/content/${slug}/views`, body)
  return data
}

export async function updateContentView(
  slug: string,
  viewId: string,
  body: UpdateContentViewBody
): Promise<ContentView> {
  const { data } = await api.patch<ContentView>(`/content/${slug}/views/${viewId}`, body)
  return data
}

export async function deleteContentView(slug: string, viewId: string): Promise<void> {
  await api.delete(`/content/${slug}/views/${viewId}`)
}

/** The RFC 9457 `type` of a failed views request (e.g. "content-view-last-table"), or null. */
export function viewProblemType(error: unknown): string | null {
  if (!isAxiosError(error)) return null
  const data: unknown = error.response?.data
  if (typeof data !== "object" || data === null || !("type" in data)) return null
  return typeof data.type === "string" ? data.type : null
}
```

### Task 9 — `features/content-views/hooks/use-content-views.ts` (new)

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import type { ContentView } from "@beechcms/core"
import {
  createContentView,
  deleteContentView,
  fetchContentViews,
  updateContentView,
  viewProblemType,
  type CreateContentViewBody,
  type UpdateContentViewBody,
} from "../api/content-views.api"

export const CONTENT_VIEWS_QUERY_KEY = (slug: string) => ["content-views", slug] as const

export function useContentViews(slug: string | undefined) {
  return useQuery({
    queryKey: CONTENT_VIEWS_QUERY_KEY(slug ?? ""),
    queryFn: () => fetchContentViews(slug ?? ""),
    enabled: Boolean(slug),
    staleTime: 30_000,
  })
}

export function useCreateContentView(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateContentViewBody) => createContentView(slug, body),
    onSuccess: (created) => {
      queryClient.setQueryData<ContentView[]>(CONTENT_VIEWS_QUERY_KEY(slug), (prev) => [...(prev ?? []), created])
    },
  })
}

interface UpdateContentViewVariables {
  viewId: string
  body: UpdateContentViewBody
}

/**
 * Optimistic and cache-authoritative: the workspace is remounted on every view switch and
 * hydrates from this cache, so it must already hold the config the previous mount just wrote,
 * even while the PATCH is in flight. The server response is not written back. Its only
 * difference is the Branch-ID cleanup, which hydration repeats anyway.
 */
export function useUpdateContentView(slug: string) {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const queryKey = CONTENT_VIEWS_QUERY_KEY(slug)
  return useMutation({
    mutationFn: ({ viewId, body }: UpdateContentViewVariables) => updateContentView(slug, viewId, body),
    onMutate: async ({ viewId, body }: UpdateContentViewVariables) => {
      await queryClient.cancelQueries({ queryKey })
      queryClient.setQueryData<ContentView[]>(queryKey, (prev) =>
        prev?.map((view) =>
          view.id !== viewId
            ? view
            : {
                ...view,
                ...(body.title !== undefined ? { title: body.title } : {}),
                ...(body.config !== undefined ? { config: body.config } : {}),
              }
        )
      )
    },
    // Options on useMutation (not on mutate()) still run after the caller unmounts, which is
    // exactly when the autosave flush fires.
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey })
      // A view deleted while its last autosave was pending: nothing to save, nothing to report.
      if (viewProblemType(error) === "content-view-not-found") return
      toast.error(t("content.views.errors.saveFailed"))
    },
  })
}

export function useDeleteContentView(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (viewId: string) => deleteContentView(slug, viewId),
    onSuccess: (_result, viewId) => {
      queryClient.setQueryData<ContentView[]>(CONTENT_VIEWS_QUERY_KEY(slug), (prev) =>
        prev?.filter((view) => view.id !== viewId)
      )
    },
  })
}
```

### Task 10 — `features/content-management` hook changes

**`hooks/use-content-list-query.ts`**

Add the exported type and constant above the hook:

```ts
export interface ContentListQueryInitialState {
  filters?: ToolbarFiltersState
  sort?: { id: string; desc: boolean } | null
  pageSize?: number
}

/** Condition id of the `?status=` URL prefilter. That filter is a navigation lens, never part of a saved view. */
export const STATUS_PREFILTER_CONDITION_ID = "status-prefilter"
```

The signature becomes
`export function useContentListQuery(slug: string | undefined, seed: Seed | null, initial?: ContentListQueryInitialState)`.
Change the state initializers:

```ts
const [pageSize, setPageSize] = React.useState<number>(initial?.pageSize ?? ROWS_PER_PAGE)
const [sorting, setSorting] = React.useState<SortingState>(() => (initial?.sort ? [initial.sort] : []))

const [toolbarFilters, setToolbarFilters] = React.useState<ToolbarFiltersState>(() => {
  const base: ToolbarFiltersState = { ...(initial?.filters ?? {}) }
  if (!prefilterStatus) return base
  return {
    ...base,
    status: {
      columnId: "status",
      label: "Status",
      type: "select",
      conditions: [{ id: STATUS_PREFILTER_CONDITION_ID, op: "eq", value: prefilterStatus }],
      selectOptions: ["draft", "published"],
    },
  }
})
```

Add, after `toolbarFilters` is declared, and return it next to `toolbarFilters`:

```ts
const persistableFilters = React.useMemo<ToolbarFiltersState>(() => {
  const next: ToolbarFiltersState = {}
  for (const [columnId, group] of Object.entries(toolbarFilters)) {
    const conditions = group.conditions.filter((condition) => condition.id !== STATUS_PREFILTER_CONDITION_ID)
    if (conditions.length > 0) next[columnId] = { ...group, conditions }
  }
  return next
}, [toolbarFilters])
```

Nothing else in the hook changes. `pageIndex` and `tableSearch` stay per-mount and unpersisted.

**`hooks/use-content-table-config.ts`**

- Delete `import type { UserViewInstance } from "@/features/content-toolbar"` (this removes a cross-slice edge).
- Options type:

```ts
export interface ContentTableInitialState {
  groupBy?: string | null
  dateGroupPrecision?: DateGroupPrecision
  /** Omitted → the built-in default hidden set (id, slug, created_at, metadata JSON branches). */
  columnVisibility?: VisibilityState
  density?: TableDensity
}

export interface UseContentTableConfigOptions {
  seed: Seed | null
  data: ContentEntry[]
  pageSize: number
  /** The active view's rules. Owned by the caller, so they can be persisted per view. */
  conditionalFormats: ConditionalFormatRule[]
  initial?: ContentTableInitialState
  selectedIds: string[]
  handleEdit: (id: string) => void
  handleDelete: (id: string) => void
  handleBulkDelete: (ids: string[]) => void
  handleBulkEdit: (ids: string[]) => void
  t: (key: string, options?: any) => string
}
```

- Initializers:
  `useState<string | null>(initial?.groupBy ?? null)`,
  `useState<DateGroupPrecision>(initial?.dateGroupPrecision ?? DEFAULT_DATE_GROUP_PRECISION)`,
  `useState<TableDensity>(initial?.density ?? DEFAULT_DENSITY)`,
  and `columnVisibility`'s lazy initializer returns `initial.columnVisibility` when it is defined. Otherwise it returns
  the existing default-building body unchanged.
- `conditionalRules`: read `conditionalFormats` instead of `activeView?.conditionalFormats`, with deps
  `[conditionalFormats]`.

**`components/ContentListModals.tsx`**: rename the prop `activeViewId: string` → `activeViewType: string` (interface,
destructuring, and the `activeViewId === "kanban"` check at L87 → `activeViewType === "kanban"`).

### Task 11 — `features/content-views/lib/view-config-mapping.ts` (new)

This is the only alias ↔ Branch-ID crossing in the dashboard. Both directions are pure, total (they never throw) and
deterministic: the same input always yields the same JSON, which `useViewConfigAutosave` relies on.

```ts
import type { VisibilityState } from "@tanstack/react-table"
import {
  findBranchById,
  MAX_VIEW_CONDITIONS,
  VIEW_SYSTEM_COLUMNS,
  viewColumnRefSchema,
  type ContentViewConfig,
  type DashboardView,
  type KanbanCardConfig,
  type KanbanViewConfig,
  type Seed,
  type ViewColumnRef,
  type ViewConditionalFormat,
  type ViewFilter,
} from "@beechcms/core"
import { buildFilterableColumns, type FilterableColumn, type ToolbarFilterGroup } from "@/lib/filter-dsl"
import type { ConditionalFormatRule } from "@/lib/conditional-format"
import { DEFAULT_DATE_GROUP_PRECISION, type DateGroupPrecision } from "@/lib/dynamic-columns"
import type { TableDensity } from "@/lib/density"

/** Alias-keyed state the toolbar hooks hold for one view instance. */
export interface ViewToolbarState {
  filters: Record<string, ToolbarFilterGroup>
  sort: { id: string; desc: boolean } | null
  groupBy: string | null
  dateGroupPrecision: DateGroupPrecision
  /** undefined → the table's built-in default hidden set. */
  columnVisibility: VisibilityState | undefined
  density: TableDensity | undefined
  pageSize: number | undefined
  conditionalFormats: ConditionalFormatRule[]
  kanban: KanbanViewConfig | undefined
  card: KanbanCardConfig | undefined
}

// Limits mirrored from contentViewConfigSchema. A value past them would make the whole PATCH 422.
const MAX_FILTERS = 50
const MAX_FORMATS = 50
const MAX_HIDDEN_COLUMNS = 200
const MAX_STRING_VALUE = 500
const MAX_RULE_ID = 64
const MAX_RULE_LABEL = 60
const MAX_PRIORITY = 1000

/** Matches the `?status=` prefilter: hydration runs before facets load, so options cannot come from data. */
const HYDRATION_STATUS_OPTIONS = ["draft", "published"]
/** Never persisted: VIEW_SYSTEM_COLUMNS has no `id`, and the toolbar cannot show it. */
const ALWAYS_HIDDEN_COLUMN = "id"

const SYSTEM_COLUMNS = new Set<string>(VIEW_SYSTEM_COLUMNS)
const DATE_SYSTEM_COLUMNS = new Set<string>(["created_at", "updated_at"])

export function columnIdToRef(seed: Seed, columnId: string): ViewColumnRef | null {
  const ref = SYSTEM_COLUMNS.has(columnId)
    ? columnId
    : seed.branches.find((branch) => branch.alias === columnId)?.id
  return ref !== undefined && viewColumnRefSchema.safeParse(ref).success ? (ref as ViewColumnRef) : null
}

export function refToColumnId(seed: Seed, ref: string): string | null {
  if (SYSTEM_COLUMNS.has(ref)) return ref
  return findBranchById(seed, ref)?.alias ?? null
}

function isDateRef(seed: Seed, ref: string): boolean {
  return DATE_SYSTEM_COLUMNS.has(ref) || findBranchById(seed, ref)?.type === "date"
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function toViewConditions(conditions: ToolbarFilterGroup["conditions"]): ViewFilter["conditions"] {
  return conditions.slice(0, MAX_VIEW_CONDITIONS).map(({ op, value }) => ({
    op,
    value: typeof value === "string" ? value.slice(0, MAX_STRING_VALUE) : value,
  }))
}

/**
 * Condition ids are derived from position, so hydrating the same config twice yields the same
 * ids and React keys stay stable across remounts.
 */
function toToolbarGroup(
  column: FilterableColumn,
  conditions: ViewFilter["conditions"],
  idPrefix: string
): ToolbarFilterGroup {
  return {
    columnId: column.columnId,
    label: column.label,
    type: column.type,
    selectOptions: column.selectOptions,
    conditions: conditions.map((condition, index) => ({ id: `${idPrefix}:${index}`, ...condition })),
  }
}

/** Persisted (Branch-ID) config → alias-keyed toolbar state. Unknown refs are dropped. */
export function toViewToolbarState(config: ContentViewConfig, seed: Seed): ViewToolbarState {
  const columns = new Map(buildFilterableColumns(seed, HYDRATION_STATUS_OPTIONS).map((c) => [c.columnId, c]))
  const columnFor = (ref: string): FilterableColumn | undefined => {
    const columnId = refToColumnId(seed, ref)
    return columnId === null ? undefined : columns.get(columnId)
  }

  const filters: Record<string, ToolbarFilterGroup> = {}
  for (const filter of config.filters) {
    const column = columnFor(filter.columnRef)
    if (column) filters[column.columnId] = toToolbarGroup(column, filter.conditions, filter.columnRef)
  }

  const sortId = config.sort ? refToColumnId(seed, config.sort.columnRef) : null
  const groupBy = config.groupBy ? refToColumnId(seed, config.groupBy.columnRef) : null

  const hidden = config.appearance.hiddenColumns
  const columnVisibility: VisibilityState | undefined =
    hidden === undefined
      ? undefined
      : Object.fromEntries([
          [ALWAYS_HIDDEN_COLUMN, false],
          ...hidden.flatMap((ref) => {
            const columnId = refToColumnId(seed, ref)
            return columnId === null ? [] : [[columnId, false] as const]
          }),
        ])

  const conditionalFormats = config.conditionalFormats.flatMap((rule): ConditionalFormatRule[] => {
    const column = columnFor(rule.columnRef)
    if (!column) return []
    return [{
      id: rule.id,
      enabled: rule.enabled,
      priority: rule.priority,
      label: rule.label,
      columnId: column.columnId,
      group: toToolbarGroup(column, rule.conditions, rule.id),
      tone: rule.tone,
      target: rule.target === "field" ? "cell" : "row",
      textStyles: rule.textStyles,
    }]
  })

  return {
    filters,
    sort: config.sort && sortId !== null ? { id: sortId, desc: config.sort.desc } : null,
    groupBy,
    dateGroupPrecision: config.groupBy?.datePrecision ?? DEFAULT_DATE_GROUP_PRECISION,
    columnVisibility,
    density: config.appearance.density,
    pageSize: config.appearance.pageSize,
    conditionalFormats,
    kanban: config.kanban,
    card: config.card,
  }
}

/** Alias-keyed toolbar state → persisted (Branch-ID) config. Unresolvable refs and empty groups are dropped. */
export function toContentViewConfig(state: ViewToolbarState, seed: Seed, type: DashboardView): ContentViewConfig {
  const filters: ViewFilter[] = Object.values(state.filters)
    .flatMap((group): ViewFilter[] => {
      const columnRef = columnIdToRef(seed, group.columnId)
      const conditions = toViewConditions(group.conditions)
      return columnRef !== null && conditions.length > 0 ? [{ columnRef, conditions }] : []
    })
    .slice(0, MAX_FILTERS)

  const sortRef = state.sort ? columnIdToRef(seed, state.sort.id) : null
  const groupRef = state.groupBy !== null ? columnIdToRef(seed, state.groupBy) : null

  const hiddenColumns =
    state.columnVisibility === undefined
      ? undefined
      : [
          ...new Set(
            Object.entries(state.columnVisibility).flatMap(([columnId, visible]) => {
              if (visible !== false || columnId === ALWAYS_HIDDEN_COLUMN) return []
              const ref = columnIdToRef(seed, columnId)
              return ref === null ? [] : [ref]
            })
          ),
        ].slice(0, MAX_HIDDEN_COLUMNS)

  const conditionalFormats = state.conditionalFormats
    .flatMap((rule): ViewConditionalFormat[] => {
      const columnRef = columnIdToRef(seed, rule.columnId)
      const conditions = toViewConditions(rule.group.conditions)
      if (columnRef === null || conditions.length === 0) return []
      return [{
        id: rule.id.slice(0, MAX_RULE_ID),
        enabled: rule.enabled,
        priority: clampInt(rule.priority, 0, MAX_PRIORITY),
        ...(rule.label ? { label: rule.label.slice(0, MAX_RULE_LABEL) } : {}),
        columnRef,
        conditions,
        tone: rule.tone,
        target: rule.target === "cell" ? "field" : "element",
        textStyles: rule.textStyles ?? [],
      }]
    })
    .slice(0, MAX_FORMATS)

  const config: ContentViewConfig = {
    filters,
    sort: state.sort && sortRef !== null ? { columnRef: sortRef, desc: state.sort.desc } : null,
    groupBy:
      groupRef === null
        ? null
        : isDateRef(seed, groupRef)
          ? { columnRef: groupRef, datePrecision: state.dateGroupPrecision }
          : { columnRef: groupRef },
    appearance: {
      ...(state.density !== undefined ? { density: state.density } : {}),
      ...(hiddenColumns !== undefined ? { hiddenColumns } : {}),
      ...(state.pageSize !== undefined ? { pageSize: clampInt(state.pageSize, 1, 100) } : {}),
    },
    conditionalFormats,
  }
  if (type === "kanban") {
    if (state.kanban) config.kanban = state.kanban
    if (state.card) config.card = state.card
  }
  return config
}
```

Notes for the executor:
- `ViewFilter` and `ViewConditionalFormat` are exported by core's `content-view.ts` (`z.output` types). Do not
  redeclare them.
- `ToolbarFilterGroup` from `@/lib/filter-dsl` is structurally identical to the one in `content-toolbar/shared.ts`, so
  `query.persistableFilters` (typed with the toolbar's alias) is assignable to `ViewToolbarState.filters` without a cast.
- If a TypeScript narrowing on `typeof value === "string"` inside `toViewConditions` complains because the source union
  is wider than core's, keep the same runtime logic and annotate the return type. **Do not use `any`.**

### Task 12 — `features/content-views/lib/resolve-active-view.ts` (new)

```ts
import type { ContentView } from "@beechcms/core"

/**
 * The first candidate that names a visible instance wins (session pick, then `?view=`, then
 * localStorage). With no match, the first Table instance, which the API guarantees exists.
 */
export function resolveActiveViewId(
  views: ReadonlyArray<Pick<ContentView, "id" | "type">>,
  candidates: ReadonlyArray<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    if (candidate && views.some((view) => view.id === candidate)) return candidate
  }
  return views.find((view) => view.type === "table")?.id ?? views[0]?.id ?? null
}
```

### Task 13 — `features/content-views/hooks/use-view-config-autosave.ts` (new)

```ts
import * as React from "react"
import type { ContentViewConfig } from "@beechcms/core"
import { useUpdateContentView } from "./use-content-views"

/** Long enough to coalesce typing in a filter pill, short enough that a reload rarely loses a change. */
export const VIEW_AUTOSAVE_DELAY_MS = 600

interface UseViewConfigAutosaveOptions {
  slug: string
  viewId: string
  config: ContentViewConfig
  /** false for users without content:update: changes stay local, as before persisted views. */
  enabled: boolean
}

export function useViewConfigAutosave({ slug, viewId, config, enabled }: UseViewConfigAutosaveOptions) {
  const { mutate, isPending } = useUpdateContentView(slug)
  const serialized = React.useMemo(() => JSON.stringify(config), [config])

  // Baseline = the config at mount, so hydrating a view never writes it back.
  const savedRef = React.useRef(serialized)
  const latestRef = React.useRef({ config, serialized, enabled })
  React.useLayoutEffect(() => {
    latestRef.current = { config, serialized, enabled }
  })

  const flush = React.useCallback(() => {
    const latest = latestRef.current
    if (!latest.enabled || latest.serialized === savedRef.current) return
    savedRef.current = latest.serialized
    mutate({ viewId, body: { config: latest.config } })
  }, [mutate, viewId])

  React.useEffect(() => {
    if (!enabled || serialized === savedRef.current) return
    const timer = setTimeout(flush, VIEW_AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [serialized, enabled, flush])

  // The caller is keyed by view id, so unmount means a view switch or leaving the page:
  // a change still inside the debounce window is flushed, never dropped.
  const flushRef = React.useRef(flush)
  React.useLayoutEffect(() => {
    flushRef.current = flush
  })
  React.useEffect(() => () => flushRef.current(), [])

  return { isSaving: isPending }
}
```

### Task 14 — `features/content-views/index.ts` (new)

```ts
/**
 * Public API of the content-views slice: persisted, shared view instances of a content type.
 * Imports no other feature slice. Pages compose it with the toolbar and the renderers.
 */
export {
  CONTENT_VIEWS_QUERY_KEY,
  useContentViews,
  useCreateContentView,
  useUpdateContentView,
  useDeleteContentView,
} from "./hooks/use-content-views"
export { useViewConfigAutosave, VIEW_AUTOSAVE_DELAY_MS } from "./hooks/use-view-config-autosave"
export { toViewToolbarState, toContentViewConfig, type ViewToolbarState } from "./lib/view-config-mapping"
export { resolveActiveViewId } from "./lib/resolve-active-view"
export { viewProblemType, type CreateContentViewBody, type UpdateContentViewBody } from "./api/content-views.api"
```

### Task 15 — `features/content-kanban`

- **Delete** `hooks/use-kanban-view-config.ts`.
- `index.ts`: delete `export { useKanbanViewConfig } from './hooks/use-kanban-view-config'`.
- `hooks/use-kanban-entry-sync.ts`: delete the `useKanbanViewConfig` import. New signature, with the body otherwise
  unchanged:

```ts
export function useKanbanEntrySync(seed: Seed | undefined, seedSlug: string, axisBranchId: string | null) {
  const queryClient = useQueryClient()

  return (info: SavedEntryInfo) => {
    if (!seed) return
    if (!axisBranchId) return
    const axisBranch = seed.branches.find(b => b.id === axisBranchId)
    // … rest unchanged
  }
}
```

- `apps/dashboard/src/lib/content-api.ts`: delete `fetchSeedViewConfig` and `updateSeedViewConfig`. The core import
  becomes `import type { FilterGroup } from "@beechcms/core"`.

### Task 16 — `features/content-toolbar`

**`types.ts`** — add the import `import type { DashboardView, Seed, TransferFormat } from "@beechcms/core"` (extend the
existing one) and change or add these props in `ContentToolbarProps`:

```ts
  /** Present only for users who may create views. */
  onCreateView?: (type: DashboardView) => void
  /** Types offered by the "+" menu, already filtered by the seed allow-list and labelled by the caller. */
  creatableViews?: ReadonlyArray<{ type: DashboardView; label: string }>
  onRenameView?: (viewId: string, label: string) => void
  /** Present only for users who may delete views. */
  onDeleteView?: (viewId: string) => void
  /** false when the active view is the content type's only Table instance. */
  canDeleteView?: boolean
```

(`onCreateView` replaces the old `() => void` declaration, and `onRenameView` stays as it is.)

**`toolbar-components/view-switcher.tsx`** — props:

```ts
interface ViewSwitcherProps {
  readonly views: UserViewInstance[]
  readonly activeViewId: string
  readonly onChangeView: (viewId: string) => void
  readonly onCreateView?: (type: DashboardView) => void
  readonly creatableViews?: ReadonlyArray<{ type: DashboardView; label: string }>
}
```

Render after the `ToggleGroup`, inside the same flex container:

```tsx
{onCreateView && creatableViews && creatableViews.length > 0 && (
  <DropdownMenu>
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("content.views.add")}>
            <Plus className="size-4" />
          </Button>
        </DropdownMenuTrigger>
      </TooltipTrigger>
      <TooltipContent side="top">{t("content.views.add")}</TooltipContent>
    </Tooltip>
    <DropdownMenuContent align="start">
      {creatableViews.map(({ type, label }) => {
        const Icon = VIEW_TYPE_ICONS[type]
        return (
          <DropdownMenuItem key={type} onSelect={() => onCreateView(type)}>
            <Icon className="size-4" />
            {label}
          </DropdownMenuItem>
        )
      })}
    </DropdownMenuContent>
  </DropdownMenu>
)}
```

Imports: `useTranslation`, `Plus` from `reicon-react`, `Button`, `Tooltip*`, `DropdownMenu*` from `@/components/ui/*`,
and `type DashboardView` from `@beechcms/core`. Keep the file's existing semicolon style.

**`content-toolbar.tsx`**
- Destructure `creatableViews`, `onDeleteView`, `canDeleteView`, `onRenameView` from `props`. The current
  `onRenameView: _` discard becomes a real binding.
- `<ViewSwitcher … onCreateView={onCreateView} creatableViews={creatableViews} />`.
- In `<SettingsMenu …>`: replace `activeViewId={activeViewId}` with `activeViewType={activeView.type}`, and add

```tsx
isViewNameEditable={Boolean(onRenameView)}
onDeleteView={onDeleteView ? () => onDeleteView(activeView.id) : undefined}
canDeleteView={canDeleteView ?? false}
```

**`toolbar-components/settings-menu.tsx`**
- Props: rename `readonly activeViewId?: string` → `readonly activeViewType?: string`. Add
  `readonly isViewNameEditable?: boolean`, `readonly onDeleteView?: () => void`, `readonly canDeleteView?: boolean`.
- Replace every `activeViewId` comparison (L267, L337, L445, L580, L617, L620) with `activeViewType`. These were always
  type checks.
- View-name `<Input>`: add `disabled={isViewNameEditable === false}`.
- After the last top-level group (just before `</DropdownMenuContent>`):

```tsx
{onDeleteView && (
  <>
    <DropdownMenuSeparator />
    <DropdownMenuItem
      variant="destructive"
      disabled={!canDeleteView}
      onSelect={() => {
        closeSettingsMenu()
        onDeleteView()
      }}
    >
      <Trash2 className="size-4" />
      {t("content.views.delete")}
    </DropdownMenuItem>
  </>
)}
```

  (`Trash2` from `reicon-react`, as in `pages/content-list.tsx`.)

**Tests in this slice**
- `test/unit/settings-menu.test.tsx`: `renderSettingsMenu(activeViewId)` → `renderSettingsMenu(activeViewType)`, and
  pass `activeViewType={activeViewType}`. Existing assertions stay the same. Add:
  - `it("offers no delete item when the caller passes no onDeleteView", …)`: assert
    `screen.queryByRole("menuitem", { name: /delete view|elimina vista/i })` is `null`.
  - `it("disables the delete item for the content type's only Table view", …)`: pass `onDeleteView={vi.fn()}` and
    `canDeleteView={false}`, then assert the menuitem has `aria-disabled="true"` (Radix sets it) or `data-disabled`.
    Assert the attribute Radix actually renders, and check one before writing the assertion.
- `test/unit/content-toolbar.test.tsx`: wherever `useContentToolbar` is mocked with `activeView: { id: "table" }`, add
  `type: "table"`, so `activeViewType` keeps resolving to the Table branch.
- `test/unit/view-switcher.test.tsx` (new, dashboard unit template §9.3, `TooltipProvider` wrapper like
  `settings-menu.test.tsx`):
  - `it("renders no add-view trigger when onCreateView is absent", …)`.
  - `it("lists every creatable type and creates the one the user picks", …)`: views = one table instance with a UUID
    id. `creatableViews = [{ type: "table", label: "Table" }, { type: "gallery", label: "Gallery" }]`. Open the trigger
    by its `aria-label`, click "Gallery", and assert `onCreateView` was called once with `"gallery"`.
  - Opening Radix dropdowns in jsdom: use `userEvent.click`, or `fireEvent.pointerDown` with
    `{ button: 0, ctrlKey: false }`. Copy whichever idiom an existing dropdown test in the repo already uses.

### Task 17 — `pages/content-view-workspace.tsx` (new)

The body of today's `ContentListPage` from the `ContentToolbar` down, plus the modals, keyed by instance id. **All
per-view state is initialised once from `view.config` at mount. The parent's `key={view.id}` is what resets it on a
switch.** There is no hydration effect.

```tsx
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { resolveKanbanConfig, type ContentView, type DashboardView, type KanbanConfig, type Seed, type TransferFormat } from "@beechcms/core"
import { usePermissions } from "@/features/shared/hooks/use-permissions"
import { ContentGallery } from "@/features/content-gallery"
import { ContentKanban, useKanbanEntrySync, type KanbanBoardConfig } from "@/features/content-kanban"
import { ContentToolbar, type UserViewInstance } from "@/features/content-toolbar"
import {
  useContentListQuery,
  useContentTableConfig,
  useContentListModals,
  ContentTableView,
  ContentListModals,
} from "@/features/content-management"
import { toContentViewConfig, toViewToolbarState, useViewConfigAutosave } from "@/features/content-views"
import { downloadExport, readProblem } from "@/features/content-transfer"
import type { ConditionalFormatRule } from "@/lib/conditional-format"

/** Gallery has no density concept yet: the control stays in the menu but must not touch table state. */
const NOOP_DENSITY_CHANGE = () => {}
const EMPTY_KANBAN_CONFIG: KanbanBoardConfig = { axisBranchId: null, sort: null }

export interface ContentViewWorkspaceProps {
  seed: Seed
  slug: string
  /** The active instance. Read once, at mount. */
  view: ContentView
  /** Every visible instance, labelled, in tab order. */
  switcherViews: UserViewInstance[]
  creatableViews: ReadonlyArray<{ type: DashboardView; label: string }>
  /** content:update on this seed: autosave and view management. */
  canManageViews: boolean
  canDeleteView: boolean
  onChangeView: (viewId: string) => void
  onCreateView?: (type: DashboardView) => void
  onRenameView?: (viewId: string, label: string) => void
  onDeleteView?: (viewId: string) => void
}

export function ContentViewWorkspace({ seed, slug, view, switcherViews, creatableViews, canManageViews, canDeleteView, onChangeView, onCreateView, onRenameView, onDeleteView }: ContentViewWorkspaceProps) {
  const { t } = useTranslation()
  const { can } = usePermissions()
  const [initial] = React.useState(() => toViewToolbarState(view.config, seed))

  const modals = useContentListModals(slug)
  // handleExport + isExportPending: moved verbatim from content-list.tsx L73–88

  const query = useContentListQuery(slug, seed, { filters: initial.filters, sort: initial.sort, pageSize: initial.pageSize })
  const [conditionalFormats, setConditionalFormats] = React.useState<ConditionalFormatRule[]>(initial.conditionalFormats)
  const [kanbanConfig, setKanbanConfig] = React.useState<KanbanBoardConfig>(initial.kanban ?? EMPTY_KANBAN_CONFIG)
  const [cardConfig, setCardConfig] = React.useState(initial.card)

  const tableConfig = useContentTableConfig({
    seed,
    data: query.data,
    pageSize: query.pageSize,
    conditionalFormats,
    initial: {
      groupBy: initial.groupBy,
      dateGroupPrecision: initial.dateGroupPrecision,
      columnVisibility: initial.columnVisibility,
      density: initial.density,
    },
    selectedIds: modals.selectedIds,
    handleEdit: modals.handleEdit,
    handleDelete: modals.handleDelete,
    handleBulkDelete: modals.handleBulkDelete,
    handleBulkEdit: modals.handleBulkEdit,
    t,
  })

  const config = React.useMemo(
    () =>
      toContentViewConfig(
        {
          filters: query.persistableFilters,
          sort: query.singleSort ? { id: query.singleSort.id, desc: query.singleSort.desc } : null,
          groupBy: tableConfig.groupBy,
          dateGroupPrecision: tableConfig.dateGroupPrecision,
          columnVisibility: tableConfig.columnVisibility,
          density: tableConfig.density,
          pageSize: query.pageSize,
          conditionalFormats,
          kanban: kanbanConfig,
          card: cardConfig,
        },
        seed,
        view.type
      ),
    [query.persistableFilters, query.singleSort, query.pageSize, tableConfig.groupBy, tableConfig.dateGroupPrecision,
     tableConfig.columnVisibility, tableConfig.density, conditionalFormats, kanbanConfig, cardConfig, seed, view.type]
  )
  const { isSaving } = useViewConfigAutosave({ slug, viewId: view.id, config, enabled: canManageViews })

  const kanbanSync = useKanbanEntrySync(seed, slug, kanbanConfig.axisBranchId)
  const kanbanCompat = React.useMemo(() => resolveKanbanConfig(seed), [seed])
  const kanbanCandidates = kanbanCompat.compatible ? kanbanCompat.candidates : []
  const kanbanAxisBranch = React.useMemo(
    () => seed.branches.find((b) => b.id === kanbanConfig.axisBranchId),
    [seed, kanbanConfig.axisBranchId]
  )
  const handleKanbanConfigChange = React.useCallback((next: KanbanConfig) => setKanbanConfig(next), [])

  const toolbarViews = React.useMemo(
    () => switcherViews.map((v) => (v.id === view.id ? { ...v, conditionalFormats } : v)),
    [switcherViews, view.id, conditionalFormats]
  )
  const handleConditionalFormatsChange = React.useCallback(
    (_viewId: string, next: ConditionalFormatRule[]) => setConditionalFormats(next),
    []
  )

  return (
    <>
      <ContentToolbar
        seed={seed}
        views={toolbarViews}
        activeViewId={view.id}
        onChangeView={onChangeView}
        onCreateView={onCreateView}
        creatableViews={creatableViews}
        onRenameView={onRenameView}
        onDeleteView={onDeleteView}
        canDeleteView={canDeleteView}
        onConditionalFormatsChange={handleConditionalFormatsChange}
        /* every other prop exactly as today's content-list.tsx L282–317, with:
           onDensityChange={view.type === "gallery" ? NOOP_DENSITY_CHANGE : tableConfig.setDensity}
           kanbanConfig={kanbanConfig}
           onKanbanConfigChange={handleKanbanConfigChange} */
      >
        {/* children exactly as today's L319–394, with every `activeViewId === "<type>"` → `view.type === "<type>"`,
            and ContentKanban receiving: kanbanConfig={kanbanConfig} setKanbanConfig={handleKanbanConfigChange}
            cardConfig={cardConfig} setCardConfig={setCardConfig} isSaving={isSaving} */}
      </ContentToolbar>

      <ContentListModals
        /* exactly as today's L402–432, with:
           activeViewType={view.type}
           cardConfig={cardConfig}
           onSaveCardConfig={setCardConfig}
           readonly={!can("content:update", modals.target?.schemaSlug ?? "")}
           onSaved={(info) => { if (view.type === "kanban") kanbanSync(info) }} */
      />
    </>
  )
}
```

Behaviour changes that are intentional (document them in the PR description):
- **Search, page index, column widths and row selection reset on a view switch.** They are not part of a view, and the
  workspace remounts. Today they survive a switch because all three "views" share one state.
- **A `?status=draft` deep link (pending-drafts widget) filters the view without saving the filter into it.** See
  `STATUS_PREFILTER_CONDITION_ID`.

### Task 18 — `pages/content-list.tsx` (rewritten shell)

Keep the file's SPDX header, the error branch (seed not found) and the loading branch exactly as today. Delete
everything that moved into the workspace, the `viewOverlays` state, `VIEW_LABELS`, the line-118 TODO, and the imports
that are now unused. New logic, between `useActiveSeed` and the early returns:

```tsx
import { resolveAuthorizedViews, type ContentView, type DashboardView } from "@beechcms/core"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DEFAULT_ENABLED_TOOLS, type UserViewInstance } from "@/features/content-toolbar"
import { viewRegistry } from "@/features/content-toolbar/view-registry"
import {
  resolveActiveViewId,
  useContentViews,
  useCreateContentView,
  useDeleteContentView,
  useUpdateContentView,
  viewProblemType,
} from "@/features/content-views"
import { ContentViewWorkspace } from "./content-view-workspace"

const EMPTY_VIEWS: ContentView[] = []

// inside ContentListPage, after `const { seed, isLoading: isSeedLoading } = useActiveSeed(slug)`:
const requestedViewId = searchParams.get("view")
const viewsQuery = useContentViews(seed ? slug : undefined)
const views = viewsQuery.data ?? EMPTY_VIEWS
const createView = useCreateContentView(slug ?? "")
const updateView = useUpdateContentView(slug ?? "")
const deleteView = useDeleteContentView(slug ?? "")
const canManageViews = can("content:update", slug ?? "")

const [selectedViewId, setSelectedViewId] = React.useState<string | null>(null)
const [viewPendingDelete, setViewPendingDelete] = React.useState<ContentView | null>(null)

const activeViewId = React.useMemo(
  () => resolveActiveViewId(views, [selectedViewId, requestedViewId, getStoredActiveView(slug)]),
  [views, selectedViewId, requestedViewId, slug]
)
const activeView = views.find((view) => view.id === activeViewId)

const handleChangeView = React.useCallback(
  (viewId: string) => {
    setSelectedViewId(viewId)
    setStoredActiveView(slug, viewId)
  },
  [slug]
)

const typeLabel = React.useCallback(
  (type: DashboardView) => t(viewRegistry.get(type)?.labelKey ?? type),
  [t]
)
const switcherViews = React.useMemo<UserViewInstance[]>(
  () =>
    views.map((view) => ({
      id: view.id,
      label: view.title ?? typeLabel(view.type),
      type: view.type,
      enabledTools: viewRegistry.get(view.type)?.enabledTools ?? DEFAULT_ENABLED_TOOLS,
    })),
  [views, typeLabel]
)
const creatableViews = React.useMemo(
  () => (seed && canManageViews ? resolveAuthorizedViews(seed).map((type) => ({ type, label: typeLabel(type) })) : []),
  [seed, canManageViews, typeLabel]
)
const tableViewCount = views.filter((view) => view.type === "table").length

const handleCreateView = React.useCallback(
  (type: DashboardView) =>
    createView.mutate(
      { type },
      {
        onSuccess: (created) => handleChangeView(created.id),
        onError: () => toast.error(t("content.views.errors.createFailed")),
      }
    ),
  [createView, handleChangeView, t]
)
const handleRenameView = React.useCallback(
  (viewId: string, label: string) => updateView.mutate({ viewId, body: { title: label } }),
  [updateView]
)
const handleRequestDeleteView = React.useCallback(
  (viewId: string) => setViewPendingDelete(views.find((view) => view.id === viewId) ?? null),
  [views]
)
const handleConfirmDeleteView = React.useCallback(() => {
  if (!viewPendingDelete) return
  deleteView.mutate(viewPendingDelete.id, {
    onError: (error) =>
      toast.error(
        viewProblemType(error) === "content-view-last-table"
          ? t("content.views.errors.lastTable")
          : t("content.views.errors.deleteFailed")
      ),
  })
  setViewPendingDelete(null)
}, [deleteView, viewPendingDelete, t])
```

Rendering rules:
- The loading branch condition becomes `isSeedLoading || !seed || viewsQuery.isLoading`.
- If `viewsQuery.isError` or `!activeView` once loading has finished: render the existing destructive error box inside
  the same chrome, with `t("content.views.errors.loadFailed")`.
- Otherwise, in place of today's `<ContentToolbar>…</ContentToolbar>` (keep the header `<div className="mb-6 …">` with
  the title and trash button above it):

```tsx
<ContentViewWorkspace
  key={activeView.id}
  seed={seed}
  slug={slug!}
  view={activeView}
  switcherViews={switcherViews}
  creatableViews={creatableViews}
  canManageViews={canManageViews}
  canDeleteView={canManageViews && !(activeView.type === "table" && tableViewCount <= 1)}
  onChangeView={handleChangeView}
  onCreateView={canManageViews ? handleCreateView : undefined}
  onRenameView={canManageViews ? handleRenameView : undefined}
  onDeleteView={canManageViews ? handleRequestDeleteView : undefined}
/>
```

- Remove `<ContentListModals>` from the page (it now lives in the workspace). Add, as the last child of the outer `<div>`:

```tsx
<ConfirmDialog
  open={viewPendingDelete !== null}
  onOpenChange={(open) => { if (!open) setViewPendingDelete(null) }}
  title={t("content.views.deleteConfirmTitle")}
  description={t("content.views.deleteConfirmDescription", {
    label: viewPendingDelete ? (viewPendingDelete.title ?? typeLabel(viewPendingDelete.type)) : "",
  })}
  confirmVariant="destructive"
  onConfirm={handleConfirmDeleteView}
/>
```

- `getStoredActiveView` / `setStoredActiveView` and the `beech_content_view_` prefix stay. The stored value is now an
  instance id. Update the doc comment above them to say so. A stale value (a type name from before this sprint, or a
  deleted id) matches nothing and falls through to the first Table instance. No migration is needed.
- Deleting the active view needs no effect: `resolveActiveViewId` stops matching the deleted id and returns the next
  candidate or the first Table instance.

### Task 19 — Locales (`src/locales/en.json`, `src/locales/it.json`)

Add `content.list.kanban` and a new `content.views` object (keep both files key-for-key in parity):

| Key | en | it |
|-----|----|----|
| `content.list.kanban` | `Kanban` | `Kanban` |
| `content.views.add` | `Add view` | `Aggiungi vista` |
| `content.views.delete` | `Delete view` | `Elimina vista` |
| `content.views.deleteConfirmTitle` | `Delete this view?` | `Eliminare questa vista?` |
| `content.views.deleteConfirmDescription` | `"{{label}}" will be removed for everyone who can access this content type. Entries are not affected.` | `"{{label}}" verrà rimossa per tutti coloro che accedono a questo tipo di contenuto. I contenuti non vengono toccati.` |
| `content.views.errors.loadFailed` | `Could not load the views of this content type` | `Impossibile caricare le viste di questo tipo di contenuto` |
| `content.views.errors.createFailed` | `Could not create the view` | `Impossibile creare la vista` |
| `content.views.errors.saveFailed` | `Could not save the view` | `Impossibile salvare la vista` |
| `content.views.errors.deleteFailed` | `Could not delete the view` | `Impossibile eliminare la vista` |
| `content.views.errors.lastTable` | `A content type must keep at least one Table view` | `Un tipo di contenuto deve mantenere almeno una vista Tabella` |

### Task 20 — Unit tests for `features/content-views`

Dashboard unit tier, file placement `features/content-views/test/unit/`, SPDX header, double quotes, four zones, no
`any`, no fake timers, no sleeping. Fixture seed:
`const posts = CANONICAL_SEEDS.find((seed) => seed.slug === "posts")!` from `@beechcms/testing`. Use its real branches:
`br_01 title`, `br_05 view_count`, `br_07 tags`; system columns `status`, `created_at`. Hand-rolled objects are allowed
only for deliberately malformed input (Rule 3.5): an unknown `br_99`, an over-long string.

**`view-config-mapping.test.ts`**: `describe("toContentViewConfig")` and `describe("toViewToolbarState")`. Write one `it`
per behaviour:
1. `toContentViewConfig` stores a filter on `title` under `br_01`, never under the alias. Assert
   `config.filters[0].columnRef === "br_01"`, and assert that `JSON.stringify(config)` does not contain `"title"`.
2. `toContentViewConfig` keeps the system columns `status` / `created_at` as-is (sort on `created_at`, filter on `status`).
3. `toContentViewConfig` drops a filter group with zero conditions and caps conditions at 3.
4. `toContentViewConfig` truncates a string condition value to 500 characters (malformed input: 600 `"x"`).
5. `toContentViewConfig` stores `datePrecision` when grouping by `created_at` and omits it when grouping by `title`.
6. `toContentViewConfig` maps rule targets `row → element` and `cell → field`.
7. `toContentViewConfig` never persists the `id` column as hidden, and stores `hiddenColumns` as Branch IDs.
8. `toContentViewConfig` drops `kanban` / `card` for a non-kanban type and keeps them for `"kanban"`.
9. `toViewToolbarState` turns `br_01` back into a `title` group with the label and type from `buildFilterableColumns`.
10. `toViewToolbarState` drops filters, sorts, groupings, hidden columns and rules that reference an unknown `br_99`.
11. `toViewToolbarState` returns `columnVisibility: undefined` when `hiddenColumns` is absent, so the table default applies.
12. Round trip: `toContentViewConfig(toViewToolbarState(config, posts), posts, "table")` deep-equals `config` for a
    config that uses every key valid on a Table view. That means filters and rules only on *filterable* columns
    (`br_01`, `br_05`, `status`; `created_at` is sortable/groupable but not filterable, so hydration drops a filter on
    it by design), sort on `created_at`, groupBy `created_at` with a `datePrecision`, all three `appearance` keys, and
    no `kanban`/`card`. This is a regression guard: autosave compares JSON, so a lossy round trip would PATCH on every
    mount.
13. Hydrating the same config twice yields identical condition ids (stable React keys across remounts).

**`resolve-active-view.test.ts`**: `describe("resolveActiveViewId")`, with ids built in UUIDv4 format (Rule 3.6) and
asserted against the list:
1. The first candidate that names a visible view wins over later candidates.
2. A candidate that names no visible view is skipped (deleted id, legacy `"gallery"` type string).
3. With no matching candidate, the first Table instance is returned, even when a Gallery precedes it.
4. An empty list returns `null`.

**`content-views.api.test.ts`**: `vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))`.
One `it` per function, asserting the path and body (template §9.3). Plus `describe("viewProblemType")`:
1. It returns the problem `type` of an Axios error. Build one with `new AxiosError(…)` and a `response.data.type`.
2. It returns `null` for a non-Axios error.

**`use-view-config-autosave.test.tsx`**: mock `@/lib/api` (`patch: vi.fn().mockResolvedValue({ data: {} })`). Wrap
in a fresh `QueryClientProvider` per test, and use `renderHook` + `rerender` + `unmount`. The debounce timer is never
waited on; every test drives the flush through `unmount()`:
1. `it("writes nothing when the config never changed after mount", …)`: render, unmount, assert `api.patch` not called.
2. `it("flushes the latest config on unmount instead of dropping it", …)`: render with config A, rerender with B, then
   C, unmount. Then `await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1))` and assert the body is
   `{ config: C }` on `/content/posts/views/<id>`.
3. `it("never writes when disabled for a user without content:update", …)`: `enabled: false`, rerender with B,
   unmount, assert not called.
Add a docblock (Rule 6.4) explaining that the debounce delay itself is deliberately not exercised (Rule 3.11 forbids
fake timers), and that flush-on-unmount is the path that proves no change is lost.

### Task 21 — `src/test/cross-slice/content-list.test.tsx`

- Mock the **source module** so the workspace's internal imports are intercepted too:

```ts
const TABLE_VIEW_ID = "3f0b6a52-5c1e-4c8e-9a51-2f7f1c9b8d10"
const GALLERY_VIEW_ID = "8a6d2c41-0e7b-4f3a-b1c2-6d9e8f7a5b43"
const mockViews = [
  { id: TABLE_VIEW_ID, seedSlug: "posts", type: "table", title: null, position: 0, config: emptyViewConfig(), createdAt: 1, updatedAt: 1, updatedBy: "u" },
  { id: GALLERY_VIEW_ID, seedSlug: "posts", type: "gallery", title: null, position: 1, config: emptyViewConfig(), createdAt: 1, updatedAt: 1, updatedBy: "u" },
]
const mockCreateView = vi.fn()
const mockUpdateView = vi.fn()
const mockDeleteView = vi.fn()

vi.mock("@/features/content-views/hooks/use-content-views", () => ({
  CONTENT_VIEWS_QUERY_KEY: (slug: string) => ["content-views", slug],
  useContentViews: () => ({ data: mockViews, isLoading: false, isError: false }),
  useCreateContentView: () => ({ mutate: mockCreateView }),
  useUpdateContentView: () => ({ mutate: mockUpdateView, isPending: false }),
  useDeleteContentView: () => ({ mutate: mockDeleteView }),
}))
```

  `emptyViewConfig` comes from `@beechcms/core`. The page is the subject and the hooks are its HTTP boundary, so
  mocking them is Rule 3.10 compliant.
- In the `ContentToolbar` mock, `change-view` calls
  `props.onChangeView?.(props.views.find((v: { type: string }) => v.type === "gallery")?.id)`. Add a
  `create-view` button calling `props.onCreateView?.("gallery")`. Type the mock's props with
  `ContentToolbarProps`, not `any`. Leave the mock's existing `any` lines elsewhere in the file alone; they are not
  in scope.
- Update the two localStorage tests to use instance ids: expect `GALLERY_VIEW_ID` in the `active-view` test id and in
  `localStorage.getItem("beech_content_view_posts")`.
- Add:
  - `it("falls back to the first Table instance when the stored view no longer exists", …)`: store the legacy value
    `"gallery"`, render, and expect `active-view` to show `TABLE_VIEW_ID`.
  - `it("creates a view of the picked type through the views API", …)`: click `create-view`, then assert
    `mockCreateView` was called with `{ type: "gallery" }` as its first argument.
- If `src/test/cross-slice/automation-panel.test.tsx` renders `ContentListModals` with `activeViewId`, rename the prop
  there too. It renders `ContentToolbar` with `activeViewId`, which is unchanged and needs no edit.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repository root unless stated otherwise.

```bash
# 0. Dependencies (new devDependency in apps/dashboard)
pnpm install

# 1. Core builds; its suite passes without the removed schema
cd packages/core && pnpm run build && pnpm test -- seed-layout content-view && cd ../..

# 2. API typechecks; removed handler leaves no dangling import
cd apps/api && npx tsc --noEmit && cd ../..
#    (8 pre-existing errors in untouched files are recorded in docs/Sprints/ContentViewsPersistence/execution_log.md;
#     the count must not grow, and no error may point at a file this sprint touched)

# 3. Migration applies on a clean DB and on top of the existing one
pnpm beech db:reset
pnpm beech db:migrate

# 4. API unit + integration tiers (migration upgrade guard, views suite, layout repo)
cd apps/api && pnpm run test:unit && pnpm run test:integration && cd ../..

# 5. Dashboard typecheck, tests, lint
cd apps/dashboard && pnpm run type-check && pnpm test && cd ../..
pnpm lint

# 6. Workspace regression, scoped to changed packages
pnpm beech test --diff

# 7. Legacy chain is gone (each must print nothing)
git grep -n "view-config\|getViewConfig\|setViewConfig\|SeedViewConfig\|seedViewConfigSchema\|useKanbanViewConfig\|fetchSeedViewConfig" -- apps/api/src apps/dashboard/src packages/core/src

# 8. Slice isolation: content-views imports no other feature (must print nothing)
git grep -n "@/features/" -- apps/dashboard/src/features/content-views | grep -v "@/features/shared"

# 9. Graph sync
graphify update . --force
```

**Runtime check** (`pnpm beech dev`, admin user, `/content/posts`):
1. Two tabs appear (Table, Gallery) with the translated type labels. Reload: the same tabs, same order.
2. On Table: add a filter on Title, sort by View Count, hide a column, set density Compact, add a conditional colour
   rule. Wait ~1 s, then reload. Every setting is restored. In D1,
   `SELECT config FROM seed_views WHERE seed_slug='posts' AND view_type='table'` shows `br_01` / `br_05`, never an alias.
3. "+" → Table: a third tab opens with default settings. Rename it in the settings menu, reload, and the name persists.
4. Switch between the two Table tabs: each keeps its own filters.
5. Delete the second Table tab: the confirm dialog appears, the tab disappears, and the first Table tab becomes active.
   On the remaining Table tab, "Delete view" is disabled.
6. A seed with `kanban` authorized: open the Kanban tab, pick an axis, reload. The axis persists, and
   `GET /api/content/<slug>/view-config` no longer returns a config.
7. Log in as a user with `content:read` only: no "+" button, no delete item, the view name is read-only, filter changes
   apply but no `PATCH /views/…` is sent (network tab).
8. Open `/content/posts?status=draft`: the status pill shows. Change density, then reload without the query string. The
   view has the new density and **no** status filter.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `0034_drop_seed_layouts_view_config.sql` exists, applies on a clean DB and on an existing one, and
      `base-migration-upgrade.test.ts` passes unchanged.
- [ ] `seedViewConfigSchema`, `SeedViewConfig`, `getViewConfig`, `setViewConfig`, `getViewConfigHandler`,
      `putViewConfigHandler`, `useKanbanViewConfig`, `fetchSeedViewConfig` and `updateSeedViewConfig` no longer exist
      (Validation step 7 prints nothing).
- [ ] `permission.middleware.ts` lost exactly the two `/view-config` rows. Middleware registration order and every
      other row are byte-identical.
- [ ] `packages/core/src/dashboard-layout/content-view.ts` and every other Sprint 1 file are unchanged.
- [ ] `features/content-views` imports no other `@/features/*` module except `@/features/shared` (Validation step 8).
- [ ] `use-content-table-config.ts` no longer imports from `@/features/content-toolbar`.
- [ ] `buildFilterableColumns` exists once, in `@/lib/filter-dsl`. `content-toolbar` re-exports it, and its existing
      tests pass unmodified.
- [ ] Every column reference written to `seed_views.config` by the dashboard is a `br_XX` id or one of
      `slug | status | created_at | updated_at`. This is proven by `view-config-mapping.test.ts` cases 1, 2, 7 and the
      runtime check 2.
- [ ] `toContentViewConfig ∘ toViewToolbarState` is lossless for a fully populated config (test case 12).
- [ ] Opening a view issues no PATCH. A change issues one PATCH per debounce window, and a change pending at view
      switch is flushed (autosave tests 1–2).
- [ ] Users without `content:update` see no create/delete affordance, cannot edit the view name, and send no PATCH.
- [ ] The `?status=` prefilter is never persisted into a view.
- [ ] `activeViewId` in the dashboard is always an instance id. No component compares an instance id to a type string
      (`settings-menu.tsx`, `ContentListModals.tsx` and the page read `activeViewType` / `view.type`).
- [ ] The Kanban axis, sort, collapsed columns and card layout are read from and written to the Kanban **instance**.
      Two Kanban instances can hold different axes.
- [ ] `en.json` and `it.json` contain every key in Task 19 and `locales.test.ts` passes.
- [ ] All new and edited tests follow `_config/testing_conventions.md`: unit tier, slice placement, SPDX header,
      four zones, one act, named act result, no `any`, no fake timers, no sleeping, canonical `posts` seed fixtures.
- [ ] `npx tsc --noEmit` (api) has no new error. `pnpm run type-check` (dashboard), `pnpm lint`,
      `pnpm beech test --diff`, and the API unit + integration tiers pass.
- [ ] `git diff --stat` touches no file outside SECTION 3.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executor MUST NOT build or modify:

- **Drag-and-drop reorder, a `PUT /views/order` client, switcher redesign (custom titles inline, "+" on hover, delete
  from the tab), the "Add view" picker with disabled future types (Chart, Board, List, Calendar, Map, Timeline, Feed,
  Form, Dashboard), the centred "create your first view" empty state, the shared page grid, the "New entry" template
  submenu, and the `ViewDefinition` harness contract.** → ROADMAP §3 `ViewHarnessSwitcher`. This sprint's "+" menu lists
  only the seed's authorized types, and delete lives in the settings menu.
- **Conditional formatting on Gallery and Kanban cards, moving rule evaluation out of `useContentTableConfig`, enabling
  the conditional-formats editor for non-Table types.** → ROADMAP §4 `UniversalElementFormatting`. Rules are already
  stored view-neutral (`element` / `field`), so §4 needs no data migration.
- **Removing `GalleryPeekPanel`, routing gallery clicks to the Entry Editor, the cover-image default layout.** → ROADMAP
  §5 `GalleryEntryEditorUnification`.
- Any change to the Sprint 1 API (`handlers/views.ts`, `content-view.repository.d1.ts`, `content-view.ts`), including
  the reorder position-compaction edge noted in Sprint 1's review. That belongs to Sprint 3, when tab order becomes
  user-visible.
- Migrating the old `seed_layouts.view_config` Kanban blobs (brief §4: discarded).
- Persisting search text, page index, column widths or row selection per view.
- Concurrency control on views (`If-Match`, version columns, live sync across open tabs). Last-write-wins per row.
- `packages/cli/src/commands/init.ts`: its embedded `0000` copy keeps `view_config TEXT`, which `0034` drops on the next
  migrate. It already lags 0030–0033, so syncing it is a separate CLI task.
- The generated `docs/api/**` pages that still mention `SeedViewConfig` / `ISeedLayoutRepository.getViewConfig`. They
  are regenerated by the docs pipeline, not edited by hand.
- Pre-existing cross-slice imports (`content-management → content-toolbar` in `use-content-list-query.ts`,
  `content-management → content-kanban` in `ContentListModals.tsx`, `content-management → automations`) and the
  pre-existing `vi.useFakeTimers()` in `seed-layout.repository.d1.test.ts`.
- `pages/drafts-list.tsx`: it keeps its single synthetic `{ id: "table" }` view.
