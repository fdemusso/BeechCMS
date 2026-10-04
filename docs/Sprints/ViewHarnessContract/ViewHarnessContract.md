# Sprint: ViewHarnessContract

Sprint 4 of 6 of **Saved Views** (roadmap: `backlog/ROADMAP.md`). Sprints 1–3 (`ContentViewsPersistence`,
`ViewInstancesDashboard`, `ViewSwitcherRedesign`) are archived in `docs/Sprints/` with PASS verdicts.

After Sprint 3, the content page renders persisted view instances, the switcher is final, and per-view state autosaves.
Adding a fourth View Type would still mean editing six places, though:
- `ContentViewWorkspace` hardcodes one JSX branch per `view.type`;
- `SettingsMenu` hardcodes `activeViewType === "kanban" | "table"` branches;
- the Kanban settings live in the toolbar slice;
- the card-layout dialog lives in `ContentListModals`, behind `activeViewType === "kanban"`;
- the kanban save-sync hangs off `onSaved`, behind `view.type === "kanban"`;
- the registry bootstrap sits inside the toolbar slice and imports two sibling slices.

This sprint turns `ViewDefinition` into the harness contract. A definition carries:
- its `Renderer`, with one uniform props contract;
- the universal settings blocks it shows (`settings`);
- an optional type-owned `SettingsSection`.

The workspace renders `definition.Renderer` inside the toolbar's single content viewport, and the composition root
registers Table, Gallery and Kanban through that contract. Dashboard only: no core, API, migration or locale change.

> **Precondition.** Sprints 1–3 are still uncommitted in the working tree of `feature/content-views-persistence`
> (`git status`: `features/content-views/`, `pages/content-view-workspace.tsx`, `toolbar-components/view-type-*`, …).
> The executor starts from a tree where all three are committed, and does not re-implement any of their files beyond
> the edits listed in SECTION 3.

---

### Pre-Computation Analysis

Graph rebuilt at planning time with `graphify update . --force`: 24 602 nodes, 36 389 edges, 2 295 communities.

**a) God nodes on the path of this sprint (degree from `graphify explain`)**

| Node | Source | Degree | Role here |
|---|---|---|---|
| `api` | `apps/dashboard/src/lib/api.ts:40` | 80 | Not touched. No new HTTP call in this sprint. |
| `usePermissions()` | `features/shared/hooks/use-permissions.ts:62` | 47 | The table renderer calls it for `can` (it was passed from the workspace before). |
| `ContentListPage()` | `pages/content-list.tsx:55` | 21 | Reads `labelKey`/`enabledTools`/`settings` from the moved registry. |
| `ContentToolbar()` | `features/content-toolbar/content-toolbar.tsx:26` | 9 | Loses the kanban props and gains `renderSettingsSection`. Its children wrapper becomes the named viewport. |
| `useContentListQuery()` | `features/content-management/hooks/use-content-list-query.ts:66` | 9 | Stays in the workspace. Its return value is passed as `query` unchanged. |
| `ContentViewWorkspace()` | `pages/content-view-workspace.tsx:47` | 8 | Rewritten as the harness host. |
| `useContentListModals()` | `features/content-management/hooks/use-content-list-modals.ts:10` | 6 | Loses `cardConfigOpen`. Its handlers become `entries`. |
| `useContentTableConfig()` | `features/content-management/hooks/use-content-table-config.ts:54` | 5 | Becomes controlled and is called only by the table renderer. |
| `ViewDefinition` / `IViewRegistry` | `features/shared/view-registry.ts:16/22` | 5 / 5 | Grow into the harness contract. |
| `SettingsMenu()` | `features/content-toolbar/toolbar-components/settings-menu.tsx:97` | 4 | Type branches replaced by the `settings` capability list and a section slot. |

**b) Architectural boundaries affected**

- `@beechcms/core`: none. `DashboardView`, `ContentViewConfig`, `KanbanViewConfig`, `KanbanCardConfig` and
  `resolveKanbanConfig`/`resolveKanbanColumns` are consumed as they are.
- `apps/api`: none.
- `apps/dashboard`:
  - `features/shared/view-registry.ts`: the contract types (no runtime code).
  - `lib/dynamic-columns.tsx`: `defaultHiddenColumns` (moved out of the table hook so the layout state can share it).
  - `features/content-views`: `useViewLayoutState`, the per-instance appearance and type state.
  - `features/content-management`: controlled `useContentTableConfig`, `ContentTableRenderer`, `TABLE_VIEW_DEFINITION`.
    `ContentListModals` drops the kanban dialog.
  - `features/content-gallery`: `GalleryViewRenderer`, `GALLERY_VIEW_DEFINITION`.
  - `features/content-kanban`: `KanbanViewRenderer` (hosts the card dialog and the save sync),
    `KanbanSettingsSection` (moved out of the toolbar), `KANBAN_VIEW_DEFINITION`.
  - `features/content-toolbar`: `SettingsMenu`/`ContentToolbar` become type-agnostic. The registry files leave the slice.
  - `pages/view-registry.ts` (new composition root), `pages/content-view-workspace.tsx`, `pages/content-list.tsx`,
    `pages/drafts-list.tsx`, `main.tsx`.

**c) `graphify affected` impact analysis**

```
$ graphify affected "ViewDefinition" --depth 2
- content-toolbar/view-registry.ts (.register/.get/.list), view-registry.bootstrap.ts, view-registry.bootstrap.test.ts,
  pages/content-list.tsx
$ graphify affected "SettingsMenu()" --depth 2
- content-toolbar.tsx, settings-menu.test.tsx, content-toolbar/index.ts, content-toolbar.test.tsx,
  use-automation.ts, cross-slice/automation-panel.test.tsx           (type re-use of ContentToolbarProps only)
$ graphify affected "ContentToolbarProps" --depth 2
- content-toolbar.tsx, use-content-toolbar.ts, content-toolbar/index.ts, content-list.tsx, content-view-workspace.tsx,
  drafts-list.tsx, App.tsx, automations (use-automation.ts, index.ts), use-content-list-query.ts,
  use-content-table-config.ts, tests: content-list, content-toolbar, view-switcher, use-content-toolbar, barrels,
  automation-panel
$ graphify affected "useContentTableConfig()" --depth 2
- pages/content-list.tsx, ContentListPage(), content-view-workspace.tsx, ContentViewWorkspace(), App.tsx
$ graphify affected "ContentKanban()" --depth 2
- content-kanban/index.ts, content-list.tsx, content-view-workspace.tsx, ContentListModals.tsx,
  view-registry.bootstrap.ts, App.tsx
$ graphify affected "ContentGallery()" --depth 2
- content-gallery/index.ts, content-list.tsx, content-view-workspace.tsx, content-gallery.test.tsx,
  view-registry.bootstrap.ts, App.tsx
$ graphify affected "ContentTableView()" --depth 2
- content-list.tsx, content-view-workspace.tsx, App.tsx
$ graphify affected "ContentListModalsProps" --depth 2
- (no affected nodes: only ContentListModals.tsx and its single caller, the workspace)
```

Breaking-change verdict:
- **`ContentToolbarProps` loses five fields:** `kanbanCandidates`, `kanbanConfig`, `onKanbanConfigChange`,
  `kanbanAxisBranch`, `onOpenCardConfig`. Only `content-view-workspace.tsx` passes them. `drafts-list.tsx`, the
  automations slice and every test listed above use other fields.
- **`UserViewInstance` gains a required `settings`.** That breaks exactly two producers: `content-list.tsx:101-110` and
  `drafts-list.tsx:295-301`. Both are fixed in this sprint. Test fixtures that build a `UserViewInstance` literal
  (`view-switcher.test.tsx`, `content-toolbar.test.tsx`, `use-content-toolbar.test.ts`) gain the field.
- **`SettingsMenuProps` changes.** `activeViewType` and the five kanban props go, and `settings`, `showSort` and
  `renderSettingsSection` arrive. Its only callers are `content-toolbar.tsx:235` and `settings-menu.test.tsx`
  (rewritten).
- **`UseContentTableConfigOptions` drops `initial` and `conditionalFormats` and gains `layout`.** The return drops
  `groupBy`/`setGroupBy`, `dateGroupPrecision`/`setDateGroupPrecision`, `columnVisibility`/`setColumnVisibility` and
  `density`/`setDensity`. `ContentTableInitialState` is deleted. Its only caller today is the workspace (`grep`: no
  test, no other import).
- **`ContentListModalsProps` drops `activeViewType`, `cardConfigOpen`, `onCloseCardConfig`, `cardConfig` and
  `onSaveCardConfig`.** Its only caller is the workspace.
- **`registerContentGalleryView` / `registerContentKanbanView` are replaced** by the `*_VIEW_DEFINITION` constants.
  Their only caller is `view-registry.bootstrap.ts`, which is deleted.
- **The cross-slice mock of `@/lib/dynamic-columns`** (`test/cross-slice/content-list.test.tsx:122`) must add
  `defaultHiddenColumns`, or every case in that file throws at import.

`graphify path "view-registry.bootstrap.ts" "ContentGallery()"` → `view-registry.bootstrap.ts --imports_from-->
content-gallery/index.ts --re_exports--> ContentGallery()`. That is a production cross-slice edge from inside
`content-toolbar`. The second one is `ContentListModals.tsx:10` (`import { CardConfigDialog } from
"@/features/content-kanban"`, confirmed by grep; the graph attributes it to `content-list.tsx`). This sprint removes
both.

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

1. **YAGNI.**
   - *Vetoed in planning:* a per-type settings component for Table and Gallery. Their blocks (group-by, conditional
     colours, visible columns, rows, density) need toolbar-internal state (`useContentToolbar` column lists, the
     conditional-format editor). Moving them out would create cross-slice imports. They stay universal and are switched
     on by a declarative `settings` list, the same idiom as `enabledTools`. Only Kanban, whose block reads only seed +
     kanban config, gets a type-owned `SettingsSection`.
   - *Vetoed in planning:* a generic untyped `typeConfig` bag. `ViewLayout` mirrors the persisted `ContentViewConfig`
     sub-configs (`kanban`, `card`) with their core types. A bag would erase types to buy extensibility nobody needs
     before a fourth type exists.
   - *Vetoed in planning:* a `ViewViewport` component. All three renderers already sit in the toolbar's one children
     wrapper (`content-toolbar.tsx:340-344`), and none sets outer margins (grep for `-m*`, `mx-auto`, `max-w-`, `w-screen`
     over the three renderer roots finds nothing). That wrapper is named (`data-slot="view-viewport"`) and becomes the
     contract.
   - *Vetoed in planning:* the Element contract and universal conditional formatting. They belong to §5, which is the
     first consumer.
   - *Approved:* `subscribeSaved` on the entry actions. It is the minimal way for a renderer to react to an editor save
     without the workspace branching on type, and Kanban needs it today.
   - *Approved:* a generic `configDialog` (open + setter). One dialog per type, hosted by its renderer, opened from its
     settings section. A Radix dropdown unmounts its content on close, so the dialog cannot live inside the section.
2. **Botanical invariant.** No D1 access, no core change. Persisted configs still cross the alias ↔ `br_XX` boundary
   only in `content-views/lib/view-config-mapping.ts` (unchanged). Branch lookups in the kanban section go by Branch
   ID (`layout.kanban.axisBranchId`), exactly as the toolbar did.
3. **VSA.**
   - `features/shared` gains types only. It imports `@beechcms/core`, `@/lib/*`, `@tanstack/react-table` types and
     React types, never a slice.
   - Each renderer and definition lives in its own slice and imports only `@/features/shared`, `@/lib/*`,
     `@/components/*` and its own files.
   - The only module that imports three content slices is `pages/view-registry.ts`. Pages are the composition roots.
   - Removed edges: `content-toolbar → content-gallery`, `content-toolbar → content-kanban`
     (`view-registry.bootstrap.ts`), and `content-management → content-kanban` (`ContentListModals.tsx:10`).
   - Added edges: none between slices.
4. **Cloudflare purity.** Dashboard only. No binding, no migration, no background work.
5. **Minimal blueprint.**
   - 7 new files: 1 composition root, 3 renderers, 1 kanban section, 1 layout hook, 1 cross-slice registry test
     (plus 3 new unit test files).
   - 1 contract file extended.
   - 4 files deleted: the 2 registry files, the bootstrap test, and the workspace's dead consts.

No violation remains. HANDOFF -> caveman_coder

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Brief §1 asks for an "harness": an interface that links the seed to the View Type and the toolbar, and that extends
(not replaces) `ViewRegistry`/`ViewDefinition`. Brief §2 asks that every View Type render in the same page
grid/margins and control only its own content area. Neither is true today. Sprint 3 deliberately left the workspace and
`SettingsMenu` untouched, so this sprint can restructure them against a final switcher and shell.

It must land before §5 `UniversalElementFormatting`. §5 moves conditional-format evaluation out of
`useContentTableConfig` and applies it to Gallery and Kanban cards through the harness. That needs:
- one renderer props contract to carry the evaluated element styles;
- `useContentTableConfig` already reduced to table-only derived state;
- a `settings` list on which "conditional colours for every type" is a one-line change per definition.

**VSA.**
- The harness contract is types in `features/shared`, next to the existing `ViewDefinition`.
- Each View Type's renderer, definition and type-owned settings live in that type's slice.
- The page-level composition root is the only place that sees all three.
- The sprint removes two existing cross-slice production imports and adds none.

**Botanical Engine.**
- Nothing new is persisted.
- The per-instance state the harness exposes is the same alias-keyed `ViewToolbarState` that Sprint 2 maps to and from
  Branch IDs. Nothing outside `view-config-mapping.ts` sees a `br_XX`↔alias conversion.
- Kanban's section reads the axis by Branch ID, as before.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Registry.**
- `features/shared/view-registry.ts:7-26` defines `ToolbarTool`, `ViewDefinition { type, labelKey, enabledTools }` and
  `IViewRegistry { register, get, list }`. Lines 28-37 hold `RESERVED_VIEW_TYPES`/`ViewTypeId` (Sprint 3, unchanged
  here).
- The implementation `ViewRegistryImpl` and the singleton `viewRegistry` live in
  `features/content-toolbar/view-registry.ts:7-14`.
- `features/content-toolbar/view-registry.bootstrap.ts:9-15` registers Table inline and calls
  `registerContentGalleryView` (`content-gallery/index.ts:12-16`) and `registerContentKanbanView`
  (`content-kanban/index.ts:4-11`).
- It is loaded as a side effect by `main.tsx:25`.
- Its only reader is `pages/content-list.tsx:22` (`typeLabel` L97-100, `switcherViews` L101-110).
- Test: `content-toolbar/test/unit/view-registry.bootstrap.test.ts`, 2 cases: transfer on every view, settings on
  gallery.

**Workspace** (`pages/content-view-workspace.tsx`, keyed by instance id in `content-list.tsx:249`).
- Mount-time hydration: `initial = toViewToolbarState(view.config, seed)` (L50).
- Harness-level hooks:
  - `useContentListModals` (L52);
  - `useContentListQuery` (L71);
  - state for `conditionalFormats`, `kanbanConfig` and `cardConfig` (L72-74);
  - `useContentTableConfig` (L76-93). It owns `groupBy`, `dateGroupPrecision`, `columnVisibility`, `density`,
    `columnSizing`, and the table columns and row styles.
- Autosave config built at L95-116.
- Kanban plumbing at L118-125: `useKanbanEntrySync`, `resolveKanbanConfig` candidates, and the axis branch.
- Type branches:
  - `onDensityChange={view.type === "gallery" ? NOOP_DENSITY_CHANGE : …}` (L173, const L24-25);
  - table loading (L188-194);
  - Table/Gallery/Kanban JSX (L195-258);
  - `activeViewType={view.type}` into `ContentListModals` (L264);
  - `if (view.type === "kanban") kanbanSync(info)` (L286-288).
- Error box for every type (L183-187).

**Toolbar.**
- `ContentToolbarProps` (`content-toolbar/types.ts:63-67`) carries `kanbanCandidates`, `kanbanConfig: any`,
  `onKanbanConfigChange`, `kanbanAxisBranch: any` and `onOpenCardConfig`. `ContentToolbar` forwards them to
  `SettingsMenu` (`content-toolbar.tsx:287-295`, with `activeViewType={activeView.type}`). The children render inside
  `<div className="mt-4">` (L340-344).
- `UserViewInstance` (`content-toolbar/shared.ts:17-23`) has `enabledTools`. `DEFAULT_ENABLED_TOOLS` is at L71.
- `SettingsMenu` (`toolbar-components/settings-menu.tsx`) has these blocks:
  - name input: universal;
  - Filter submenu: universal;
  - Sort submenu: L274 `activeViewType !== "kanban"`;
  - Kanban "Layout & style" group: L343-449 (axis group-by, visible kanban columns via `resolveKanbanColumns`,
    "Configure card layout" → `onOpenCardConfig`);
  - non-Kanban groups (L451-754):
    - Group-by with date precision: L456-585;
    - Conditional colours (`activeViewType === "table"`): L586-616;
    - display group labelled `table` vs `display` (L621-625);
    - Visible columns (table only): L627-684;
    - Rows (`pageSize`): L685-725;
    - Density: L726-751;
  - Delete: universal.
- `settings-menu.test.tsx` asserts that table shows "Table" + conditional colours + visible columns. Gallery shows
  "Display", Group, Rows and Density. Kanban shows none of those.
- Kanban's `enabledTools` already exclude `sort` (`content-kanban/index.ts:9`). That is why L274's branch is
  equivalent to tool gating.

**Modals.**
- `ContentListModals.tsx:10` imports `CardConfigDialog` from `@/features/content-kanban`.
- It renders the dialog when `slug && activeViewType === "kanban"` (L87-95).
- Its open state is `useContentListModals.ts:52` (`cardConfigOpen`, returned at L145-146).
- `onSaved` is typed `(info: any) => void`. The editor's real type is
  `{ entryId?: string; data: Record<string, unknown>; isCreate: boolean }` (`entry-editor-dialog.tsx:14`), which is
  identical to kanban's `SavedEntryInfo` (`content-kanban/types.ts:73-80`).

**Table config** (`content-management/hooks/use-content-table-config.ts`).
- State it owns:
  - `groupBy` (L68);
  - `dateGroupPrecision` (L71), with an effect (L76-82) that resets precision to `DEFAULT_DATE_GROUP_PRECISION` when
    `groupBy` moves to a non-date branch;
  - `columnVisibility` (L177-198), whose default hides `id`, `slug`, `created_at` and every `json` branch whose alias
    contains `metadata`/`metadati`;
  - `columnSizing` (L200);
  - `density` (L201).
- `initialHiddenColumns` (L262-276) recomputes the same default list.
- Derived state: `columns`, `grouping`, `tableKey`, `handleGroupingChange` (functional `setGroupBy`) and `getRowStyles`
  (conditional formats).

**Renderers.**
- `ContentGallery` takes `{ seed, data, isLoading, onEdit, onCreate, groupBy }` (`content-gallery/types.ts:9-18`).
- `ContentKanban` takes `{ seed, seedSlug, isLoading, onEdit, onCreateEntry, search, kanbanConfig, setKanbanConfig,
  cardConfig, setCardConfig, isSaving }` (`content-kanban/types.ts:56-70`).
- `ContentTableView` takes the 33 props at `content-management/components/ContentTableView.tsx:28-64`.
- `useKanbanEntrySync(seed, seedSlug, axisBranchId)` returns a new, un-memoised `(info) => void` on every render
  (`hooks/use-kanban-entry-sync.ts:13-16`).

**Mapping.** `toContentViewConfig(state, seed, type)` writes `kanban`/`card` only when `type === "kanban"`
(`content-views/lib/view-config-mapping.ts:221-224`). That is persisted-shape policy, not rendering, and it stays.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Dashboard only (`apps/dashboard/src/`). No core, API, migration, permission or locale change.

Create:
1. `pages/view-registry.ts`: composition root, `ViewRegistryImpl` + `viewRegistry` with the three definitions
   registered.
2. `features/content-views/hooks/use-view-layout-state.ts`
3. `features/content-management/components/content-table-renderer.tsx`
4. `features/content-gallery/gallery-view-renderer.tsx`
5. `features/content-kanban/components/kanban-view-renderer.tsx`
6. `features/content-kanban/components/kanban-settings-section.tsx`
7. Tests:
   - `test/cross-slice/view-registry.test.ts`;
   - `features/content-views/test/unit/use-view-layout-state.test.ts`;
   - `features/content-kanban/test/unit/kanban-settings-section.test.tsx`;
   - `features/content-kanban/test/unit/kanban-view-renderer.test.tsx`.

Edit:
8. `features/shared/view-registry.ts`: harness contract types.
9. `lib/dynamic-columns.tsx`: `defaultHiddenColumns`, plus a case in `lib/dynamic-columns.test.tsx`.
10. `features/content-views/index.ts`: export `useViewLayoutState`.
11. `features/content-management/hooks/use-content-table-config.ts`: controlled.
12. `features/content-management/hooks/use-content-list-modals.ts`: drop `cardConfigOpen`.
13. `features/content-management/components/ContentListModals.tsx`: drop the kanban dialog and type prop. Type
    `onSaved`.
14. `features/content-management/index.ts`: export `ContentTableRenderer` and `TABLE_VIEW_DEFINITION`.
15. `features/content-gallery/index.ts`: `GALLERY_VIEW_DEFINITION` replaces `registerContentGalleryView`.
16. `features/content-kanban/index.ts`: `KANBAN_VIEW_DEFINITION` replaces `registerContentKanbanView`.
17. `features/content-toolbar/shared.ts`: `UserViewInstance.settings`, `DEFAULT_VIEW_SETTINGS`.
18. `features/content-toolbar/types.ts`: drop the kanban props, add `renderSettingsSection`.
19. `features/content-toolbar/content-toolbar.tsx`: forward `settings`/`showSort`/section, and name the viewport.
20. `features/content-toolbar/toolbar-components/settings-menu.tsx`: type-agnostic.
21. `features/content-toolbar/index.ts`: export `DEFAULT_VIEW_SETTINGS`.
22. `pages/content-view-workspace.tsx`: harness host.
23. `pages/content-list.tsx`: registry import path and `settings` on `switcherViews`.
24. `pages/drafts-list.tsx`: `settings` on its single view.
25. `main.tsx`: drop the bootstrap side-effect import (L25).
26. Test edits:
    - `features/content-toolbar/test/unit/settings-menu.test.tsx` (rewritten helper + cases);
    - `features/content-toolbar/test/unit/content-toolbar.test.tsx` (viewport case + `settings` in fixtures);
    - `features/content-toolbar/test/unit/view-switcher.test.tsx` and `use-content-toolbar.test.ts` (`settings` in
      `UserViewInstance` fixtures);
    - `test/cross-slice/content-list.test.tsx` (mock + one case).

Delete:
27. `features/content-toolbar/view-registry.ts`
28. `features/content-toolbar/view-registry.bootstrap.ts`
29. `features/content-toolbar/test/unit/view-registry.bootstrap.test.ts`. Its two cases move into item 7.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — Harness contract (`features/shared/view-registry.ts`)

Extend the file in place. Keep `ToolbarTool`, `IViewRegistry` and the Sprint 3 reserved identifiers byte-identical. This
is types only, with no runtime code. Allowed imports: `react` (types), `@tanstack/react-table` (types),
`@beechcms/core` (types), `@/lib/dynamic-columns` (`ContentEntry`, `DateGroupPrecision`), `@/lib/density`
(`TableDensity`) and `@/lib/conditional-format` (`ConditionalFormatRule`).

Verbatim building blocks:

```ts
/** Universal settings-menu blocks a View Type opts into (name, filter, sort and delete are always there). */
export type ViewSetting = 'groupBy' | 'conditionalFormats' | 'columns' | 'pageSize' | 'density'

/** Live list query shared by every View Type. Field names match useContentListQuery's return value. */
export interface ViewQueryState {
  readonly data: ContentEntry[]
  readonly isLoading: boolean
  readonly totalRows: number
  readonly pageIndex: number
  readonly setPageIndex: (index: number) => void
  readonly pageSize: number
  readonly handlePageSizeChange: (size: number) => void
  readonly pageCount: number
  readonly tableSearch: string
  readonly setTableSearch: (value: string) => void
  readonly debouncedSearch: string
  readonly sorting: SortingState
  readonly handleTableSortingChange: (next: SortingState) => void
  readonly columnFilters: ColumnFiltersState
  readonly isEmptySeed: boolean
  readonly applyCellFilter: (columnId: string, entry: ContentEntry) => void
}

/** Per-instance appearance and type sub-config, alias-keyed, persisted by the autosave. */
export interface ViewLayout {
  readonly groupBy: string | null
  readonly setGroupBy: Dispatch<SetStateAction<string | null>>
  readonly dateGroupPrecision: DateGroupPrecision
  readonly setDateGroupPrecision: Dispatch<SetStateAction<DateGroupPrecision>>
  readonly columnVisibility: VisibilityState
  readonly setColumnVisibility: Dispatch<SetStateAction<VisibilityState>>
  readonly density: TableDensity
  readonly setDensity: Dispatch<SetStateAction<TableDensity>>
  readonly conditionalFormats: ConditionalFormatRule[]
  readonly setConditionalFormats: Dispatch<SetStateAction<ConditionalFormatRule[]>>
  readonly kanban: KanbanViewConfig
  readonly setKanban: Dispatch<SetStateAction<KanbanViewConfig>>
  readonly card: KanbanCardConfig | undefined
  readonly setCard: Dispatch<SetStateAction<KanbanCardConfig | undefined>>
}

/** Emitted after a successful entry-editor save (same shape as EntryEditorDialog's onSaved). */
export interface ViewEntrySavedInfo {
  entryId?: string
  data: Record<string, unknown>
  isCreate: boolean
}

/** Entry actions shared by every View Type. Field names match useContentListModals' return value. */
export interface ViewEntryActions {
  readonly handleEdit: (entryId: string) => void
  readonly handleCreate: (defaultValues?: Record<string, unknown> | SyntheticEvent | Event) => void
  readonly handleDelete: (entryId: string) => void
  readonly handleBulkDelete: (entryIds: string[]) => void
  readonly handleBulkEdit: (entryIds: string[]) => void
  readonly rowSelection: RowSelectionState
  readonly setRowSelection: Dispatch<SetStateAction<RowSelectionState>>
  readonly selectedIds: string[]
  /** Adds a listener for entry-editor saves; returns its unsubscribe. */
  readonly subscribeSaved: (listener: (info: ViewEntrySavedInfo) => void) => () => void
}

/**
 * The one props contract every View Type renderer receives. A renderer controls only its own content area: it
 * renders inside the toolbar's view viewport and never sets outer margins, width or page chrome.
 */
export interface ViewRendererProps {
  readonly seed: Seed
  readonly slug: string
  readonly query: ViewQueryState
  readonly layout: ViewLayout
  readonly entries: ViewEntryActions
  /** True while the instance's config autosave is in flight. */
  readonly isSaving: boolean
  /** The View Type's own configuration dialog, hosted by its renderer and opened from its settings section. */
  readonly configDialog: { readonly open: boolean; readonly onOpenChange: (open: boolean) => void }
}

/** Props of a View Type's own settings-menu block. */
export interface ViewSettingsSectionProps {
  readonly seed: Seed
  readonly layout: ViewLayout
  /** Closes the settings menu. */
  readonly onClose: () => void
  readonly onOpenConfigDialog: () => void
}

export interface ViewDefinition {
  type: DashboardView
  labelKey: string
  enabledTools: ToolbarTool[]
  settings: readonly ViewSetting[]
  Renderer: ComponentType<ViewRendererProps>
  /** Rendered in the settings menu, after quick actions. Omit when the universal blocks suffice. */
  SettingsSection?: ComponentType<ViewSettingsSectionProps>
}
```

`features/shared/index.ts:8` already re-exports the file (`export *`), so there is no barrel change.

### Task 2 — `defaultHiddenColumns` (`lib/dynamic-columns.tsx`)

This moves the default hidden-column rule out of `use-content-table-config.ts`, so the layout state (content-views)
and the table renderer (content-management) share it without a cross-slice import.

```ts
/** Columns hidden until the user decides otherwise: id, slug, created_at, and json branches named like metadata. */
export function defaultHiddenColumns(seed: Seed): string[]
```

The rule is the one in `use-content-table-config.ts:262-276`. Order: `["id", "slug", "created_at", ...aliases]`, with
aliases in seed branch order. A json branch qualifies when its lower-cased alias contains `metadata` or `metadati`.
Pure, and the same input gives the same output.

### Task 3 — `useViewLayoutState` (`features/content-views/hooks/use-view-layout-state.ts`)

```ts
export function useViewLayoutState(initial: ViewToolbarState, seed: Seed): ViewLayout
```

One `useState` per `ViewLayout` field, initialised once from `initial` (the workspace is keyed by instance id, so there
is no rehydration effect). Defaults when `initial` leaves a field undefined:
- `columnVisibility`: `defaultHiddenColumns(seed)` mapped to `false`. This is the same set the table hook built at L177-198.
- `density`: `DEFAULT_DENSITY` (`@/lib/density`).
- `kanban`: `{ axisBranchId: null, sort: null }`, the value of the workspace's `EMPTY_KANBAN_CONFIG` today.
- `card` stays `undefined`.

Move the precision-reset effect from `use-content-table-config.ts:76-82` here unchanged. It is a known quirk on
system date columns and is out of scope (SECTION 7).

Return a memoised object whose setters are the raw `useState` dispatchers, so functional updates keep working
(`handleGroupingChange` relies on them). Export it from `features/content-views/index.ts`.

### Task 4 — Controlled `useContentTableConfig` (`content-management/hooks/use-content-table-config.ts`)

The hook becomes table-only derived state, and its only caller is the table renderer (Task 5).
- Delete `ContentTableInitialState` (L31-37), the `groupBy`/`dateGroupPrecision`/`columnVisibility`/`density` states,
  and the precision effect.
- `initialHiddenColumns` becomes `defaultHiddenColumns(seed)` (empty-seed case: `["id", "slug", "created_at"]`, as
  today).

```ts
export interface UseContentTableConfigOptions {
  seed: Seed | null
  data: ContentEntry[]
  pageSize: number
  layout: Pick<ViewLayout, 'groupBy' | 'setGroupBy' | 'dateGroupPrecision' | 'conditionalFormats'>
  selectedIds: string[]
  handleEdit: (id: string) => void
  handleDelete: (id: string) => void
  handleBulkDelete: (ids: string[]) => void
  handleBulkEdit: (ids: string[]) => void
  t: (key: string, options?: any) => string
}
// returns { columns, tableKey, initialHiddenColumns, columnSizing, setColumnSizing, grouping, handleGroupingChange, getRowStyles }
```

`columnSizing` stays local to the hook. It is not persisted (unchanged). Conditional-format evaluation (`getRowStyles`)
stays here unchanged. §5 moves it.

### Task 5 — Table renderer and definition (`content-management`)

`components/content-table-renderer.tsx` exports `ContentTableRenderer(props: ViewRendererProps)`. It:
- calls `useTranslation`, `usePermissions` (for `can`), and `useContentTableConfig` with `query.data`,
  `query.pageSize`, `layout` and the `entries` handlers;
- while `query.isLoading`, renders the loading block that is now at `content-view-workspace.tsx:188-194`;
- otherwise renders `ContentTableView` with the mapping that is now at L196-231. The only differences are the sources:
  `columnVisibility`/`onColumnVisibilityChange`/`density` come from `layout`, selection comes from `entries`, and
  `onCreate` is `entries.handleCreate`.

Add `TABLE_VIEW_DEFINITION: ViewDefinition` in the same file:
- `type: "table"`;
- `labelKey: "content.list.table"`;
- `enabledTools`: the list at `view-registry.bootstrap.ts:12`;
- `settings: ["groupBy", "conditionalFormats", "columns", "pageSize", "density"]`;
- `Renderer: ContentTableRenderer`;
- no section.

Export both from `content-management/index.ts`.

### Task 6 — Gallery renderer and definition (`content-gallery`)

`gallery-view-renderer.tsx` exports `GalleryViewRenderer(props: ViewRendererProps)`, which renders `ContentGallery`
with:
- `seed`, `data = query.data`, `isLoading = query.isLoading`;
- `onEdit = entries.handleEdit`, `onCreate = entries.handleCreate`;
- `groupBy = layout.groupBy`.

`GALLERY_VIEW_DEFINITION` sits in the same file:
- `type: "gallery"`, `labelKey: "content.list.gallery"`;
- `enabledTools`: the list at `content-gallery/index.ts:15`;
- `settings: ["groupBy", "pageSize"]`;
- `Renderer: GalleryViewRenderer`.

In `content-gallery/index.ts`, replace `registerContentGalleryView` (L12-16) with the export of
`GALLERY_VIEW_DEFINITION`.

Gallery drops `density`. The control was a documented no-op (`NOOP_DENSITY_CHANGE`, workspace L24-25), and a
declarative list cannot express "shown but inert".

### Task 7 — Kanban renderer, settings section and definition (`content-kanban`)

**`components/kanban-view-renderer.tsx`** exports `KanbanViewRenderer(props: ViewRendererProps)`. It renders two
siblings:
- `ContentKanban`, with the mapping that is now at workspace L245-257, sourced from `query`
  (`isLoading`, `debouncedSearch.trim() || undefined`), `entries` (`handleEdit`, `handleCreate`), `layout`
  (`kanban`/`setKanban`, `card`/`setCard`) and `isSaving`;
- `CardConfigDialog`, with:
  - `open = configDialog.open`;
  - `onClose = () => configDialog.onOpenChange(false)`;
  - `config = layout.card`, `onSave = layout.setCard`.

Save sync: call `useKanbanEntrySync(seed, slug, layout.kanban.axisBranchId)` and keep the result in a ref that is
updated every render. Subscribe once per mount through `entries.subscribeSaved` with a listener that calls the ref's
current value, and unsubscribe on unmount. The hook's return is not memoised, so subscribing it directly would
resubscribe on every render.

**`components/kanban-settings-section.tsx`** exports `KanbanSettingsSection(props: ViewSettingsSectionProps)`. It moves
`settings-menu.tsx:343-449` here with the same JSX structure, icons, locale keys and behaviour. Its inputs are
recomputed from props:
- candidates: `resolveKanbanConfig(seed)`, `compatible ? candidates : []` (copy of workspace L119-120);
- axis branch: `seed.branches.find(b => b.id === layout.kanban.axisBranchId)`;
- columns: `resolveKanbanColumns(axisBranch)`.

Writes:
- picking an axis calls `layout.setKanban(...)` with the same object literal as `settings-menu.tsx:368-373`, then
  `onClose()`;
- toggling a column's visibility calls `layout.setKanban(...)` as at L417-422, and the menu stays open;
- "Configure card layout" calls `onOpenConfigDialog()`, then `onClose()`.

It renders nothing (`null`) when there are no candidates, matching the L344 guard. It renders its own
`DropdownMenuGroup` + label (`toolbar.settings.layoutStyle`) followed by a `DropdownMenuSeparator`.

**`KANBAN_VIEW_DEFINITION`** sits in `kanban-view-renderer.tsx`:
- `type: "kanban"`, `labelKey: "content.list.kanban"`;
- `enabledTools`: the list at `content-kanban/index.ts:9`;
- `settings: []`;
- `Renderer: KanbanViewRenderer`, `SettingsSection: KanbanSettingsSection`.

In `index.ts`, replace `registerContentKanbanView` (L4-11) with the export of `KANBAN_VIEW_DEFINITION`. The existing
barrel exports stay.

### Task 8 — Composition root (`pages/view-registry.ts`)

Move `ViewRegistryImpl` from `features/content-toolbar/view-registry.ts:7-12` here unchanged. Export
`viewRegistry: IViewRegistry` with `TABLE_VIEW_DEFINITION`, `GALLERY_VIEW_DEFINITION` and `KANBAN_VIEW_DEFINITION`
registered at module load, in that order.

This is a module with exports, not a side-effect import. `content-list.tsx` and `content-view-workspace.tsx` import
`{ viewRegistry } from "./view-registry"`. That keeps the cross-slice page test working without a bootstrap import.

Delete:
- `features/content-toolbar/view-registry.ts`;
- `features/content-toolbar/view-registry.bootstrap.ts`;
- its test;
- the `main.tsx:25` side-effect import.

The header comment line at `view-registry.bootstrap.ts:3` ("Composition root — the ONLY module allowed to import from
multiple content slices") moves with the file.

### Task 9 — Type-agnostic toolbar (`features/content-toolbar`)

**`shared.ts`.**
- `UserViewInstance` gains `settings: readonly ViewSetting[]` (type re-exported from `@/features/shared`, next to
  `ToolbarTool` at L15).
- Add `DEFAULT_VIEW_SETTINGS: readonly ViewSetting[] = ["groupBy", "conditionalFormats", "columns", "pageSize",
  "density"]` next to `DEFAULT_ENABLED_TOOLS` (L71).
- Export it from `index.ts:25`.

**`types.ts`.**
- Delete `kanbanCandidates`, `kanbanConfig`, `onKanbanConfigChange`, `kanbanAxisBranch` and `onOpenCardConfig`
  (L63-67).
- Add:

```ts
  /** The active View Type's own settings block; `close` closes the settings menu. */
  renderSettingsSection?: (ctx: { close: () => void }) => React.ReactNode
```

**`content-toolbar.tsx`.**
- Stop destructuring and forwarding the deleted props (L59-63, L291-295).
- Pass `SettingsMenu` the following, instead of `activeViewType`:
  - `settings={activeView.settings}`;
  - `showSort={isToolEnabled("sort")}`;
  - `renderSettingsSection={props.renderSettingsSection}`.
- Name the children wrapper at L341: `<div className="mt-4" data-slot="view-viewport">`. It is the one content
  viewport every View Type renders in, and its classes do not change.

**`toolbar-components/settings-menu.tsx`.**

Props:
- delete `activeViewType` and the five kanban props (L86, L90-94) and the `resolveKanbanColumns` import;
- add `settings: readonly ViewSetting[]`, `showSort: boolean`, and `renderSettingsSection?` (same signature as in
  `types.ts`).

Rendering rules (they replace every `activeViewType` test):
- The Sort submenu (L274) renders iff `showSort`.
- `renderSettingsSection?.({ close: closeSettingsMenu })` renders right after the quick-actions separator (L341). That
  is where the Kanban group sits today.
- The universal "Layout & style" group (L454-617) renders iff `settings` includes `groupBy` or `conditionalFormats`.
  - Group-by is gated by `groupBy`.
  - Conditional colours are gated by `conditionalFormats`. The comment at L586 goes.
  - The separator after the group renders only with the group.
- The display group (L622-752) renders iff `settings` includes at least one of `columns`, `pageSize` or `density`.
  - Its label is always `toolbar.settings.display`. The table/display switch at L624 goes, because the label must not
    depend on the type.
  - Visible columns are gated by `columns`, rows by `pageSize`, density by `density`, each still also requiring its
    props as today.
- Delete stays universal.
- No two separators may end up adjacent.

`use-content-toolbar.ts` needs no change. It already reads the active `UserViewInstance`.

### Task 10 — Modals lose the kanban dialog (`content-management`)

**`ContentListModals.tsx`.**
- Delete the `CardConfigDialog` import (L10), the props `activeViewType`, `cardConfigOpen`, `onCloseCardConfig`,
  `cardConfig` and `onSaveCardConfig` (L18-22), and the block at L87-95.
- Type `onSaved?: (info: ViewEntrySavedInfo) => void`.

**`use-content-list-modals.ts`.** Delete `cardConfigOpen`/`setCardConfigOpen` (L52, L145-146).

### Task 11 — The workspace as harness host (`pages/content-view-workspace.tsx`)

Keep the props interface (L28-45), the export handling (L54-69), `initial` (L50), `useContentListModals` (L52),
`useContentListQuery` (L71), `useViewConfigAutosave` (L116), the `toolbarViews` override and the toolbar props that are
not listed below.

Replace:
- `conditionalFormats`/`kanbanConfig`/`cardConfig` states (L72-74) and `useContentTableConfig` (L76-93) with
  `const layout = useViewLayoutState(initial, seed)`;
- the autosave `config` memo (L95-115). It reads the same fields from `layout` (groupBy, dateGroupPrecision,
  columnVisibility, density, conditionalFormats, kanban, card) plus `query` as today;
- the kanban block (L118-125) and `NOOP_DENSITY_CHANGE`/`EMPTY_KANBAN_CONFIG` (L24-26): delete them.

New harness state:
- `definition = viewRegistry.get(view.type)`, read once.
- `configDialogOpen` (`useState(false)`).
- A ref holding a `Set` of saved-listeners, plus:
  - `subscribeSaved`: a stable callback that adds a listener and returns a function deleting it;
  - an `onSaved` handler that calls every listener with the info.
- `entries`: a memo over the `modals` handlers, selection, and `subscribeSaved`.

Toolbar props from `layout`:
- `columnVisibility`/`setColumnVisibility`, `groupBy`/`setGroupBy`;
- `dateGroupPrecision`/`setDateGroupPrecision`;
- `density`/`setDensity`, for every type (no NOOP);
- `handleConditionalFormatsChange` calls `layout.setConditionalFormats`.
- `renderSettingsSection` is defined iff `definition.SettingsSection` exists. It renders that component with `seed`,
  `layout`, `onClose = close` and `onOpenConfigDialog = () => setConfigDialogOpen(true)`.

Toolbar children:
- `query.error` → the existing error box (L183-187);
- else, `definition` → `<definition.Renderer …ViewRendererProps />`;
- else → the error box with `t("content.views.errors.loadFailed")`. An unregistered type is a programming error, and
  the registry test guards against it.

`ContentListModals` gets `onSaved={handleSaved}` and none of the deleted props.

After this task, the file contains no `view.type ===` comparison. The only remaining use of `view.type` is the
`toContentViewConfig(…, view.type)` argument and the registry lookup.

### Task 12 — Pages

- `content-list.tsx`:
  - import `viewRegistry` from `"./view-registry"` (L22);
  - `switcherViews` (L101-110) adds `settings: viewRegistry.get(view.type)?.settings ?? DEFAULT_VIEW_SETTINGS`;
  - nothing else changes. The `view.type === "table"` checks at L115/L143/L257 implement the domain rule "Table always
    has an instance", not rendering.
- `drafts-list.tsx:295-301`: the single view gets `settings: DEFAULT_VIEW_SETTINGS`. That preserves today's
  table-branch menu.

### Task 13 — Tests

All files: SPDX header, four zones, one act per `it()`, no `any`, no fake timers. Dashboard double quotes.

**`test/cross-slice/view-registry.test.ts`.** Unit tier, under cross-slice because it imports three slices through the
page root. Fixture: none (pure registry).
- `it`: every `DashboardView` (`table`, `gallery`, `kanban`) resolves to a definition with a `Renderer` component (driven
  from an array, Rule 1.6).
- `it`: every definition enables the `transfer` tool (moved from the deleted bootstrap test).
- `it`: gallery enables the `settings` tool (moved).
- `it`: settings capability lists are Table = all five, Gallery = `groupBy` + `pageSize`, Kanban = none.
- `it`: only Kanban contributes a `SettingsSection`.

**`features/content-views/test/unit/use-view-layout-state.test.ts`.** Unit, `renderHook`. Fixture: canonical `posts`
from `@beechcms/testing` (copy the lookup at `view-config-mapping.test.ts:11`). Base state built like that file's
`baseState` helper.
- `it`: hydrates groupBy, conditional formats, kanban and card from the initial state unchanged.
- `it`: with `columnVisibility` undefined, hides exactly `id`, `slug` and `created_at` (posts has no metadata json
  branch).
- `it`: with `density` and `kanban` undefined, yields `DEFAULT_DENSITY` and `{ axisBranchId: null, sort: null }`.
- `it`: grouping by `title` (non-date) after a day-precision initial state resets `dateGroupPrecision` to
  `DEFAULT_DATE_GROUP_PRECISION`.

**`lib/dynamic-columns.test.tsx`** (add a `describe("defaultHiddenColumns")`). Unit.
- `it`: canonical `posts` → `["id", "slug", "created_at"]`.
- `it`: a json branch whose alias contains `metadata` is appended after the system columns. Fixture: `posts` plus one
  json branch. Comment why: the canonical set has no json branch (Rule 6.2.1).

**`features/content-kanban/test/unit/kanban-settings-section.test.tsx`.** Unit; render inside an open `DropdownMenu`.
Fixture: canonical `posts` with `allowDrafts: false`. Add a comment: drafts make a seed kanban-incompatible, and with
them off `tags` (`br_07`) is the only axis candidate.
- `it`: lists the seed's axis candidates under group-by (shows "Tags").
- `it`: picking "Tags" calls `layout.setKanban` with `axisBranchId: "br_07"`, `sort: null`, `hiddenColumnValues: []`,
  and calls `onClose`.
- `it`: renders nothing for canonical `posts` as-is (drafts enabled → no candidates).
- `it`: "Configure card layout" calls `onOpenConfigDialog` and `onClose`.

**`features/content-kanban/test/unit/kanban-view-renderer.test.tsx`.** Unit; `QueryClientProvider` wrapper.
Fixture: canonical `posts`. It is kanban-incompatible, so `ContentKanban` renders its notice and fetches nothing.
- `it`: with `configDialog.open` true, renders the card-layout dialog. Closing it calls `configDialog.onOpenChange(false)`.
- `it`: subscribes exactly one saved-listener on mount, across re-renders.
- `it`: unmounting calls the unsubscribe that `subscribeSaved` returned.

**`features/content-toolbar/test/unit/settings-menu.test.tsx`.** Rewrite the helper as
`renderSettingsMenu(settings, overrides)` (overrides add `showSort`, `renderSettingsSection`, delete props). Keep the
two delete cases unchanged.
- `it`: with all five settings, shows Group, Conditional colors, Visible columns, Rows and Density under "Display".
- `it`: with `["groupBy", "pageSize"]`, hides Conditional colors, Visible columns and Density, and keeps Group and Rows.
- `it`: with `[]` and no section, shows neither "Layout & style" nor "Display".
- `it`: renders the node returned by `renderSettingsSection`, whose `close` calls `closeSettingsMenu`.
- `it`: hides the Sort submenu when `showSort` is false.

**`features/content-toolbar/test/unit/content-toolbar.test.tsx`.** Add `settings` to its `UserViewInstance` fixtures.
- `it` (new): children render inside the `[data-slot="view-viewport"]` element.

**`view-switcher.test.tsx`, `use-content-toolbar.test.ts`.** Add `settings` to the `UserViewInstance` literals only.
No case changes.

**`test/cross-slice/content-list.test.tsx`.**
- Add `defaultHiddenColumns: () => ["id", "slug", "created_at"]` to the `@/lib/dynamic-columns` mock (L122-126).
- `it` (new): switching to the Gallery instance unmounts the table renderer (`DATA_TABLE` gone) and mounts the gallery
  renderer. Assert on the gallery's empty-state text for the mocked empty list; the executor reads it from
  `content-gallery.tsx:125-135`.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run in order:

1. `apps/dashboard/`: `pnpm run type-check`, then `pnpm test`.
2. Repo root: `pnpm lint`.
3. Repo root: `pnpm beech test --diff`.
4. No rendering branch on the type outside the composition root and the Table-guarantee rule:
   `git grep -nE 'activeViewType|view\.type === ' -- apps/dashboard/src/pages/content-view-workspace.tsx apps/dashboard/src/features/content-toolbar apps/dashboard/src/features/content-management`
   gives no output.
5. Kanban props are gone from the toolbar and the pages:
   `git grep -nE 'kanbanCandidates|kanbanAxisBranch|onKanbanConfigChange|onOpenCardConfig|resolveKanbanColumns|NOOP_DENSITY_CHANGE' -- apps/dashboard/src/features/content-toolbar apps/dashboard/src/pages`
   gives no output.
6. Slice isolation:
   - `git grep -nE '@/features/content-(gallery|kanban|management|views)' -- apps/dashboard/src/features/content-toolbar`
     gives no output;
   - `git grep -n '@/features/content-kanban' -- apps/dashboard/src/features | grep -v '^apps/dashboard/src/features/content-kanban/'`
     gives no output;
   - `git grep -nE '@/features/content-' -- apps/dashboard/src/features/shared` gives no output.
7. Old registry is gone: `git grep -nE 'view-registry\.bootstrap|registerContent(Gallery|Kanban)View' -- apps/dashboard/src`
   gives no output.
8. Graph sync: `graphify update . --force`.
9. Runtime check (`pnpm beech dev`, seed `posts`, plus a kanban-compatible seed without drafts if one is present
   locally):
   - Table renders, with the settings menu showing Group, Conditional colours, Visible columns, Rows and Density under
     "Display".
   - A Gallery instance shows Group and Rows only.
   - A Kanban instance shows its own layout block. "Configure card layout" opens the dialog, and saving it persists
     after a reload.
   - Editing an entry from the Kanban board moves its card to the new column without a reload.
   - The three types sit in the same content margins under the toolbar.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `ViewDefinition` carries `settings`, `Renderer` and an optional `SettingsSection`, and every contract type in
      Task 1 is exported verbatim from `features/shared/view-registry.ts`. That file imports no `@/features/*` module.
- [ ] `pages/view-registry.ts` is the only module that imports Table, Gallery and Kanban definitions. It registers all
      three `DashboardView` types, and `main.tsx` has no registry import.
- [ ] `ContentViewWorkspace` renders `definition.Renderer` with `ViewRendererProps` and contains no `view.type ===`
      comparison (Validation step 4).
- [ ] `SettingsMenu` has no `activeViewType` prop. Its blocks are gated only by `settings`, `showSort` and the section
      slot. Its display group label is always "Display".
- [ ] The Kanban layout block lives in `content-kanban` and behaves as before: axis pick closes the menu, column toggles
      keep it open, and "Configure card layout" opens the dialog.
- [ ] `CardConfigDialog` is rendered only by `KanbanViewRenderer`. `ContentListModals` imports nothing from
      `content-kanban`.
- [ ] An entry-editor save reaches the Kanban sync through `subscribeSaved`. There is exactly one subscription per
      mounted renderer.
- [ ] `useContentTableConfig` holds no persisted state (`groupBy`, precision, visibility, density). `useViewLayoutState`
      owns it, with the same defaults as before.
- [ ] Every View Type renders inside `[data-slot="view-viewport"]`. No renderer root sets outer margins or width.
- [ ] Gallery no longer shows the inert Density control. Every other visible setting per type is unchanged.
- [ ] No core, API, migration, permission or locale file is in the diff.
- [ ] All new and edited tests follow `_config/testing_conventions.md`:
  - tier and placement as listed in Task 13;
  - SPDX header, four zones, one act, a named act result;
  - no `any`, no fake timers;
  - canonical `posts` fixture, or a one-field delta of it with its reason commented.
- [ ] Validation steps 1–8 pass. Step 9 is done, or reported as not done.
- [ ] `git diff --stat` touches no file outside SECTION 3.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- **§5 `UniversalElementFormatting`** (roadmap §5) is not part of this sprint:
  - the Element contract;
  - moving `getRowStyles`/conditional-format evaluation out of `useContentTableConfig`;
  - conditional formats on Gallery/Kanban cards;
  - adding `conditionalFormats` to the Gallery/Kanban `settings` lists.
- **§6 `GalleryEntryEditorUnification`** (roadmap §6) is not part of this sprint: `GalleryPeekPanel` removal and the
  cover-image default layout. `ContentGallery` internals are untouched; only the adapter is new.
- No new View Type and no runtime behaviour for `RESERVED_VIEW_TYPES`.
- No change to `toContentViewConfig`'s kanban/card persistence rule (`view-config-mapping.ts:221-224`) or to any mapping
  function.
- The moved precision-reset effect keeps its current behaviour. It also resets precision when grouping by the
  `created_at`/`updated_at` system columns (they have no branch). Fixing that is a separate bug, not part of this
  move.
- The hardcoded `metadata`/`metadati` alias heuristic in `defaultHiddenColumns` is moved, not redesigned.
- `drafts-list.tsx` keeps its fixed single table-like view. It does not use the registry.
- No keyboard or a11y rework of the settings menu, and no new locale key.
- `ContentListModals`' remaining cross-slice composition (entry editor, delete, bulk edit, automations, transfer)
  stays as it is. Only the kanban edge is removed, because it is the type branch this sprint eliminates.
- `D1ContentViewRepository`, every `/views` route, `permission.middleware.ts` and `packages/core` are not touched.
