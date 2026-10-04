# Sprint: UniversalElementFormatting

Sprint 5 of 6 of **Saved Views** (roadmap: `backlog/ROADMAP.md`). Sprints 1–4 (`ContentViewsPersistence`,
`ViewInstancesDashboard`, `ViewSwitcherRedesign`, `ViewHarnessContract`) are archived in `docs/Sprints/` with PASS
verdicts.

After Sprint 4, every View Type renders through `ViewDefinition.Renderer`, and the persisted per-view state lives in
`useViewLayoutState`. Conditional formatting is still a Table-only feature, though:
- rule evaluation lives inside `useContentTableConfig` (`use-content-table-config.ts:56-147`) and returns Tailwind
  classes for a `<tr>`/`<td>`, so no other renderer can reuse it;
- the dashboard rule speaks Table vocabulary (`target: "row" | "cell"`), while the persisted rule is already view-neutral
  (`element | field`, `packages/core/src/dashboard-layout/content-view.ts:83`). `view-config-mapping.ts:142,200`
  translates between the two;
- Gallery and Kanban cards ignore the rules, and only `TABLE_VIEW_DEFINITION.settings` lists `conditionalFormats`.

This sprint defines the harness **Element contract**: one pure evaluator turns the instance's rules into a semantic
`ElementFormat` (tone + text styles for the whole element and per field), and the workspace hands every renderer the
same `formatElement`. Each renderer only maps that format to its own visuals: row/cell for Table, card surface/card slot
for Gallery and Kanban. The rule vocabulary becomes `element | field` end to end, and the conditional-colours editor is
enabled for all three View Types. Dashboard only: no core, API, migration or permission change.

> **Precondition.** Sprints 1–4 are still uncommitted in the working tree of `feature/content-views-persistence`
> (`git status`: `features/content-views/`, `pages/view-registry.ts`, `*-view-renderer.tsx`, …). The executor starts
> from a tree where all four are committed. It does not re-implement any of their files beyond the edits in SECTION 3.

---

### Pre-Computation Analysis

Graph rebuilt at planning time with `graphify update . --force`: 24 624 nodes, 36 525 edges, 2 292 communities.

**a) God nodes on the path of this sprint (degree from `graphify explain`)**

| Node | Source | Degree | Role here |
|---|---|---|---|
| `useContentToolbar()` | `features/content-toolbar/use-content-toolbar.ts:17` | 18 | Not edited. It already feeds the editor from `activeView.conditionalFormats` for any View Type. |
| `matchesFilterGroupStrict()` | `lib/filter-dsl.ts:407` | 9 | The evaluator's one matcher, reused unchanged. |
| `ContentKanban()` | `features/content-kanban/components/content-kanban.tsx:163` | 9 | Threads `formatElement` to its columns and to the optimistic incoming card. |
| `ContentViewWorkspace()` | `pages/content-view-workspace.tsx:37` | 9 | Compiles the formatter once per rule set and passes it to the renderer. |
| `ContentGallery()` | `features/content-gallery/content-gallery.tsx:70` | 8 | Threads `formatElement` to `useContentGallery`. |
| `toViewToolbarState()` | `features/content-views/lib/view-config-mapping.ts:103` | 7 | The target translation is removed (pass-through). |
| `GalleryCard()` | `features/content-gallery/gallery-components/gallery-card.tsx:31` | 6 | Applies the card and slot styles. |
| `useConditionalFormats()` | `features/content-toolbar/toolbar-hooks/use-conditional-formats.ts:22` | 5 | The new-rule default target becomes `element`. |
| `KanbanCard()` | `features/content-kanban/components/kanban-card.tsx:55` | 4 | Applies the card and slot styles. |
| `ContentTableView()` | `features/content-management/components/ContentTableView.tsx:66` | 4 | Its `getRowStyles` prop contract is unchanged. |

**b) Architectural boundaries affected**

- `@beechcms/core`: none. `VIEW_FORMAT_TARGETS = ['element', 'field']` is already the persisted vocabulary.
- `apps/api`: none.
- `apps/dashboard`:
  - `lib/conditional-format.ts`: Element contract types, `compileElementFormatter`, `getConditionalFormatCardClass`.
    The target type becomes `"element" | "field"`.
  - `lib/filter-dsl.ts`: receives `getEntryValueForColumn` (moved out of `content-management`, so that `lib` never
    imports a slice).
  - `features/shared/view-registry.ts`: `ViewRendererProps.formatElement`.
  - `pages/content-view-workspace.tsx`: compiles and passes the formatter.
  - `features/content-management`: the table renderer maps format → row/cell classes. `useContentTableConfig` loses
    evaluation. `use-content-list-query.ts` imports the moved helper.
  - `features/content-gallery`: display model + card + hook + renderer. `conditionalFormats` is added to `settings`.
  - `features/content-kanban`: display model + card + column query + board + renderer. `conditionalFormats` is added to
    `settings`.
  - `features/content-toolbar`: target rename in `shared.ts`, `use-conditional-formats.ts` and
    `conditional-formats-editor.tsx` (labels).
  - `features/content-views/lib/view-config-mapping.ts`: target pass-through.
  - `locales/en.json`, `locales/it.json`: two keys renamed.

**c) `graphify affected` impact analysis**

```
$ graphify affected "ConditionalFormatRule" --depth 2
- use-content-table-config.ts, content-toolbar/shared.ts (UserViewInstance), conditional-formats-editor.tsx,
  settings-menu.tsx, use-conditional-formats.ts, content-toolbar/types.ts (ContentToolbarProps),
  view-config-mapping.ts (ViewToolbarState), features/shared/view-registry.ts (ViewLayout), content-list.tsx,
  content-view-workspace.tsx, content-table-renderer.tsx, use-content-toolbar.ts, barrels, filter-pills-bar.tsx,
  filter-condition-input.tsx, view-switcher.tsx (type re-use only)
$ graphify affected "useContentTableConfig()" --depth 2
- content-table-renderer.tsx / ContentTableRenderer(), content-list.tsx, content-view-workspace.tsx, App.tsx
$ graphify affected "ViewRendererProps" --depth 2
- gallery-view-renderer.tsx, kanban-view-renderer.tsx, kanban-view-renderer.test.tsx, content-table-renderer.tsx,
  the three slice barrels
$ graphify affected "buildGalleryCardDisplayModel()" --depth 2
- use-content-gallery.ts, content-gallery.tsx, gallery-card-display.test.ts, use-content-gallery.test.ts, barrels
$ graphify affected "buildKanbanCardDisplayModel()" --depth 2
- content-kanban.tsx / KanbanColumnConnected(), use-kanban-column-query.ts, use-kanban-drag.ts / getCardsFromCache(),
  test/unit/kanban-card-display.test.ts, utils/kanban-card-display.test.ts, kanban-view-renderer.tsx, barrel
$ graphify affected "getEntryValueForColumn()" --depth 2
- use-content-table-config.ts, content-list-hooks.test.ts, content-table-renderer.tsx, content-management/index.ts
$ graphify affected "normalizeConditionalTarget()" --depth 2
- use-conditional-formats.ts, shared.test.ts, use-conditional-formats.test.ts, use-content-toolbar.ts
$ graphify affected "useKanbanColumnQuery()" --depth 2
- content-kanban.tsx / KanbanColumnConnected(), kanban-view-renderer.tsx, barrel
```

Breaking-change verdict:
- **`ConditionalFormatTarget` changes from `"cell" | "row"` to `"element" | "field"`.** The type-checker finds every
  producer and comparison. The production sites are `shared.ts:101-103`, `use-conditional-formats.ts:100`,
  `conditional-formats-editor.tsx:235-253,340-355`, `view-config-mapping.ts:142,200` and the legacy branches in
  `use-content-table-config.ts:94-111` (deleted). The test fixtures are `shared.test.ts:43-45`,
  `use-conditional-formats.test.ts:67,84`, `use-view-layout-state.test.ts:36` and
  `view-config-mapping.test.ts:101-117`. Persisted data is untouched, because the API already stores
  `element | field`.
- **`ViewRendererProps` gains a required `formatElement`.** Its producer is the workspace. The fixture is
  `kanban-view-renderer.test.tsx` (`renderWithClient` props).
- **`UseContentTableConfigOptions.layout` drops `"conditionalFormats"`, and the return drops `getRowStyles`.** The only
  caller is `content-table-renderer.tsx`. No test imports the hook.
- **`getEntryValueForColumn` leaves `@/features/content-management`.** Callers: `use-content-list-query.ts:198` (same
  file today), `use-content-table-config.ts:27` (import deleted), and `content-list-hooks.test.ts:8`. That test's
  describe block moves to `lib/filter-dsl.test.ts`.
- **`buildGalleryCardDisplayModel` / `buildKanbanCardDisplayModel` gain an optional trailing `format` parameter.**
  Existing calls stay valid. `getCardsFromCache` (`use-kanban-drag.ts:57`) builds models for reorder math only, and
  stays unformatted on purpose.
- **Display models gain optional fields only.** Every existing model literal in the tests stays valid.
- **The `toolbar.conditionalFormats.cell` / `.row` keys are renamed.** Their only reader is
  `conditional-formats-editor.tsx:241,254`.

`graphify path "content-gallery.tsx" "content-management/index.ts"` resolves only through `pages/content-list.tsx`.
Gallery and Kanban do not reach `content-management` today, and this sprint keeps it that way: the evaluator and
`getEntryValueForColumn` live in `lib/`.

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

1. **YAGNI.**
   - *Vetoed in planning:* an `Element` React component or render-prop wrapper. Each renderer already owns its element
     markup (`<tr>` via `DataTableRow`, the `<button>` of each card). A wrapper would fight three different DOM shapes.
     The contract is data (`ElementFormat`), not a component.
   - *Vetoed in planning:* evaluating inside each card component. Kanban models are "computed once at fetch"
     (`content-kanban/types.ts:13`), and the gallery builds models in one memo. The format is computed where the model
     is built and travels on the model, so the cards stay pure.
   - *Vetoed in planning:* a per-View-Type rule editor or per-type rule targets. The brief requires one semantics with a
     different visual mapping. The existing editor is reused unchanged except for its two labels.
   - *Vetoed in planning:* formatting the cover image, the gallery category folder card and the drag-overlay
     placeholder. A tone has no meaning on an image, and folders and ghosts are not entries.
   - *Approved:* renaming the dashboard target to `element | field`. "Row"/"Cell" labels in a Gallery settings menu
     would contradict brief §2. The rename also deletes a translation layer in `view-config-mapping.ts`.
   - *Approved:* moving `getEntryValueForColumn` into `lib/filter-dsl.ts`. The shared evaluator needs it, and leaving
     it in `content-management` would force `lib → slice` or `gallery/kanban → content-management` imports.
2. **Botanical invariant.**
   - No D1 access and no core change.
   - Rules stay alias-keyed in the dashboard. They cross the alias ↔ `br_XX` boundary only in `view-config-mapping.ts`,
     unchanged apart from the target pass-through.
   - Card slots are matched to rules by the slot's branch alias, read from the seed (`branch.alias`), never from a
     hardcoded field name. `status` is the system column id the table already uses (`getEntryValueForColumn`).
3. **VSA.**
   - `lib/conditional-format.ts` imports `@/lib/filter-dsl` and a type from `@/lib/dynamic-columns`.
   - `features/shared` gains one type import from `@/lib`.
   - Gallery, Kanban and Management import the contract only from `@/lib/conditional-format` and `@/features/shared`.
   - New slice → slice edges: none. The `content-management`-internal import of `getEntryValueForColumn` goes away.
4. **Cloudflare purity.** Dashboard only. No binding, no migration, no background work.
5. **Minimal blueprint.**
   - No new production file: the contract, the evaluator and the card class extend `lib/conditional-format.ts`.
   - 1 new test file, for the table adapter.
   - Every other change is an edit to an existing file.

No violation remains. HANDOFF -> caveman_coder

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Brief §1 asks the harness to standardise an "Element" concept (row in Table, card in Gallery/Kanban), so that
cross-cutting properties stop being Table-only. Brief §2 asks that a rule mean the same thing (tone, text style) on a
Table row, a Gallery card and a Kanban card, with only the visual mapping changing. Its user story asks for conditional
colours on rows, on cards, and on a specific field inside them.

Sprint 4 built what this needs:
- one renderer props contract, to carry the formatter;
- `useContentTableConfig` reduced to table-derived state;
- a `settings` list where "editor available for every type" is a one-entry change per definition.

It has to land before §6 `GalleryEntryEditorUnification`, which rewrites `content-gallery.tsx` and the gallery
card's surroundings (peek panel removal). Doing §5 first keeps the card-styling diff isolated and reviewable.

**VSA.**
- The evaluator and the Element contract are pure `lib/` code next to the existing rule type and class builders.
- The renderer prop is a type in `features/shared`.
- Each slice maps the semantic format to its own markup.
- The page workspace is the single place that compiles the formatter.
- No slice imports another.

**Botanical Engine.**
- Nothing new is persisted, and the persisted rule shape (`viewConditionalFormatSchema`) is unchanged.
- The dashboard rule now uses the persisted target names, so the mapping only renames refs, as it does for every other
  field.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Rule model (`lib/conditional-format.ts`).**
- `ConditionalFormatTone` (`:7-12`), `ConditionalFormatTarget = "cell" | "row"` (`:14`) and
  `ConditionalFormatTextStyle` (`:15`).
- `ConditionalFormatRule { id, enabled, priority, label?, columnId, group: ToolbarFilterGroup, tone, target,
  textStyles? }` (`:17-30`).
- `getConditionalFormatRowClass` (`:42-62`) gives a 12% tint plus hover per tone. `getConditionalFormatCellClass`
  (`:64-85`) gives tone text colour plus `forceBadgeInheritClass`, which recolours nested `[data-slot=badge]`. Both
  apply text styles through the private `getTextStylesClass` (`:32-40`).

**Evaluation today (`features/content-management/hooks/use-content-table-config.ts`).**
- `conditionalRules` (`:86-92`): keeps enabled rules and sorts them by ascending `priority`. `Array.prototype.sort` is
  stable, so ties keep array order.
- `rowRules` (`:94-99`): target `row` (or the legacy `cell+row`). The first match wins.
- `cellRulesByColumnId` (`:101-111`): every non-`row` target, grouped by `columnId`. The first match per column wins.
- The value comes from `getEntryValueForColumn(entry, rule.columnId)` (`use-content-list-query.ts:50-55`: `id`/`slug`/
  `status` from the top level, everything else from `entry.data[columnId]`). Groups of type `tags` get a `JSON.parse`
  of string values (null on failure), cached per `entryId::columnId` (`:56-84`).
- Output: `getRowStyles(entry) → { rowClassName?, cellClassNameByColumnId }` (`:113-147`). It is consumed by
  `ContentTableView` (`ContentTableView.tsx:40`), which hands it to `DataTableRow` (`data-table-row.tsx:59`).

**Harness (`features/shared/view-registry.ts`).**
- `ViewSetting` (`:22`) and `ViewLayout` (`:45-60`, with `conditionalFormats`/`setConditionalFormats`).
- `ViewRendererProps` (`:87-97`: `seed, slug, query, layout, entries, isSaving, configDialog`).
- `ViewDefinition.settings` (`:112`).

**Workspace (`pages/content-view-workspace.tsx`).**
- `layout = useViewLayoutState(initial, seed)` (`:62`).
- `toolbarViews` injects `layout.conditionalFormats` into the active switcher instance (`:87-90`), and
  `handleConditionalFormatsChange` writes back (`:91-94`). The editor therefore already works for any View Type that
  lists `conditionalFormats`.
- The renderer is mounted at `:179-187`.

**Settings gating (`toolbar-components/settings-menu.tsx`).**
- `showLayoutGroup = settings.includes("groupBy") || settings.includes("conditionalFormats")` (`:155`).
- The editor sub-menu sits at `:490-520`.
- Definitions today:
  - Table: `["groupBy", "conditionalFormats", "columns", "pageSize", "density"]` (`content-table-renderer.tsx:82`);
  - Gallery: `["groupBy", "pageSize"]` (`gallery-view-renderer.tsx:26`);
  - Kanban: `[]` (`kanban-view-renderer.tsx:53`).

**Target vocabulary.**
- `normalizeConditionalTarget` (`content-toolbar/shared.ts:101-103`): `"cell"` → cell, else row.
- New-rule default `target: "row"` (`use-conditional-formats.ts:100`).
- Editor toggle and preview (`conditional-formats-editor.tsx:227-256` and `:336-357`).
- Mapping `field ↔ cell`, `element ↔ row` (`view-config-mapping.ts:142` and `:200`).
- Locale keys `toolbar.conditionalFormats.cell` / `.row`: en "Cell"/"Row", it "Cella"/"Riga".

**Gallery.**
- `useContentGallery(seed, data, groupBy)` (`gallery-hooks/use-content-gallery.ts:32`) builds `cardModels` in one memo
  (`:53-56`) through `buildGalleryCardDisplayModel(entry, branches, t, language)` (`gallery-card-display.ts:103`).
- Slots come from `resolveCardFields` (`resolve-card-fields.ts:20`): `titleBranch`, `excerptBranch`, `dateBranch`,
  `tagsBranch`, `coverBranch`, `categoryBranch`.
- `GalleryCard` (`gallery-card.tsx:31`):
  - surface `GALLERY_CARD_SURFACE_CLASS` (`:41`, `bg-card border border-border`, `gallery-card-surface.ts:11-19`);
  - status and pending badges wrapper (`:69`);
  - title `h3` (`:96`), excerpt `p` (`:105`), date `div` (`:116`), `TagChips` (`:125`).
- `ContentGallery` props: `features/content-gallery/types.ts:9-18`.

**Kanban.**
- Models are built per page in `useKanbanColumnQuery` (`hooks/use-kanban-column-query.ts:48-52`). Each one is built
  from `{ ...item, data: localize(seed, item.data) }` through `buildKanbanCardDisplayModel(entry, axisBranch,
  columnValue, seed?, card?)` (`utils/kanban-card-display.ts:31`).
- The optimistic incoming card is rebuilt from a patched cached item (`components/content-kanban.tsx:80`).
- Slots `media/header/subtitle/metadata` are `ResolvedSlotField { branch, value }` (`types.ts:4-11`). The legacy path
  (no card config) shows `title` (heuristic key, `kanban-card-display.ts:44`) and `statusBadge`.
- `KanbanCard` (`components/kanban-card.tsx:55`):
  - button surface `bg-card border` (`:70`);
  - slot wrappers: header `p` (`:82`), subtitle `p` (`:87`), metadata value `span` (`:96`), status `span` (`:104`);
  - legacy title `p` (`:124`), legacy status `span` (`:126`).
- `ColumnProps` (`content-kanban.tsx:22-39`) and `ContentKanbanProps` (`types.ts:56-70`).

**Utilities.** `cn` = `twMerge(clsx(...))` (`lib/utils.ts:4-6`), so a later class of the same group overrides an earlier
one. Tailwind is v4 (`apps/dashboard/package.json:120`).

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Dashboard only. No core, API, migration, permission or seed file.

**Edit (production)**
- `apps/dashboard/src/lib/conditional-format.ts`
- `apps/dashboard/src/lib/filter-dsl.ts`
- `apps/dashboard/src/features/shared/view-registry.ts`
- `apps/dashboard/src/pages/content-view-workspace.tsx`
- `apps/dashboard/src/features/content-management/hooks/use-content-table-config.ts`
- `apps/dashboard/src/features/content-management/hooks/use-content-list-query.ts`
- `apps/dashboard/src/features/content-management/components/content-table-renderer.tsx`
- `apps/dashboard/src/features/content-gallery/gallery-card-display.ts`
- `apps/dashboard/src/features/content-gallery/gallery-hooks/use-content-gallery.ts`
- `apps/dashboard/src/features/content-gallery/gallery-components/gallery-card.tsx`
- `apps/dashboard/src/features/content-gallery/content-gallery.tsx`
- `apps/dashboard/src/features/content-gallery/types.ts`
- `apps/dashboard/src/features/content-gallery/gallery-view-renderer.tsx`
- `apps/dashboard/src/features/content-kanban/types.ts`
- `apps/dashboard/src/features/content-kanban/utils/kanban-card-display.ts`
- `apps/dashboard/src/features/content-kanban/hooks/use-kanban-column-query.ts`
- `apps/dashboard/src/features/content-kanban/components/content-kanban.tsx`
- `apps/dashboard/src/features/content-kanban/components/kanban-card.tsx`
- `apps/dashboard/src/features/content-kanban/components/kanban-view-renderer.tsx`
- `apps/dashboard/src/features/content-toolbar/shared.ts`
- `apps/dashboard/src/features/content-toolbar/toolbar-hooks/use-conditional-formats.ts`
- `apps/dashboard/src/features/content-toolbar/toolbar-components/conditional-formats-editor.tsx`
- `apps/dashboard/src/features/content-views/lib/view-config-mapping.ts`
- `apps/dashboard/src/locales/en.json`, `apps/dashboard/src/locales/it.json`

**Create (tests)**
- `apps/dashboard/src/features/content-management/test/unit/content-table-renderer.test.ts`

**Edit (tests)**
- `apps/dashboard/src/lib/conditional-format.test.ts`
- `apps/dashboard/src/lib/filter-dsl.test.ts`
- `apps/dashboard/src/features/content-management/test/unit/content-list-hooks.test.ts`
- `apps/dashboard/src/features/content-gallery/test/unit/gallery-card-display.test.ts`
- `apps/dashboard/src/features/content-gallery/test/unit/gallery-card.test.tsx`
- `apps/dashboard/src/features/content-kanban/test/unit/kanban-card-display.test.ts`
- `apps/dashboard/src/features/content-kanban/test/unit/kanban-card.test.tsx`
- `apps/dashboard/src/features/content-kanban/test/unit/kanban-view-renderer.test.tsx`
- `apps/dashboard/src/features/content-toolbar/test/unit/shared.test.ts`
- `apps/dashboard/src/features/content-toolbar/test/unit/use-conditional-formats.test.ts`
- `apps/dashboard/src/features/content-views/test/unit/view-config-mapping.test.ts`
- `apps/dashboard/src/features/content-views/test/unit/use-view-layout-state.test.ts`
- `apps/dashboard/src/test/cross-slice/view-registry.test.ts`

**Delete:** none.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — Element contract and pure evaluator (`lib/conditional-format.ts`, `lib/filter-dsl.ts`)

Approach: extend the module that already owns the rule type and the class builders. Reason: it is the only place every
renderer slice may import, and it keeps rule semantics in one file.

**`lib/filter-dsl.ts`:** move `getEntryValueForColumn` here unchanged, from `use-content-list-query.ts:50-55`, with
the same signature. Add a type-only import of `ContentEntry` from `@/lib/dynamic-columns`. In
`use-content-list-query.ts`, delete the function and import it from `@/lib/filter-dsl` (still used at `:198`).
`content-management/index.ts` therefore stops re-exporting it. That is intended, and nothing outside the slice used it.

**`lib/conditional-format.ts`: exact building blocks.**

```ts
export type ConditionalFormatTarget = "element" | "field"

/** What a matching rule assigns. Same meaning on a table row, a gallery card and a kanban card. */
export interface ElementStyle {
  readonly tone: ConditionalFormatTone
  readonly textStyles: readonly ConditionalFormatTextStyle[]
}

/** Evaluated conditional formatting of one Element (table row, gallery card, kanban card). */
export interface ElementFormat {
  /** Winning `element` rule, or null when none matches. */
  readonly element: ElementStyle | null
  /** Winning `field` rule per column id (branch alias or system column). A missing key means no match. */
  readonly fields: Readonly<Record<string, ElementStyle>>
}

/** The harness Element contract: entry in, semantic format out. */
export type ElementFormatter = (entry: ContentEntry) => ElementFormat

export const NO_ELEMENT_FORMAT: ElementFormat
export const NO_ELEMENT_FORMATTER: ElementFormatter

export function compileElementFormatter(rules: readonly ConditionalFormatRule[]): ElementFormatter
export function getConditionalFormatCardClass(
  tone: ConditionalFormatTone,
  textStyles?: readonly ConditionalFormatTextStyle[]
): string
```

Update the `ConditionalFormatRule.columnId` doc comment: the column the condition reads, and the field highlighted
when `target` is `field`. `getConditionalFormatRowClass`/`getConditionalFormatCellClass` keep their signatures. Widen
their `textStyles` parameter to `readonly ConditionalFormatTextStyle[]`, so an `ElementStyle` passes straight through.

**`compileElementFormatter`: rules.**
- Compile once:
  - keep `enabled` rules only;
  - sort by ascending `priority` (missing → 0) with a stable sort, so ties keep input order;
  - split by `target`;
  - group the `field` rules by `columnId`.
- The returned function evaluates one entry:
  - `element` is the style of the first matching `element` rule, or `null`;
  - `fields[columnId]` is the style of the first matching `field` rule on that column.
  - An `element` rule and a `field` rule on the same column are independent: both can apply.
- Matching: `matchesFilterGroupStrict(value, rule.group)`, where `value = getEntryValueForColumn(entry, rule.columnId)`.
  - When `rule.group.type === "tags"` and the value is a string, the value is `JSON.parse`d first. A parse failure
    gives `null`.
  - Parse each `(entry, columnId)` at most once per evaluation, with a local map inside the call. There is no
    cross-call cache, because the old ref cache existed only to survive React re-renders.
- Style: `{ tone: rule.tone, textStyles: rule.textStyles ?? [] }`.
- No enabled rule → the compiled function returns `NO_ELEMENT_FORMAT` (the same frozen reference) for every entry and
  allocates nothing.
- Pure: no React and no module state. It never throws on malformed values. The same rules and entry give an equal
  `ElementFormat`.
- `NO_ELEMENT_FORMAT` is `Object.freeze({ element: null, fields: Object.freeze({}) })`. `NO_ELEMENT_FORMATTER` always
  returns it.
- The legacy `"cell+row"` handling is not carried over. Targets are normalised on input (Task 6).

**`getConditionalFormatCardClass`: exact classes.** The card stays opaque. The tint is a background image layered over
the card's own `bg-card`, never a background colour that replaces it. The border colour carries the tone. There are no
hover classes, because the card owns its hover. Text styles are appended with `getTextStylesClass`.

| tone | border | tint |
|---|---|---|
| `success` | `border-emerald-500/50` | `bg-linear-to-b from-emerald-500/12 to-emerald-500/12` |
| `warning` | `border-amber-500/50` | `bg-linear-to-b from-amber-500/12 to-amber-500/12` |
| `danger` | `border-destructive/50` | `bg-linear-to-b from-destructive/12 to-destructive/12` |
| `info` | `border-sky-500/50` | `bg-linear-to-b from-sky-500/12 to-sky-500/12` |
| `neutral` / default | `border-muted-foreground/30` | `bg-linear-to-b from-muted/50 to-muted/50` |

Field styles on cards use `getConditionalFormatCellClass` unchanged. Its badge-inherit rule is what recolours the
status and tag badges.

### Task 2 — Harness prop and workspace (`features/shared/view-registry.ts`, `pages/content-view-workspace.tsx`)

Approach: the workspace compiles the formatter once, and every renderer receives it. Reason: one evaluation path for
all View Types, so no renderer reads `layout.conditionalFormats` directly.

Add to `ViewRendererProps`, after `layout`:

```ts
  /** Evaluates the instance's conditional formats for one Element. Renderers map the result to their own visuals. */
  readonly formatElement: ElementFormatter
```

Import `ElementFormatter` as a type from `@/lib/conditional-format`. In the workspace, memoise
`compileElementFormatter(layout.conditionalFormats)` on `layout.conditionalFormats`, and pass it as `formatElement` at
`:179-187`. The rule edits already flow into `layout.conditionalFormats` (`:91-94`), so the cards restyle as the user
edits.

### Task 3 — Table maps the format (`content-table-renderer.tsx`, `use-content-table-config.ts`)

Approach: the adapter from `ElementFormat` to the existing `getRowStyles` contract lives in the table renderer.
`useContentTableConfig` keeps only table-derived state. Reason: `ContentTableView`/`DataTableRow` stay untouched, and
evaluation leaves the hook as the roadmap requires.

Export from `content-table-renderer.tsx`:

```ts
export interface TableRowStyles {
  rowClassName?: string
  cellClassNameByColumnId: Record<string, string | undefined>
}
export function toTableRowStyles(format: ElementFormat): TableRowStyles
```

- `format.element` → `rowClassName = getConditionalFormatRowClass(tone, textStyles)`. With `null`, `rowClassName` is
  `undefined`.
- Each `format.fields[columnId]` → `getConditionalFormatCellClass(tone, textStyles)`. With no fields, the map is `{}`.
- The renderer passes `getRowStyles = (entry) => toTableRowStyles(formatElement(entry))`, memoised on `formatElement`.
  It replaces `tableConfig.getRowStyles` at `:50`.

In `use-content-table-config.ts`:
- delete `tagsParseCacheRef`, its effect, `getCachedValueForGroupType`, `conditionalRules`, `rowRules`,
  `cellRulesByColumnId` and `getRowStyles` (`:56-147`), plus their imports (`conditional-format`, `matchesFilterGroupStrict`,
  `FilterGroupType`, `getEntryValueForColumn`);
- narrow `layout` to `Pick<ViewLayout, "groupBy" | "setGroupBy" | "dateGroupPrecision">`;
- drop `getRowStyles` from the return.

Every other line is unchanged.

### Task 4 — Gallery applies the format

Approach: build the format into the display model next to the other per-entry fields. The card only maps styles to
classes. Reason: models are already built in one memo, and the card stays a pure function of its model.

`gallery-card-display.ts`:

```ts
export type GalleryCardSlot = "status" | "title" | "excerpt" | "date" | "tags"
```

Add to `GalleryCardDisplayModel`:

```ts
  /** Element-level conditional format. Absent when no `element` rule matches. */
  elementStyle?: ElementStyle
  /** Field-level conditional format per visible slot. Present only for slots whose column matched a `field` rule. */
  slotStyles?: Partial<Record<GalleryCardSlot, ElementStyle>>
```

Add a fifth optional parameter `format: ElementFormat = NO_ELEMENT_FORMAT` to `buildGalleryCardDisplayModel`. Rules:
- `elementStyle` is `format.element`, omitted when `null`.
- Slot → column id:
  - `status` → `"status"`;
  - `title` → `branches.titleBranch.alias`;
  - `excerpt` → `branches.excerptBranch.alias`;
  - `date` → `branches.dateBranch.alias`;
  - `tags` → `branches.tagsBranch.alias`.
- A slot whose branch is `null` never gets a style. A slot appears in `slotStyles` only when `format.fields[columnId]`
  exists. `slotStyles` is omitted when empty.
- Cover and category get no style (VETO Audit).

`use-content-gallery.ts`:
- add a fourth parameter `formatElement: ElementFormatter = NO_ELEMENT_FORMATTER`;
- pass `formatElement(entry)` into the builder inside the `cardModels` memo (`:53-56`);
- add `formatElement` to its deps.

`types.ts` (`ContentGalleryProps`): add `readonly formatElement?: ElementFormatter`. `content-gallery.tsx` forwards it
to `useContentGallery`. `gallery-view-renderer.tsx` passes `formatElement={formatElement}`. Its definition's
`settings` becomes `["groupBy", "conditionalFormats", "pageSize"]`.

`gallery-card.tsx`:
- the button class becomes `cn(GALLERY_CARD_SURFACE_CLASS, elementStyle && getConditionalFormatCardClass(...))`;
- each slot style becomes `getConditionalFormatCellClass(...)` on the element that wraps that slot's value: the
  status-badge wrapper (`:69`), title `h3` (`:96`), excerpt `p` (`:105`), date `div` (`:116`), and `TagChips`
  `className` (`:125`).
- Merge with `cn` so the tone text colour wins over `text-foreground`/`text-muted-foreground`.
- The pending-draft badge shares the status wrapper and takes the status style with it. That is accepted, since both
  describe the status.

### Task 5 — Kanban applies the format

Approach: same as Gallery. The format is computed where the model is built (column query and optimistic incoming card)
and travels on the model. Reason: Kanban models are built once per fetch (`types.ts:13`), and the card stays pure.

`types.ts`:

```ts
export interface ResolvedSlotField { branch: Branch; value: unknown; style?: ElementStyle }
```

Add to `KanbanCardDisplayModel`:

```ts
  /** Element-level conditional format. Absent when no `element` rule matches. */
  elementStyle?: ElementStyle
  /** Field format of the legacy-path title (no card config). */
  titleStyle?: ElementStyle
  /** Field format of the status badge (`status` system column). */
  statusStyle?: ElementStyle
```

Add a sixth optional parameter `format: ElementFormat = NO_ELEMENT_FORMAT` to `buildKanbanCardDisplayModel`. Rules:
- `elementStyle` is `format.element` (omitted when `null`).
- Each resolved slot gets `style = format.fields[branch.alias]` (omitted when absent).
- `statusStyle` is `format.fields.status`.
- `titleStyle` is `format.fields[titleKey]`, where `titleKey` is the legacy heuristic key (`:44`). When there is no key,
  there is no style.
- The axis-slot value override (`:59-61`) does not change the evaluation. The format is evaluated on the entry the
  model is built from.

`use-kanban-column-query.ts`:
- add a trailing parameter `formatElement: ElementFormatter = NO_ELEMENT_FORMATTER`;
- build the localised entry once per item, and pass it both to the builder and to `formatElement(entry)`.

`content-kanban.tsx`:
- `ContentKanbanProps` (`types.ts:56`) gains `formatElement?: ElementFormatter`, and `ColumnProps` (`:22`) gains
  `formatElement: ElementFormatter`.
- `ContentKanban` forwards it to every `KanbanColumnConnected` (`:276-302`), defaulting to `NO_ELEMENT_FORMATTER`.
- The column passes it to `useKanbanColumnQuery` (`:46`) and to the incoming-card build (`:80`), which evaluates the
  patched item. A card moved across columns is therefore styled on its new axis value while pending.
- The same-column pending branch (`:108-125`) keeps the card's existing styles.

`getCardsFromCache` (`use-kanban-drag.ts:57`) is not touched. Its models feed reorder math only.

`kanban-view-renderer.tsx`: passes `formatElement`. Its definition's `settings` becomes `["conditionalFormats"]`.

`kanban-card.tsx`:
- The button class gains `getConditionalFormatCardClass(...)` when `elementStyle` is set. Merge with `cn`, so the tone
  border wins over the default `border`.
- `getConditionalFormatCellClass(...)` goes on the slot wrappers: header `p` (`:82`), subtitle `p` (`:87`), metadata
  value `span` (`:96`), status `span` (`:104` and legacy `:126`), and legacy title `p` (`:124`).
- `media` gets no style.
- The `isPending` opacity stays.

### Task 6 — One rule vocabulary in the toolbar and the mapping

Approach: the dashboard rule uses the persisted targets. Reason: one meaning everywhere, and the mapping stops
translating.

- `content-toolbar/shared.ts:101-103`: `normalizeConditionalTarget` returns `"field"` for `"field"` and `"element"` for
  anything else.
- `use-conditional-formats.ts:100`: a new rule defaults to `target: "element"`.
- `conditional-formats-editor.tsx`:
  - toggle (`:227-256`): the first button sets `"field"` with label `toolbar.conditionalFormats.field`. The second sets
    `"element"` with label `toolbar.conditionalFormats.element`.
  - preview (`:336-357`): `"element"` uses the row class and `"field"` the cell class, as today under the old names.
- `view-config-mapping.ts:142` and `:200`: `target: rule.target` in both directions (the two types are now identical).
- Locales, under `toolbar.conditionalFormats`:
  - delete `cell` and `row`;
  - add `field`: en `"Field"`, it `"Campo"`;
  - add `element`: en `"Whole item"`, it `"Intero elemento"`.

  No other key changes. Leave the unrelated `"row"` key at `it.json:1780` alone.

### Task 7 — Tests

Every file follows `_config/testing_conventions.md` (SPDX header, one tier, four zones, no `any`, no fake timers). Quote
style: double quotes in the dashboard, except files already in single quotes (`kanban-card.test.tsx`), which keep
theirs.

Fixtures:
- **Seed:** canonical `posts` from `CANONICAL_SEEDS` in `@beechcms/testing`. Aliases: `title` text `br_01`, `body`
  richtext `br_02`, `view_count` number `br_05`.
- **Entries:** `ContentEntry` objects built from `CANONICAL_ENTRIES[0]`:
  - `data.title` "Canonical Post", `status` "published";
  - `id` is a fixed UUIDv4-format literal (production format, Rule 3.6);
  - one documented delta per test, for example `status: "draft"`.
- **Rules:** literal `ConditionalFormatRule` objects. They are the subject's input, so they are not an entity shape the
  canonical set covers.

**`lib/conditional-format.test.ts`** (unit, existing; add `describe("compileElementFormatter")` and
`describe("getConditionalFormatCardClass")`):
- with no enabled rule, it returns the `NO_ELEMENT_FORMAT` reference for any entry;
- the first matching `element` rule by ascending priority wins, and a disabled higher-priority rule is ignored;
- equal priorities resolve by input order;
- `field` rules resolve per column and leave `element` null when no element rule matches;
- an `element` rule and a `field` rule on the same column both apply;
- a `status` rule reads the entry's top-level status, not `data.status`;
- a `tags` group parses a JSON string value, and an unparsable string is treated as null without throwing;
- a rule without `textStyles` yields a style with an empty `textStyles` array;
- the card class carries the border and tint of each tone from the Task 1 table, and the text-style classes (one matrix
  `it()`);
- the card class contains no `hover:` and no plain `bg-<colour>` utility, so `bg-card` is never overridden.

**`lib/filter-dsl.test.ts`** (unit, existing): add `describe("getEntryValueForColumn")` with the two cases moved
verbatim from `content-list-hooks.test.ts:13-37`. That file loses the block and its import.

**`features/content-management/test/unit/content-table-renderer.test.ts`** (unit, new, `// @vitest-environment node`):
- an element style becomes `rowClassName` equal to `getConditionalFormatRowClass` for that tone and text styles;
- field styles become one `cellClassNameByColumnId` entry per column, equal to `getConditionalFormatCellClass`;
- `NO_ELEMENT_FORMAT` gives `rowClassName` undefined and an empty map.

**`features/content-gallery/test/unit/gallery-card-display.test.ts`** (unit, existing; add cases):
- a format with `fields.title` and `fields.status` sets `slotStyles.title` and `slotStyles.status` on the posts entry;
- a field style on a column no slot displays (`view_count`) adds no slot style;
- `format.element` becomes `elementStyle`;
- without a format argument, the model has neither `elementStyle` nor `slotStyles`.

**`features/content-gallery/test/unit/gallery-card.test.tsx`** (unit, existing; add cases):
- an `elementStyle` puts the tone's card border class on the card button;
- a `slotStyles.title` puts the tone's cell text class on the title heading and not on the excerpt.

**`features/content-kanban/test/unit/kanban-card-display.test.ts`** (unit, existing; add cases; card config with
`header` = `br_01`):
- the header slot carries the style of `fields.title`;
- `statusStyle` comes from `fields.status`;
- legacy path (no card config): `titleStyle` comes from the field of the heuristic title key;
- without a format argument, neither slots nor model carry a style.

**`features/content-kanban/test/unit/kanban-card.test.tsx`** (unit, existing; add cases):
- an `elementStyle` puts the tone's card border class on the button;
- a header slot style puts the tone's cell text class on the header line.

Mechanical fixture edits (no new `it()`):
- `kanban-view-renderer.test.tsx`: pass `formatElement: NO_ELEMENT_FORMATTER` in the props.
- `shared.test.ts:43-45`: the expectations become `"field"`→`"field"`, `"element"`→`"element"`, `"other"`→`"element"`.
  Update the `it()` name if it names the old values.
- `use-conditional-formats.test.ts:67,84` and `use-view-layout-state.test.ts:36`: `target: "row"` → `"element"`.
- `view-config-mapping.test.ts:101-117`: replace the case with "passes element and field targets through unchanged
  in both directions". It checks both `toContentViewConfig` and `toViewToolbarState` on the same two rules.
- `test/cross-slice/view-registry.test.ts:30-33`:
  - name: "settings capability lists: table has all five, gallery groupBy, conditionalFormats and pageSize, kanban
    conditionalFormats";
  - expectations updated to match.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run in order:

1. `apps/dashboard/`: `pnpm run type-check`, then `pnpm test`.
2. Repo root: `pnpm lint`.
3. Repo root: `pnpm beech test --diff`.
4. Evaluation lives only in the shared evaluator:
   `grep -rnE 'matchesFilterGroupStrict|getConditionalFormat(Row|Cell)Class' apps/dashboard/src/features/content-management/hooks`
   gives no output.
5. Old vocabulary is gone:
   `grep -rnE 'target: ?"(row|cell)"|=== "(row|cell)"|cell\+row|conditionalFormats\.(cell|row)' apps/dashboard/src`
   gives no output.
6. Slice isolation:
   - `grep -rnE '@/features/content-(management|toolbar|views|kanban)' apps/dashboard/src/features/content-gallery`
     gives no output;
   - `grep -rnE '@/features/content-(management|toolbar|views|gallery)' apps/dashboard/src/features/content-kanban`
     gives no output;
   - `grep -nE '@/features/' apps/dashboard/src/lib/conditional-format.ts apps/dashboard/src/lib/filter-dsl.ts`
     gives no output.

   (Plain `grep`, not `git grep`: it must also see files that are not committed yet.)
7. Graph sync: `graphify update . --force`.
8. Runtime check (`pnpm beech dev`, seed `posts`, plus a kanban-compatible seed without drafts if one is present
   locally):
   - On a Table instance, add a rule "Status equals draft", apply to "Whole item", tone Warning: draft rows tint amber.
   - Switch the same rule to "Field": only the status cell turns amber.
   - On a Gallery instance, the settings menu shows "Conditional colors". The same two rules tint the draft cards'
     surface and then only the status badge. Reload, and the rules persist.
   - On a Kanban instance, the settings menu shows "Conditional colors" next to its layout block. A "Whole item" rule
     tints matching cards, and a "Field" rule on the header branch colours only the header line.
   - Two instances of the same type keep independent rules.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `ElementStyle`, `ElementFormat`, `ElementFormatter`, `NO_ELEMENT_FORMAT`, `NO_ELEMENT_FORMATTER`,
      `compileElementFormatter` and `getConditionalFormatCardClass` are exported from `lib/conditional-format.ts`
      exactly as in Task 1. That module imports no `@/features/*`.
- [ ] `ConditionalFormatTarget` is `"element" | "field"`. No dashboard file compares a target against `"row"`/`"cell"`
      (Validation step 5).
- [ ] `compileElementFormatter` keeps the old evaluation order: enabled rules only, ascending priority, ties in input
      order, first match per element and per field column. It is pure and never throws.
- [ ] `ViewRendererProps.formatElement` is required, and the workspace compiles it once per `layout.conditionalFormats`
      value.
- [ ] `useContentTableConfig` contains no rule evaluation and returns no `getRowStyles`. Table rows and cells look as
      before for the same rules.
- [ ] Gallery cards show the element tint and border, and per-slot field colours, for status, title, excerpt, date and
      tags.
- [ ] Kanban cards show the element tint and border, and field colours, on the header, subtitle, metadata values and
      status. The legacy path styles the title and status.
- [ ] Cards stay opaque: the card class never replaces `bg-card`.
- [ ] Gallery `settings` is `["groupBy", "conditionalFormats", "pageSize"]`, and Kanban `settings` is
      `["conditionalFormats"]`. The editor opens and edits rules on all three View Types, and edits persist through the
      existing autosave.
- [ ] The editor labels read "Field" / "Whole item" (it: "Campo" / "Intero elemento"). The `cell`/`row` keys are gone
      from both locales.
- [ ] `getEntryValueForColumn` lives in `lib/filter-dsl.ts`, and no file imports it from `content-management`.
- [ ] No core, API, migration, permission or seed file is in the diff.
- [ ] All new and edited tests follow `_config/testing_conventions.md`.
- [ ] Validation steps 1–7 pass, and the step 8 runtime walk is done or its absence is logged with the reason.
- [ ] `git diff --stat` for this sprint touches no file outside SECTION 3.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- **§6 `GalleryEntryEditorUnification`** (roadmap §6) is not part of this sprint: `GalleryPeekPanel` /
  `gallery-peek-*` removal, routing card clicks to `modals.handleEdit`, and the core `generateDefaultLayout`
  cover-image section. The peek panel gets no formatting.
- No formatting on the gallery cover image, the gallery category folder card, the kanban media slot, the drag-overlay
  placeholder or the `getCardsFromCache` reorder models.
- No change to the persisted rule shape (`viewConditionalFormatSchema`), to `validateViewConfigAgainstSeed`, or to any
  core/API file. The target rename is dashboard-only, because the API already stores `element | field`.
- No new rule capability: no "hide element" or visibility rules (discarded by brief §5), no new tones, text styles,
  operators or per-type targets.
- No redesign of the conditional-formats editor beyond the two labels and their values. `CONDITIONAL_TONE_OPTIONS`'
  hardcoded Italian labels stay as they are.
- No change to `ContentTableView`, `DataTableRow` or the `getRowStyles` prop contract.
- `drafts-list.tsx` keeps its fixed table-like view with `conditionalFormats: []`.
- No change to the Kanban settings section, the card-config dialog, kanban persistence, or `toContentViewConfig`'s
  kanban/card rule.
- The duplicate `features/content-kanban/utils/kanban-card-display.test.ts` is left as is. Only the `test/unit/`
  copy gains cases.
- `D1ContentViewRepository`, every `/views` route, `permission.middleware.ts` and `packages/core` are not touched.
