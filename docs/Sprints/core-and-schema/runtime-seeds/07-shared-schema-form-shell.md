# Runtime Seeds — Sprint 07: Shared Schema-Form Shell (dependency inversion)

> **Audience:** an AI coding agent with no prior knowledge of Beech CMS. Everything is
> inline. Trust live code over snippets if they drift.
>
> **Depends on Sprint 05** (the Seed Builder UI). Read [`00-overview.md`](./00-overview.md)
> and [`seed-creation-modal-analysis.md`](./seed-creation-modal-analysis.md) first.

## 0. Why this sprint exists

`seed-creation-modal-analysis.md` asked whether the Seed-creation modal
(`SeedEditorDialog`) can be **unified** with the universal content modal
(`EntryEditorDialog`). The answer, validated against the live code, is **yes — and
cheaply** — because `EntryEditorDialog` is **already a pure presentational component**.
It contains no business logic: every value it renders comes from a single hook call.

```tsx
// apps/dashboard/src/features/entry-editor/entry-editor-dialog.tsx
export function EntryEditorDialog(props) {
  const { t, seed, formData, fieldErrors, layout, branchById,
          handleInputChange, handleSubmit, /* …~35 fields… */ } =
    useEntryEditorDialog({ schemaSlug, entryId, isDraftContext, onClose })
  // …JSX only…
}
```

The body is drawn by `LayoutRenderer`, which is driven **only** by `layout`,
`branchById`, `formData`, `fieldErrors`, and `handleInputChange`. That means: if a
**different hook** returns the **same shape**, the **same dialog** can edit a different
domain object — including a `Seed`. This is the "same UI, swappable business logic"
strategy. Sprint 07 makes that swap **type-safe** by inverting the dependency; sprints
08–09 use it to render the Seed editor; sprint 10 (optional) lights up the reusable
field type behind it.

**This sprint changes no behaviour.** It is a pure refactor of the `entry-editor` slice
that leaves the content create/edit/draft/delete flows byte-for-byte identical, verified
by the existing tests.

## 1. Role & ground rules

Senior front-end engineer, `apps/dashboard`: React 19 + Vite + Tailwind 4 +
shadcn/radix + TanStack Query + React Router + react-hook-form + zod + i18next.
**Vertical Slice Architecture**: code lives in `apps/dashboard/src/features/<name>/`
with an `index.ts` barrel; never import another slice's internals. All visible text via
`t()` with keys in both `apps/dashboard/src/locales/{it,en}.json`. Docs English.

## 2. What this sprint builds

Inside the **existing** `entry-editor` slice
(`apps/dashboard/src/features/entry-editor/`):

1. **`SchemaFormViewModel`** — an explicit TypeScript interface describing the exact
   shape the dialog consumes. Today that shape is the implicit return type of
   `useEntryEditorDialog`. We name it so any hook can implement it.
2. **`capabilities`** — a small flag object on the view-model that gates the
   **entry-specific chrome** (drafts, back-references, delete, layout-builder). The
   content hook sets them all `true`; future hooks (the Seed hook, sprint 09) set the
   irrelevant ones `false`.
3. **`SchemaFormShell`** — the presentational component extracted from
   `EntryEditorDialog`. It receives a `SchemaFormViewModel` as a prop and renders it.
   No hooks of its own except local UI state already present.
4. **`EntryEditorDialog`** — reduced to a 3-line wrapper:
   `const vm = useEntryEditorDialog(props); return <SchemaFormShell vm={vm} />`.
5. The slice `index.ts` additionally exports `SchemaFormShell` and the
   `SchemaFormViewModel` / `SchemaFormCapabilities` types, so the `seed-builder` slice
   can consume them in sprint 09 without crossing internal boundaries.

## 3. The view-model contract — `renderer/schema-form-view-model.ts` (new)

Create `apps/dashboard/src/features/entry-editor/renderer/schema-form-view-model.ts`.
Mirror the **current** return object of `useEntryEditorDialog` exactly (see
`hooks/use-entry-editor-dialog.ts` lines ~389–426), then fold the entry-specific booleans
into a `capabilities` object. Keep field names identical so the JSX needs minimal edits.

```ts
import type { FormLayout } from "@beechcms/core"
import type { Blocker } from "react-router-dom"
import type { RendererBranchMap } from "./layout-renderer"

/**
 * Capability flags gate the *entry-specific* chrome of the shell.
 * The content hook (useEntryEditorDialog) sets every flag true.
 * The Seed hook (sprint 09) sets drafts/backrefs/delete/layoutBuilder false.
 *
 * SPRINT 10 NOTE: capabilities is intentionally an open object so future
 * consumers (e.g. a repeater sub-form) can add flags without touching the shell.
 */
export interface SchemaFormCapabilities {
  readonly drafts: boolean        // draft notices + save-draft dropdown
  readonly backrefs: boolean      // ReferencedByPanel in edit mode
  readonly delete: boolean        // destructive delete button + confirm
  readonly layoutBuilder: boolean // the "edit layout" pencil + BuilderPane
}

/**
 * The complete shape SchemaFormShell consumes. Any hook that implements this
 * interface can drive the shell. `useEntryEditorDialog` is the first implementer;
 * `useSeedEditorDialog` (sprint 09) is the second.
 */
export interface SchemaFormViewModel {
  t: (key: string, params?: Record<string, unknown>) => string
  title: string                   // NEW: precomputed by the hook (was inlined as pageTitle)
  isCreate: boolean

  // schema + form state
  seed: { label: string; slug: string } | null
  layout: FormLayout | null
  branchById: RendererBranchMap
  formData: Record<string, unknown>
  fieldErrors: Record<string, string>

  // loading / error
  isSeedLoading: boolean
  isLoadingEntry: boolean
  errorEntry: string | null
  notFoundLabel: string           // NEW: what to show when seed is null (slug, etc.)

  // submit
  handleInputChange: (alias: string, value: unknown) => void
  handleSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void | Promise<void>
  isBusy: boolean
  saveLabel: React.ReactNode      // NEW: hook decides "Create" / "Save" / "Save draft"

  // navigation / dirty guard
  goBack: () => void
  blocker: Blocker

  // capabilities + their handlers (only read when the matching flag is true)
  capabilities: SchemaFormCapabilities

  // drafts (read only when capabilities.drafts)
  effectiveDraftContext: boolean
  hasPendingDraftNotice: boolean
  hasSaveDropdown: boolean
  isPublishing: boolean
  isDiscarding: boolean
  showDiscardConfirm: boolean
  setShowDiscardConfirm: (v: boolean) => void
  handlePublishDraft: () => void
  handleDiscardDraft: () => void
  navigate: (to: string, opts?: unknown) => void
  schemaSlug: string
  entryId: string | undefined

  // delete (read only when capabilities.delete)
  isDeleting: boolean
  showDeleteConfirm: boolean
  setShowDeleteConfirm: (v: boolean) => void
  handleDelete: () => void
  hasRestrictedRefs: boolean
  setHasRestrictedRefs: (v: boolean) => void

  // layout builder (read only when capabilities.layoutBuilder)
  canEditLayoutFlag: boolean
  builderMode: boolean
  setBuilderMode: (v: boolean) => void
}
```

> **Pragmatic note:** the goal is *not* a minimal interface; it is a faithful one. Copy
> the current return shape, then add the five precomputed fields (`title`,
> `notFoundLabel`, `saveLabel`) the JSX currently computes inline, and the `capabilities`
> object. Moving the small inline computations (`pageTitle`, `getSaveButtonText`) into the
> hook is what lets a second hook fully control the shell.

## 4. Update the content hook — `hooks/use-entry-editor-dialog.ts`

Keep all current logic. Only:

1. Type the return as `SchemaFormViewModel`.
2. Add `title` (the current `pageTitle` logic), `notFoundLabel`
   (`t("content.editor.seedNotFound", { slug: schemaSlug })`), and `saveLabel`
   (the current `getSaveButtonText()` body, minus the spinner which the shell already
   adds — or keep the spinner here; pick one and keep the shell dumb).
3. Add the `capabilities` object — for content, **all true**:

```ts
const capabilities: SchemaFormCapabilities = {
  drafts: true,
  backrefs: true,
  delete: true,
  layoutBuilder: true,
}
return { /* …existing fields…, */ title, notFoundLabel, saveLabel, capabilities }
```

No state, query, or handler changes. The content flows must behave identically.

## 5. Extract the shell — `renderer/schema-form-shell.tsx` (new)

Move the **entire JSX** of the current `EntryEditorDialog` into
`SchemaFormShell({ vm }: { vm: SchemaFormViewModel })`. Mechanical transform:

- Replace every destructured local (`seed`, `formData`, …) with `vm.seed`, `vm.formData`,
  … (or destructure `const { … } = vm` at the top — cleaner).
- Replace inline `pageTitle` with `vm.title`, the save-button computation with
  `vm.saveLabel`, and the not-found copy with `vm.notFoundLabel`.
- **Gate the entry-specific chrome behind capability flags** so a Seed view-model can
  switch it off:

```tsx
{/* layout-builder pencil */}
{vm.capabilities.layoutBuilder && vm.canEditLayoutFlag && vm.seed && ( …pencil… )}
{vm.capabilities.layoutBuilder && vm.builderMode && vm.seed && ( <BuilderPane … /> )}

{/* draft notices */}
{vm.capabilities.drafts && vm.effectiveDraftContext && ( …draft notice… )}
{vm.capabilities.drafts && !vm.effectiveDraftContext && vm.hasPendingDraftNotice && ( … )}

{/* back-references — edit mode only */}
{vm.capabilities.backrefs && !vm.isCreate && vm.schemaSlug && vm.entryId && (
  <ReferencedByPanel … />
)}

{/* delete button */}
{vm.capabilities.delete && !vm.isCreate && !vm.effectiveDraftContext && ( …delete… )}

{/* save-draft split dropdown */}
{vm.capabilities.drafts && vm.hasSaveDropdown && ( …dropdown… )}
```

- The three alert dialogs at the bottom (unsaved-changes, discard-draft, delete-entry)
  stay, but guard the draft/delete ones with the matching capability so they never open
  for a Seed:
  `{vm.capabilities.delete && <AlertDialog open={vm.showDeleteConfirm} …>}`.
- The unsaved-changes blocker alert (`vm.blocker`) is **universal** — keep it ungated.
- The `LoadingDialog` / `SeedNotFoundDialog` / `EntryErrorDialog` helper components move
  with the shell. `SeedNotFoundDialog` should render `vm.notFoundLabel` instead of
  hard-coding the content i18n key, so a Seed context can supply its own message.

> **Forward-compat for sprint 10 — leave a comment here.** The body renders fields via
> `LayoutRenderer` → `FieldEdit`, which resolves a renderer by `branch.type`. Add:
> ```tsx
> {/* Field rendering is fully registry-driven. New branch types (e.g. the
>     'repeater' added in sprint 08, promoted to a core BranchType in sprint 10)
>     appear here automatically with zero changes to this shell. */}
> ```

## 6. Reduce `entry-editor-dialog.tsx` to a wrapper

```tsx
import { useEntryEditorDialog } from "./hooks/use-entry-editor-dialog"
import { SchemaFormShell } from "./renderer/schema-form-shell"

export interface EntryEditorDialogProps {
  schemaSlug: string
  entryId: string | undefined
  isDraftContext: boolean
  open: boolean
  onClose: () => void
}

export function EntryEditorDialog(props: Readonly<EntryEditorDialogProps>) {
  const vm = useEntryEditorDialog(props)
  return <SchemaFormShell vm={vm} open={props.open} />
}
```

(The shell needs `open` for the `<Dialog open={…}>` — pass it as a second prop, or fold
it into the view-model. Keep it a prop to avoid threading window state through the hook.)

## 7. Barrel — `index.ts`

```ts
export { EntryEditorDialog } from "./entry-editor-dialog"
export { SchemaFormShell } from "./renderer/schema-form-shell"
export type {
  SchemaFormViewModel,
  SchemaFormCapabilities,
} from "./renderer/schema-form-view-model"
export { LayoutRenderer } from "./renderer/layout-renderer"
export type { RendererBranchMap, RendererProps } from "./renderer/layout-renderer"
export { LayoutBuilderDialog } from "./builder/layout-builder-dialog"
export type { LayoutBuilderDialogProps } from "./builder/layout-builder-dialog"
```

## 8. Tests

The whole point of this sprint is **invisibility**. Add/keep:

- The existing entry-editor tests must pass **unchanged** (create, edit, draft save,
  publish, discard, delete, dirty-guard). If any test imported internal helpers that
  moved, update the import path only — never the assertions.
- New unit test `schema-form-shell.test.tsx`: render `SchemaFormShell` with a hand-built
  `SchemaFormViewModel` fixture and assert capability gating:
  - `capabilities.delete=false` → no delete button, delete confirm never mounts.
  - `capabilities.drafts=false` → no draft notice, no save-draft dropdown.
  - `capabilities.backrefs=false` → no `ReferencedByPanel`.
  - `capabilities.layoutBuilder=false` → no layout pencil.
  - With all flags `true` and a 1-tab layout, fields render via `LayoutRenderer`.

## 9. Acceptance criteria

- [ ] `SchemaFormViewModel` + `SchemaFormCapabilities` declared and exported from the
      slice barrel.
- [ ] `useEntryEditorDialog` returns `SchemaFormViewModel` (incl. `title`,
      `notFoundLabel`, `saveLabel`, `capabilities` all-true). No behavioural change.
- [ ] `SchemaFormShell` is the presentational component; `EntryEditorDialog` is a thin
      wrapper.
- [ ] Entry-specific chrome (drafts, backrefs, delete, layout-builder) is capability-gated.
- [ ] All existing dashboard tests pass; new shell capability tests added.
- [ ] `pnpm run lint`, `pnpm run build`, `pnpm run test` pass in `apps/dashboard`.

## 10. Do NOT

- Do **not** change any content create/edit/draft/delete behaviour. This is a refactor.
- Do **not** add the Seed hook here (sprint 09) or any field renderer (sprint 08).
- Do **not** make the shell call domain hooks itself — it only reads `vm`. Dependency
  flows hook → view-model → shell, never the reverse.
- Do **not** delete `SeedEditorDialog` yet (sprint 09 replaces it).
- Do **not** import `entry-editor` internals from other slices — only the barrel.
