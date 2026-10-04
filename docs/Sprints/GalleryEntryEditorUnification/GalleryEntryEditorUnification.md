# Sprint: GalleryEntryEditorUnification

Sprint 6 of 6 of **Saved Views** (roadmap: `backlog/ROADMAP.md`). Sprints 1–5 (`ContentViewsPersistence`,
`ViewInstancesDashboard`, `ViewSwitcherRedesign`, `ViewHarnessContract`, `UniversalElementFormatting`) are archived in
`docs/Sprints/` with PASS verdicts.

After Sprint 5, every View Type renders through `ViewDefinition.Renderer` and receives the same `entries` actions
(`ViewEntryActions`, `features/shared/view-registry.ts`). Table rows and Kanban cards call `entries.handleEdit`, which
navigates to `/content/:slug/:id`, and the workspace opens the shared `EntryEditorDialog` with
`readonly={!can("content:update", …)}` (`pages/content-view-workspace.tsx:219`). Gallery is the exception:
- a card click calls `setPeekId` (`content-gallery.tsx:142,179`), and the slice renders its own read-only dialog,
  `GalleryPeekPanel` (`gallery-components/gallery-peek-panel.tsx`), with a parallel field renderer, its own tags/SEO
  tabs and its own `content:update` gate on an "Edit" button;
- only the "Edit" button inside that dialog reaches `onEdit` → `entries.handleEdit`.

Brief §2 requires one Entry Editor for every View Type, with no parallel read/edit UI. Brief §4 requires the default
editor layout to give a single cover image its own full-width section at the top when the seed has no custom layout.
Today `generateDefaultLayout` (`packages/core/src/dashboard-layout/seed-layout.ts:246`) isolates only richtext, json
and gallery (`multiple` / `asset-list`) file branches.

This sprint deletes the peek panel and its helpers, routes gallery card clicks straight to `entries.handleEdit`, and adds
the cover-image rule to the core default-layout generator. There is no API, migration, permission or seed change.

> **Precondition.** Sprints 1–5 are still uncommitted in the working tree of `feature/content-views-persistence`
> (Sprint 5 `review_report.md`, findings 1–2). The executor starts from a tree where all five are committed. It does
> not re-implement any of their files beyond the edits in SECTION 3. `fix/gallery-categories-review` is already an
> ancestor of `HEAD` (verified with `git merge-base --is-ancestor`), so the roadmap's other precondition is met.

---

### Pre-Computation Analysis

Graph rebuilt at planning time with `graphify update . --force`: 24 639 nodes, 36 619 edges, 2 296 communities.

**a) God nodes on the path of this sprint (degree from `graphify explain`)**

| Node | Source | Degree | Role here |
|---|---|---|---|
| `ContentViewWorkspace()` | `pages/content-view-workspace.tsx:37` | 9 | Not edited. It already builds `entries.handleEdit` from `modals.handleEdit` (L114) and passes `readonly` to `ContentListModals` (L219). |
| `ContentGallery()` | `features/content-gallery/content-gallery.tsx:70` | 8 | Loses the peek panel. Cards call `onEdit` directly. |
| `GalleryCard()` | `features/content-gallery/gallery-components/gallery-card.tsx:32` | 8 | Not edited. Its `onOpen(entryId)` contract (L21, L40) is reused as is. |
| `useContentListModals()` | `features/content-management/hooks/use-content-list-modals.ts:10` | 6 | Not edited. `handleEdit` (L56-61) keeps `location.search`, so the open gallery folder (`?album=`) survives the editor. |
| `generateDefaultLayout()` | `packages/core/src/dashboard-layout/seed-layout.ts:246` | 4 | Gains the cover-image section. |
| `useContentGallery()` | `features/content-gallery/gallery-hooks/use-content-gallery.ts:33` | 4 | Loses the peek state. |
| `buildSectionsForBranches()` | `packages/core/src/dashboard-layout/seed-layout.ts:207` | 3 | Not edited. It still lays out every non-cover branch. |

**b) Architectural boundaries affected**

- `@beechcms/core`: `dashboard-layout/seed-layout.ts` (generator only) and its test. No exported signature changes.
- `apps/api`: none. The API never calls `generateDefaultLayout` (it is consumed only by `seed-layout.ts` itself and by
  the dashboard `entry-editor` slice).
- `apps/dashboard`:
  - `features/content-gallery`: `content-gallery.tsx`, `gallery-hooks/use-content-gallery.ts`, and their tests are
    edited. Peek files are deleted, and one renderer test is added.
  - `features/content-management/hooks/use-content-list.ts`: one stale comment.
  - `locales/en.json`, `locales/it.json`: the peek-only `gallery.*` keys are removed.
- Docs: `docs/features/editorial-views.md` (one bullet).

**c) `graphify affected` impact analysis**

```
$ graphify affected "generateDefaultLayout()" --depth 2
- seed-layout.test.ts [imports], validateLayoutAgainstSeed() [calls]   (seed-layout.ts:L278)
$ graphify affected "GalleryPeekPanel()" --depth 2
- content-gallery.tsx, gallery-view-renderer.tsx, content-gallery/index.ts, pages/content-list.tsx,
  test/unit/content-gallery.test.tsx
$ graphify affected "useContentGallery()" --depth 2
- content-gallery.tsx / ContentGallery(), test/unit/use-content-gallery.test.ts, gallery-view-renderer.tsx,
  content-gallery/index.ts, pages/content-list.tsx, test/unit/content-gallery.test.tsx, pages/content-view-workspace.tsx
$ graphify affected "ContentGallery()" --depth 2
- gallery-view-renderer.tsx, content-gallery/index.ts, pages/content-list.tsx, pages/content-view-workspace.tsx,
  test/unit/content-gallery.test.tsx, pages/view-registry.ts, App.tsx
$ graphify affected "getPeekEntryTitle()" --depth 2
- gallery-peek-panel.tsx / GalleryPeekPanel(), gallery-peek-title.ts, content-gallery/shared.ts,
  test/unit/gallery-peek-title.test.ts, content-gallery.tsx
```

The graph does not resolve package imports of `@beechcms/core`. A direct grep for `generateDefaultLayout` adds four
dashboard callers: `entry-editor/hooks/use-entry-editor-dialog.tsx:280`, `entry-editor/builder/use-layout-builder.ts:395`,
`entry-editor/builder/layout-builder-dialog.tsx:65` and `entry-editor/builder/builder-pane.tsx:61`. All four call it
only when `seed.layout` is absent, or on an explicit builder reset, so they pick up the new default on purpose. No
dashboard test asserts a default layout for a seed with an image `file` branch (grep for `accept: 'image'` in
`apps/dashboard/**/*.test.*` finds only `display-media`/`edit-media`, which do not call the generator).

Breaking-change verdict:
- **`ContentGalleryProps` is unchanged.** `onEdit` keeps its type. It is now called on card click instead of from the
  peek "Edit" button.
- **`UseContentGalleryResult` drops `peekId`, `setPeekId` and `peekEntry`.** Its only consumer is `ContentGallery`.
  The fixtures that read them are `use-content-gallery.test.ts:38-76,98` and the hook mock in
  `content-gallery.test.tsx:42`.
- **`features/content-gallery/shared.ts` is deleted.** No file imports it (`grep -rn "content-gallery/shared"` is
  empty). It is not part of the slice's public `index.ts`.
- **`generateDefaultLayout(seed, opts?)` keeps its signature.** Output changes only for seeds with exactly one main
  image `file` branch. `validateLayoutAgainstSeed` calls it only as a fallback for a structurally broken layout, and
  still returns a valid layout.
- **Locale keys removed:** `gallery.mainContent`, `.content`, `.seo`, `.status`, `.noContent`, `.edit`, `.cover`,
  `.loadingPreview`, `.missingUpdatePermission` and `gallery.tags.*`. Their only readers are the deleted files.
  `locales.test.ts` asserts only `rbac.*` keys.

`graphify path "ContentGallery()" "EntryEditorDialog()"` resolves only through `pages/content-list.tsx` (2 hops). The
gallery slice never reaches `entry-editor`, and this sprint keeps it that way: the gallery hands an entry id to the
harness callback, and the page-level composition opens the editor.

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

1. **YAGNI.**
   - *Vetoed in planning:* keeping the peek panel as an optional "quick look" next to the editor. Brief §2 forbids a
     parallel read UI.
   - *Vetoed in planning:* a new `entries.handleView` / `onOpenEntry` callback on `ViewEntryActions`. Table and Kanban
     already open entries through `handleEdit`, and the editor shell already decides read-only from permissions. A
     second callback would duplicate one path.
   - *Vetoed in planning:* a `content:update` check inside the gallery. Read-only is decided once, by the workspace
     (`content-view-workspace.tsx:219`) and `useEntryEditorDialog` (`isReadOnly`, `use-entry-editor-dialog.tsx:235`).
     The route `/content/:slug/:id` (`App.tsx:225`) is guarded only by `ProtectedRoute` (authentication), so users
     without `content:update` reach the editor in read-only mode, as they do from Table and Kanban.
   - *Vetoed in planning:* adding the cover image to `FULL_WIDTH_BRANCH_TYPES` / `isFullWidthBranch`. That would make
     the validator and the Layout Builder force isolation on every image field in custom layouts. The brief asks only
     for a default-generation rule.
   - *Vetoed in planning:* exporting a new `isCoverImageBranch` predicate from core. It has one caller, the generator,
     so it stays module-private.
   - *Approved:* deleting `gallery-detail-branches.ts`, `gallery-detail-tags.tsx`, `gallery-richtext-readonly.tsx`,
     `gallery-peek-title.ts` and the dead `shared.ts` barrel. Each is reachable only from the peek panel or from the
     unused barrel.
2. **Botanical invariant.** No D1 access is added or changed. The generator places fields by Branch ID
   (`{ branchId: branch.id }`), as `buildSectionsForBranches` already does. The cover rule reads branch metadata
   (`type`, `multiple`, `format`, `fileOptions.accept`), never an alias name. No hardcoded field names: the canonical
   `posts.image` qualifies because of its `fileOptions.accept: 'image'`, not because of its alias.
3. **VSA.**
   - `features/content-gallery` imports nothing new. Removing the peek panel also removes its
     `@/features/shared/hooks/use-permissions` import, which leaves the slice with no permission logic.
   - The editor stays owned by `features/entry-editor`, and is reached only through `pages/content-view-workspace.tsx`
     → `ContentListModals`.
   - The core change stays inside `dashboard-layout/seed-layout.ts`.
4. **Cloudflare purity.** No runtime or storage change.
5. **Minimal blueprint.** One core function edit, plus one test block. Two dashboard files are edited, seven are deleted
   (five source files, two tests), and one test file is added. There are also locale and doc edits. No new module.

No violation found. HANDOFF -> caveman_coder.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

This is the last sprint of the series. It closes the two remaining brief requirements that the harness sprints left
out: one Entry Editor for every View Type (§2, user story 5), and the cover-image default layout (§2, §4).

It had to wait for Sprints 4–5. Both rewrote `content-gallery.tsx`, `use-content-gallery.ts` and the gallery
renderer, and the peek removal touches the same lines (`content-gallery.tsx:80,142,179`). It also had to wait for
`fix/gallery-categories-review`, which rewrote the folder flow in `content-gallery.tsx`. That branch is now in `HEAD`.

VSA: the gallery stops owning an entry UI and keeps only its rendering job (cards and folders). Opening an entry goes
through the harness contract every renderer already shares (`ViewRendererProps.entries.handleEdit`), so the editor stays
in its own slice and no slice imports another.

Botanical Engine: the default-layout rule lives in `@beechcms/core`, next to the existing full-width rules, so every
consumer (the editor dialog, the Layout Builder reset and the builder preview) gets the same layout from one pure
function. The layout references branches only by `br_XX`.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Entry opening, per View Type**
- Table: `content-table-renderer.tsx:48,100` → `entries.handleEdit`.
- Kanban: `kanban-view-renderer.tsx:29` → `onEdit={entries.handleEdit}`.
- Gallery: `gallery-view-renderer.tsx:15` passes `onEdit={entries.handleEdit}`, but `ContentGallery` wires the card
  click to `setPeekId` (`content-gallery.tsx:142,179`). It renders `GalleryPeekPanel` twice: once in the flat-grid
  branch (L143-149) and once after the folder UI (L224-230). `onEdit` is reached only through the panel's "Edit"
  button (`gallery-peek-panel.tsx:190-221`), which is disabled with a tooltip when `can('content:update', seed.slug)`
  is false (L92-93).
- `entries` is built in `content-view-workspace.tsx:112-126`. `handleEdit` = `modals.handleEdit`, which navigates to
  `/content/${slug}/${id}${location.search}` (`use-content-list-modals.ts:56-61`). `handleDialogClose` returns to
  `/content/${slug}${location.search}` (L22-26), which keeps `?album=` and `?view=`.
- `ContentListModals` renders `EntryEditorDialog` with `readonly` (`ContentListModals.tsx:102-113`). The workspace
  passes `readonly={!can("content:update", modals.target?.schemaSlug ?? "")}` (`content-view-workspace.tsx:219`).
  `useEntryEditorDialog` holds it in `isReadOnly` (`use-entry-editor-dialog.tsx:235-240`).
- Route `/content/:slug/:id` renders `ContentListPage` behind `ProtectedRoute` only (`App.tsx:225-231`).

**Gallery slice, peek-only material**

| File | Used by |
|---|---|
| `gallery-components/gallery-peek-panel.tsx` | `content-gallery.tsx:25` |
| `gallery-components/gallery-peek-sections.tsx` | peek panel |
| `gallery-components/gallery-richtext-readonly.tsx` | peek sections |
| `gallery-components/gallery-detail-tags.tsx` | peek panel |
| `gallery-detail-branches.ts` | peek panel, `shared.ts` |
| `gallery-peek-title.ts` | peek panel, `shared.ts` |
| `shared.ts` | nobody |
| `test/unit/gallery-peek-title.test.ts`, `test/unit/gallery-detail-branches.test.ts` | tests of the above |

Shared with the cards, and kept: `gallery-card-display.ts` (`resolveImageUrl`, `buildGalleryCardDisplayModel`),
`resolve-card-fields.ts`, `@/lib/tags-utils`, `@/lib/pending-draft`, `@/lib/sanitize-html` (also used by
`pages/test-fields.tsx`).

`useContentGallery` (`use-content-gallery.ts`) holds the peek state: the result fields at L18-20, `useState` at L40,
the `peekEntry` memo at L42-45, a reset effect at L47-51, and the return at L68-70. Card models, groups and
`categoryAlias` (L53-65) are unrelated to it.

**Default layout (core)**
- `FULL_WIDTH_BRANCH_TYPES = {'richtext','json'}` (`seed-layout.ts:85`), `isGalleryBranch` (L88-91: `file` +
  `multiple === true` or `format === 'asset-list'`), `isLayoutableBranch` (L102-107), `isFullWidthBranch` (L110-112),
  `isSeoBranch` (L115-117).
- `buildSectionsForBranches` (L207-244): it emits a full-width section shaped
  `{ id, label: branch.label, hideLabel: true, columns: [{ id, fields: [{ branchId }] }] }` (L223-228), and groups the
  other branches into sections of up to 3 one-field columns. When it ends with no sections, it pushes one empty
  placeholder section (L239-241).
- `generateDefaultLayout` (L246-268): it splits the layoutable branches into SEO and main, and returns
  `{ version: 1, tabs: [Data, SEO] }`. The Data tab id is minted before its sections.
- File semantics: `FileFieldOptions.accept?: FileAccept` (`engine/types.ts:56`), with
  `FileAccept = 'image' | 'document' | 'any'` (`media/file-types.ts:7`). The default is `'any'`
  (`resolveFileOptions`, `engine/validation/file-branch.ts:50-56`), and the type doc says `'any'` makes "no image render
  attempt".
- Canonical `posts` (`packages/testing/src/seeds/canonical.seeds.ts:43`) has
  `br_06 image: file, fileOptions.accept 'image'` as its only file branch, and `br_02 body: richtext`.
- `validateLayoutAgainstSeed` (L278-354) enforces isolation only for `isFullWidthBranch` fields. A lone image field
  in a one-column section is valid.
- Core suites cannot import `@beechcms/testing` (cycle), so they build their seeds with `defineSeed`
  (`content-view.test.ts:5,19-32`).

**Tests touching this surface**
- `content-gallery.test.tsx`: the hook mock returns `setPeekId`/`peekEntry` (L42), a `GalleryPeekPanel` mock (L50-52)
  and a `GalleryCard` mock that drops `onOpen` (L46-48, typed `any`).
- `use-content-gallery.test.ts`: three peek cases (L38-76) and a `peekEntry` assertion (L98).
- `seed-layout.test.ts`: `describe('generateDefaultLayout')` (L353-379), one json case.
- `kanban-view-renderer.test.tsx`: the pattern for a renderer test (`makeQuery`/`makeLayout`/`makeEntries`/
  `makeProps`, canonical `posts`).

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**Edit**
- `packages/core/src/dashboard-layout/seed-layout.ts`: the cover-image rule in `generateDefaultLayout`.
- `packages/core/src/dashboard-layout/seed-layout.test.ts`: new cases in `describe('generateDefaultLayout')`.
- `apps/dashboard/src/features/content-gallery/content-gallery.tsx`: no peek, card click → `onEdit`.
- `apps/dashboard/src/features/content-gallery/gallery-hooks/use-content-gallery.ts`: no peek state.
- `apps/dashboard/src/features/content-gallery/test/unit/content-gallery.test.tsx`
- `apps/dashboard/src/features/content-gallery/test/unit/use-content-gallery.test.ts`
- `apps/dashboard/src/features/content-management/hooks/use-content-list.ts`: the comment at L28 only.
- `apps/dashboard/src/locales/en.json`, `apps/dashboard/src/locales/it.json`
- `docs/features/editorial-views.md`: the bullet at L34.
- `stages/01_sprint_planning/output/backlog/ROADMAP.md` is already updated by planning. The executor does not touch it.

**Create**
- `apps/dashboard/src/features/content-gallery/test/unit/gallery-view-renderer.test.tsx`

**Delete**
- `apps/dashboard/src/features/content-gallery/gallery-components/gallery-peek-panel.tsx`
- `apps/dashboard/src/features/content-gallery/gallery-components/gallery-peek-sections.tsx`
- `apps/dashboard/src/features/content-gallery/gallery-components/gallery-richtext-readonly.tsx`
- `apps/dashboard/src/features/content-gallery/gallery-components/gallery-detail-tags.tsx`
- `apps/dashboard/src/features/content-gallery/gallery-detail-branches.ts`
- `apps/dashboard/src/features/content-gallery/gallery-peek-title.ts`
- `apps/dashboard/src/features/content-gallery/shared.ts`
- `apps/dashboard/src/features/content-gallery/test/unit/gallery-peek-title.test.ts`
- `apps/dashboard/src/features/content-gallery/test/unit/gallery-detail-branches.test.ts`

Nothing in `apps/api`, migrations, `permission.middleware.ts`, `features/entry-editor`, `features/shared`, `pages/`,
or `packages/testing` changes.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — Core: cover-image section in `generateDefaultLayout`

**Approach:** a module-private predicate plus a small pre-pass in `generateDefaultLayout`. `buildSectionsForBranches`
is not modified. This keeps the rule to default generation only, and leaves the validator and the Layout Builder's
full-width semantics alone.

File: `packages/core/src/dashboard-layout/seed-layout.ts`.

Predicate (not exported), placed next to `isGalleryBranch` (L87-91):

```ts
/** True for a single-file image branch: the candidate cover of the default editor layout. */
function isCoverImageBranch(branch: Branch): boolean
```

Rules:
- True iff `branch.type === 'file'`, `!isGalleryBranch(branch)` and `branch.fileOptions?.accept === 'image'`.
  An absent `accept` means `'any'`, which never qualifies (no image rendering is attempted for it).
- It reads metadata only, never an alias.

`generateDefaultLayout` behaviour (signature unchanged):
- Collect the cover candidates from `main` (the non-SEO layoutable branches) only. An image branch whose alias starts
  with `meta` stays in the SEO tab, where it is laid out as today.
- **Exactly one candidate:** the Data tab's sections become the cover section first, followed by the sections that
  `buildSectionsForBranches` builds from `main` without that branch.
  - The cover section has the same shape as a full-width section (copy `seed-layout.ts:223-228`):
    `label: branch.label`, `hideLabel: true`, one column holding one field `{ branchId: branch.id }`.
  - If the cover is the only main branch, the Data tab holds the cover section alone. Do not append the empty
    placeholder section that `buildSectionsForBranches([])` would produce.
- **Zero or two or more candidates:** the output is identical to today's, including the order in which ids are
  minted. With a deterministic `newId`, the JSON is byte-identical to the current implementation.
- Id minting order for the one-candidate case: the Data tab id, then the cover section id, then its column id, then the
  remaining Data sections, then the SEO tab. Same input + same `newId` sequence → same JSON.
- The remaining main branches keep their seed order. Only the cover moves to the top.
- The result passes `validateLayoutAgainstSeed` with `ok: true` for any seed that passed before.
- Add a one-paragraph JSDoc on `generateDefaultLayout` that states the three rules: full-width branches get their own
  sections, the other branches are packed three per section, and a single image file branch leads the Data tab. Typedoc
  publishes this JSDoc to `docs/api`.

### Task 2 — Gallery: card click opens the shared Entry Editor

File: `apps/dashboard/src/features/content-gallery/content-gallery.tsx`.

**Approach:** pass `onEdit` as the grid's `onOpen`. `GalleryCard` already calls `onOpen(model.entryId)`
(`gallery-card.tsx:40`), and `onEdit` is `entries.handleEdit` (`gallery-view-renderer.tsx:15`), which is the same path
Table and Kanban use.

- Remove the `GalleryPeekPanel` import (L25) and both renders (L143-149 and L224-230).
- `GalleryGrid` receives `onOpen={onEdit}` in the flat branch (L142) and inside an open folder (L179).
- The destructuring at L80 drops `setPeekId` and `peekEntry`.
- The flat branch returns the grid alone (the fragment is no longer needed). The folder branch keeps its fragment for
  the new-folder dialog.
- No permission logic is added. The editor decides read-only (`content-view-workspace.tsx:219`).
- Folder state survives the round trip unchanged: `handleEdit` and `handleDialogClose` both carry `location.search`, so
  `?album=` is kept.
- `ContentGalleryProps` (`types.ts`) is unchanged. Optionally, the `onEdit` field gets a one-line JSDoc: "Opens the
  entry in the shared Entry Editor (read-only without `content:update`)."

### Task 3 — Gallery hook: drop the peek state

File: `apps/dashboard/src/features/content-gallery/gallery-hooks/use-content-gallery.ts`.

Resulting exported interface (verbatim):

```ts
export interface UseContentGalleryResult {
  cardModels: GalleryCardDisplayModel[]
  /** Gruppi per categoria; vuoto se non c'è un "Raggruppa per" attivo (vista piatta). */
  categoryGroups: GalleryCategoryGroup[]
  /** Alias del campo scelto come "Raggruppa per", `null` se nessuno. */
  categoryAlias: string | null
}
```

- Delete the `useState` (L40), the `peekEntry` memo (L42-45), the reset effect (L47-51) and the three return fields
  (L68-70).
- The signature `useContentGallery(seed, data, groupBy, formatElement = NO_ELEMENT_FORMATTER)` is unchanged.

### Task 4 — Delete the peek material

Delete the nine files listed under SECTION 3 → Delete. The order does not matter. After deletion:
- `grep -rnE "gallery-peek|GalleryPeek|peekId|peekEntry|gallery-detail|GalleryDetailTags|GalleryRichtextReadonly|content-gallery/shared" apps/dashboard/src`
  is empty (Validation step 4).
- `features/content-gallery/index.ts` is unchanged (it never exported any of them).

### Task 5 — Locales

Files: `apps/dashboard/src/locales/en.json` and `apps/dashboard/src/locales/it.json`.

- Remove these keys under `gallery` from both files: `mainContent`, `content`, `seo`, `status`, `noContent`, `edit`,
  `cover`, `loadingPreview`, `missingUpdatePermission`, and the whole `tags` object.
- Keep `noItems`, `noItemsDesc`, `untitled`, `preview`, `imageUnavailable`, `openDetailAriaLabel`,
  `openDetailAriaLabelFallback` and `folders.*`. They are still read by `content-gallery.tsx`, `gallery-card.tsx`,
  `gallery-card-display.ts:134-135` and the folder components.
- Both files end with the same key set under `gallery`.

### Task 6 — Comment and docs

- `features/content-management/hooks/use-content-list.ts:28`: the comment says "Table, gallery cards and the gallery
  peek all render these items". It becomes "Table rows and gallery/kanban cards render these items". The rest of the
  comment is unchanged.
- `docs/features/editorial-views.md:34`: replace the "Peek Inspector" bullet with one bullet. It says that clicking a
  card opens the entry in the same Entry Editor that Table and Kanban use, and that users without `content:update` see
  it read-only.
- `docs/IP_PROVENANCE.md` is a historical record of verified files. It is not edited.

### Task 7 — Tests

All files follow `_config/testing_conventions.md`: SPDX header, `describe` names the subject, `it` states behaviour
and outcome, four zones, no `any`, no snapshots. Dashboard files use double quotes. Core files use single quotes. Edited
files keep their existing `it()` language (Italian in the gallery suites), and new files use English.

**7a. `packages/core/src/dashboard-layout/seed-layout.test.ts`** (unit, existing file, existing
`describe('generateDefaultLayout')`)
- Fixture: one local `defineSeed` (`import { defineSeed } from '../engine/seeds/define-seed.js'`) that mirrors the
  branch types of canonical `posts`: a title `text`, a `richtext` body, a `number`, and one
  `file` with `fileOptions: { accept: 'image' }`. Put the image after the body, so that "first" is observable.
  - Add a comment explaining why the fixture is local: the `@beechcms/testing` → `@beechcms/core` cycle, same wording
    as `content-view.test.ts:19-20`.
  - Variants are built by spreading that seed's `branches`. Malformed or edge shapes are allowed per Rule 3.5 because
    they feed rule boundaries.
- Deterministic ids: a local counter factory passed as `opts.newId` (`id-1`, `id-2`, …).
- Cases, one `it()` each:
  - `places a single image file branch alone in the first section of the Data tab`: the section's only field is the
    image `br_XX`, it has one column, and its `hideLabel` is `true`.
  - `keeps every other main branch after the cover section, in seed order`: the flattened field order of the remaining
    Data sections equals the seed order minus the image.
  - `does not lift a file branch without accept 'image'`: the image branch's `fileOptions` is removed (defaults to
    `'any'`). The file field sits in a packed compact section after the body section, not in section 0.
  - `leaves the layout unchanged when two image file branches exist`: two image branches; neither one occupies a
    dedicated first section, and both sit in the packed compact sections.
  - `does not treat a gallery file branch as a cover`: the image branch also has `multiple: true`. It gets the existing
    gallery full-width section in seed position (after the body section), not position 0.
  - `does not add an empty placeholder section when the cover is the only main branch`: a seed with only the image
    branch gives a Data tab with exactly one section.
  - `leaves an SEO image branch in the SEO tab`: the image alias is `meta_image`. The Data tab has no cover section, and
    the branch appears in the SEO tab.
  - `produces a layout that validateLayoutAgainstSeed accepts`: `ok` is `true` for the base fixture.
  - `is deterministic for the same seed and id sequence`: two calls with fresh counters are `toEqual`.

**7b. `apps/dashboard/src/features/content-gallery/test/unit/gallery-view-renderer.test.tsx`** (unit, new)
- Copy the scaffolding of `content-kanban/test/unit/kanban-view-renderer.test.tsx:21-99` (`makeQuery`, `makeLayout`,
  `makeEntries`, `makeProps`). Render inside `MemoryRouter`, because `ContentGallery` uses `useSearchParams`.
  QueryClient is not needed.
- Fixture: canonical `posts` from `CANONICAL_SEEDS`. One entry built from `CANONICAL_ENTRIES[0].data` with a UUIDv4
  literal id, plus a comment that production mints UUIDv4 ids. The real `GalleryCard` is used (no component mocks).
- `describe("GalleryViewRenderer")`:
  - `clicking a card calls entries.handleEdit with that entry id and renders no dialog of its own`: click the button
    named `Open detail: Canonical Post`. `handleEdit` is called once with the entry id, and `queryByRole("dialog")` is
    `null`.

**7c. `apps/dashboard/src/features/content-gallery/test/unit/content-gallery.test.tsx`** (unit, edit)
- Hook mock (L16-44): remove `setPeekId` and `peekEntry` from the returned object.
- Delete the `GalleryPeekPanel` mock (L50-52).
- `GalleryCard` mock (L46-48): it renders a `<button>` that calls `onOpen(model.entryId)`, and keeps the
  `data-testid`. Its props are typed inline (`{ model: { entryId: string; title: string }; onOpen: (id: string) => void }`).
  This removes the existing `any`.
- New cases:
  - `nella griglia piatta il click su una card chiama onEdit con l'id dell'entry`: flat seed, two entries. Clicking
    `card-e2` calls `onEdit` exactly once with `"e2"`.
  - `dentro una cartella il click su una card chiama onEdit con l'id dell'entry`: `seedWithCategory`, route
    `/?album=matrimonio`. Clicking `card-3` calls `onEdit` with `"3"`.
- Existing cases are unchanged.

**7d. `apps/dashboard/src/features/content-gallery/test/unit/use-content-gallery.test.ts`** (unit, edit)
- Delete `setPeekId aggiorna peekEntry…` (L47-56) and `reimposta peekId a null…` (L58-76).
- `parte con peekId null e restituisce cardModels…` (L38-45) becomes `restituisce un cardModel per ogni entry,
  nell'ordine dei dati`. It loses its two peek assertions.
- `gestisce dataset vuoto senza errori` (L94-99) loses its `peekEntry` assertion. It keeps `cardModels` length 0, and
  adds `categoryGroups` equal to `[]` so that it still has two axes.
- Remove the now-unused `act` import.

**7e. Deleted with their subjects:** `gallery-peek-title.test.ts` and `gallery-detail-branches.test.ts`.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run in order:

1. `packages/core/`: `pnpm run type-check`, `pnpm test`, then `pnpm run build` (the dashboard consumes the built
   package).
2. `apps/dashboard/`: `pnpm run type-check`, then `pnpm test`.
3. Repo root: `pnpm lint`.
4. Peek material is gone:
   `grep -rnE "gallery-peek|GalleryPeek|peekId|peekEntry|gallery-detail|GalleryDetailTags|GalleryRichtextReadonly|content-gallery/shared|missingUpdatePermission" apps/dashboard/src`
   gives no output.
5. Slice isolation and no permission logic in the gallery:
   - `grep -rnE "@/features/(content-(management|toolbar|views|kanban)|entry-editor)" apps/dashboard/src/features/content-gallery`
     gives no output;
   - `grep -rn "usePermissions\|content:update" apps/dashboard/src/features/content-gallery` gives no output.

   (Plain `grep`, not `git grep`: it must also see files that are not committed yet.)
6. Repo root: `pnpm beech test --diff`.
7. Graph sync: `graphify update . --force`.
8. Runtime check (`pnpm beech dev`, seed `posts`, which has a single `image` file branch and authorizes `gallery`):
   - On a Gallery instance, click a card. The Entry Editor opens at `/content/posts/<id>` (the same dialog as from a
     Table row), and no separate preview dialog appears. Close it, and the gallery is still showing.
   - With a "Raggruppa per" category set, open a folder, then click a card and close the editor. The same folder is
     still open (`?album=` kept).
   - As a user without `content:update` on `posts` (for example a viewer role), click a card. The editor opens
     read-only, as it does from a Table row.
   - With `posts` having no custom layout, open any entry. The Data tab starts with the "Featured Image" field alone in
     a full-width section, followed by the title and the body. A seed with a custom layout looks exactly as before.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] Clicking a Gallery card (in the flat grid or inside a folder) calls `entries.handleEdit(entryId)`. The shared
      `EntryEditorDialog` opens, and the gallery renders no dialog of its own.
- [ ] `GalleryPeekPanel`, `gallery-peek-sections`, `gallery-richtext-readonly`, `gallery-detail-tags`,
      `gallery-detail-branches`, `gallery-peek-title`, `content-gallery/shared.ts` and their two test files no longer
      exist.
- [ ] `UseContentGalleryResult` is exactly the interface in Task 3. `ContentGalleryProps` is unchanged.
- [ ] `features/content-gallery` contains no permission check, and imports no other feature slice except
      `@/features/shared`.
- [ ] Read-only parity: a user without `content:update` opening a gallery card gets the editor with `readonly=true`.
      This comes through the unchanged `content-view-workspace.tsx:219`, not through gallery code.
- [ ] `generateDefaultLayout` puts a seed's single main non-gallery `file` branch with `fileOptions.accept === 'image'`
      alone in the first, full-width, one-column section of the Data tab. For zero or several such branches, its output
      is identical to the previous implementation.
- [ ] The cover rule never adds an empty placeholder section, never moves an SEO-tab branch, and never changes
      `isFullWidthBranch`, `FULL_WIDTH_BRANCH_TYPES` or `validateLayoutAgainstSeed`.
- [ ] `generateDefaultLayout`'s signature and the `@beechcms/core` public exports are unchanged. `isCoverImageBranch`
      is not exported.
- [ ] Seeds with a custom `layout` render exactly as before.
- [ ] The removed `gallery.*` locale keys are gone from both `en.json` and `it.json`. Both files keep the same
      `gallery` key set.
- [ ] `docs/features/editorial-views.md` no longer mentions a peek inspector.
- [ ] No `apps/api`, migration, permission, `entry-editor`, `features/shared`, `pages/` or `packages/testing` file is
      in the diff.
- [ ] All new and edited tests follow `_config/testing_conventions.md`.
- [ ] Validation steps 1–7 pass, and the step 8 runtime walk is done or its absence is logged with the reason.
- [ ] `git diff --stat` for this sprint touches no file outside SECTION 3.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- No new entry-open callback (`handleView`, `onOpenEntry`) on `ViewEntryActions` or `ViewRendererProps`.
- No change to `EntryEditorDialog`, `useEntryEditorDialog`, `ContentListModals`, `useContentListModals` or the
  workspace. The read-only decision stays where it is.
- No change to the Layout Builder (`features/entry-editor/builder/*`). It picks up the new default through
  `generateDefaultLayout` without edits.
- No change to `isFullWidthBranch`, `FULL_WIDTH_BRANCH_TYPES`, `UNSUPPORTED_BRANCH_TYPES` or
  `validateLayoutAgainstSeed`. Custom layouts are never rewritten, and no migration touches stored `seed.layout`
  values.
- No cover rule for `accept: 'any'` / `'document'` file branches, multi-file galleries, or SEO-tab images.
- No restyling of `GalleryCard` or the folder UI, and no change to `gallery-card-display.ts`, `resolve-card-fields.ts`
  or the card `ariaLabel` copy ("Open detail: …").
- No editor quick-look, hover preview or tooltip replacing the peek panel.
- `docs/IP_PROVENANCE.md` is not edited.
- The reserved View Types, the "New" templates menu, the view switcher and all `/views` API behaviour are not touched.
- Committing or merging Sprints 1–5 is a human step (see the Precondition). The executor does not rewrite history.
