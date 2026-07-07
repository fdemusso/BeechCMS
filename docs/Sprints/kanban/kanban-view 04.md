# Sprint Plan — Kanban View (Sprint 04 / Post-Save Column Sync & Column-Cap Notice)

> Feature Brief: `stages/00_ideation/output/feature_brief.md` (Kanban View v1.0)
> Predecessors (all **already implemented** on branch `kanban-drag-stabilization`):
> - Sprint 01 (`docs/Sprints/kanban-view.md`) — Foundation & Contracts.
> - Sprint 02 (`docs/Sprints/kanban-view 02.md`) — Static Board (`view_config`, per-column `useInfiniteQuery`,
>   virtualizer, axis-config bar, collapse, skeleton/empty, click-to-edit).
> - Sprint 03 (`docs/Sprints/kanban-view 03.md`) — Interactive Drag & Optimistic Persistence
>   (`PATCH /:slug/:id/kanban-move`, `updateWithKanbanPosition`, the `useReducer` overlay, fractional indexing).
>
> Scope of THIS sprint: close the **three remaining v1 behavioural gaps** the brief still requires after the
> drag sprint, all on the **dashboard tier only** — no migration, no core change, no api change:
> - **KB-U16** — after editing an entry whose kanban-axis value changed, the card moves to the correct column
>   without a full board reload.
> - **KB-U18** — after creating an entry from a column's "+ Nuova entry", the card appears in that column
>   immediately (and is actually *created in* that column — the pre-seed channel is currently dropped).
> - **KB-U06c (completion)** — add the **visible cap notice** ("avviso visibile") when the axis produces more
>   than `KANBAN_MAX_COLUMNS` columns. The visibility selector and the cap enforcement already exist.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

This is a **closing sprint**: the board renders, paginates, virtualizes, and drags. What remains are the two
mutation paths that bypass the kanban caches (entry **edit** and entry **create**) plus one missing piece of
chrome (the cap notice). None of these introduce a new persistence concern, a new endpoint, or a new D1
object — they reconcile the *existing* Sprint 02 React Query caches with the *existing* generic content
save mutation. Building them now (and not in Sprint 02/03) is correct sequencing: there was no board to
re-sync, and no axis to move a card across, until the drag substrate existed.

- **Botanical Engine invariant.** This sprint writes **zero** new SQL and touches **no** D1 access path. Entry
  edit/create still flow through the already-frozen `useSaveContent` → `contentApi.update/create` → engine
  (`apiToDb`/`dbToApi`). The kanban-axis value is addressed only by `Branch.id` (`br_XX`) resolved to
  `branch.alias` via `resolveKanbanConfig`/the seed's branches — never a hardcoded column name. The only
  new behaviour is **client-side cache invalidation** (`queryClient.invalidateQueries`), which is not a
  persistence concern.

- **Vertical Slice Architecture.** Kanban knowledge stays in the `content-kanban/` slice. The cross-column
  reconciliation logic (which column(s) to invalidate after a save) lands in a **new hook inside the slice**
  (`use-kanban-entry-sync.ts`), consumed by the composing page exactly as the page already consumes
  `handleEdit`/`handleCreate`. The generic `content-management` and `entry-editor` slices gain only a
  **feature-agnostic `onSaved` callback** — they learn *nothing* about kanban. No cross-feature import is
  added: `content-kanban` keeps importing only `@beechcms/core`, shared libs, `@/components/ui/*`, and
  `@dnd-kit/*`.

- **YAGNI boundary (Ponytail).** The minimal correct blueprint is: (1) a feature-neutral "an entry was saved"
  signal lifted out of the entry editor, (2) a kanban-owned reconciler that invalidates **only** the source
  and destination columns (KB-S23 spirit: no full-board refetch), and (3) re-wiring the already-passed
  pre-seed `defaultValues` through the route so create lands in the right column. The cap **notice** is a
  pure render addition to a component that already computes `needsVisibilitySelector`. No new state machine,
  no new endpoint, no optimistic insert (the entry editor already round-trips through the server).

==========================================================================
SECTION 2 — CURRENT STATE (verified via direct inspection of Sprint 02/03 artifacts)
==========================================================================

> The kanban files are untracked/new, so the graphify graph predates them (graph-router fallback rule):
> source was read directly. Verified facts are quoted from the on-disk implementation.

**Tier 3 — `@beechcms/core` (frozen — NO change this sprint)**
- `resolveKanbanConfig(seed)`, `resolveKanbanColumns(branch)`, `kanbanColumnFilter(branch, value)`,
  `KanbanConfig` (`axisBranchId`, `sort`, `hiddenColumnValues?`). The mapping "axis raw value → column
  descriptor value" is exactly the `resolveKanbanColumns` vocabulary: in-vocab `text`/`tags`/`boolean`
  values map to themselves; `null`/empty/out-of-vocab fold to the `value: null` "Senza valore" column
  (KB-U25). No new export needed.

**Tier 2 — `apps/api` (frozen — NO change this sprint)**
- The save path is unchanged: `PUT /:slug/:id` (update) and `POST /:slug` (create). KB-U24 `null` axis is
  already accepted (`validateAndSanitizeSeedPayload({ allowNull: true })`). No new route, no migration.

**Tier 1 — `apps/dashboard` (the surface for all changes)**
- `apps/dashboard/src/features/content-kanban/hooks/use-kanban-column-query.ts`
  - Column query key: `['kanban', seedSlug, config.axisBranchId, col.value, allFilters, search, config.sort]`.
  - Already exports **`useInvalidateKanbanColumn(seedSlug, axisBranchId, colValue)`** →
    `invalidateQueries({ queryKey: ['kanban', seedSlug, axisBranchId, colValue] })` (prefix match, so it
    invalidates every page/filter/sort variant of that one column). **Currently unused.**
- `apps/dashboard/src/features/content-kanban/content-kanban.tsx`
  - L239-241: the column "+ Nuova entry" already builds the pre-seed:
    `onCreateEntry={onCreateEntry ? () => onCreateEntry(col.value != null ? { [axisBranch.alias]: col.value } : {}) : undefined}`.
  - `ContentKanbanProps.onCreateEntry?: (defaultValues?: Record<string, unknown>) => void` (`types.ts:45`).
- `apps/dashboard/src/features/content-kanban/hooks/use-kanban-view-config.ts` — owns `kanbanConfig`
  (`axisBranchId`, `sort`, `hiddenColumnValues`, `collapsedColumnValues`); cached/shared by query key, so a
  second consumer at page level is cheap.
- `apps/dashboard/src/features/content-kanban/hooks/use-kanban-columns.ts`
  - L13-16: `resolveKanbanColumns(axisBranch)` → drop hidden → **`.slice(0, KANBAN_MAX_COLUMNS)`**. Cap is
    enforced; the slice is deterministic (NOT count-sorted — see Section 4 Task D rationale).
- `apps/dashboard/src/features/content-kanban/kanban-axis-config.tsx`
  - L18: `needsVisibilitySelector = allCols.length > KANBAN_MAX_COLUMNS`; L89-109 already render the
    per-column visibility checkboxes. **No visible "columns are capped" notice exists** (the KB-U06c gap).
- `apps/dashboard/src/pages/content-list.tsx`
  - L401-406 `handleEdit(id)` → `navigate('/content/:slug/:id')` (route-driven dialog).
  - L420-422 `handleCreate()` → `navigate('/content/:slug/create')`. **Signature takes no args — the
    `defaultValues` passed by `ContentKanban` are silently dropped (KB-U18 pre-seed broken).**
  - L104-126: the dialog is route-driven; `isDraftContext` already rides on `location.state`
    (`(location.state as {isDraftContext?})`). This is the precedent for passing create defaults via
    `navigate(path, { state })`.
  - L954-962: `<ContentKanban seed seedSlug isLoading onEdit={handleEdit} onCreateEntry={handleCreate} />`.
  - L998-1006: `<EntryEditorDialog … onClose={handleDialogClose} />` — **exposes only `onClose`, no save
    signal.**
- `apps/dashboard/src/features/entry-editor/entry-editor-dialog.tsx` — `EntryEditorDialogProps`
  (`schemaSlug`, `entryId`, `isDraftContext`, `open`, `onClose`, `readonly`); delegates to
  `useEntryEditorDialog`.
- `apps/dashboard/src/features/entry-editor/hooks/use-entry-editor-dialog.tsx`
  - `handleSaveLive()` (L330-368): `prepareSubmissionPayload` → `await saveContent({slug, id, data})` →
    toast → `onClose()`. **This is the single live-save success point** for both create (`isCreate`) and
    edit. (Draft-only saves, L370-397, are irrelevant: kanban is incompatible with `allowDrafts` per Q3/KB-S26.)
  - Create-mode form init (L291-301): `createInitialFormData(branches)` — **no merge of external defaults**,
    so even a delivered pre-seed would not populate the field.
- `apps/dashboard/src/features/content-management/hooks/use-content-item.ts`
  - `useSaveContent().onSuccess` (L107-129) invalidates `CONTENT_QUERY_KEYS.all`, `FACET_QUERY_KEYS.all`,
    detail, `DASHBOARD_QUERY_KEYS.activity/stats`, `BACKREF_QUERY_KEY`. **It does NOT touch `['kanban', …]`.**
    This is the precise root cause of KB-U16 and KB-U18: the kanban column caches are a separate namespace
    that nothing on the save path invalidates.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**Tier 3 — `@beechcms/core`** — none.

**Tier 2 — `apps/api`** — none. (No migration, no route, no handler, no repository change.)

**Tier 1 — `apps/dashboard` (all changes)**

*Entry-editor: emit a feature-neutral save signal (KB-U16/U18 enabler)*
- `src/features/entry-editor/hooks/use-entry-editor-dialog.tsx` *(modified)* — add optional
  `onSaved?: (info: SavedEntryInfo) => void` to `UseEntryEditorDialogProps`; fire it in `handleSaveLive`
  **after** a successful live save, **before** `onClose()`. Also merge create-mode `defaultValues` into the
  initial form data.
- `src/features/entry-editor/entry-editor-dialog.tsx` *(modified)* — thread `onSaved` and `defaultValues`
  from `EntryEditorDialogProps` into the hook.

*Kanban slice: the reconciler (KB-U16/U18) + cap notice (KB-U06c)*
- `src/features/content-kanban/hooks/use-kanban-entry-sync.ts` *(new)* — `useKanbanEntrySync(seed, seedSlug)`
  returning `(info: SavedEntryInfo) => void`. Resolves the active axis branch, maps the saved entry's axis
  value to a column descriptor value, and invalidates **only** the destination column — plus the source
  column (scanned from the kanban cache) on an edit that changed the axis. No full-board refetch.
- `src/features/content-kanban/kanban-axis-config.tsx` *(modified)* — render a visible notice when
  `needsVisibilitySelector` (KB-U06c "avviso visibile"): "Mostrate N colonne su M; usa il selettore per
  scegliere quali visualizzare."
- `src/features/content-kanban/index.ts` *(modified)* — export `useKanbanEntrySync` and the `SavedEntryInfo`
  type.
- `src/features/content-kanban/types.ts` *(modified)* — add the `SavedEntryInfo` type (shared shape).

*Page wiring: pre-seed + connect the signal (KB-U18 pre-seed, KB-U16/U18 trigger)*
- `src/pages/content-list.tsx` *(modified)* — (a) widen `handleCreate` to
  `(defaultValues?: Record<string, unknown>) => void` and pass them via `navigate('/content/:slug/create',
  { state: { defaultValues } })`; (b) read `location.state.defaultValues` and pass it to
  `EntryEditorDialog`; (c) pass `onSaved={kanbanSync}` (from `useKanbanEntrySync`) to `EntryEditorDialog`,
  active only on the kanban view.

**Explicitly excluded:** any optimistic single-card insert/move into the cache (the entry editor already
performs a real server round-trip; invalidate-then-refetch the two affected columns is the YAGNI path and
satisfies "senza ricaricare l'intera board"); any change to the drag reducer; any `@beechcms/core`/`apps/api`
change; any new endpoint or migration.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task A — Shared save-signal type (`content-kanban/types.ts`)

The signal is **feature-neutral** (the entry editor must not import a kanban type), so the canonical shape
lives in the kanban slice and the entry editor declares an identical local/structural type. Keep it minimal:

```ts
// content-kanban/types.ts  (addition)
/** Emitted by the entry editor after a successful LIVE save (create or edit). */
export interface SavedEntryInfo {
  /** Entry id; undefined on create when the API response omits it (not required for column invalidation). */
  entryId?: string
  /** The submitted form data (carries the axis branch value under its alias). */
  data: Record<string, unknown>
  /** True when this was a create, false when an edit. */
  isCreate: boolean
}
```

> The entry editor side (Task B) declares `onSaved?: (info: { entryId?: string; data: Record<string, unknown>;
> isCreate: boolean }) => void` structurally — **no import from `content-kanban`** (VSA: dashboard pages
> compose slices; slices do not depend on each other).

### Task B — Entry editor: emit `onSaved` + merge create defaults (`use-entry-editor-dialog.tsx`, `entry-editor-dialog.tsx`)

1. Extend the props (both the hook props and `EntryEditorDialogProps`):

```ts
// UseEntryEditorDialogProps & EntryEditorDialogProps  (additions)
onSaved?: (info: { entryId?: string; data: Record<string, unknown>; isCreate: boolean }) => void
/** Pre-seed values for CREATE mode (e.g. kanban column axis value). Ignored in edit mode. */
defaultValues?: Record<string, unknown>
```

2. In `handleSaveLive` (after the existing `await saveContent(...)` success, before `onClose()`):

```ts
const result = await saveContent({ slug: schemaSlug, id: isCreate ? undefined : entryId, data: payload })
toast.success(isCreate ? t("content.editor.createdSuccess") : t("content.editor.savedSuccess"))
setIsDirty(false)
hasJustSavedRef.current = true
onSaved?.({
  entryId: isCreate ? (result as { id?: string } | undefined)?.id : entryId,
  data: payload,
  isCreate,
})
onClose()
```

> `saveContent` is `useSaveContent().mutateAsync`; its `mutationFn` returns `contentApi.create/update(...).data`.
> Read `result.id` defensively (it is not needed for column invalidation; only `data` + `isCreate` are
> required). Do **not** add kanban invalidation here — the editor stays feature-neutral.

3. Merge `defaultValues` into create-mode initialization (the block at L291-301):

```ts
if (seed && isCreate) {
  setFormData({ ...createInitialFormData(branches), ...(defaultValues ?? {}) })
  setStatus("draft")
  setSlug("")
  setSlugTouched(false)
}
```

> Add `defaultValues` to that effect's dependency-guard tuple alongside `seed`/`isCreate`/`branches`.
> Empty `defaultValues` (the "Senza valore" column, KB-U24 create half) leaves the axis field untouched —
> correct: the new entry has a `null`/empty axis and folds into "Senza valore".

### Task C — Kanban reconciler (`content-kanban/hooks/use-kanban-entry-sync.ts`, new)

Maps a saved entry's axis value to a column descriptor value and invalidates **only** the affected
column(s). Reuses the existing column-key convention; **no new query key**.

```ts
import { useQueryClient } from '@tanstack/react-query'
import { resolveKanbanColumns } from '@beechcms/core'
import type { Seed } from '@beechcms/core'
import { useKanbanViewConfig } from './use-kanban-view-config'
import type { SavedEntryInfo } from '../types'

/** Map a raw axis value to its column descriptor value (null = "Senza valore", incl. out-of-vocab KB-U25). */
function toColumnValue(raw: unknown, validValues: Set<string>): string | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'boolean') return raw ? 'true' : 'false'
  // tags axis: raw may be an array — a saved entry belongs to every matching column; caller invalidates each.
  const s = String(raw)
  return validValues.has(s) ? s : null
}

export function useKanbanEntrySync(seed: Seed, seedSlug: string) {
  const queryClient = useQueryClient()
  const { kanbanConfig } = useKanbanViewConfig(seedSlug)

  return (info: SavedEntryInfo) => {
    const axisBranchId = kanbanConfig.axisBranchId
    if (!axisBranchId) return
    const axisBranch = seed.branches.find(b => b.id === axisBranchId)
    if (!axisBranch) return

    const descriptors = resolveKanbanColumns(axisBranch)
    const validValues = new Set(descriptors.map(d => d.value).filter((v): v is string => v !== null))

    const invalidateColumn = (colValue: string | null) =>
      queryClient.invalidateQueries({ queryKey: ['kanban', seedSlug, axisBranchId, colValue] })

    // Destination column(s) from the saved axis value (tags => possibly several).
    const raw = info.data[axisBranch.alias]
    const destValues = Array.isArray(raw)
      ? (raw.length ? raw.map(v => toColumnValue(v, validValues)) : [null])
      : [toColumnValue(raw, validValues)]
    const dest = new Set<string | null>(destValues)

    // Source column on edit: scan the kanban cache for the entry's current placement (axis may have changed).
    if (!info.isCreate && info.entryId) {
      const cached = queryClient.getQueriesData<{ pages?: Array<{ items: Array<{ id: string }> }> }>({
        queryKey: ['kanban', seedSlug, axisBranchId],
      })
      for (const [key, data] of cached) {
        const colValue = (key as unknown[])[3] as string | null
        const has = data?.pages?.some(p => p.items.some(it => it.id === info.entryId))
        if (has) dest.add(colValue)
      }
    }

    dest.forEach(invalidateColumn)
  }
}
```

> Invalidating `['kanban', seedSlug, axisBranchId, colValue]` (4-element prefix) re-runs only that column's
> `useInfiniteQuery` across all its filter/search/sort variants — the card reappears in the correct column
> on refetch (KB-U16/U18) with no remount and no other column touched (KB-S23 spirit). On create, only the
> destination column refetches; on an axis-changing edit, the source + destination columns refetch. Unaffected
> columns are not refetched, satisfying "senza ricaricare l'intera board".

### Task D — Page wiring (`content-list.tsx`)

1. Pre-seed create (KB-U18 / KB-U24 create half):

```ts
const handleCreate = React.useCallback(
  (defaultValues?: Record<string, unknown>) => {
    if (slug) navigate(`/content/${slug}/create`, { state: { defaultValues } })
  },
  [slug, navigate],
)
```

2. Read the pre-seed off the route state (mirrors the existing `isDraftContext` read at L109) and forward it:

```ts
const createDefaults = (location.state as { defaultValues?: Record<string, unknown> } | null)?.defaultValues
```

3. Build the kanban sync and pass both new props to the dialog (active only when the kanban view is selected;
   `useKanbanEntrySync` is a no-op when no axis is configured, so it is safe to always provide):

```ts
const kanbanSync = useKanbanEntrySync(seed, slug ?? '')   // import from "@/features/content-kanban"

// …in the dialog render (L998-1006):
<EntryEditorDialog
  schemaSlug={target.schemaSlug}
  entryId={target.entryId}
  isDraftContext={target.isDraftContext}
  open={dialogOpen}
  onClose={handleDialogClose}
  defaultValues={createDefaults}
  onSaved={(info) => { if (activeViewId === 'kanban') kanbanSync(info) }}
/>
```

> `handleCreate` is already passed to `<ContentKanban onCreateEntry={handleCreate} />` (L960) — the
> `defaultValues` that `ContentKanban` builds (`{ [axisBranch.alias]: col.value }`) now flow end-to-end.
> Guard `useKanbanEntrySync` against `seed` being briefly undefined (call only when `seed` is defined, or
> early-return inside the hook).

### Task E — KB-U06c visible cap notice (`kanban-axis-config.tsx`)

The selector and cap already exist; add the **notice** the brief requires ("un avviso visibile"). Render it
inside the existing `needsVisibilitySelector && axisBranch` block, above the checkbox list:

```tsx
{needsVisibilitySelector && axisBranch && (
  <div className="flex flex-col gap-2">
    <p className="text-xs text-amber-600 dark:text-amber-500">
      Questo campo genera {allCols.length} colonne. Ne sono mostrate al massimo {KANBAN_MAX_COLUMNS};
      scegli quali visualizzare qui sotto.
    </p>
    <label className="text-sm font-medium">Colonne visibili (max {KANBAN_MAX_COLUMNS})</label>
    {/* …existing checkbox list… */}
  </div>
)}
```

> **Deliberate non-goal:** the brief's "le prime N ordinate per conteggio decrescente" is NOT implemented,
> because per-column counts require fetching the columns, which directly contradicts the same requirement's
> "le colonne nascoste non vengono fetchate". The deterministic `resolveKanbanColumns` order +
> `.slice(0, KANBAN_MAX_COLUMNS)` (already in `use-kanban-columns.ts`) + the manual visibility selector is the
> reconciled behaviour. This trade-off is called out explicitly in the PR description (Section 6).

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the monorepo root unless noted (commands per `_config/commands.md`):

```bash
# Tier 3 / Tier 2 untouched — sanity only (must remain green):
pnpm --filter @beechcms/core run test
pnpm --filter @beechcms/api exec tsc --noEmit

# No new migration this sprint — confirm a clean DB still boots (0034 already present)
pnpm run db:reset:local

# Tier 1 — dashboard: the only changed surface
pnpm --filter @beechcms/dashboard exec tsc --noEmit
pnpm --filter @beechcms/dashboard run build

# Whole-repo gate
pnpm run build
pnpm run lint
```

Manual acceptance walkthrough (kanban-compatible seed, axis configured):
1. Edit a card, change its axis field, save → card leaves its old column and appears in the new column; no
   other column flickers/reloads; board stays mounted (KB-U16).
2. Click "+ Nuova entry" under a non-"Senza valore" column, save → entry is created with that axis value and
   appears at the top of that column (KB-U18 + KB-U24 create half).
3. Click "+ Nuova entry" under "Senza valore", save with the axis left empty → entry appears in "Senza
   valore" (axis `null`, KB-U24).
4. Configure an axis whose options exceed `KANBAN_MAX_COLUMNS` → the amber cap notice and the visibility
   selector both render (KB-U06c).

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] **No migration, no `content_{slug}` DDL, no `@beechcms/core` change, no `apps/api` change.**
      `pnpm run db:reset:local` still succeeds. The diff is confined to `apps/dashboard`.
- [ ] Editing an entry and changing its kanban-axis value moves the card to the correct column **without a
      full board refetch**: only the source and destination column queries are invalidated (KB-U16/KB-S23).
- [ ] Creating an entry from a column's "+ Nuova entry" pre-seeds the axis value end-to-end (the
      `defaultValues` reach the create form) and the saved card appears in that column immediately; only that
      column's query is invalidated (KB-U18).
- [ ] Dropping/creating into "Senza valore" sets/leaves the axis `null` (not `""`) and the card folds into the
      "Senza valore" column (KB-U24). Out-of-vocab values also fold there (KB-U25).
- [ ] The kanban-axis value is addressed by `Branch.id` (`br_XX`) → `branch.alias` via `resolveKanbanConfig`/
      `resolveKanbanColumns`; **no hardcoded column name** appears in the reconciler.
- [ ] The entry editor emits a **feature-neutral** `onSaved` signal and imports **nothing** from
      `content-kanban`; the reconciliation logic lives entirely in `content-kanban/hooks/use-kanban-entry-sync.ts`
      (VSA: no cross-feature import).
- [ ] `KanbanAxisConfig` renders a **visible cap notice** when the axis produces more than
      `KANBAN_MAX_COLUMNS` columns, alongside the existing visibility selector (KB-U06c). The PR description
      explicitly waives the "ordinate per conteggio decrescente" default as unsatisfiable without fetching
      hidden columns.
- [ ] Existing non-kanban flows are byte-identical: `onSaved`/`defaultValues` are optional and unused by the
      Table/Gallery views; `useSaveContent` invalidations are unchanged.
- [ ] All commands in Section 5 pass.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT build the following:

- Any **optimistic cache mutation** for edit/create (direct `setQueryData` insert/move). The entry editor
  performs a real server round-trip; invalidate-and-refetch the two affected columns is the chosen, sufficient
  path. (The optimistic *drag* reducer from Sprint 03 is untouched.)
- Any change to `useSaveContent`'s existing invalidation set, or moving kanban invalidation **into** the
  generic `content-management`/`entry-editor` slices (that would couple them to kanban — rejected).
- Any **new endpoint, migration, `content_{slug}` DDL change, or `buildSelectQuery` change.**
- Per-column **count-descending** auto-selection of the capped columns (contradicts "le colonne nascoste non
  vengono fetchate"; the manual selector + deterministic slice stands).
- Any change to the drag pipeline, the virtualizer, the per-column fetch architecture, or `view_config`
  persistence beyond reading `kanbanConfig.axisBranchId` in the reconciler.
- Any change to `content-gallery`/`content-toolbar`, or any new view/toolbar concept.
