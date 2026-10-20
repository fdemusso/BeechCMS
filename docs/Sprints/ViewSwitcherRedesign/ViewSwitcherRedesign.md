# Sprint: ViewSwitcherRedesign

Sprint 3 of 6 of **Saved Views** (roadmap: `backlog/ROADMAP.md`). Sprint 1 (`ContentViewsPersistence`) and Sprint 2
(`ViewInstancesDashboard`) are archived in `docs/Sprints/` with PASS verdicts.

After Sprint 2, `/content/:slug` renders persisted `ContentView` instances. Editors can create, rename and delete them,
and every per-view setting autosaves. Tab order cannot be changed, though. The switcher is still the Sprint-1-era
`ToggleGroup` with a "+" menu that lists only the seed's authorized types. Deleting the last Gallery or Kanban
instance silently jumps back to Table. The "New" button is a plain button.

This sprint makes the switcher look and behave like the brief's mockups (`stages/00_ideation/image_1.png`,
`image_2.png`, `image_3.png`):
- tabs show an icon and a custom title, and can be dragged to reorder (persisted through `PUT /views/order`);
- "+" appears on hover, in line with the toolbar tools, and opens an "Add a new view" picker that lists every
  conceptual View Type, with unavailable ones disabled;
- deleting the last instance of a non-Table type shows a centred "create your first view" state;
- "New" becomes a split button with a No-Op templates menu.

It also fixes the hidden-row position collision that Sprint 1's review flagged for exactly this moment, when tab order
becomes user-visible.

> **Scope change vs. ROADMAP §3 as written on 2026-10-03.** The old §3 bundled this UX work with the
> `ViewDefinition` renderer/settings harness and the shared page grid. Those are a separate boundary: they restructure
> `ContentViewWorkspace` and `SettingsMenu`, while this sprint restructures the switcher and the page shell. Both
> rewrite the same two files from different directions, so they are validated separately. The harness moves to the
> new §4 `ViewHarnessContract`. The Element contract moves to §5 `UniversalElementFormatting`, its first consumer. See
> SECTION 7.

> **Precondition.** Sprint 1 and Sprint 2 are still uncommitted in the working tree of
> `feature/content-views-persistence` (`git status`: `handlers/views.ts`, `content-view.ts`,
> `features/content-views/`, `pages/content-view-workspace.tsx`, …). The executor starts from a tree where both are
> committed, and does not re-implement any of their files beyond the edits listed in SECTION 3.

---

### Pre-Computation Analysis

Graph rebuilt at planning time with `graphify update . --force`: 24 570 nodes, 36 278 edges, 2 296 communities.

**a) God nodes on the path of this sprint (degree from `graphify explain`)**

| Node | Source | Degree | Role here |
|---|---|---|---|
| `api` | `apps/dashboard/src/lib/api.ts:40` | 79 | HTTP client. The new `reorderContentViews` uses it, as every views call does. Not modified. |
| `usePermissions()` | `features/shared/hooks/use-permissions.ts:62` | 47 | Gates "+" / reorder / empty-state create (`content:update`) and "New" (`content:create`). Not modified. |
| `ContentListPage()` | `pages/content-list.tsx:53` | 20 | Page shell. Gains reorder, the empty-state branch and the new prop names. |
| `ContentToolbar()` | `features/content-toolbar/content-toolbar.tsx:25` | 9 | Hosts the switcher and the "New" button. Imported by `content-view-workspace.tsx`, `drafts-list.tsx` and tests. |
| `ContentViewWorkspace()` | `pages/content-view-workspace.tsx:45` | 8 | Pass-through of the renamed and new switcher props. |
| `reorderViewsHandler()` | `apps/api/src/features/content/handlers/views.ts:155` | 8 | Gets the hidden-slot-preserving order. |
| `useUpdateContentView()` | `features/content-views/hooks/use-content-views.ts:51` | 7 | Pattern for the optimistic, cache-authoritative reorder mutation. |
| `IViewRegistry` | `features/shared/view-registry.ts:22` | 5 | The reserved View Type identifiers are added next to it. The interface itself does not change. |
| `resolveAuthorizedViews()` | `packages/core/src/dashboard-layout/view-authorization.ts:24` | 4 | Source of the creatable (enabled) types in the picker. Not modified. |

**b) Architectural boundaries affected**

- `@beechcms/core`: one pure function added to `dashboard-layout/content-view.ts`
  (`mergeContentViewOrder`, exported through the existing `export *` at `packages/core/src/index.ts:92`). No schema,
  migration, repository-contract or zod change.
- `apps/api`: `features/content/handlers/views.ts` `reorderViewsHandler` only. Route table, permission rows
  (`permission.middleware.ts:121`, `PUT …/views/order` → `content:update`), middleware order and `D1ContentViewRepository`
  are unchanged.
- `apps/dashboard`:
  - `features/shared/view-registry.ts`: reserved View Type identifiers (types and constant only).
  - `features/content-views`: reorder client and hook, `ViewEmptyState` component.
  - `features/content-toolbar`: switcher rewrite, picker, catalogue, `ToolbarStrip`, `NewEntryButton`, props renamed.
  - `pages/content-list.tsx` + `pages/content-view-workspace.tsx`: composition only.
  - Locales.

**c) `graphify affected` impact analysis**

```
$ graphify affected "ContentToolbarProps" --depth 2
- use-automation.ts, automations/index.ts, automation-panel.test.tsx   (type re-use, untouched fields)
- content-toolbar.tsx, use-content-toolbar.ts, content-toolbar/index.ts
- content-list.tsx, ContentListPage(), content-view-workspace.tsx, drafts-list.tsx, App.tsx
- use-content-list-query.ts, use-content-table-config.ts               (import other fields only)
- content-list.test.tsx, content-toolbar.test.tsx, view-switcher.test.tsx, use-content-toolbar.test.ts, barrels.test.ts
$ graphify affected "ViewSwitcher()" --depth 2
- content-toolbar.tsx, view-switcher.test.tsx, content-toolbar/index.ts, content-toolbar.test.tsx,
  use-automation.ts, automation-panel.test.tsx
$ graphify affected "useContentViews()" --depth 2
- content-views/index.ts, content-list.tsx, ContentListPage(), content-view-workspace.tsx, App.tsx
$ graphify affected "reorderViewsHandler()" --depth 2
- features/content/index.ts, factory.ts
$ graphify affected "IViewRegistry" --depth 2
- content-gallery/index.ts, content-kanban/index.ts, content-toolbar/view-registry.ts (+ bootstrap, test),
  content-list.tsx, content-view-workspace.tsx, ContentListModals.tsx
```

Breaking-change verdict:
- `ContentToolbarProps.creatableViews` → `creatableViewTypes` breaks exactly three callers: `content-view-workspace.tsx`,
  `content-list.test.tsx` (its toolbar mock ignores the field) and `view-switcher.test.tsx` (rewritten).
  `drafts-list.tsx` never passed it. `automations` / `content-management` import other members of the same types
  file, which do not change.
- Deleting the `ViewType` union (`content-toolbar/shared.ts:13`) breaks only `view-switcher.tsx` and the
  `content-toolbar/index.ts` re-export. `barrels.test.ts:20-21` asserts only `ContentToolbar` and
  `DEFAULT_ENABLED_TOOLS`.
- `IViewRegistry` / `ViewDefinition` are untouched, so the gallery/kanban registrations do not move.
- `reorderViewsHandler` keeps its request and response contract. Only the stored positions of hidden rows change.

`graphify path "content-views.api.ts" "content-toolbar.tsx"` and `graphify path "content-views.api.ts"
"view-switcher.tsx"` resolve only through `pages/content-list.tsx`, `lib/api.ts` or a shared `components/ui` file.
There is no direct edge between the two slices, and this plan adds none.

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

1. **YAGNI.**
   - *Vetoed in planning:* the Element contract in this sprint. It would have no consumer until formatting is
     universal, so it moves to §5.
   - *Vetoed in planning:* keyboard drag-reorder. Space/Enter already select a tab, and the dashboard builder ships
     pointer-only reorder (`builder-pane.tsx:46`).
   - *Vetoed in planning:* delete/rename from the tab. Both already live in the settings menu (Sprint 2), and the
     brief puts the custom title "nelle impostazioni della vista".
   - *Vetoed in planning:* a `?view=<type>` deep link into the empty state. Nothing in the app links with a type
     (`grep "view="` over `apps/dashboard/src` finds only the resolver doc comment).
   - *Vetoed in planning:* a server write-back of the reorder response. The cache stays authoritative, as with
     `useUpdateContentView`.
   - *Approved:* the reserved catalogue is a constant plus a type, with no runtime behaviour, as brief §4 requires.
2. **Botanical invariant.**
   - The only server change is a pure permutation of row ids in `@beechcms/core`. It is consumed by a handler that
     still writes through `IContentViewRepository`.
   - No D1 statement is added or changed, and nothing outside core touches `seed_views`.
   - No field names are involved. The sprint never reads or writes branch data, so the alias/`br_XX` boundary from
     Sprint 2 is untouched.
3. **VSA.**
   - `content-views` keeps importing only `@/features/shared` (Validation step 8), and `content-toolbar` imports no
     `content-views` symbol.
   - The reserved identifiers live in `@/features/shared/view-registry.ts`, the file both the registry and the
     switcher already depend on.
   - The catalogue (icons + label keys) is presentation owned by the switcher's slice.
   - The empty state lives in `content-views` and gets its label and create callback from the page.
   - Only the pages, as composition roots, combine `ToolbarStrip`/`ViewSwitcher` (content-toolbar) with
     `ViewEmptyState` (content-views). That is the pattern `content-list.tsx` already uses for both slices.
   - No new cross-slice edge.
4. **Cloudflare purity.** No migration, binding or background work. The reorder stays one D1 `batch` (unchanged
   `D1ContentViewRepository.reorder`, `content-view.repository.d1.ts:158`).
5. **Minimal blueprint.** Core: 1 function. API: 1 handler line. Dashboard: 4 new files (`view-type-catalogue.ts`,
   `view-type-picker.tsx`, `toolbar-strip.tsx`, `new-entry-button.tsx` in content-toolbar) + 1 in content-views
   (`view-empty-state.tsx`), plus edits.

No violation remains. HANDOFF -> caveman_coder

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 2 made views real records, but three brief requirements still have no UI:
- user-defined order (§2 "L'ordine delle viste … riordinabile … via drag-and-drop, persistito e condiviso");
- the extensibility-signalling picker (§4 "il picker … deve elencare visivamente ogni View Type");
- the controlled degradation after deleting the last instance of a type (§2 and §4 "stato vuoto centrato").

Each is page-shell and switcher work, and none depends on how renderers are wired. Shipping them before the harness
sprint means the harness sprint can restructure `ContentViewWorkspace` and `SettingsMenu` against a switcher and
shell that are already final.

The reorder fix has to land now. Sprint 1's review (`docs/Sprints/ContentViewsPersistence/review_report.md`, finding 1)
showed that `reorder()` writes positions only for visible ids. A row hidden by the allow-list can therefore end up
sharing a position with a reordered visible row. Until this sprint, no user could reorder, so the defect could not be
reached. From this sprint on it can.

**VSA.**
- Every new dashboard file sits in the slice that owns its concern. The switcher, picker, catalogue, strip and "New"
  button go to `content-toolbar`. The reorder API, hook and empty state go to `content-views`.
- Pages remain the only modules that compose both slices.
- The reserved identifiers sit in `features/shared`, next to `ViewDefinition`, so §4 can grow the harness from there.

**Botanical Engine.**
- The persisted order is computed by a pure `@beechcms/core` function and written through the existing
  `IContentViewRepository`.
- Branch data is never touched.
- `RESERVED_VIEW_TYPES` is dashboard-only (ROADMAP decision), so `DashboardView` and the `seed_views.view_type`
  domain stay `table | gallery | kanban`.
- The API keeps refusing reserved types with 422 (`content-views.integration.test.ts:137`).

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**API / core (unchanged except where noted)**

`content.put('/:slug/views/order', reorderViewsHandler)` is registered at `apps/api/src/features/content/index.ts:32`,
before `/:slug/views/:viewId`. Its permission row is `permission.middleware.ts:121` (`content:update`). The handler
(`handlers/views.ts:155-178`) works in four steps:
1. It loads all records through `loadOrBootstrap` (L58), which returns every row, hidden ones included, ordered by
   `position, created_at, id`.
2. It projects the visible ones with `projectContentViews` (`content-view.ts:262`).
3. It checks that the body is a permutation of the visible ids, and otherwise answers 422
   `content-view-order-mismatch`.
4. It calls `repository.reorder(slug, requested, sub)` and answers with the re-projected list.

`D1ContentViewRepository.reorder` (`content-view.repository.d1.ts:158-165`) writes `position = index` for the ids it
is given and leaves the others untouched (contract doc: `content-view.repository.ts`, "Ids not listed keep their
position"). `create()` appends at `MAX(position)+1` over all rows.

**Dashboard (state after Sprint 2)**

- **Registry.**
  - `features/shared/view-registry.ts:7-26` defines `ToolbarTool`, `ViewDefinition { type, labelKey, enabledTools }`
    and `IViewRegistry`.
  - The singleton is `content-toolbar/view-registry.ts:14`.
  - The composition root `content-toolbar/view-registry.bootstrap.ts` registers Table plus the gallery/kanban slices'
    `register*View`. It is imported by `main.tsx:25`.
- **`content-toolbar/shared.ts:13`.** `ViewType = "table" | "gallery" | "grid" | "kanban" | "chart"` is a stale union.
  Its only consumers are `UserViewInstance.type` (L20) and `VIEW_TYPE_ICONS` in `view-switcher.tsx:19-28`.
- **`content-toolbar/toolbar-components/view-switcher.tsx` (98 lines).**
  - Tabs are a Radix `ToggleGroup` (L48-70) with `VIEW_TYPE_ICONS`.
  - "+" is an always-visible ghost `Button` that opens a `DropdownMenu` listing `creatableViews` (L71-95).
- **`content-toolbar/content-toolbar.tsx`.**
  - The sticky strip wrapper is at L151-153 / L366-368.
  - `ViewSwitcher` is rendered at L156-162.
  - The "New" button is at L299-330: `canCreate` → primary `Button`, otherwise disabled with the hardcoded tooltip
    "Manca il permesso 'content:create'".
  - `ContentToolbarProps` is in `types.ts:12-74`. The view-management props are at L21-29.
- **`pages/content-list.tsx` (shell).**
  - `resolveActiveViewId` is at L74-77.
  - `handleChangeView` (L80-86) sets `selectedViewId` and localStorage.
  - `creatableViews` (L102-105) is `resolveAuthorizedViews(seed)` labelled, and empty without `content:update`.
  - `handleConfirmDeleteView` (L127-138) handles only `onError`.
  - Render: `viewsQuery.isError || !activeView` → error box, otherwise `<ContentViewWorkspace key={activeView.id} …/>`
    (L212-231).
- **`pages/content-view-workspace.tsx`.** Props are at L28-43 and are passed through to `ContentToolbar` at L136-146.
- **`features/content-views`.**
  - API client: `api/content-views.api.ts`.
  - Hooks: `hooks/use-content-views.ts`. `useUpdateContentView` (L51-80) is optimistic and does not write back the
    server response.
  - Public barrel: `index.ts`.
  - There is no reorder client yet.
- **DnD.** `@dnd-kit/core` / `sortable` / `utilities` are already dependencies (`apps/dashboard/package.json:30-32`).
  - Horizontal sortable tabs: `features/dashboard/builder/page-tabs-manager.tsx:52-77` (`SortableContext` +
    `horizontalListSortingStrategy`) and L110-137 (`useSortable`, `CSS.Transform`, role override, Enter/Space
    activation).
  - Self-contained `DndContext` with `PointerSensor { distance: 5 }` + `arrayMove` drag-end:
    `components/fields/edit/repeater/repeater.tsx:61`, `:76-83`, `:102`.
- **Empty-state UI.** `Empty/EmptyHeader/EmptyMedia/EmptyTitle/EmptyDescription/EmptyContent` from
  `@/components/ui/small-cta`, used at `content-gallery/content-gallery.tsx:192-203`.
- **Locales.** `content.list.{table,gallery,kanban}` are at `en.json:556-559`. `content.views.*` is at `en.json:564-576`
  (same lines in `it.json`). `toolbar.*` starts at `en.json:696`. `locales.test.ts` enforces key parity.

**`AppEnv.Variables` / middleware order.** Unchanged and not touched by this sprint (`contentViewRepository` was
registered in Sprint 1).

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**`packages/core`**
1. `src/dashboard-layout/content-view.ts`: add `mergeContentViewOrder`.
2. `src/dashboard-layout/content-view.test.ts`: new `describe('mergeContentViewOrder')`.

**`apps/api`**
3. `src/features/content/handlers/views.ts`: `reorderViewsHandler` writes the merged full order.
4. `src/features/content/test/integration/content-views.integration.test.ts`: one new case under
   `PUT /api/content/:slug/views/order`.

**`apps/dashboard`**

`features/shared` and `features/content-views`:
5. `src/features/shared/view-registry.ts`: `RESERVED_VIEW_TYPES`, `ReservedViewType`, `ViewTypeId`.
6. `src/features/content-views/api/content-views.api.ts`: `reorderContentViews`.
7. `src/features/content-views/hooks/use-content-views.ts`: `useReorderContentViews`.
8. `src/features/content-views/components/view-empty-state.tsx` (new): `ViewEmptyState`.
9. `src/features/content-views/index.ts`: export `useReorderContentViews`, `ViewEmptyState`, `ViewEmptyStateProps`.
10. `src/features/content-views/test/unit/content-views.api.test.ts`: `describe("reorderContentViews")`.
11. `src/features/content-views/test/unit/use-content-views.test.tsx` (new): `describe("useReorderContentViews")`.
12. `src/features/content-views/test/unit/view-empty-state.test.tsx` (new).

`features/content-toolbar`:
13. `shared.ts`: delete `ViewType`, `UserViewInstance.type: DashboardView`, add `moveViewId`.
14. `toolbar-components/view-type-catalogue.ts` (new): `VIEW_TYPE_CATALOGUE`, `viewTypeIcon`.
15. `toolbar-components/view-type-picker.tsx` (new): `ViewTypePicker`.
16. `toolbar-components/view-switcher.tsx`: rewritten (sortable tabs, hover "+", picker).
17. `toolbar-components/toolbar-strip.tsx` (new): `ToolbarStrip`.
18. `toolbar-components/new-entry-button.tsx` (new): `NewEntryButton`.
19. `content-toolbar.tsx`: use `ToolbarStrip`, `NewEntryButton`, and pass the new switcher props.
20. `types.ts`: `creatableViews` → `creatableViewTypes`, add `onReorderViews`.
21. `index.ts`: drop the `ViewType` re-export, export `ViewSwitcher` and `ToolbarStrip`.
22. `test/unit/view-switcher.test.tsx`: rewritten.
23. `test/unit/view-type-picker.test.tsx` (new).
24. `test/unit/new-entry-button.test.tsx` (new).
25. `test/unit/shared.test.ts`: `describe("moveViewId")`.
26. `test/unit/content-toolbar.test.tsx`: mock `new-entry-button` like the other toolbar components.

Pages, cross-slice tests and locales:
27. `src/pages/content-view-workspace.tsx`: props `creatableViews` → `creatableViewTypes`, add `onReorderViews`, pass
    through.
28. `src/pages/content-list.tsx`: reorder handler, empty-state branch, `creatableViewTypes`.
29. `src/test/cross-slice/content-list.test.tsx`: reorder and empty-state cases, plus the mock updates.
30. `src/locales/en.json`, `src/locales/it.json`: keys from Task 14.

No other file changes. Feature code is included: this sprint ships user-visible behaviour.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — `packages/core/src/dashboard-layout/content-view.ts`: `mergeContentViewOrder`

Add after `projectContentViews` (L262-269). Chosen: compute the full order in core and keep the repository contract
unchanged. The handler already holds every record, and a pure function is unit-testable without D1.

```ts
/**
 * The full position order of a seed's rows after its visible views were reordered. Hidden rows
 * (types the allow-list currently rejects) keep their slot; visible slots are refilled in the
 * requested order. Writing the result compacts positions to 0..n-1 with no duplicates.
 */
export function mergeContentViewOrder(allIds: readonly string[], visibleOrder: readonly string[]): string[]
```

Rules:
- `allIds` is every row id in current position order (what `listBySeed` returns). `visibleOrder` is a validated
  permutation of the visible subset.
- Walk `allIds`. A slot whose id appears in `visibleOrder` takes the next id from `visibleOrder`. Any other id stays
  where it is.
- The output length always equals `allIds.length`. The function never throws, never mutates its inputs, and returns
  the same output for the same input.
- When every id is visible, the output equals `visibleOrder`.

**Tests** (`content-view.test.ts`, unit, plain id arrays, no seed fixture needed):
- `it('refills the visible slots in the requested order and keeps a hidden id in its slot')`:
  `['t','g1','k','g2']` with `['g2','g1','t']` gives `['g2','g1','k','t']`.
- `it('returns the requested order when every row is visible')`.
- `it('returns a permutation of every input id with no duplicates')`: assert the output, sorted, equals the input,
  sorted, for the fixture of the first case.

### Task 2 — `apps/api/src/features/content/handlers/views.ts`: `reorderViewsHandler`

- Keep the records returned by `loadOrBootstrap` in a local variable, and project the visible ones from it.
- Replace the `repository.reorder(slug, requested, …)` argument with
  `mergeContentViewOrder(records.map((record) => record.id), requested)`.
- Import `mergeContentViewOrder` from `@beechcms/core`.
- The permutation check, the error codes and the response (`projectContentViews(await repository.listBySeed(slug),
  seed)`) are unchanged.
- `D1ContentViewRepository` is not edited. Its `reorder` already writes `position = index` for every id it is given,
  and it now receives all of them.

**Test** (`content-views.integration.test.ts`, integration, harness + canonical `posts` seed, inside
`describe('PUT /api/content/:slug/views/order')`):
- `it('keeps a hidden instance in its slot and gives every row a distinct position after a reorder')`.
  - Setup:
    - `GET` bootstraps table at position 0 and gallery at position 1.
    - Insert a kanban row at position 2 with the direct INSERT used at L69-73.
    - `POST { type: 'gallery' }` lands at position 3.
  - Act: `PUT` `[gallery2, gallery1, table]`.
  - Assert:
    - the status is 200;
    - the response ids equal the requested order;
    - `SELECT id, position FROM seed_views WHERE seed_slug = 'posts' ORDER BY position` gives gallery2 = 0,
      gallery1 = 1, kanban = 2, table = 3;
    - `COUNT(DISTINCT position)` is 4.

### Task 3 — `features/shared/view-registry.ts`: reserved identifiers

Append verbatim:

```ts
/**
 * Brief §1/§4: View Types announced in the "Add view" picker but not implemented. Dashboard-only
 * identifiers with no runtime behaviour; the API keeps rejecting them (DashboardView is unchanged).
 */
export const RESERVED_VIEW_TYPES = [
  'chart', 'board', 'list', 'calendar', 'map', 'timeline', 'feed', 'form', 'dashboard',
] as const
export type ReservedViewType = (typeof RESERVED_VIEW_TYPES)[number]
/** Every View Type the picker knows about: implemented (DashboardView) or reserved. */
export type ViewTypeId = DashboardView | ReservedViewType
```

`ViewDefinition` and `IViewRegistry` are not changed. They grow in §4.

### Task 4 — `features/content-views`: reorder client + hook

**`api/content-views.api.ts`** — add, following `updateContentView` (L30-37):

```ts
/** Body is the full permutation of the visible view ids; answers the re-projected list. */
export async function reorderContentViews(slug: string, ids: readonly string[]): Promise<ContentView[]>
```

It sends `PUT /content/${slug}/views/order` with body `{ ids }`.

**`hooks/use-content-views.ts`** — add:

```ts
/** mutate(orderedIds). Optimistic and cache-authoritative, like useUpdateContentView. */
export function useReorderContentViews(slug: string)
```

Copy the shape of `useUpdateContentView` (L51-80):
- **`onMutate`:** `cancelQueries`, then rewrite the cached list in `orderedIds` order with `position = index`. Any
  cached view missing from `orderedIds` is appended in its previous relative order. This cannot happen from the UI,
  but it guards against a concurrent create.
- **`onError`:** invalidate the views query, then `toast.error(t("content.views.errors.reorderFailed"))`. This also
  covers a 422 `content-view-order-mismatch` caused by a colleague's concurrent create or delete.
- **No `onSuccess` write-back.** The reason is the same as in the `useUpdateContentView` doc comment (L45-50): the
  response carries configs that could be older than an in-flight autosave. Reuse that comment's reasoning in one line.

Workspaces are keyed by `view.id` (`content-list.tsx:218`), so a reorder never remounts or re-hydrates the active
workspace.

**Tests**
- `test/unit/content-views.api.test.ts`, new `describe("reorderContentViews")` (copy the `@/lib/api` mock at L7 and
  add `put`):
  - `it("puts the ordered ids to /content/:slug/views/order and returns the payload unchanged")`.
- `test/unit/use-content-views.test.tsx` (new, unit, `@/lib/api` + `sonner` mocked; QueryClient wrapper copied from
  `use-view-config-autosave.test.tsx:24-30`; cache primed with three `ContentView` objects built from
  `emptyViewConfig()`), `describe("useReorderContentViews")`:
  - `it("reorders the cached views and rewrites their positions before the server answers")`: `api.put` returns a
    never-settling promise, and the test asserts the cache order and positions.
  - `it("refetches the views and reports the failure when the server rejects the order")`: `api.put` rejects, and the
    test asserts `api.get` is called again and `toast.error` is called once.

### Task 5 — `features/content-views/components/view-empty-state.tsx` (new)

```ts
export interface ViewEmptyStateProps {
  /** Translated label of the View Type whose last instance was deleted. */
  readonly typeLabel: string
  /** Absent for users without content:update: the state then only explains. */
  readonly onCreate?: () => void
}
export function ViewEmptyState(props: ViewEmptyStateProps): JSX.Element
```

Layout:
- Centred both ways in the content area: an outer `flex min-h-[50vh] items-center justify-center`.
- Built with `Empty/EmptyHeader/EmptyMedia variant="icon"/EmptyTitle/EmptyDescription/EmptyContent` from
  `@/components/ui/small-cta`, copying the composition at `content-gallery/content-gallery.tsx:192-203`.
- Icon: `Layer` from `reicon-react` (verified to exist). The slice cannot import the toolbar catalogue, and a generic
  glyph is enough.

Content:
- Title: `content.views.emptyTitle` with `{ label: typeLabel }`.
- Description: `content.views.emptyDescription` with `{ label }`.
- Button: a primary `Button` labelled `content.views.emptyCreate`, rendered only when `onCreate` is present.

Export `ViewEmptyState` and `type ViewEmptyStateProps` from `index.ts`, together with `useReorderContentViews`.

**Tests** (`test/unit/view-empty-state.test.tsx`, unit, no mocks):
- `it("names the View Type and creates a view when the user clicks the create button")`.
- `it("renders no create button when the caller passes no onCreate")`.

### Task 6 — `content-toolbar/shared.ts`

- Delete `ViewType` (L13). `UserViewInstance.type` becomes `DashboardView` (import the type from `@beechcms/core`).
  `drafts-list.tsx` passes `type: "table"` and keeps compiling.
- Add:

```ts
/** New tab order after dragging `activeId` onto `overId`; null when nothing moves. */
export function moveViewId(ids: readonly string[], activeId: string, overId: string | null): string[] | null
```

  Rules:
  - Return null when `overId` is null, when it equals `activeId`, or when either id is not in `ids`.
  - Otherwise return `arrayMove` (`@dnd-kit/sortable`) of `ids` from the active index to the over index.
  - Copy the guard logic of `repeater.tsx:76-83`.
- In `index.ts`, drop `ViewType` from the type re-exports.

**Tests** (`test/unit/shared.test.ts`, new `describe("moveViewId")`):
- `it("moves a tab forward to the index of the tab it was dropped on")`.
- `it("moves a tab backward to the index of the tab it was dropped on")`.
- `it("returns null when the tab is dropped on itself or outside the list")`: covers `overId` equal to the active id
  and `overId` null. These two are the same "no move" behaviour.

### Task 7 — `toolbar-components/view-type-catalogue.ts` (new)

```ts
import type { ComponentType } from "react"
import type { DashboardView } from "@beechcms/core"
import type { ViewTypeId } from "@/features/shared"

export interface ViewTypeCatalogueEntry {
  readonly type: ViewTypeId
  readonly labelKey: string
  readonly Icon: ComponentType<{ className?: string }>
}
/** Picker order: implemented types (AUTHORIZABLE_VIEWS order), then reserved ones. */
export const VIEW_TYPE_CATALOGUE: readonly ViewTypeCatalogueEntry[]
/** Icon of an implemented type, for the switcher tabs. */
export function viewTypeIcon(type: DashboardView): ComponentType<{ className?: string }>
```

The entries, in this order. Every icon name was checked to exist in `reicon-react@1.1.302`.

| type | labelKey | Icon |
|---|---|---|
| table | `content.list.table` | `Grid` |
| gallery | `content.list.gallery` | `Category` |
| kanban | `content.list.kanban` | `Kanban` |
| chart | `content.views.types.chart` | `ChartPie` |
| board | `content.views.types.board` | `Layout` |
| list | `content.views.types.list` | `List` |
| calendar | `content.views.types.calendar` | `Calendar` |
| map | `content.views.types.map` | `Map` |
| timeline | `content.views.types.timeline` | `Story` |
| feed | `content.views.types.feed` | `Feed` |
| form | `content.views.types.form` | `Edit` |
| dashboard | `content.views.types.dashboard` | `Element4` |

- The implemented label keys equal the registry's `labelKey`s (`view-registry.bootstrap.ts:11`,
  `content-gallery/index.ts:14`, `content-kanban/index.ts:8`), so tab and picker labels match.
- `viewTypeIcon` looks the type up in the catalogue. It always finds the type, because `DashboardView` ⊂ the
  catalogue.

### Task 8 — `toolbar-components/view-type-picker.tsx` (new)

The "Add a new view" menu from `image_3.png`. It is a separate component so the switcher file stays about tabs.

```ts
export interface ViewTypePickerProps {
  /** Types the user may create here: the seed allow-list, already empty without content:update. */
  readonly creatableViewTypes: readonly DashboardView[]
  readonly onCreateView: (type: DashboardView) => void
  /** Classes for the trigger, so the switcher can apply its hover reveal. */
  readonly triggerClassName?: string
}
```

**Trigger:** today's "+" `Button` (`view-switcher.tsx:72-82`: ghost, `icon-sm`, `Plus`, `aria-label` and tooltip
`content.views.add`), with `triggerClassName` merged in.

**Content:**
- `DropdownMenuContent align="start"`, with `DropdownMenuLabel` showing `content.views.pickerTitle`.
- Below it, a `grid grid-cols-4 gap-1` of one `DropdownMenuItem` per `VIEW_TYPE_CATALOGUE` entry.
- Each item: `flex-col items-center gap-1.5 py-3`, the icon at `size-5`, and the translated label.

**Enabled rule:** an item is enabled iff its `type` is in `creatableViewTypes`. Reserved types, and implemented types
the seed does not authorize, render with Radix `disabled`, which dims them and sets `data-disabled`. They have no hint
text. **Selecting** an enabled item calls `onCreateView(type)`. Radix closes the menu.

**Tests** (`test/unit/view-type-picker.test.tsx`, unit, `TooltipProvider` wrapper, open the menu with
`fireEvent.pointerDown` on the trigger as `view-switcher.test.tsx:47` does):
- `it("lists every catalogue View Type under the add-view heading")`: all 12 labels are present.
- `it("creates the authorized type the user picks")`: `creatableViewTypes=["table","gallery"]`, click "Gallery", and
  `onCreateView` is called once with `"gallery"`.
- `it("disables reserved types and implemented types the seed does not authorize")`: the "Calendar" and "Kanban"
  menuitems carry `data-disabled`, and clicking "Kanban" calls nothing.

### Task 9 — `toolbar-components/view-switcher.tsx` (rewrite)

```ts
interface ViewSwitcherProps {
  readonly views: UserViewInstance[]
  /** null while the page shows the empty state of a type with no instance left. */
  readonly activeViewId: string | null
  readonly onChangeView: (viewId: string) => void
  /** Present only for users who may create views. */
  readonly onCreateView?: (type: DashboardView) => void
  readonly creatableViewTypes?: readonly DashboardView[]
  /** Present only for users who may reorder views. */
  readonly onReorderViews?: (orderedIds: string[]) => void
}
```

**Structure.**
- The root is `div.group/switcher flex min-w-0 items-center gap-1`.
- Inside it:
  1. a `role="tablist"` container (`aria-label` = `content.views.tabsLabel`, `flex min-w-0 items-center gap-0.5
     overflow-x-auto`) holding the tabs;
  2. after it, outside the scroller so it never scrolls away, `<ViewTypePicker>`. It renders only when `onCreateView`
     is present.

**DnD.**
- Always wrap the tabs in `DndContext` (sensors exactly as `repeater.tsx:61`, `closestCenter`) and in
  `SortableContext` with `horizontalListSortingStrategy` (`page-tabs-manager.tsx:52`).
- `onDragEnd` calls `moveViewId(views.map((v) => v.id), String(active.id), over ? String(over.id) : null)` and, when
  the result is non-null, `onReorderViews(result)`.
- Pointer sensor only. The `distance: 5` constraint keeps a plain click a click.

**Tab (local `SortableViewTab`).**
- Copy `PageTabPill` (`page-tabs-manager.tsx:110-137`), with these differences:
  - a native `<button type="button">`, since there is no nested interactive element;
  - `useSortable({ id: view.id, disabled: !onReorderViews })`;
  - strip `role` from `attributes` as L111 does, then set `role="tab"` and `aria-selected={view.id === activeViewId}`;
  - `onClick` → `onChangeView(view.id)`.
- Content: `viewTypeIcon(view.type)` at `size-4`, plus the label in `truncate max-w-32`.
- Styling per `image_1.png`:
  - base: `h-8 rounded-full px-3 gap-1.5 text-sm`;
  - active: `bg-muted text-foreground font-medium`;
  - inactive: `text-muted-foreground hover:text-foreground`;
  - while dragging: `opacity-50`.

**Hover "+".** Pass `triggerClassName="opacity-0 group-hover/switcher:opacity-100 focus-visible:opacity-100
data-[state=open]:opacity-100 transition-opacity"`. The trigger stays in the tab order and the accessibility tree, so
keyboard and screen-reader users still reach it. It sits on the same row and at the same `icon-sm` size as the toolbar
tools on the right.

Remove `ToggleGroup`, `VIEW_TYPE_ICONS` and the inline dropdown. Keep the file's semicolon style.

**Tests** (`test/unit/view-switcher.test.tsx`, rewritten, unit, `TooltipProvider` wrapper, views = one Table and one
Gallery instance with UUID ids):
- `it("renders one tab per view and marks only the active one as selected")`: two `role="tab"` elements, and only
  the Table tab has `aria-selected="true"`.
- `it("selects a view when the user clicks its tab")`: `onChangeView` is called with the Gallery id.
- `it("marks no tab as selected when no view is active")`: `activeViewId={null}`.
- `it("renders no add-view trigger when onCreateView is absent")`.

Reorder is not driven through dnd-kit in jsdom. Its logic is `moveViewId` (Task 6), and the wiring is covered by the
cross-slice reorder case (Task 13).

### Task 10 — `toolbar-components/toolbar-strip.tsx` (new)

```ts
/** The sticky strip under the SiteHeader that holds the switcher row and the filter banners. */
export function ToolbarStrip({ children }: { readonly children: React.ReactNode }): JSX.Element
```

- Move the wrappers at `content-toolbar.tsx:151-153` and `:366-368` into it verbatim: the sticky `div`, then `Card`,
  then `CardContent`.
- `ContentToolbar` renders its row, banners and pills inside `<ToolbarStrip>`.
- Export it from `index.ts` next to `ViewSwitcher`. The page needs both for the empty state (Task 13).

### Task 11 — `toolbar-components/new-entry-button.tsx` (new)

The split button from `image_2.png`.

```ts
export interface NewEntryButtonProps {
  readonly canCreate: boolean
  readonly onCreate: () => void
  /** Content type name shown in the templates header (labelPlural ?? label). */
  readonly seedLabel: string
}
```

**Layout.** An `inline-flex` group of two default-variant `size="sm"` buttons:
- **Main button.** Classes `rounded-r-none gap-1.5`, with `Plus` and `t("siteHeader.new")`. `onClick` → `onCreate`.
- **Chevron.**
  - It is a `DropdownMenuTrigger asChild` on a `Button` with classes `rounded-l-none border-l
    border-primary-foreground/20 px-1.5`, the `ChevronDown` icon, and `aria-label` =
    `toolbar.newEntry.moreOptions`.
  - Menu: `DropdownMenuContent align="end" className="w-72"`, containing:
    - a `DropdownMenuLabel` showing `toolbar.newEntry.templatesTitle` with `{ label: seedLabel }`;
    - a muted `p` with `toolbar.newEntry.templatesDescription`;
    - a `DropdownMenuSeparator`;
    - one `DropdownMenuItem` with `Plus` and `toolbar.newEntry.newTemplate`.

**No-Op.** The item's `onSelect` does nothing beyond Radix's default close. There is no handler prop, no toast, no
navigation, and no `console`. The brief (§4) makes it explicitly No-Op.

**Without `canCreate`.** Both buttons are `disabled`. The existing tooltip wrapper (`content-toolbar.tsx:311-328`,
including its hardcoded string) moves here around the group unchanged.

**`content-toolbar.tsx`** replaces L299-330 with `isToolEnabled("create") && <NewEntryButton canCreate={canCreate}
onCreate={onCreate} seedLabel={seed.labelPlural ?? seed.label} />`.

**Tests** (`test/unit/new-entry-button.test.tsx`, unit, `TooltipProvider`; open the menu with
`fireEvent.pointerDown` on the chevron, found by its `aria-label`):
- `it("creates an entry when the user clicks New")`: `onCreate` is called once.
- `it("opens a templates menu for the content type with a New template item")`: the title contains `seedLabel`, and
  the `menuitem` "New template" is present.
- `it("closes the templates menu and creates nothing when New template is chosen")`: after the click, the menuitem is
  gone and `onCreate` was not called.
- `it("disables both buttons without content:create")`.

**`test/unit/content-toolbar.test.tsx`.** Add a `vi.mock` of
`@/features/content-toolbar/toolbar-components/new-entry-button` that renders `<button onClick={onCreate}>New</button>`,
the way L28-40 mock the other toolbar components. The existing `getByText("New")` case (L130) then keeps testing the
toolbar's wiring.

### Task 12 — `content-toolbar.tsx`, `types.ts`, `index.ts`, workspace

**`types.ts`** (`ContentToolbarProps`, L21-29):
- Replace `creatableViews?` with:

```ts
  /** Types the "+" picker enables: the seed allow-list, empty without content:update. */
  creatableViewTypes?: readonly DashboardView[]
  /** Present only for users who may reorder views. */
  onReorderViews?: (orderedIds: string[]) => void
```

- `activeViewId` stays a `string`. The toolbar always has an active view, and only the page's empty state passes
  `null`, directly to `ViewSwitcher`.

**`content-toolbar.tsx`:**
- Destructure `creatableViewTypes` and `onReorderViews`, and pass both to `<ViewSwitcher>` (L156-162).
- Wrap the strip in `<ToolbarStrip>` (Task 10).
- Use `<NewEntryButton>` (Task 11).
- No other change.

**`index.ts`:** add `export { ViewSwitcher } from "./toolbar-components/view-switcher"` and
`export { ToolbarStrip } from "./toolbar-components/toolbar-strip"`.

**`pages/content-view-workspace.tsx`:**
- In `ContentViewWorkspaceProps` (L28-43), replace `creatableViews` with
  `creatableViewTypes: readonly DashboardView[]` and add `onReorderViews?: (orderedIds: string[]) => void`.
- Pass both through to `ContentToolbar` (L141-142).

### Task 13 — `pages/content-list.tsx`

**Reorder.**
- Add `const reorderViews = useReorderContentViews(slug ?? "")`.
- Add `handleReorderViews = useCallback((ids: string[]) => reorderViews.mutate(ids), [reorderViews])`.
- Pass `onReorderViews={canManageViews ? handleReorderViews : undefined}` to the workspace and to the empty-state
  switcher.

**Creatable types.** Replace the `creatableViews` memo (L102-105) with
`creatableViewTypes = seed && canManageViews ? resolveAuthorizedViews(seed) : []`, memoised on `[seed,
canManageViews]`. `typeLabel` stays, because tab labels and the delete dialog use it.

**Empty state.**
- **State.** `const [emptyStateType, setEmptyStateType] = React.useState<DashboardView | null>(null)`.
- **Entry.** In `handleConfirmDeleteView` (L127-138), snapshot the facts before calling `mutate`:
  - `wasActive = viewPendingDelete.id === activeViewId`;
  - `isLastOfType = views.filter((v) => v.type === viewPendingDelete.type).length === 1`.

  Add `onSuccess: () => { if (wasActive && isLastOfType && viewPendingDelete.type !== "table")
  setEmptyStateType(type) }`, with `type` captured before `setViewPendingDelete(null)`. A Table can never reach this
  branch: the API refuses the last one with 409, and a second Table instance is not "last". The `type !== "table"`
  check documents the rule and costs nothing.
- **Exit.** `handleChangeView` and the `onSuccess` of `handleCreateView` call `setEmptyStateType(null)`. The latter
  reaches it through `handleChangeView(created.id)`, which it already calls.
- **Not entered.**
  - Deleting a non-active view: unreachable today, because delete lives in the active view's settings menu.
  - A colleague deleting the view you are on: the next refetch falls back to the first Table, as in Sprint 2.
- **Not persisted.** A reload shows the resolver's normal choice. The state is the controlled landing right after a
  delete (brief §4), not a navigable location.
- **Render.** Make the content branch at L212-231 three-way:
  1. `viewsQuery.isError || (!activeView && !emptyStateType)` → the existing error box.
  2. `emptyStateType` →
     `<ToolbarStrip><ViewSwitcher views={switcherViews} activeViewId={null} onChangeView={handleChangeView}
     onCreateView={…} creatableViewTypes={creatableViewTypes} onReorderViews={…} /></ToolbarStrip>`, followed by
     `<ViewEmptyState typeLabel={typeLabel(emptyStateType)} onCreate={canManageViews ? () =>
     handleCreateView(emptyStateType) : undefined} />`.
  3. Otherwise → the workspace, as today, with the new props.

  The empty state checks before `!activeView` matters: after the delete, `activeView` resolves to the Table again,
  and the empty state must win over it.

**Imports.** `ToolbarStrip` and `ViewSwitcher` come from `@/features/content-toolbar`. `ViewEmptyState` and
`useReorderContentViews` come from `@/features/content-views`.

**Tests** (`src/test/cross-slice/content-list.test.tsx`):
- Extend the `use-content-views` mock (L199-205) with `useReorderContentViews: () => ({ mutate: mockReorderView })`.
- Give `mockDeleteView` an implementation that calls `options.onSuccess?.()`.
- Add two buttons to the `ContentToolbar` mock (L131-164):
  - "reorder-views", calling `props.onReorderViews?.([GALLERY_VIEW_ID, TABLE_VIEW_ID])`;
  - "delete-view", calling `props.onDeleteView?.(props.activeViewId)`.
- `ToolbarStrip` and `ViewSwitcher` stay real through the `...actual` spread.

New cases:
- `it("persists a new tab order through the views API")`: `mockReorderView` is called with `[GALLERY_VIEW_ID,
  TABLE_VIEW_ID]`.
- `it("shows the create-your-first-view state after the last Gallery view is deleted")`. Store `GALLERY_VIEW_ID` in
  localStorage, then click "delete-view" and then the confirm dialog's `common.confirm` button. Assert the
  `content.views.emptyTitle` text is shown and the `active-view` test id is absent.
- `it("leaves the empty state when the user picks a view in the switcher")`: from the previous state, click the
  `role="tab"` named after the Table view. `active-view` then shows `TABLE_VIEW_ID`. Build the state with a local
  helper per Rule 3.12, not by depending on the previous `it()`.

### Task 14 — Locales (`en.json`, `it.json`)

Add the same keys to both files. `locales.test.ts` enforces parity.

| Key | en | it |
|---|---|---|
| `content.views.tabsLabel` | Views | Viste |
| `content.views.pickerTitle` | Add a new view | Aggiungi una nuova vista |
| `content.views.types.chart` | Chart | Grafico |
| `content.views.types.board` | Board | Bacheca |
| `content.views.types.list` | List | Elenco |
| `content.views.types.calendar` | Calendar | Calendario |
| `content.views.types.map` | Map | Mappa |
| `content.views.types.timeline` | Timeline | Timeline |
| `content.views.types.feed` | Feed | Feed |
| `content.views.types.form` | Form | Modulo |
| `content.views.types.dashboard` | Dashboard | Dashboard |
| `content.views.emptyTitle` | No {{label}} views yet | Nessuna vista {{label}} |
| `content.views.emptyDescription` | Create a view to see this content as a {{label}}. | Crea una vista per vedere questo contenuto come {{label}}. |
| `content.views.emptyCreate` | Create your first view | Crea la tua prima vista |
| `content.views.errors.reorderFailed` | Could not save the view order | Impossibile salvare l'ordine delle viste |
| `toolbar.newEntry.moreOptions` | Templates | Template |
| `toolbar.newEntry.templatesTitle` | Templates for {{label}} | Template per {{label}} |
| `toolbar.newEntry.templatesDescription` | Create a reusable entry template for this content type. | Crea un template riutilizzabile per le entry di questo tipo di contenuto. |
| `toolbar.newEntry.newTemplate` | New template | Nuovo template |

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# 1. Core contract + unit tests
cd packages/core && pnpm run build && pnpm test -- content-view

# 2. API typecheck: no new error (8 pre-existing errors in 5 untouched files, per Sprint 2's review)
cd apps/api && npx tsc --noEmit

# 3. API integration (real D1), including the new reorder case and base-migration-upgrade
cd apps/api && pnpm run test:integration

# 4. Dashboard
cd apps/dashboard && pnpm run type-check && pnpm test

# 5. Lint (noopParser workaround for TS 7 is in place)
pnpm lint

# 6. Workspace regression scoped to changed packages
pnpm beech test --diff

# 7. Stale union gone
git grep -n "\bViewType\b\|VIEW_TYPE_ICONS\|creatableViews\b" -- apps/dashboard/src      # expect no output

# 8. Slice isolation
git grep -n "@/features/" -- apps/dashboard/src/features/content-views | grep -v "@/features/shared"   # expect no output
git grep -n "content-views" -- apps/dashboard/src/features/content-toolbar                              # expect no output

# 9. Graph sync
graphify update . --force
```

**Runtime check** (`pnpm beech dev`, `posts` seed, admin user, then a user with only `content:read`). Report any step
that cannot be run in the execution log.
1. The tabs show an icon and a title. The active tab is a filled pill. "+" is invisible until the pointer is over the
   switcher, and Tab-key focus reveals it too.
2. "+" opens a 4-column "Add a new view" grid with 12 entries. Table and Gallery are enabled. Kanban and the nine
   reserved types are dimmed and do nothing.
3. Dragging Gallery before Table reorders immediately. After a reload, and in a second browser, the order holds.
   Network: one `PUT /views/order` and no PATCH.
4. Creating a second Gallery and then deleting the active Gallery leaves you on the Table. Deleting the remaining
   Gallery shows the centred empty state with "Create your first view". Clicking it creates a Gallery and opens it.
5. "New" opens the entry editor. The chevron opens "Templates for Posts", and "New template" closes the menu with no
   network request.
6. As the `content:read` user: there is no "+", dragging does nothing, and both "New" halves are disabled with the
   permission tooltip.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `mergeContentViewOrder` is exported from `@beechcms/core`. It is pure, its output is always a permutation of
      `allIds`, and hidden ids keep their slot (core tests).
- [ ] After `PUT /views/order`, every `seed_views` row of the seed has a distinct position. A hidden row keeps its
      slot (integration case). The route, permission row, request/response shape and error codes are unchanged.
- [ ] `D1ContentViewRepository`, `IContentViewRepository`, every migration, `permission.middleware.ts` and the
      middleware registration order are byte-identical.
- [ ] `RESERVED_VIEW_TYPES` / `ViewTypeId` exist only in the dashboard. `DashboardView`, `AUTHORIZABLE_VIEWS` and
      `VIEW_TYPE_IDS` in core are unchanged, and the API still answers 422 to `POST { type: 'calendar' }`.
- [ ] The picker lists all 12 catalogue entries. An entry is enabled iff its type is in the seed's
      `resolveAuthorizedViews` and the user has `content:update`.
- [ ] Tabs are draggable only when `onReorderViews` is passed (`content:update`). A plain click still selects. A
      reorder issues exactly one `PUT /views/order`, updates the cache optimistically, and never remounts the active
      workspace.
- [ ] Deleting the active view, when it is the last instance of a non-Table type, renders `ViewEmptyState` with the
      switcher still visible. Picking any tab or creating a view leaves it.
- [ ] The "New" split button's template item has no side effect other than closing the menu.
- [ ] `ViewType` and `VIEW_TYPE_ICONS` are gone (Validation step 7), and `UserViewInstance.type` is `DashboardView`.
- [ ] `content-views` imports no `@/features/*` module except `@/features/shared`, and `content-toolbar` imports
      nothing from `content-views` (Validation step 8).
- [ ] Every key in Task 14 exists in both locale files, and `locales.test.ts` passes.
- [ ] All new and edited tests follow `_config/testing_conventions.md`:
  - unit or integration tier as listed, placed in their slice (cross-slice cases in `src/test/cross-slice/`);
  - SPDX header, four zones, one act, a named act result;
  - no `any` in new code, no fake timers, no sleeping;
  - canonical `posts` seed in the integration case.
- [ ] `pnpm run build` + `pnpm test` (core), `npx tsc --noEmit` (api, no new error), `pnpm run test:integration`
      (api), `pnpm run type-check` + `pnpm test` (dashboard), `pnpm lint`, and `pnpm beech test --diff` all pass.
- [ ] `git diff --stat` touches no file outside SECTION 3.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executor MUST NOT build or modify:

- **The harness contract.** That means:
  - `ViewDefinition` growing a renderer component or a per-type settings section;
  - moving the `view.type === …` renderer branches out of `ContentViewWorkspace`;
  - moving the type-specific groups out of `SettingsMenu`;
  - one shared page grid/margins for every View Type.

  → ROADMAP §4 `ViewHarnessContract`. `IViewRegistry`, `ViewDefinition`, `view-registry.bootstrap.ts` and the gallery
  and kanban `register*View` functions stay as they are.
- **The Element contract, and conditional formatting on Gallery/Kanban cards.** → ROADMAP §5
  `UniversalElementFormatting`.
- **Gallery → Entry Editor, `GalleryPeekPanel` removal, the cover-image default layout.** → ROADMAP §6
  `GalleryEntryEditorUnification`.
- **Rename or delete from the tab** (context menu, double-click, inline edit). Both stay in the settings menu
  (Sprint 2).
- **Keyboard drag-reorder**, a `DragOverlay`, `@dnd-kit/modifiers` or any new dependency.
- **A working template picker.** That covers any template data, route or state behind "New template".
- **Hint text or tooltips on disabled picker entries.**
- **A URL- or localStorage-persisted empty state, or `?view=<type>` deep links.**
- **The `nowSeconds()` duplication in `content-view.repository.d1.ts:65`** (Sprint 1 review finding 2). This sprint
  does not touch that file.
- **`pages/drafts-list.tsx`.** It keeps its single synthetic `{ id: "table" }` view, and gets no reorder and no
  picker because it passes neither callback.
- **Pre-existing cross-slice imports, and the hardcoded Italian permission tooltip text.** The tooltip moves verbatim.
- **Concurrency control on views.** Last-write-wins per row. A conflicting reorder is resolved by the refetch in
  `useReorderContentViews.onError`.
