# Sprint: InstantDeleteUndo

Sprint 3 of 3 of **Universal Soft Delete & Trash Retention** (roadmap: `backlog/ROADMAP.md`).
Feature brief: `stages/00_ideation/output/feature_brief.md`. Sprints 1 (`UniversalSoftDelete`, `b5d8003f`) and 2 (`TrashRetentionSweep`, `cf12aab4`) have shipped. Their plans, execution logs and reviews are archived in `docs/Sprints/UniversalSoftDelete/` and `docs/Sprints/TrashRetentionSweep/`.

The server is finished: every delete is soft, retention is enforced, `GET/PUT /api/settings` carries `trashRetentionDays`, and the trash list returns the effective `retentionDays`. The dashboard still behaves as it did before the feature:
- a single delete opens a confirmation dialog, both from the list and from the entry editor;
- the Settings page has no retention field;
- the Trash countdown reads `seed.retentionDays`, so it shows `—` for every seed that relies on the 14-day global default.

This sprint is **dashboard only**:
- **Instant single delete.** No dialog. The row leaves the cached lists optimistically, the server soft-deletes at once, and each deletion raises its own 5-second toast with "Undo". Undo calls `restore`.
- **Bulk delete** keeps its mandatory confirmation modal, has no undo, and reports results per id.
- **Settings → General** gets a global `trashRetentionDays` field, validated with core `isValidRetentionDays`.
- **Trash countdown** uses the payload's effective `retentionDays`, and `0` reads as "kept indefinitely".

---

### Pre-Computation Analysis

Graph rebuilt at planning time with `graphify update . --force`. It completed with exit 0; the totals were not captured.

**a) God nodes on the path of this sprint (degree from `graphify explain`)**

| Node | Degree | Why it matters here |
|------|--------|---------------------|
| `useEntryEditorDialog()` (`features/entry-editor/hooks/use-entry-editor-dialog.tsx:L184`) | 18 | Owns the editor's delete path (`useDeleteContent` L207, `showDeleteConfirm` L233, `handleDelete` L468-480). It imports from `@/features/content-management` (L20-30), and that **existing** edge is how it will reach the new hook. |
| `ContentViewWorkspace()` (`pages/content-view-workspace.tsx:L39`) | 9 | Composition root of the list. It forwards `modals.handleDelete` / `handleBulkDelete` to the view renderer through `ViewEntryActions` (L125-139). **Not edited.** The contract of `ViewEntryActions.handleDelete: (entryId) => void` stays the same. |
| `useDeleteContent()` (`features/content-management/hooks/use-content-facets.ts:L32`) | 8 | The current delete mutation and its invalidation set. Bulk delete keeps using it. The single path moves to the new hook. |
| `useContentListModals()` (`features/content-management/hooks/use-content-list-modals.ts:L10`) | 6 | Owns `handleDelete` (L63), `handleBulkDelete` (L68) and `handleConfirmDelete` (L96). |
| `SchemaFormViewModel` (`features/entry-editor/renderer/schema-form-view-model.ts:L32`) | 13 affected | Loses `showDeleteConfirm` / `setShowDeleteConfirm`. Implemented by `useEntryEditorDialog` and by `useSeedEditorDialog` (`features/seed-builder/hooks/use-seed-editor-dialog.tsx:L202-203`). |

**b) Architectural boundaries affected**

- `@beechcms/core`: **zero files.** The dashboard imports the existing `isValidRetentionDays`, `MAX_RETENTION_DAYS` and `DEFAULT_TRASH_RETENTION_DAYS` (`packages/core/src/content/retention.ts`, re-exported at `packages/core/src/index.ts:L24`).
- `apps/api`: **zero files.**
- `apps/dashboard`:
  - slice `features/content-management`:
    - new hook `use-delete-with-undo.ts`;
    - new private module `lib/trash-cache.ts`;
    - `use-content-trash.ts`, `use-content-list-modals.ts`;
    - `api/trash.api.ts` (`TrashListResponse.retentionDays`);
    - `components/ContentTrashView.tsx`, `lib/retention.ts` (JSDoc only);
    - `index.ts` (barrel).
  - slice `features/entry-editor`:
    - `hooks/use-entry-editor-dialog.tsx`;
    - `renderer/schema-form-shell.tsx`;
    - `renderer/schema-form-view-model.ts`.
  - slice `features/seed-builder`: `hooks/use-seed-editor-dialog.tsx` (drops the two removed view-model fields).
  - slice `features/settings`:
    - `types/settings.types.ts`;
    - `hooks/use-general-tab.ts`;
    - `components/general-tab.tsx`.
  - page `pages/content-trash.tsx`;
  - locales `en.json` and `it.json`.

  New cross-slice edges: **none**. `entry-editor → content-management` already exists (`use-entry-editor-dialog.tsx:L20-30`). `seed-builder → entry-editor` already exists (`use-seed-editor-dialog.tsx:L11`). `settings` imports only `@beechcms/core`.

**c) `graphify affected` impact analysis**

```
affected "useContentListModals" --depth 2
  content-view-workspace.tsx [imports] L1, ContentViewWorkspace() [calls] L39, App.tsx [imports_from]
  content-list.tsx / ContentListPage() L55   ← stale edge: grep finds no import in pages/content-list.tsx today
affected "SchemaFormViewModel" --depth 2
  use-entry-editor-dialog.tsx, entry-editor/index.ts [re_exports], schema-form-shell.tsx (+ 4 prop types),
  use-seed-editor-dialog.tsx, entry-editor-dialog.tsx, test/cross-slice/schema-form-shell.test.tsx,
  test/cross-slice/entry-editor.test.tsx, entry-json-form.test.ts
affected "TrashListResponse" --depth 2
  use-content-trash.ts [imports], content-management/index.ts [re_exports], use-content-trash.test.ts
affected "retentionRemainingDays" --depth 2
  ContentTrashView.tsx [imports], retention.test.ts [imports], content-management/index.ts [re_exports]
affected "GeneralSettings" --depth 2
  settings.api.ts [imports], settings.api.test.ts, use-settings.ts
affected "useGeneralTabLogic" --depth 2
  general-tab.tsx / GeneralTab() L18, settings-dialog.tsx, settings-page.tsx
explain "useDeleteContent()" → degree 8; callers: use-content-list-modals.ts, use-entry-editor-dialog.tsx
path "useEntryEditorDialog" "useContentTrash"
  useEntryEditorDialog() → useActiveSeed() ← content-trash.tsx → useContentTrash()   (no direct edge)
```

Grep fallback for edges graphify does not model (type-only usage, object literals, test mocks):
- `showDeleteConfirm` literals: `use-seed-editor-dialog.tsx:L202-203` and `test/cross-slice/schema-form-shell.test.tsx:L135-136, L157`.
- `useDeleteContent` mocks: `test/cross-slice/content-list.test.tsx:L65-67, L84-86` and `test/cross-slice/entry-editor.test.tsx:L186-189`.
- The single-delete dialog flow is asserted by `content-list.test.tsx:L361-371` (`apre dialog ed esegue delete con refresh dati`). It breaks by design and is rewritten (Task 8).
- Single-delete entry points in the Table view: `lib/dynamic-columns.tsx:L461-468` (row menu), `ContentTableView.tsx:L158-166` (context menu, single), `ContentTableView.tsx:L116-121` (Del key → `onBulkDelete(rows)`, possibly one row). Gallery and Kanban expose no delete (`grep handleDelete` in `features/content-gallery`, `features/content-kanban`: only test stubs).
- `GeneralSettings` partial mocks in tests: `settings.api.test.ts`. The new field is required on the type, and the mock only needs it if a test builds a full `GeneralSettings` literal.

Breaking-change conclusions:
1. `ViewEntryActions` is unchanged, so no view renderer or renderer test changes.
2. Removing `showDeleteConfirm` / `setShowDeleteConfirm` from `SchemaFormViewModel` breaks one implementer (seed-builder) and one test fixture. Both are updated here. Keeping dead fields on a view model is the alternative, and it is rejected.
3. `TrashListResponse.retentionDays` is additive and is already sent by the server (sprint 2).
4. `GeneralSettings.trashRetentionDays` is required: the server always returns it (sprint 2, Task 5).
5. Behaviour change by design: a single delete no longer asks for confirmation (brief §2/§3). Bulk behaviour changes only in how partial failures are reported.

---

### VETO Audit

| Check (`_config/ponytail_arch.md`) | Verdict |
|---|---|
| **YAGNI (rule 1)** | Pass. One hook, one 3-function cache module, one Settings input, one prop on the Trash view, and i18n keys. Nothing else is added: no server endpoint (bulk stays client-side `Promise.allSettled` over the existing `DELETE`), no toast manager or queue (sonner already stacks independent toasts), no Mod+Z shortcut, no Seed Builder retention field, no new dependency. The ROADMAP left the Seed Builder exposure open. **Decision: not exposed.** The per-seed override stays a manifest / `PUT /api/seeds/:slug` field, because no user story in the brief asks for it in the Builder. |
| **Botanical invariant (rule 2)** | Pass. No D1 access exists in the dashboard. Every write goes through the existing `DELETE /api/content/:slug/:id` and `POST /api/content/:slug/:id/restore`, which go through `@beechcms/core` on the server. Retention validation imports the core `isValidRetentionDays`, so the dashboard and the server share one definition. No field name is hardcoded: optimistic removal filters by entry `id`, a system column. |
| **VSA (rule 3)** | Pass. New code lives in `features/content-management` (which owns the content list, delete and the Trash) and in `features/settings`. Only the existing `entry-editor → content-management` edge carries the new hook. `lib/trash-cache.ts` is slice-private, not re-exported from the barrel, so it does not widen the slice's public surface. `scripts/check-test-placement.mjs` R3 is respected: tests that cross slices live in `src/test/cross-slice/`. |
| **Cloudflare purity (rule 4)** | Pass. No runtime, worker, binding or migration change. |
| **Minimal blueprint (rule 5)** | Pass. One tier only (dashboard). The core and API contracts it consumes shipped in sprints 1 and 2. |

No violation found. No plan adjustment needed.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

This is the last sprint of the feature. It comes after the other two because every UI behaviour it adds relies on a server guarantee that now exists:
- **Undo is a restore.** It is safe only because sprint 1 made every delete soft, made restore strip the `_old_<ms>` suffix, and auto-renamed on conflict. The user is never blocked.
- **The Settings field and the Trash countdown** are only truthful because sprint 2 made `GET/PUT /api/settings` carry `trashRetentionDays` and made the trash list return the effective value the sweep actually enforces.

Building the UI earlier would have shown a countdown the server did not honour.

VSA: the delete/undo flow belongs to `content-management`, the slice that owns content mutations and the Trash. The entry editor consumes it through the dependency it already has. Settings stays self-contained. Botanical Engine: the dashboard never touches storage; it calls the two existing routes and imports the core retention validator.

After this sprint, `feature/universal-soft-delete` is complete and can be merged to `master`.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Single delete today (Table view)**
- `useContentListModals.handleDelete(id)` (`use-content-list-modals.ts:L63-66`) sets `entryIdsToDelete=[id]` and opens `ContentDeleteDialog`.
- `handleConfirmDelete` (L96-110) runs `Promise.allSettled` over `useDeleteContent().mutateAsync({slug,id})`. It throws the hardcoded English `Partial deletion: N out of M failed` on any failure, and clears `rowSelection` on success.
- `handleBulkDelete(ids)` (L68-73) dedupes and opens the same dialog. The Del key goes through it even for one focused row (`ContentTableView.tsx:L116-121` → `use-data-table-selection.ts:L231-238`).
- `ContentDeleteDialog` (`features/content-delete-dialog/`) shows trash-mode copy, gates the confirm button on `content:delete`, and shows `onConfirm`'s thrown message inline. On rejection it stays open (`use-content-delete-dialog.ts:L31-45`).
- The menu items are already disabled without `content:delete` (`dynamic-columns.tsx:L464`, `ContentTableView.tsx:L161`).

**Delete mutation and cache**
- `useDeleteContent` (`use-content-facets.ts:L32-48`): `contentApi.delete(slug, id, purge?)`. Its `onSuccess` invalidates `CONTENT_QUERY_KEYS.all`, `TRASH_QUERY_KEYS.all`, `DASHBOARD_QUERY_KEYS.activity()` and `[BACKREF_QUERY_KEY]`.
- `invalidateTrashSurfaces(queryClient)` (`use-content-trash.ts:L16-21`) is the same four-key set, module-private, used by restore and purge.
- List cache: key `CONTENT_QUERY_KEYS.list(slug, params)` = `['content','list',slug,params]` (`consts/content.keys.ts:L9-11`). The value is the raw `ContentListWithMeta` `{ items, total, page, limit, relations? }` (`api/content.api.ts:L46-58`). `useContentList` localizes only in `select` (`use-content-list.ts:L30-49`), so the cache holds raw entries keyed by `id`.
- `trashApi.restore(slug, id)` → `RestoreResult { success, slug }` (`api/trash.api.ts:L30-50`). Restore requires `content:update` (docblock L38-39).

**Entry editor delete**
- `use-entry-editor-dialog.tsx`:
  - `useDeleteContent` at L207 (`isDeleting`);
  - `showDeleteConfirm` state at L233;
  - `handleDelete` at L468-480: awaits delete, `toast.success`, `hasJustSavedRef.current = true` (bypasses the unsaved-changes blocker, L245), `onClose()`, and on failure `toast.error`;
  - the fields are returned at L678-685.
- `schema-form-shell.tsx`:
  - the Delete button opens the confirm (`onClick={() => setShowDeleteConfirm(true)}`, L319-328), and its backrefs-blocked variant is at L304-317;
  - the `AlertDialog` is at L436-456;
  - the destructuring is at L111-118.
- View-model fields: `schema-form-view-model.ts:L81-87`. Seed-builder stub: `use-seed-editor-dialog.tsx:L201-206`.

**Toasts**
- `sonner` ^2.0.7. A single `<Toaster />` is mounted at `main.tsx:L37` with library defaults (`components/ui/sonner.tsx`).
- Action-toast precedent: `use-entry-editor-dialog.tsx:L340-348` (`toast.error(msg, { action: { label, onClick } })`).
- Sonner gives every call a fresh id unless `id` is passed, stacks toasts independently, and closes a toast when its action is clicked.

**TanStack Query** ^5.90. Callbacks passed in `useMutation({...})` options are mutation-level: they still run after the calling component unmounts. Callbacks passed to `mutate(vars, {...})` do not. The entry editor unmounts right after delete (`onClose`), so its toast must come from mutation-level callbacks.

**Trash page**
- `pages/content-trash.tsx` passes `seed`, `nowSeconds` (L53) and the rest to `ContentTrashView` (L160-179).
- `ContentTrashView.tsx:L84-91` calls `retentionRemainingDays(row.original.deleted_at, seed.retentionDays, nowSeconds)`.
- `lib/retention.ts:L18-26` returns `null` for an absent retention or a retention `<= 0`.
- `TrashListResponse` (`trash.api.ts:L13-18`) lacks `retentionDays`.

**Settings**
- The General tab is shown only with `canGlobally('manage_users')` (`settings-dialog.tsx:L127-128`), which matches the server's `PUT /api/settings` gate (sprint 2).
- `GeneralSettings` type: `settings.types.ts:L54-77`.
- `useGeneralTabLogic` (`use-general-tab.ts`):
  - keeps one `useState` per field, synced from the query in an effect (L20-30);
  - validates client-side before the mutation, as in the website check (L35-42);
  - sends the full payload (L45-55), and shows server `detail` on error (L57-61).
- `general-tab.tsx` has two sections split by `<Separator />` (L39-114).
- `PUT /api/settings` answers 400 `settings-invalid-trash-retention` for invalid values (sprint 2). `GET` always returns `trashRetentionDays`.

**i18n**
- `apps/dashboard/src/locales/en.json` and `it.json`:
  - `content.trash.*` (en L675-693);
  - `content.deleteDialog.*` (L694-707);
  - `settings.general.*` (L483-505).
- `locales.test.ts` spot-checks keys.

**Docs**: `docs/features/trash.md` § "Dashboard Experience" (L176-186). Item 2 still describes a delete dialog for every delete.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**Create**
- `apps/dashboard/src/features/content-management/hooks/use-delete-with-undo.ts`
- `apps/dashboard/src/features/content-management/lib/trash-cache.ts`
- `apps/dashboard/src/features/content-management/test/unit/use-delete-with-undo.test.ts`
- `apps/dashboard/src/features/content-management/test/unit/use-content-list-modals.test.ts`
- `apps/dashboard/src/features/content-management/test/unit/content-trash-view.test.tsx`
- `apps/dashboard/src/features/settings/hooks/use-general-tab.test.ts`

**Edit**
- `features/content-management/`:
  - `index.ts` (export the new hook only);
  - `hooks/use-content-trash.ts`;
  - `hooks/use-content-list-modals.ts`;
  - `api/trash.api.ts`;
  - `components/ContentTrashView.tsx`;
  - `lib/retention.ts` (JSDoc).
- `pages/content-trash.tsx`.
- `features/entry-editor/`:
  - `hooks/use-entry-editor-dialog.tsx`;
  - `renderer/schema-form-shell.tsx`;
  - `renderer/schema-form-view-model.ts`.
- `features/seed-builder/hooks/use-seed-editor-dialog.tsx`.
- `features/settings/`:
  - `types/settings.types.ts`;
  - `hooks/use-general-tab.ts`;
  - `components/general-tab.tsx`.
- `locales/en.json`, `locales/it.json`.
- Tests:
  - `test/cross-slice/content-list.test.tsx`;
  - `test/cross-slice/entry-editor.test.tsx`;
  - `test/cross-slice/schema-form-shell.test.tsx`;
  - `features/content-management/test/unit/retention.test.ts` (only if the JSDoc change touches its description; no behaviour change).
- Docs: `docs/features/trash.md`.

**Excluded:** `packages/**`, `apps/api/**`, `features/content-delete-dialog/**` (its trash-mode copy already fits a bulk confirmation), `pages/content-view-workspace.tsx`, `features/shared/view-registry.ts`, Seed Builder retention UI.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — Slice-private cache helpers (`content-management/lib/trash-cache.ts`)

Approach: move `invalidateTrashSurfaces` out of `use-content-trash.ts:L16-21` and put the optimistic-removal helpers next to it. Both the existing trash hooks and the new hook need them. The file is **not** re-exported from `index.ts`, so the slice's public surface does not grow.

Verbatim signatures:

```ts
import type { QueryClient } from "@tanstack/react-query"
import type { ContentListWithMeta } from "../api/content.api"

/** Snapshot of every cached list page of one seed, taken before an optimistic removal. */
export type ContentListSnapshot = Array<[queryKey: readonly unknown[], data: ContentListWithMeta | undefined]>

/** Invalidates content lists, Trash, activity feed and back-refs — a delete or restore moves a row between them. */
export function invalidateTrashSurfaces(queryClient: QueryClient): void

/**
 * Cancels in-flight list fetches for `slug`, snapshots every cached page under
 * `[...CONTENT_QUERY_KEYS.lists(), slug]`, then removes the entry `id` from each page.
 * `total` drops by 1 only on a page that actually contained the id. Pages without the id are left as is.
 */
export async function removeEntryFromCachedLists(
  queryClient: QueryClient,
  slug: string,
  id: string,
): Promise<ContentListSnapshot>

/** Writes every snapshotted page back exactly as it was. */
export function restoreCachedLists(queryClient: QueryClient, snapshot: ContentListSnapshot): void
```

Rules:
- `use-content-trash.ts` imports `invalidateTrashSurfaces` from `../lib/trash-cache`. The local copy is deleted and the behaviour is unchanged. The existing `use-content-trash.test.ts` must stay green untouched.
- Use `queryClient.cancelQueries`, `getQueriesData` and `setQueriesData` / `setQueryData` with the prefix key. Never touch `CONTENT_QUERY_KEYS.detail` entries: the editor that is closing may still read them.

### Task 2 — `useDeleteWithUndo` (`content-management/hooks/use-delete-with-undo.ts`)

Approach: one hook drives both single-delete entry points (list + entry editor), so "instant + undo" is defined once. It is a `useMutation` whose toast logic lives in **mutation-level** options, so the undo toast survives the entry editor unmounting.

Verbatim building blocks:

```ts
/** Lifetime of the single-delete "Undo" toast (feature brief §3). */
export const UNDO_DELETE_TOAST_MS = 5000

export interface DeleteWithUndoVariables {
  slug: string
  id: string
}

export interface DeleteWithUndo {
  /**
   * Soft-deletes now (`DELETE /api/content/:slug/:id`), removing the row from cached lists first.
   * Resolves `true` once the server confirmed, `false` on failure. Never rejects: the hook owns every toast.
   */
  deleteWithUndo: (variables: DeleteWithUndoVariables) => Promise<boolean>
  isDeleting: boolean
}

export function useDeleteWithUndo(): DeleteWithUndo
```

Export it from `content-management/index.ts` (`export * from "./hooks/use-delete-with-undo"`).

Behaviour:
1. `onMutate`: `snapshot = await removeEntryFromCachedLists(queryClient, slug, id)`. Return it as the mutation context. The row disappears before the request leaves (brief §3: "sparisca nell'istante").
2. `mutationFn`: `contentApi.delete(slug, id)` with **no** purge option. A single delete is always soft.
3. `onError`:
   - `restoreCachedLists(queryClient, context.snapshot)` (the row comes back);
   - `toast.error(t("content.undoDelete.deleteFailed"))`.

   No undo toast is shown.
4. `onSuccess`: raise **one** toast per deletion:
   - `toast.success(t("content.undoDelete.trashed"), { duration: UNDO_DELETE_TOAST_MS, action })`.
   - `action` is present only when `can("content:update", slug)` (`usePermissions` from `@/features/shared/hooks/use-permissions`). Without that permission the toast is a plain confirmation: restore would be refused with 403 (brief §4, Permessi).
   - **Never pass an `id` option.** Sonner would then replace an earlier toast, and one deletion's Undo would vanish because of another deletion (brief §4: "nessuna eliminazione può annullarne un'altra").
   - `action.label = t("content.undoDelete.undo")`.
   - `action.onClick` calls `trashApi.restore(slug, id)` for **this** deletion's `slug`/`id`, captured in the closure.
     - On resolve: `invalidateTrashSurfaces(queryClient)` and `toast.success(t("content.trash.restored"))`.
     - On reject: `toast.error(t("content.undoDelete.restoreFailed"))`. The entry stays recoverable from the Trash.

     It must not use a component-bound mutation, because the caller may be unmounted. Sonner dismisses the toast on click, so one toast restores at most once.
5. `onSettled`: `invalidateTrashSurfaces(queryClient)`. This is the same four-key set `useDeleteContent` invalidates, and it reconciles the optimistic list with the server.
6. `deleteWithUndo` wraps `mutateAsync` and maps resolve/reject to `true`/`false`. It never throws.
7. Timing is sonner's, not a timer of ours. Sonner pauses the countdown while the toaster is hovered or expanded. That is accepted library behaviour. The brief's guarantees still hold: the server delete is never delayed, and after expiry the entry can only be recovered from the Trash.
8. No `window` unload handling: the delete is already committed when the toast appears (brief §4, Chiusura del tab).

### Task 3 — List: instant single, confirmed bulk (`content-management/hooks/use-content-list-modals.ts`)

- Replace the dialog path of `handleDelete` (L63-66):
  - call `deleteWithUndo({ slug, id })` from `useDeleteWithUndo()`, guarded on `slug`;
  - remove `id` from `rowSelection` (functional `setRowSelection`), so a deleted row never stays selected.

  The signature stays `(id: string) => void` (fire-and-forget, `void` the promise). `ViewEntryActions` is unchanged.
- `handleBulkDelete` (L68-73): after dedupe, **exactly one id → delegate to `handleDelete`**. Two or more open the dialog as today. Reason: the Del key routes a single focused row through the bulk path (`ContentTableView.tsx:L116-121`), and the brief makes every single deletion instant.
- `handleConfirmDelete` (L96-110), per-id reporting (brief §4, Bulk):
  - keep `Promise.allSettled` over `useDeleteContent().mutateAsync` (no purge);
  - collect `failedIds` by index and remove the succeeded ids from `rowSelection`;
  - if `failedIds.length === 0`: clear `rowSelection` and `toast.success(t("content.deleteDialog.bulkTrashed", { count }))`. The dialog closes through `useContentDeleteDialog`'s success path;
  - otherwise: `setEntryIdsToDelete(failedIds)`, then throw `new Error(t("content.deleteDialog.bulkPartialFailure", { count: failedIds.length, total }))`. The dialog stays open, shows the localized error, and its ID preview now lists only the failed ids, so confirming again retries exactly those. The hardcoded English message is removed.
- `useTranslation` and `toast` imports follow `content-view-workspace.tsx:L6-8`. The returned object keeps every field it has today.

### Task 4 — Entry editor: delete without dialog

- `use-entry-editor-dialog.tsx`:
  - replace `useDeleteContent` (L207) with `const { deleteWithUndo, isDeleting } = useDeleteWithUndo()` (same import block, L20-30);
  - delete `showDeleteConfirm` state (L233);
  - rewrite `handleDelete` (L468-480): guard as today; `ok = await deleteWithUndo({ slug: schemaSlug, id: entryId })`; when `ok`, set `hasJustSavedRef.current = true` and then `onClose()`. When not `ok`, the editor stays open and the hook has already toasted the error. Remove the local `toast.success` / `toast.error` and the `finally`;
  - drop `showDeleteConfirm` / `setShowDeleteConfirm` from the returned view model (L684-685).
- `schema-form-view-model.ts:L81-87`: remove `showDeleteConfirm` and `setShowDeleteConfirm`. Keep `isDeleting`, `handleDelete`, `hasRestrictedRefs` and `setHasRestrictedRefs`.
- `schema-form-shell.tsx`:
  - the Delete button (L319-328) calls `handleDelete` directly. It stays `disabled={isDeleting}`, and the backrefs-blocked variant (L304-317) is untouched;
  - delete the confirm `AlertDialog` (L436-456) and remove the two fields from the destructuring (L117-118);
  - drop now-unused imports only if nothing else in the file uses them (the discard-draft `AlertDialog` at L415-433 still does).
- `use-seed-editor-dialog.tsx:L202-203`: remove the two stub fields.
- Locale keys `content.editor.deleteTitle` / `deleteDesc`, which are read only through `defaultValue` fallbacks: no JSON entry exists, so there is nothing to delete.

### Task 5 — Trash countdown uses the effective retention

- `trash.api.ts`: `TrashListResponse` gains

  ```ts
  /** Effective retention for this seed (seed override, else global setting). 0 = never purged. */
  retentionDays: number
  ```

- `ContentTrashView.tsx`: add the prop

  ```ts
  /** Effective retention from the trash list; `undefined` while it loads. 0 = never purged. */
  retentionDays: number | undefined
  ```

  The retention cell (L84-91) behaves as follows:
  - `retentionDays === 0` → `t("content.trash.neverPurged")`;
  - otherwise `retentionRemainingDays(row.original.deleted_at, retentionDays, nowSeconds)`, where `null` → the existing muted `—`.

  `seed.retentionDays` is no longer read anywhere in the dashboard. Add `retentionDays` to the `useMemo` deps (L117).
- `content-trash.tsx` (L160-179): pass `retentionDays={trash.data?.retentionDays}`.
- `lib/retention.ts`: signature and behaviour unchanged. Rewrite the JSDoc of `SECONDS_PER_DAY` and of `retentionRemainingDays`: the input is the **effective** retention from `GET /api/content/:slug/trash` (`TrashListResponse.retentionDays`), not the seed's declaration. `null` is returned for "no countdown" (unknown or `0`), and the caller renders `0` as "kept indefinitely".

### Task 6 — Settings: global retention field

- `settings.types.ts` `GeneralSettings`: add

  ```ts
  /** Global Trash retention in days (seed `retentionDays` overrides it). 0 = never purge. Integer 0..MAX_RETENTION_DAYS. */
  trashRetentionDays: number
  ```

- `use-general-tab.ts`:
  - New state `trashRetentionDays: string`. It is a string so the input can be empty while typing. Initial value `String(DEFAULT_TRASH_RETENTION_DAYS)`, synced in the existing effect from `String(settings.trashRetentionDays ?? DEFAULT_TRASH_RETENTION_DAYS)`.
  - `handleSave`: after the website check and before `mutateAsync`, parse `value = Number(trashRetentionDays.trim())`. If the trimmed string is empty or `!isValidRetentionDays(value)`, call `toast.error(t("settings.general.trashRetentionInvalid", { max: MAX_RETENTION_DAYS }))` and return. Nothing is sent. Otherwise include `trashRetentionDays: value` in the payload.
  - Imports `DEFAULT_TRASH_RETENTION_DAYS`, `MAX_RETENTION_DAYS` and `isValidRetentionDays` from `@beechcms/core`.
  - Expose `state.trashRetentionDays` and `actions.setTrashRetentionDays`.
  - A server 400 `settings-invalid-trash-retention` still surfaces through the existing `detail` catch (L57-61).
- `general-tab.tsx`: a third section after the company block, separated by `<Separator />` like L73. It has:
  - heading `settings.general.trashTitle` and description `settings.general.trashDesc`;
  - one `Label` + `Input` with `id="trashRetentionDays"`, `type="number"`, `min={0}`, `max={MAX_RETENTION_DAYS}`, `step={1}` and `inputMode="numeric"`;
  - a muted hint `settings.general.trashRetentionHint`.

  Use the same grid/spacing classes as the existing fields. The tab is already gated on `manage_users` global, and no extra gate is added.

### Task 7 — i18n (`locales/en.json`, `locales/it.json`, identical key sets)

| Key | en | it |
|---|---|---|
| `content.undoDelete.trashed` | `Moved to Trash` | `Spostato nel cestino` |
| `content.undoDelete.undo` | `Undo` | `Annulla` |
| `content.undoDelete.deleteFailed` | `Could not delete the entry` | `Impossibile eliminare l'entry` |
| `content.undoDelete.restoreFailed` | `Could not undo — the entry is still in the Trash` | `Annullamento non riuscito — l'entry è ancora nel cestino` |
| `content.deleteDialog.bulkTrashed_one` / `_other` | `{{count}} entry moved to Trash` / `{{count}} entries moved to Trash` | `{{count}} entry spostata nel cestino` / `{{count}} entry spostate nel cestino` |
| `content.deleteDialog.bulkPartialFailure` | `{{count}} of {{total}} entries could not be moved to the Trash. Confirm to retry them.` | `{{count}} di {{total}} entry non sono state spostate nel cestino. Conferma per riprovare.` |
| `content.trash.neverPurged` | `Kept indefinitely` | `Conservata a tempo indeterminato` |
| `settings.general.trashTitle` | `Trash` | `Cestino` |
| `settings.general.trashDesc` | `How long deleted entries stay in the Trash before they are erased. A content type can override it.` | `Per quanto tempo le entry eliminate restano nel cestino prima di essere cancellate definitivamente. Un tipo di contenuto può sovrascriverlo.` |
| `settings.general.trashRetentionLabel` | `Retention (days)` | `Conservazione (giorni)` |
| `settings.general.trashRetentionHint` | `0 = never erase automatically.` | `0 = non cancellare mai automaticamente.` |
| `settings.general.trashRetentionInvalid` | `Retention must be a whole number between 0 and {{max}}.` | `La conservazione deve essere un numero intero tra 0 e {{max}}.` |

`content.undoDelete` is a new object under `content`, a sibling of `trash` and `deleteDialog`.

### Task 8 — Documentation (`docs/features/trash.md` § Dashboard Experience, L176-186)

- Replace item 2 with two items:
  - **Single delete is instant.** There is no dialog. The row disappears at once, and a 5-second toast offers **Undo**, which calls restore. The toast has no Undo without `content:update`. Each deletion has its own toast.
  - **Bulk delete** asks for confirmation, has no undo, and reports per-id failures, keeping the failed ids for a retry.
- Item 3: the countdown uses the trash list's effective `retentionDays`, and `0` shows "Kept indefinitely".
- Add one item: **Settings → Site → Trash** sets the global `trashRetentionDays` (requires `manage_users` global). The per-seed override is set in the seed manifest / `PUT /api/seeds/:slug`, not in the Seed Builder.

Do not hand-edit `docs/api/**`.

### Task 9 — Tests

All files open with the SPDX header. Double quotes (`apps/dashboard`). There are no fake timers anywhere (Rule 3.11): time-dependent behaviour is asserted through the `duration` passed to sonner and through an explicit `nowSeconds`. Entry ids and seed slugs come from `CANONICAL_ENTRIES` / `CANONICAL_SEEDS` (`@beechcms/testing`, precedent `features/content-gallery/test/unit/folder-create-defaults.test.ts:L8`).

Mocks are boundary-only (Rule 3.10): `@/lib/api`, `sonner` and `@/features/shared/hooks/use-permissions`, at the top of the file, with `beforeEach(() => vi.clearAllMocks())`. Wrapper and QueryClient follow `use-content-trash.test.ts:L21-30`.

**`features/content-management/test/unit/use-delete-with-undo.test.ts`** — unit, `describe("useDeleteWithUndo")`. The QueryClient is pre-filled with two list pages for the canonical seed.
- `removes the entry from every cached list page of its seed before the DELETE resolves`: assert cache state while `api.delete` is still pending (a deferred promise).
- `decrements total only on the page that contained the entry`.
- `sends a soft DELETE with no purge flag`: `api.delete` is called with `/content/<slug>/<id>`, with no `?purge`.
- `on success raises one toast lasting UNDO_DELETE_TOAST_MS with an Undo action`.
- `two deletions raise two toasts with no shared id option`: each call has no `id` key; there are two `toast.success` calls.
- `the Undo action restores exactly its own entry`: delete A, then B; invoke A's `action.onClick`; `api.post` is called once with `/content/<slug>/<A>/restore`.
- `a successful undo invalidates the content and trash key spaces and confirms the restore`.
- `a failed undo shows restoreFailed and does not throw`.
- `without content:update the success toast carries no Undo action`.
- `a failed DELETE puts the row back in every cached page, shows deleteFailed and resolves false`.
- `raises the undo toast even when the calling component has unmounted before the DELETE resolves`: `unmount()` while pending, then resolve; `toast.success` is still called. This is a regression guard for the entry-editor path; comment the mechanism (mutation-level vs `mutate`-level callbacks).

**`features/content-management/test/unit/use-content-list-modals.test.ts`** — unit, `describe("useContentListModals")`. Mock `react-router-dom` (`useParams`, `useNavigate`, `useLocation`) as `content-list.test.tsx:L20-25` does. Mock `./use-delete-with-undo` and `./use-content-facets` as the slice-internal mutation boundaries. **Exception, documented in a comment:** they are hooks that wrap HTTP, mocked so the subject (dialog/selection orchestration) is isolated.
- `handleDelete deletes at once without opening the dialog`: `deleteDialogOpen` stays `false`; `deleteWithUndo` is called with `{ slug, id }`.
- `handleDelete drops the deleted id from rowSelection`.
- `handleBulkDelete with two ids opens the confirmation dialog and deletes nothing yet`.
- `handleBulkDelete with one id (after dedupe) takes the instant single path`.
- `handleConfirmDelete with all ids succeeding clears the selection and toasts bulkTrashed`.
- `handleConfirmDelete with a partial failure rejects with bulkPartialFailure and narrows entryIdsToDelete to the failed ids`.

**`features/content-management/test/unit/content-trash-view.test.tsx`** — unit (jsdom), `describe("ContentTrashView")`. Render with a fixed `nowSeconds` literal and one trashed row, using a canonical id with `deleted_at` set relative to `nowSeconds`.
- `shows the days left computed from the retentionDays prop, ignoring seed.retentionDays`: the seed declares `30`, the prop is `14`, the row was deleted 4 days ago → `10 days left`.
- `shows neverPurged when retentionDays is 0`.
- `shows the muted dash while retentionDays is undefined`.

**`features/settings/hooks/use-general-tab.test.ts`** — unit, `describe("useGeneralTabLogic")`, next to its source (the slice's existing placement, e.g. `api/settings.api.test.ts`). Mock `@/lib/api` and `sonner`. The GET payload is a full `GeneralSettings` literal with `trashRetentionDays: 21`.
- `loads trashRetentionDays from settings into state as "21"`.
- `saves a valid retention as a number in the PUT payload`: `"30"` → `api.put("/settings", objectContaining({ trashRetentionDays: 30 }))`.
- `saves 0 (never purge)`.
- `refuses an invalid retention with trashRetentionInvalid and sends nothing`: matrix `"", "-1", "1.5", "abc", "36501"`. Each case gets `toast.error` and `api.put` is not called (Rule 5.6).

**Edits to existing tests**
- `test/cross-slice/content-list.test.tsx`:
  - extend the `@/features/content-management` mock with `useDeleteWithUndo: () => ({ deleteWithUndo: mockDeleteWithUndo, isDeleting: false })`, and the `use-content-facets` path mock likewise;
  - replace `apre dialog ed esegue delete con refresh dati` (L361-371) with `clicking Delete on a row deletes it at once without opening the confirmation dialog`: `confirm-delete` never appears, and `mockDeleteWithUndo` is called with `{ slug: "posts", id: "id-1" }`.

  Keep the file's existing fixtures. It is a pre-existing cross-slice suite, and this sprint does not rework its fixtures.
- `test/cross-slice/entry-editor.test.tsx`:
  - replace the `useDeleteContent` mock (L186-189) with `useDeleteWithUndo: () => ({ deleteWithUndo: mockDeleteWithUndo, isDeleting: false })`;
  - add, in edit mode, `clicking Delete calls deleteWithUndo directly and closes the editor without a confirmation dialog`: `deleteTitle` is never rendered, `onClose` is called, and `mockDeleteWithUndo` resolves `true`;
  - add `a failed delete keeps the editor open`: resolve `false`, and `onClose` is not called.
- `test/cross-slice/schema-form-shell.test.tsx`:
  - remove `showDeleteConfirm` / `setShowDeleteConfirm` from `buildViewModel` (L135-136) and from the override at L157;
  - rename that test to `hides the delete button when capabilities.delete is false`;
  - add `the Delete button calls handleDelete directly and mounts no confirmation dialog`.

**Not tested here (comment where relevant):** the server's restore and soft-delete contracts. They are covered by sprint-1 `soft-delete.integration.test.ts` and are unchanged. The toast's 5-second expiry is sonner's own timer: the unit test asserts the `duration` handed to it, not the passage of time (Rule 3.11).

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```
npx tsc --noEmit                                  # in apps/dashboard — must stay at 0 errors
pnpm --filter ./apps/dashboard test
pnpm lint
pnpm beech test --diff                            # changed-line coverage gate
node scripts/check-test-placement.mjs
node scripts/docs-fact-check.mjs
rg -n "seed\.retentionDays|showDeleteConfirm|Partial deletion" apps/dashboard/src   # must print nothing
graphify update . --force
```

No `packages/core` or `apps/api` command is required: neither changes. No `pnpm beech db:migrate`: no migration.

Manual smoke (`pnpm beech dev`, as an admin):
- delete one row → it vanishes, the toast shows Undo, and Undo brings it back;
- delete two rows quickly → two toasts, each restoring only its own row;
- bulk-delete three rows → the modal appears and the success toast follows;
- set Trash retention to `0` in Settings → the Trash shows "Kept indefinitely" for seeds without an override.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] A single delete from the Table view (row menu, context menu, Del key on one row) and from the entry editor opens **no** dialog. It calls `DELETE /api/content/:slug/:id` with no purge flag immediately.
- [ ] The deleted row disappears from every cached list page of its seed before the server answers. A failed delete puts it back and shows `content.undoDelete.deleteFailed`.
- [ ] Each successful single delete raises its own sonner toast with `duration: UNDO_DELETE_TOAST_MS` (5000). No toast is created with an `id` option.
- [ ] Undo calls `POST /api/content/:slug/:id/restore` for exactly that toast's entry, then invalidates content, Trash, activity and back-refs. Undo is offered only with `content:update`.
- [ ] The undo toast is raised even when the calling component (the entry editor) has unmounted.
- [ ] Bulk delete of two or more ids always requires the confirmation modal, has no undo, and on partial failure keeps the dialog open with a localized per-id error and only the failed ids queued for retry.
- [ ] `TrashListResponse.retentionDays` exists. The Trash countdown uses it, shows `content.trash.neverPurged` for `0`, and no dashboard file reads `seed.retentionDays`.
- [ ] Settings → Site has a Trash retention field. Values that fail `isValidRetentionDays` (from `@beechcms/core`) are refused client-side with nothing sent. Valid values (including `0`) are sent as numbers.
- [ ] `SchemaFormViewModel` no longer has `showDeleteConfirm` / `setShowDeleteConfirm`, and both implementers compile.
- [ ] `en.json` and `it.json` carry the same new keys (Task 7).
- [ ] `docs/features/trash.md` Dashboard Experience describes instant delete + undo, the bulk modal, the effective countdown and the Settings field.
- [ ] No file under `packages/**` or `apps/api/**` changed. No new cross-slice import. `lib/trash-cache.ts` is not re-exported from the barrel.
- [ ] All SECTION 5 commands pass. `apps/dashboard` `tsc` stays at 0 errors.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executor MUST NOT:
- Touch `apps/api/**` or `packages/**`. That includes adding a server bulk soft-delete endpoint: bulk stays client-side `Promise.allSettled` over the existing `DELETE`.
- Add undo for bulk deletion, a confirmation for single deletion, or a client-side delayed delete (brief §5).
- Add a Seed Builder field for `retentionDays`. **Decision of this sprint:** the per-seed override stays a manifest / `PUT /api/seeds/:slug` contract field.
- Build a custom toast queue, a global undo stack, or a Mod+Z / keyboard shortcut for undo.
- Pass a fixed `id` to sonner toasts, change the `<Toaster />` configuration (`main.tsx`, `components/ui/sonner.tsx`), or override sonner's hover-pause behaviour.
- Change `ContentDeleteDialog` / `useContentDeleteDialog`, `ViewEntryActions`, `content-view-workspace.tsx` or the view registry.
- Surface the restore auto-rename (`-restored-<id8>`) in the undo toast. Within a 5-second window it is practically unreachable, and the Trash page already surfaces it.
- Change the Trash page's restore/purge flows beyond passing `retentionDays`.
- Fix the sprint-1/2 review leftovers (`useContentTrash` `enabled` option, the `trash-retention.integration.test.ts` two-GET case, `parseTrashRetentionDays` accepting `'1e2'`).
- Hand-edit `docs/api/**`.
