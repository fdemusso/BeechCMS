# Sprint Plan — Entry Editor Dialog Animation Unification

> Feature: fix the two animation defects of the `EntryEditorDialog` modal — the **double
> open animation** (skeleton → form mount thrash inside `SchemaFormShell`) and the
> **suppressed close animation** (instant unmount in `content-list.tsx`).
> This is the **only live deliverable** that survives the brief's VETO/deferral filter
> (`feature_brief.md`). Every other line in the brief is already implemented, explicitly
> VETOED, or deferred to a separate sprint (see Section 7).
> Scope is deliberately narrow: **dashboard UI only. Zero `@beechcms/core` / `apps/api` /
> D1 changes.**

---

## Pre-flight: Relational Mapping & VETO (summary)

**God Nodes affected (verified via graphify + reads):**

| Node | Path | Role |
|---|---|---|
| `ContentListPage` | `apps/dashboard/src/pages/content-list.tsx` | Route-driven mount/unmount of the dialog; owns `dialogOpen` + `handleDialogClose` |
| `EntryEditorDialog` | `apps/dashboard/src/features/entry-editor/entry-editor-dialog.tsx` | Thin wrapper: VM hook → `SchemaFormShell` |
| `SchemaFormShell` | `apps/dashboard/src/features/entry-editor/renderer/schema-form-shell.tsx` | Renders **four distinct `<Dialog>` subtrees** by state (loading / not-found / error / form) |
| `useEntryEditorDialog` | `apps/dashboard/src/features/entry-editor/hooks/use-entry-editor-dialog.tsx` | View-model; exposes `isSeedLoading`, `isLoadingEntry`, `goBack`, etc. |
| `Dialog` primitive | `apps/dashboard/src/components/ui/dialog.tsx` | Radix `Root`/`Content` with `data-open` / `data-closed` enter/exit animations |

**VSA boundary:** all changes are confined to the `entry-editor` slice + its single consumer
page `content-list.tsx`. No cross-slice imports introduced. No Botanical Engine / D1 contact.

**Ponytail VETO check:** PASS. No new dependencies, no new `BranchType`, no core bypass,
no schema/migration change. The fix *removes* component thrash rather than adding machinery —
strictly YAGNI-compliant.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

The list-view presentation sprint (Sprint 01) shipped the table rendering foundation but
explicitly deferred the Entry Editor modal polish. The modal is the single most-used write
surface in the dashboard, and it currently animates incorrectly in **both** directions:

1. **Open:** a double animation — the skeleton dialog animates in, then is torn down and the
   form dialog animates in again.
2. **Close:** no animation at all — the dialog snaps out of existence.

This is a **presentational correctness** fix, not a feature. It belongs in its own narrow
sprint because:

- **It is the only un-VETOED, un-deferred item in `feature_brief.md`.** Bundling it with the
  deferred work (column resizing, click-to-filter) would violate the brief's own scoping.
- **It is a pure Vertical Slice fix.** The defect lives entirely in the `entry-editor` slice
  and its consumer page; isolating it keeps the blast radius to two files of logic and
  guarantees no Botanical Engine / D1 / API surface is touched. The Ponytail invariant
  ("never bypass `@beech/core`") is trivially satisfied because the data layer is not in scope.
- **Root cause is structural, not cosmetic.** The fix requires collapsing the four-`<Dialog>`
  branching in `SchemaFormShell` into a single stable `<Dialog>` whose *body* swaps — a change
  that must land before any future modal work (e.g. transition tuning) is meaningful.

Doing this first establishes a single, stable dialog mount point that downstream modal work
can build on without re-deriving the mount/animation contract.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

### Mount path (route-driven)

`content-list.tsx` derives the open state from the URL, not local state:

```ts
// apps/dashboard/src/pages/content-list.tsx  (L67–79)
const { slug, id: entryId } = useParams<{ slug: string; id?: string }>()
const isCreatePath = location.pathname.endsWith("/create")
const isEditPath   = !!entryId && !isCreatePath
const dialogOpen   = isCreatePath || isEditPath
const handleDialogClose = React.useCallback(
  () => navigate(`/content/${slug}`),   // flips dialogOpen → false on next render
  [navigate, slug]
)
```

```tsx
// apps/dashboard/src/pages/content-list.tsx  (L872–880)
{slug && dialogOpen && (            // ⚠️ dialogOpen short-circuit = instant unmount
  <EntryEditorDialog
    schemaSlug={slug}
    entryId={isCreatePath ? undefined : entryId}   // ⚠️ read live from route
    isDraftContext={!!(location.state as {...})?.isDraftContext}
    open={dialogOpen}
    onClose={handleDialogClose}
  />
)}
```

### Render path (state-driven branching)

`SchemaFormShell` returns **four different `<Dialog>` elements** depending on VM state. Each is
a distinct React subtree, so a state transition (e.g. `isLoadingEntry: true → false`) unmounts
one Radix `<Dialog>` and mounts another:

```tsx
// apps/dashboard/src/features/entry-editor/renderer/schema-form-shell.tsx
if (isSeedLoading || (entryId && isLoadingEntry)) return <LoadingDialog .../>      // L200–202
if (!seed && !isSeedLoading)                       return <SeedNotFoundDialog .../> // L205–207
if (entryId && errorEntry)                         return <EntryErrorDialog .../>   // L210–212
return ( <><Dialog ...> ...form... </Dialog> ...alert dialogs... </> )             // L214–
```

`LoadingDialog`, `SeedNotFoundDialog`, `EntryErrorDialog`, and the main form each instantiate
their own `<Dialog open={open}>` (L75–93, L96–116, L118–138, L216).

### Animation contract (Radix)

`dialog.tsx` relies on Radix `Presence`: `DialogContent` carries
`data-open:animate-in … data-closed:animate-out …` (L66). The exit animation only plays if the
`<Dialog open={false}>` element **stays mounted** long enough for Radix to drive the
`data-closed` state. Today neither direction satisfies this:

- **Open thrash:** the skeleton `<Dialog>` mounts and plays `data-open` (zoom-in-95 + fade), then
  on data arrival it unmounts and the form `<Dialog>` mounts and plays `data-open` again → two
  enter animations.
- **Close suppression:** `handleDialogClose` navigates, `dialogOpen` becomes `false`, and the
  `dialogOpen &&` guard rips the whole `<EntryEditorDialog>` out of the tree on the same commit,
  so Radix never gets to render `data-closed` → exit animation skipped.

### View-model facts (relied upon)

- `useEntryEditorDialog` exposes `isSeedLoading`, `isLoadingEntry`, `seed`, `errorEntry`,
  `notFoundLabel`, `goBack`, plus the full form VM — already a single object (`SchemaFormViewModel`).
- `goBack()` calls `onClose()` (normal context) or `navigate("/drafts")` (draft context). It is
  the canonical close handler and must remain the single source of close intent.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**Modified (3 files, dashboard only):**

1. `apps/dashboard/src/features/entry-editor/renderer/schema-form-shell.tsx`
   — Collapse the four `<Dialog>` branches into **one** stable root `<Dialog open>` whose
     **inner body** swaps between skeleton / not-found / error / form. The `<Dialog>` and
     `<DialogContent>` element identity stays constant across the loading→loaded transition.
   — Delete the standalone `LoadingDialog`, `SeedNotFoundDialog`, `EntryErrorDialog` wrapper
     components (their *bodies* are inlined as plain `<div>` content, not new dialogs).

2. `apps/dashboard/src/pages/content-list.tsx`
   — Remove the `dialogOpen &&` unmount guard. Render `<EntryEditorDialog>` whenever a
     latched target exists, driven by `open={dialogOpen}` so Radix owns the exit animation.
   — Latch the last non-empty `schemaSlug` / `entryId` / `isDraftContext` so the body does not
     blank out while the dialog fades closed (route params clear before the fade finishes).

3. `apps/dashboard/src/features/entry-editor/entry-editor-dialog.tsx`
   — No prop-shape change required; verify it still forwards `open` straight to the single
     shell. (Touched only if the latch in #2 changes which props are passed.)

**Excluded from this sprint:** no changes to `useEntryEditorDialog` logic (VM stays as-is),
no changes to `dialog.tsx` primitive, no transition-duration retuning, no new animation utility.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

> No D1 migration, no TypeScript interface changes to core. The work is JSX/structure only.
> The existing `SchemaFormShellProps` (`{ vm: SchemaFormViewModel; open: boolean }`) is
> unchanged.

### Task 4.1 — Single stable `<Dialog>` in `SchemaFormShell`

Refactor `schema-form-shell.tsx` so there is exactly one `<Dialog open={open} onOpenChange>`
and one `<DialogContent>` rendered on every code path. Replace the early `return`s with a
computed body. Target shape:

```tsx
export function SchemaFormShell({ vm, open }: SchemaFormShellProps) {
  const { /* …existing destructure… */ } = vm
  const [activeTabId, setActiveTabId] = useState(() => layout?.tabs[0]?.id ?? "")
  useEffect(() => { /* unchanged tab-sync effect */ }, [layout, activeTabId, dangerZoneSlot])

  // Decide WHICH body to show — but never which <Dialog> to mount.
  const isLoading  = isSeedLoading || (!!entryId && isLoadingEntry)
  const isNotFound = !isLoading && !seed
  const isError    = !isLoading && !!seed && !!entryId && !!errorEntry

  let body: React.ReactNode
  if (isLoading)       body = <ShellSkeletonBody />
  else if (isNotFound) body = <ShellMessageBody message={notFoundLabel} onClose={goBack} t={t} />
  else if (isError)    body = <ShellMessageBody message={errorEntry!} onClose={goBack} t={t} />
  else                 body = (/* the existing form: toolbar + <form> + ScrollArea + footer */)

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) goBack() }}>
        <DialogContent
          className="flex flex-col max-h-[calc(100vh-2rem)] p-0 sm:max-w-2xl md:max-w-4xl"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader className="px-6 pt-6 pb-2 flex-shrink-0">
            <DialogTitle>{isLoading ? <Skeleton className="h-6 w-48" /> : (title || t("common.error"))}</DialogTitle>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>

      {/* existing AlertDialogs (blocker / discard / delete) stay below, unchanged */}
    </>
  )
}
```

**Body extraction rules:**
- `ShellSkeletonBody` = the inner `<ScrollArea>` + skeleton `<div>`s currently inside
  `LoadingDialog` (L84–90), **without** its own `<Dialog>/<DialogContent>/<DialogHeader>`.
- `ShellMessageBody` = the destructive-banner `<div>` currently inside `SeedNotFoundDialog` /
  `EntryErrorDialog` (L103–113 / L125–135), parameterised by `message`. Both error dialogs
  collapse into this one component.
- The form body is the **existing** JSX from L225–421 (toolbar buttons block + `builderMode`
  `BuilderPane` + `<form>`), moved verbatim under the single `DialogContent`.
- Delete the now-unused `LoadingDialog`, `SeedNotFoundDialog`, `EntryErrorDialog` function
  components and their `LoadingDialogProps` / `SeedNotFoundDialogProps` / `EntryErrorDialogProps`
  interfaces (L52–138).

**Invariant:** the `<DialogContent>` JSX element must be the *same* element on the loading and
loaded commits so React reconciles (not remounts) it — this is what kills the double enter
animation. Do **not** wrap `<DialogContent>` in a conditional or key it by state.

### Task 4.2 — Keep the dialog mounted through the close animation

In `content-list.tsx`, stop gating the dialog on `dialogOpen`. Latch the last known target so
the body survives the fade-out after the route params clear.

```tsx
// derive as today
const isCreatePath = location.pathname.endsWith("/create")
const isEditPath   = !!entryId && !isCreatePath
const dialogOpen   = isCreatePath || isEditPath

// NEW: latch the target so it persists during the closing animation
const isDraftContext = !!(location.state as { isDraftContext?: boolean } | null)?.isDraftContext
const [target, setTarget] = React.useState<
  { schemaSlug: string; entryId: string | undefined; isDraftContext: boolean } | null
>(null)

React.useEffect(() => {
  if (dialogOpen && slug) {
    setTarget({ schemaSlug: slug, entryId: isCreatePath ? undefined : entryId, isDraftContext })
  }
  // when closing, DO NOT clear target here — let Radix finish the exit, then clear (4.3)
}, [dialogOpen, slug, entryId, isCreatePath, isDraftContext])
```

```tsx
// render: gate on the latch, not on dialogOpen
{target && (
  <EntryEditorDialog
    schemaSlug={target.schemaSlug}
    entryId={target.entryId}
    isDraftContext={target.isDraftContext}
    open={dialogOpen}            // ← Radix drives data-closed exit when this flips to false
    onClose={handleDialogClose}
  />
)}
```

`handleDialogClose` is unchanged (`navigate(\`/content/${slug}\`)`). When it fires, `dialogOpen`
→ `false`, Radix plays `data-closed` (fade-out + zoom-out-95) while `target` keeps the content
populated.

### Task 4.3 — Clear the latch after the exit completes

Radix unmounts `DialogContent` after the exit animation. Clear the stale `target` so the next
open starts clean and memory does not retain the last entry. Add an exit hook via Radix
`onAnimationEnd` / the existing `onOpenChange`, or a short post-close timeout matched to the
`duration-100` in `dialog.tsx`:

```tsx
// simplest robust option: clear when the dialog has reported closed AND route is back to list
React.useEffect(() => {
  if (!dialogOpen && target) {
    const id = window.setTimeout(() => setTarget(null), 150) // > duration-100 in dialog.tsx
    return () => window.clearTimeout(id)
  }
}, [dialogOpen, target])
```

> Implementation note for the executing agent: `dialog.tsx` `DialogContent` uses `duration-100`
> (100 ms). The 150 ms clear gives a safe margin. If you prefer event-accuracy over a timer,
> forward an `onCloseAnimationEnd` from a `data-slot="dialog-content"` `onAnimationEnd` handler
> instead — but the timer is acceptable and YAGNI-simpler.

### Task 4.4 — Verify wrapper passthrough

Confirm `entry-editor-dialog.tsx` still forwards `open` unchanged to `SchemaFormShell`
(`<SchemaFormShell vm={vm} open={open} />`). No edit expected unless 4.2 changes the prop set.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# Type-check the dashboard slice (no core/api involved)
cd apps/dashboard && npx tsc --noEmit

# Lint the touched files
cd apps/dashboard && pnpm run lint

# Full dashboard build
cd apps/dashboard && pnpm run build

# Monorepo task graph (ensures nothing downstream broke)
pnpm run build
```

**Manual animation QA (must be performed — automated tests cannot assert the fade):**

```text
1. /content/<slug>/create
   → dialog fades+zooms in ONCE (no skeleton flash re-animating into the form).
2. Open an existing entry that triggers an entry fetch (/content/<slug>/<id>)
   → skeleton shows inside the SAME dialog frame; on data arrival the body swaps
     with NO second enter animation (frame does not zoom/fade again).
3. Close via X, Esc, overlay click, and Cancel/back
   → dialog fades+zooms OUT every time (no instant snap).
4. Not-found slug and entry-load-error
   → message renders inside the same single dialog frame, animates in/out normally.
5. Draft context (from /drafts) close
   → goBack() routes to /drafts with a clean exit animation; latch clears (open again is fresh).
```

No `db:reset:local` / migration step is required — **this sprint does not touch D1.**

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `SchemaFormShell` renders exactly **one** `<Dialog>` and one `<DialogContent>` on every
      state (loading / not-found / error / form); the `<DialogContent>` element is reconciled,
      not remounted, across the loading→loaded transition.
- [ ] `LoadingDialog`, `SeedNotFoundDialog`, `EntryErrorDialog` components and their prop
      interfaces are deleted; their bodies survive as non-dialog body fragments.
- [ ] Opening the editor plays the enter animation **once** (verified manually for create,
      edit-with-fetch, not-found, error).
- [ ] Closing the editor plays the exit animation in **all** close paths (X, Esc, overlay,
      Cancel/back, draft-context back).
- [ ] `content-list.tsx` no longer gates the dialog on `dialogOpen &&`; the dialog stays
      mounted through the exit animation via the latched `target`, then clears.
- [ ] The latched body does not blank/flicker during the close fade (entryId/slug retained).
- [ ] `npx tsc --noEmit` passes in `apps/dashboard` with **zero** new errors; no `@ts-ignore`
      / `any` added.
- [ ] `pnpm run lint` and `pnpm run build` pass at the monorepo root.
- [ ] **Zero** changes to `@beechcms/core`, `apps/api`, `packages/*`, any D1 migration, or
      `dialog.tsx`. `git diff --stat` touches only the three dashboard files in Section 3.
- [ ] No new `BranchType`, no new npm dependency, no cross-slice import introduced.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT build or modify the following. These are either VETOED, already
implemented, or deferred per `feature_brief.md`:

- **DataTable internals / resizable columns** — deferred to *"Sprint 02 — Column Resizing &
  Density"*. Do not touch `data-table.tsx`.
- **Click-to-filter (`applyFilter`) on cell values** — deferred to a later sprint. The filter
  DSL exists; wiring cell clicks is a separate concern.
- **Single-click row routing / Load-More pagination** — YAGNI. Keep double-click routing and
  numbered server-side pagination. Do not add a second pagination paradigm.
- **Avatar *images* for relations** — initials only; image-branch convention is out.
- 🔴 **VETOED — do not implement:** `_liked_by` hearts/favourites; hardcoded phone-number column
  icon; any new `BranchType` (`phone` / `currency` / `duration`).
- **Already implemented — do not reimplement:** rating stars & percentage bars, checkbox,
  tag/status badges, text truncation+reveal, column add/hide/reorder, page-length, sort,
  group-by, advanced filters, bulk actions, search.
- **Any `@beechcms/core` / `apps/api` / D1 change** — including server-side timestamp sorting.
  This sprint is dashboard-only by construction; if such a change appears necessary, STOP and
  escalate — it does not belong here.
- **`dialog.tsx` primitive retuning** — do not change durations, easing, or Radix wiring in the
  shared primitive. This sprint fixes *usage*, not the primitive.
- **View-model logic in `useEntryEditorDialog`** — data fetching, draft logic, and the blocker
  stay exactly as they are. Only render structure and mount lifecycle change.
- **Entry editor *page* (`src/pages/entry-editor.tsx`)** — slated for separate deletion; do not
  refactor it as part of this animation fix.
