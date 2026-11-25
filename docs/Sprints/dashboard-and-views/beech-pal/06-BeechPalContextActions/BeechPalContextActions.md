# Sprint Plan — BeechPalContextActions (BeechPal, sprint 7 of 11)

Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md` (entry 6).
Feature brief: `stages/00_ideation/output/feature_brief.md`, user story "trovare in cima alla palette
le azioni pertinenti alla pagina in cui mi trovo", business rules 1 (one execution path), 2 (confirm
destructive or irreversible actions), 4 (visible but disabled without permission), 5 (hosts declare,
the palette aggregates), §4 "Esecuzione delle azioni e sicurezza" (target frozen at selection, cancel
leaves state unchanged and returns to the palette) and §4 "Azioni di contesto" (actions follow the
active page; missing target ⇒ clear failure, no partial state).
Previous sprints (shipped, review PASS): `docs/Sprints/BeechPalProviderEngine/`,
`docs/Sprints/BeechPalLocalTools/`, `docs/Sprints/SearchResultMetadataApi/`,
`docs/Sprints/BeechPalContentSearch/`, `docs/Sprints/BeechPalRowActions/`,
`docs/Sprints/BeechPalQuickNotes/`.

### Pre-Computation Analysis

Graph refreshed with `graphify update . --force` (30211 nodes, 44257 edges) before any query.

**a) God Nodes identified via the CLI**

| Node | Source | Role in this sprint |
|------|--------|---------------------|
| `CommandPalette()` | `features/command-palette/command-palette.tsx:L109` | Engine. Reads the published declarations, registers the context provider, owns the confirmation step. Public props unchanged. |
| `PaletteProvider` / `PaletteItem` | `features/command-palette/types.ts:L106`, `L65` | Unchanged. The new provider maps declarations onto them. |
| `collectPaletteItems()` | `lib/collect-palette-items.ts:L28` | Unchanged. Already resolves `requires` and `unavailableReason` (sprint 5). |
| `useEntryEditorDialog()` | `features/entry-editor/hooks/use-entry-editor-dialog.tsx:L183` | First host. Owns every handler the palette must reuse (degree 19: content-management mutations, `useDeleteWithUndo`, `usePermissions`). |
| `EntryEditorDialog()` | `features/entry-editor/entry-editor-dialog.tsx:L19` | Holds `open`, which the hook does not receive today. Mounted by 4 hosts (see c). |
| `usePermissions()` | `features/shared/hooks/use-permissions.ts` | The only node linking palette and editor (`graphify path` below). Read only. |
| `ConfirmDialog()` | `components/ui/confirm-dialog.tsx:L27` | Reused as is for the palette's confirmation. |

**b) Architectural boundaries affected**

- `@beechcms/core`: none.
- `apps/api`: none. Every action reuses an existing dashboard handler that already calls an existing
  route (draft `PUT`/`POST …/publish`/`DELETE`, content `PUT`/`POST`/`DELETE`,
  `apps/api/src/middleware/permission.middleware.ts:L154–L156` for the draft rows).
- `apps/dashboard`:
  - `src/features/shared/`: new declaration contract and module store (`hooks/use-page-actions.ts`),
    re-exported by the barrel. Neither slice imports the other.
  - `src/features/command-palette/` (owner of aggregation): one provider, one pending-confirmation
    type, engine wiring.
  - `src/features/entry-editor/` (first host): one pure declaration builder, the hook publishes it
    while the dialog is open.
  - `src/locales/en.json`, `it.json`: 3 keys under `content.editor`, 1 under `commandPalette.context`.
  - `src/pages/*`, `App.tsx`, every other slice: unchanged.
- `docs/features/command-palette.md`: one capability bullet.

**c) `graphify affected` impact analysis**

```
graphify path "CommandPalette()" "useEntryEditorDialog()"
  CommandPalette() --calls--> usePermissions() <--calls-- useEntryEditorDialog()   (shared only: no direct edge)

graphify affected "useEntryEditorDialog()" --depth 2
- entry-editor-dialog.tsx, EntryEditorDialog(), use-entry-editor-dialog.test.tsx, index.ts
- App.tsx, relation.tsx, ContentListModals.tsx, data-table-widget.tsx, content-list.tsx
- test/cross-slice/entry-editor.test.tsx, entry-editor-localization.test.tsx

graphify affected "EntryEditorDialog()" --depth 2
- relation.tsx (nested read-only editor, open={true}), ContentListModals.tsx, data-table-widget.tsx,
  content-list.tsx, App.tsx, main.tsx, registry.ts, widget-lab.tsx, builtin-widgets.tsx
- cross-slice: entry-editor(.localization).test.tsx, relation.test.tsx, content-list-relation.test.tsx, app.test.tsx

graphify affected "SchemaFormViewModel" --depth 2
- use-entry-editor-dialog.tsx, schema-form-shell.tsx, SeedBuilderPage.tsx (builds its own vm), 5 tests

graphify affected "CommandPalette()" --depth 2
- App.tsx, index.ts, app-command-palette.tsx, command-palette.test.tsx, app.test.tsx, main.tsx,
  palette-providers.ts(+test)

graphify affected "PaletteItem" --depth 2
- 33 nodes, all in the slice or the composition root (unchanged type)

graphify affected "ConfirmDialog()" --depth 2
- builder-pane.tsx (x2), dashboard-builder-dialog.tsx, content-list.tsx, schema-form-shell.tsx (unchanged component)
```

Breaking-change verdict:
- `SchemaFormViewModel` is **not** changed: `SeedBuilderPage.tsx` builds its own view model, and any new
  required member would break it. The declaration is built and published inside the hook.
- `UseEntryEditorDialogProps` gains an **optional** `open`. The existing hook test and every
  `EntryEditorDialog` mount compile unchanged.
- Four suites mock the `@/features/shared` barrel with a fixed object
  (`test/cross-slice/entry-editor.test.tsx:L134`, `relation.test.tsx:L13`,
  `content-list-relation.test.tsx:L22`, `features/command-palette/test/unit/command-palette.test.tsx:L31`).
  A barrel import of the new hooks would be `undefined` there and crash. Both consumers therefore
  import the module path `@/features/shared/hooks/use-page-actions`, as the editor already does for
  `use-permissions` (`use-entry-editor-dialog.tsx:L31`). The real store then runs in every suite.
- No existing provider, `PaletteItem` literal or `src/pages/*` file changes.

Findings that shape the plan:
1. **No React context, a module store.** The editor renders in a Radix portal under four different
   parents (list page, dashboard widget, relation field, App route). A context would need a provider
   above all of them plus a composition-root change. A module store with `useSyncExternalStore`
   needs neither, and hosts that unmount withdraw their own declaration. Nothing like it exists in
   `src` today, so the store is new; it lives in `features/shared` because both slices read it.
2. **`open` lives one level up.** `useEntryEditorDialog` runs while the dialog is closed
   (`ContentListModals.tsx:L103–L112`, `data-table-widget.tsx:L138–L146` keep it mounted with
   `open={false}`). Publishing must follow `open`, so the hook receives it.
3. **Two editors at once.** `components/fields/display/relation.tsx:L206–L213` opens a read-only
   editor on top of an open editor. Both publish; the most recently published comes first, so the
   top-most dialog's actions lead. Each group carries its own title.
4. **What the brief lists vs what exists.** The brief names save draft, publish, duplicate, copy ID,
   revision history. Duplicate and revision history exist nowhere (no button, no endpoint: grep of
   `apps/dashboard/src` and `apps/api/src` finds neither). Brief rule 1 forbids a palette-only
   implementation, so they are out of scope (roadmap entry 6 note). The editor declares what its
   footer and banner already offer: save, publish draft, discard draft, delete, plus copy ID
   (a read-only copy, so rule 1 does not apply).
5. **Confirmation, one rule per action.**
   - *Publish draft* overwrites the live version and has no confirm on its button
     (`schema-form-shell.tsx:L403`). The brief names "pubblicare" explicitly: the palette asks first.
   - *Discard draft*: the button already opens the host's own `AlertDialog`
     (`setShowDiscardConfirm(true)`, `schema-form-shell.tsx:L317`). The palette calls the same setter;
     a second palette confirm would double it.
   - *Delete* is a soft delete with a 5000 ms Undo toast (`useDeleteWithUndo`). The design contract
     (`_config/design_system.html:L542–L545`) reserves `ConfirmDialog` for irreversible or bulk
     actions. The palette runs the button's handler, Undo included, without a confirm.
6. **Frozen target.** `ContentListModals` re-renders the same `EntryEditorDialog` instance with a new
   `entryId` when the target changes. A confirmed action whose closure reaches the editor's latest
   handlers could then act on a different record. At confirm time the engine checks that a
   declaration with the frozen `hostId` and `targetId` is still published, and refuses otherwise.
   A record deleted on the server in the meantime fails inside the handler with the button's own
   error toast (rule 1), leaving no partial state.
7. **Keystrokes must not re-publish.** The handlers are re-created on every render. If the
   declaration held them directly, every field edit would re-publish and re-render the palette. The
   hook keeps the handlers in a ref updated in an effect (pattern: `json-code-editor.tsx:L115–L118`)
   and memoises the declaration over the flags it shows.

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

- **Rule 1, YAGNI.** One contract file, one provider, one builder, three wiring edits. Cut:
  - duplicate and revision history (no feature exists, finding 4);
  - media library actions (no media surface exists; deferred to new roadmap entry 6b);
  - actions on the content list, trash or settings pages (the brief's example is the editor; any page
    can declare later with one hook call);
  - per-action keyboard shortcuts, row secondary actions on context rows, a context prefix;
  - a palette-level confirm on delete (Undo is the contract, finding 5).

  The store is needed now (one host, a nested second instance) and is the brief's mandated shape
  (rule 5). **No VETO.**
- **Rule 2, Botanical invariant.** No data access added. Every mutating action calls the editor's
  existing handler, which calls the existing RPC through `features/content-management`. **Respected.**
- **Rule 3, VSA.** The contract is in `features/shared`. The editor imports it; the palette imports it;
  `graphify path` shows no edge between the two slices besides `usePermissions`. The palette never
  imports the editor, and the editor never imports the palette. **Respected.**
- **Rule 4, Cloudflare purity.** Nothing server side. **Respected.**
- **Rule 5, minimal blueprint.** Core 0, api 0. Dashboard: 3 slices; 3 new source files, 6 edited;
  3 new test files, 2 edited; 2 locale files; 1 doc. **Respected.**

HANDOFF -> caveman_coder

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprints 1–5 built the provider engine, the prefix router, the async lane, row actions and the
row-level `unavailableReason`. Every row so far comes from a provider the palette owns or from the
composition root. The brief's second promise, "azione nel contesto", needs rows that belong to the
page the user is on, whose handlers live inside another slice.

This sprint lands the contract that makes that possible without breaking VSA: hosts publish
declarations through `features/shared`, the palette reads them. The entry editor is the first host
because the brief names it and because it exercises every rule at once: permissions per seed,
an irreversible action (confirm), an action with the host's own confirm, a soft delete with Undo,
busy states, two instances on screen, and a target that can change under the same component.

Roadmap entries 6b (media actions) and any later page reuse the same hook. Entry 9 (pins) excludes
these rows by design (brief: no pins for record-bound actions).

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Precondition.** Sprint 5 (`BeechPalQuickNotes`, review PASS) is still uncommitted on
`feature/beechpal-quick-notes` (HEAD `6db1d36d`). The human commits it; the executor branches
`feature/beechpal-context-actions` from that commit. Line numbers below are as of that working tree.

**Palette contract** (`features/command-palette/types.ts`):
- `PaletteRequirement { permission; scope? }` (L39–L43);
- `PalettePerform`: `navigate`, `page`, `run`, `copy` (L49–L53);
- `PaletteItem` with `requires`, `unavailableReason`, `score`, `actions` (L65–L95);
- `PaletteProvider` (L106–L117).

**Collection** (`lib/collect-palette-items.ts`): `servesContext` silences providers without the typed
prefix (L14–L20); `disabledReason` = missing permission, else `unavailableReason` (L50–L56); first id
wins (L48).

**Ranking** (`lib/rank-palette-items.ts:L15–L31`): blank query keeps input order; ties keep input
order; `section` is matched as a keyword.

**Engine** (`command-palette.tsx`):
- `useCommandPalette()` gives `open`, `setOpen` (L113–L115);
- providers memo (L149–L168): calculator, conversions, navigation, content, host, notes, tools;
- `runPerform` closes the palette after `navigate`, `run`, `copy` (L208–L226);
- JSX: one `CommandDialog` inside a fragment (L248–L287).

**Shared barrel** (`features/shared/index.ts:L5–L11`): query keys, `useSchema`, `useLocaleConfig`,
view registry, `useMe`, `usePermissions`, card config dialog. Tests for shared live flat in
`features/shared/test/`.

**Editor hook** (`features/entry-editor/hooks/use-entry-editor-dialog.tsx`):
- `UseEntryEditorDialogProps` (L50–L59), no `open`;
- `isDeleting` (L206), `hasPendingDraftNotice` (L208), `effectiveDraftContext` (L210),
  `showDiscardConfirm` setter (L212), `isDiscarding` (L221), `hasRestrictedRefs` (L231),
  `builderMode` (L232), `isReadOnly` (L233);
- `handlePublishDraft` (L352–L367), `handleDelete` (L466–L472), `handleSaveLive` (L506–L555),
  `handleSaveDraftOnly` (L557–L580), `handleSubmit` dispatches between the two saves (L582–L589);
- `isBusy` (L591), `hasSaveDropdown` (L592), `title` (L594–L598), `saveLabel` branches (L602–L616);
- `errorEntry` (L419–L420), `isSeedLoading` / `isLoadingEntry` from L196 / L200.

**Editor shell** (`renderer/schema-form-shell.tsx`), the buttons the palette mirrors:
- loading / not found / error bodies (L189–L191);
- footer shown only when `!vm.isReadOnly` and not on the danger-zone tab (L355);
- delete: rendered when `capabilities.delete && !isCreate && !effectiveDraftContext` (L359), disabled
  with tooltip `backrefs.deleteBlocked` (`{ count: "?" }`) when `hasRestrictedRefs` (L361–L373);
- save submit, disabled when `isBusy` (L391); publish / discard dropdown when `hasSaveDropdown`
  (L394–L415);
- pending-draft banner's discard button, `disabled={isDiscarding}` (L299–L324).

**Mount sites of `EntryEditorDialog`**: `ContentListModals.tsx:L103`, `data-table-widget.tsx:L138`,
`relation.tsx:L206` (read-only, nested), the `/content/:slug/:id` route via `content-list.tsx`.

**Confirm dialog** (`components/ui/confirm-dialog.tsx:L18–L25`): `open`, `onOpenChange`, `title`,
`description`, `confirmVariant`, `onConfirm`; confirm label fixed to `common.confirm`.

**Locale keys already present**: `content.editor.save`, `saveDraft`, `publishDraft`, `discardDraft`,
`common.create`, `common.delete`, `content.actions.copyId`, `backrefs.deleteBlocked`.

**Tests**:
- `features/entry-editor/test/unit/use-entry-editor-dialog.test.tsx`: RPC mocked at `@/lib/rpc`
  (L7–L22, including `draft.$put` and `publish.$post`), `use-permissions` mocked (L23–L25), `t` is the
  identity (L27), helper `editor()` renders the hook in draft context and waits for the draft
  (L64–L72);
- `features/command-palette/test/unit/command-palette.test.tsx`: barrel mock (L31–L40),
  `renderPalette` (L79–L86), `typeInRoot` (L107–L112).

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Create:
- `apps/dashboard/src/features/shared/hooks/use-page-actions.ts`: declaration types and the module store.
- `apps/dashboard/src/features/command-palette/providers/context-actions-provider.ts`
- `apps/dashboard/src/features/entry-editor/lib/entry-page-actions.ts`: pure declaration builder.
- `apps/dashboard/src/features/shared/test/use-page-actions.test.tsx`
- `apps/dashboard/src/features/command-palette/test/unit/context-actions-provider.test.ts`
- `apps/dashboard/src/features/entry-editor/test/unit/entry-page-actions.test.ts`

Edit:
- `apps/dashboard/src/features/shared/index.ts`: re-export the new module.
- `apps/dashboard/src/features/command-palette/types.ts`: `PendingPageAction`.
- `apps/dashboard/src/features/command-palette/command-palette.tsx`: declarations, provider, confirmation.
- `apps/dashboard/src/features/entry-editor/hooks/use-entry-editor-dialog.tsx`: `open` prop,
  `handleSave`, handler ref, publish.
- `apps/dashboard/src/features/entry-editor/entry-editor-dialog.tsx`: pass `open`.
- `apps/dashboard/src/features/entry-editor/test/unit/use-entry-editor-dialog.test.tsx`: cases added.
- `apps/dashboard/src/features/command-palette/test/unit/command-palette.test.tsx`: cases added.
- `apps/dashboard/src/locales/en.json`, `apps/dashboard/src/locales/it.json`.
- `docs/features/command-palette.md`: one Key Capabilities bullet.

Not touched: `apps/api`, `packages/*`, `src/pages/*`, `App.tsx`, `schema-form-shell.tsx`,
`schema-form-view-model.ts`, `components/ui/*`, every other palette provider, `_parts/*`,
`use-command-palette.ts`, `collect-palette-items.ts`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

**Task 1 — Declaration contract and store (`features/shared/hooks/use-page-actions.ts`, new)**

Building blocks, verbatim:

```ts
import type { Permission, Scope } from "@beechcms/core"
import type { IconComponent } from "@/lib/icon-registry"

/** Permission an action needs to be enabled; same shape and evaluation as the palette's requirements. */
export interface PageActionRequirement {
  readonly permission: Permission
  /** GLOBAL_SCOPE ('*') or a seed slug. Omitted: held on at least one scope. */
  readonly scope?: Scope
}

/** Question asked before an irreversible action runs (brief rule 2). Cancelling changes nothing. */
export interface PageActionConfirm {
  readonly title: string
  readonly description: string
  /** Destructive styling on the confirming button (design contract, "Deleting"). */
  readonly destructive?: boolean
}

/** One action a page offers, run through the page's own handler (brief rule 1). */
export interface PageAction {
  /** Unique within its declaration, e.g. "publish-draft". */
  readonly id: string
  /** Translated by the host. */
  readonly label: string
  readonly icon: IconComponent
  readonly keywords?: readonly string[]
  readonly requires?: PageActionRequirement
  /** Why the action cannot run right now (e.g. a save in flight); disables it like a failing `requires`. */
  readonly unavailableReason?: string
  readonly confirm?: PageActionConfirm
  readonly perform:
    | { readonly kind: "run"; readonly run: () => void }
    | { readonly kind: "copy"; readonly value: string }
}

/** Everything one mounted page offers right now. */
export interface PageActionDeclaration {
  /** The declaring surface, e.g. "entry-editor". */
  readonly hostId: string
  /** The record the actions act on; null when there is none (create mode). Frozen with an action when it is selected. */
  readonly targetId: string | null
  /** Group heading in the palette, translated by the host (e.g. "Edit Post"). */
  readonly title: string
  readonly actions: readonly PageAction[]
}

/** Publishes `declaration` while the caller is mounted; null withdraws it. Pass a memoised value. */
export function useDeclarePageActions(declaration: PageActionDeclaration | null): void

/** Every published declaration, most recently published first. Re-renders only when the set changes. */
export function usePageActionDeclarations(): readonly PageActionDeclaration[]

/** The same snapshot outside React (the palette's confirm-time check, tests). */
export function getPageActionDeclarations(): readonly PageActionDeclaration[]
```

Rules:
- Module-level state: entries keyed by a per-caller key (`React.useId()` inside
  `useDeclarePageActions`), a listener set, and a cached snapshot array.
- The snapshot is rebuilt only when an entry is added, replaced or removed, so
  `useSyncExternalStore` receives the same array reference between changes (otherwise React loops).
  `usePageActionDeclarations` passes `getPageActionDeclarations` as both client and server snapshot.
- Order: by the time an entry was **first** published, newest first. Replacing an entry's declaration
  (a new memoised value) keeps its position. Publishing `null`, or unmounting, removes it.
- Publishing the same object again changes nothing and notifies nobody.
- The store never throws and holds no React context. No provider is mounted anywhere.
- Add `export * from "./hooks/use-page-actions"` to `features/shared/index.ts`. Consumers in this sprint
  import the module path `@/features/shared/hooks/use-page-actions` (Pre-Computation, breaking-change
  verdict). Add a one-line comment at each such import saying why.

**Task 2 — Palette provider (`providers/context-actions-provider.ts`, new; `types.ts`)**

In `types.ts`, after `ResolvedPaletteItem`:

```ts
/** A page action picked from the palette that waits for confirmation; its target is frozen at selection. */
export interface PendingPageAction {
  readonly hostId: string
  readonly targetId: string | null
  readonly action: PageAction
}
```

(`PageAction` imported as a type from `@/features/shared/hooks/use-page-actions`.)

```ts
/** Actions declared by the pages on screen, grouped per declaration, before every other local row. */
export function createContextActionsProvider(deps: {
  declarations: readonly PageActionDeclaration[]
  requestConfirm: (pending: PendingPageAction) => void
}): PaletteProvider
```

`id: "context"`, `pages: ["root"]`, no `prefix` (any typed prefix silences it through `servesContext`).
`getItems` ignores the query (the engine ranks lexically) and returns, for each declaration in store
order, one row per action in declaration order:
- `id`: `context:<hostId>:<targetId ?? "new">:<action.id>`. Never pinned (brief: no pins for
  record-bound actions); the duplicate-id guard drops a second identical row.
- `section`: the declaration's `title`; `label`, `icon`, `keywords`, `requires`, `unavailableReason`
  copied from the action.
- `perform`: the action's own `perform` when it has no `confirm`; otherwise
  `{ kind: "run", run: () => requestConfirm({ hostId, targetId, action }) }`, built from the
  declaration being read, so the target is the one visible at selection.
- No `actions`, no `score`, no `description`.

The provider is pure: no store reads, no side effects.

**Task 3 — Engine (`command-palette.tsx`)**

- Import `usePageActionDeclarations` and `getPageActionDeclarations` from the module path, and
  `ConfirmDialog` from `@/components/ui/confirm-dialog`.
- `const declarations = usePageActionDeclarations()`.
- `const [pendingAction, setPendingAction] = React.useState<PendingPageAction | null>(null)`.
- Providers memo: insert `createContextActionsProvider({ declarations, requestConfirm: setPendingAction })`
  after the two computed providers and before navigation; add `declarations` to the dependencies.
  Update the comment on L149 to the new idle order: context, navigation, content, host, notes, tools.
- Selecting a confirmable row runs `requestConfirm` through `runPerform`'s `run` branch, which closes
  the palette in the same event. Nothing else runs.
- Render, inside the fragment after `CommandDialog`, one `ConfirmDialog`:
  - `open={pendingAction !== null}`;
  - `title` / `description` from `pendingAction.action.confirm`;
  - `confirmVariant="destructive"` when `confirm.destructive`, otherwise the default;
  - `onConfirm`: if `getPageActionDeclarations()` still holds a declaration with the frozen `hostId` and
    `targetId`, call `runPerform(pendingAction.action.perform)`; otherwise
    `toast.error(t("commandPalette.context.targetGone"))` and run nothing. In both cases clear
    `pendingAction`.
  - `onOpenChange(false)` without a confirmation (Cancel, Escape): clear `pendingAction` and
    `setOpen(true)`, back to the palette on root (brief §4). A confirmation is followed by the same
    `onOpenChange(false)` in the same event: mark it consumed in a ref set by `onConfirm` and read by
    `onOpenChange`, so a confirmed action never reopens the palette.
- Disabled rows (missing permission, `unavailableReason`) are already skipped by cmdk, Mod+Enter and
  Shift+Enter. No other engine change.

**Task 4 — Declaration builder (`features/entry-editor/lib/entry-page-actions.ts`, new)**

```ts
/** Stable entry points into the editor's own handlers (brief rule 1); never re-created per render. */
export interface EntryPageActionHandlers {
  /** The submit button's path: draft save in draft context, live save otherwise. */
  readonly save: () => void
  readonly publishDraft: () => void
  /** Opens the editor's own discard confirmation, as the dropdown item and the banner button do. */
  readonly requestDiscardDraft: () => void
  /** Soft delete with the 5000 ms Undo toast, as the footer button does. */
  readonly remove: () => void
}

export interface EntryPageActionsInput {
  readonly t: TFunction
  readonly schemaSlug: string
  readonly entryId: string | undefined
  /** The dialog title, e.g. "Edit Post". */
  readonly title: string
  /** The form is on screen: seed loaded, entry loaded without error, layout builder closed. */
  readonly ready: boolean
  readonly isCreate: boolean
  readonly isDraftContext: boolean
  readonly effectiveDraftContext: boolean
  readonly hasSaveDropdown: boolean
  readonly hasPendingDraftNotice: boolean
  readonly hasRestrictedRefs: boolean
  readonly isReadOnly: boolean
  /** isBusy || isDeleting || isDiscarding: a mutation is in flight. */
  readonly isWorking: boolean
  readonly handlers: EntryPageActionHandlers
}

export const ENTRY_EDITOR_HOST_ID = "entry-editor"

/** What the editor offers the palette right now; null while the form is not on screen. Pure. */
export function buildEntryPageActions(input: EntryPageActionsInput): PageActionDeclaration | null
```

Rules (each action mirrors a rendered button, Section 2 "Editor shell"):
- `!ready` → `null`. Otherwise `{ hostId: ENTRY_EDITOR_HOST_ID, targetId: entryId ?? null, title, actions }`.
- Actions, in this order, each included only when its condition holds:

| id | Condition | label | icon | requires (scope `schemaSlug`) | confirm | perform |
|----|-----------|-------|------|-------------------------------|---------|---------|
| `save` | `!isReadOnly` | `content.editor.saveDraft` when `effectiveDraftContext \|\| (isDraftContext && isCreate)`, else `common.create` when `isCreate`, else `content.editor.save` (branch order of L602–L616) | `Check` | `content:create` when `isCreate`, else `content:update` | — | run `handlers.save` |
| `publish-draft` | `!isReadOnly && hasSaveDropdown` | `content.editor.publishDraft` | `Send` | `content:update` | `{ title: content.editor.publishConfirmTitle, description: content.editor.publishConfirmDesc }` | run `handlers.publishDraft` |
| `discard-draft` | `!isReadOnly && (hasSaveDropdown \|\| (!effectiveDraftContext && hasPendingDraftNotice))` | `content.editor.discardDraft` | `Undo` | `content:update` | — (the host confirms) | run `handlers.requestDiscardDraft` |
| `delete` | `!isReadOnly && !isCreate && !effectiveDraftContext` | `common.delete` | `Trash2` | `content:delete` | — (Undo toast) | run `handlers.remove` |
| `copy-id` | `!isCreate && entryId` | `content.actions.copyId` | `Copy` | — | — | copy `entryId` |

- `unavailableReason` on every action except `copy-id`: `backrefs.deleteBlocked` with `{ count: "?" }`
  on `delete` when `hasRestrictedRefs` (the tooltip's text, L371); otherwise `content.editor.busy`
  when `isWorking`; otherwise none.
- Requirement scopes match the API permission table: draft `PUT`/`DELETE`/`publish` are
  `content:update` on the seed (`permission.middleware.ts:L154–L156`).
- Same input → equal output. No `t` call outside the returned strings.

**Task 5 — Publishing from the editor (`use-entry-editor-dialog.tsx`, `entry-editor-dialog.tsx`)**

- `UseEntryEditorDialogProps` gains:

```ts
  /** While true the editor publishes its actions to the command palette. Omitted: never published. */
  open?: boolean
```

- `EntryEditorDialog` passes its `open` prop through (L21).
- Extract `handleSave` from `handleSubmit` (L582–L589): it runs `handleSaveDraftOnly` in
  `effectiveDraftContext`, `handleSaveLive` otherwise. `handleSubmit` keeps `preventDefault` and awaits
  `handleSave`. The submit button and the palette now share one path. `SchemaFormViewModel` is
  unchanged.
- Keep the four handlers (`handleSave`, `handlePublishDraft`, `() => setShowDiscardConfirm(true)`,
  `handleDelete`) in a ref updated in an effect (copy `json-code-editor.tsx:L115–L118`). Build
  `EntryPageActionHandlers` once (`useMemo` with no dependencies), each entry calling the ref and
  discarding the promise with `void`.
- `const declaration = useMemo(() => buildEntryPageActions({...}), [...])` over the flags only:
  `t`, `schemaSlug`, `entryId`, `title`, `ready`, `isCreate`, `isDraftContext`, `effectiveDraftContext`,
  `hasSaveDropdown`, `hasPendingDraftNotice`, `hasRestrictedRefs`, `isReadOnly`, `isWorking`, the
  handlers object. `ready` is `!!seed && !isSeedLoading && !isLocaleConfigPending &&
  !(entryId && (isLoadingEntry || errorEntry)) && !builderMode`. Form data, `isDirty`, field errors
  and touched locales are not dependencies (finding 7).
- `useDeclarePageActions(open ? declaration : null)`.
- The palette runs `save` after closing itself; the editor's own toasts, field errors, conflict
  actions, navigation and `onClose` behave exactly as for the button.

**Task 6 — Locale keys (`en.json` / `it.json`)**

| Key | en | it |
|-----|----|----|
| `content.editor.publishConfirmTitle` | `Publish this draft?` | `Pubblicare questa bozza?` |
| `content.editor.publishConfirmDesc` | `The draft replaces the live version of this entry.` | `La bozza sostituisce la versione pubblicata di questo contenuto.` |
| `content.editor.busy` | `Wait for the current operation to finish` | `Attendi la fine dell'operazione in corso` |
| `commandPalette.context.targetGone` | `The page changed before you confirmed: nothing was done` | `La pagina è cambiata prima della conferma: non è stato fatto nulla` |

`commandPalette.context` is a new nested block next to `commandPalette.notes`.

**Task 7 — Docs (`docs/features/command-palette.md`, Key Capabilities)**

Add one bullet after "Quick notes":
- **Page actions**: while an entry is open, the palette lists its actions first, under the entry's
  title: save (or save draft), publish draft, discard draft, delete, copy ID. They run exactly like
  the editor's buttons. Publishing asks for confirmation; delete keeps its Undo toast. Actions you
  lack the permission for are shown disabled with the missing permission.

**Task 8 — Tests**

Fixtures:
- seed slug `"posts"` and entry data from `CANONICAL_SEEDS` / `CANONICAL_ENTRIES` (`@beechcms/testing`);
- entry ids: UUIDv4 literals declared once per file (Rule 3.6);
- icons: any icon from `@/components/icons`; handlers and `run` functions are `vi.fn()`;
- `t`: the identity-with-params stub of `quick-notes-provider.test.ts` (node files) or the identity of
  `use-entry-editor-dialog.test.tsx:L27`.

`features/shared/test/use-page-actions.test.tsx`, unit (happy-dom, `renderHook`).
`describe("useDeclarePageActions")`:
- `it` a mounted caller's declaration is returned by `getPageActionDeclarations` and
  `usePageActionDeclarations`.
- `it` unmounting the caller withdraws its declaration.
- `it` rerendering with null withdraws the declaration while the caller stays mounted.
- `it` a new declaration from the same caller replaces the old one and keeps its position.
- `it` two callers are listed most recently published first.
- `it` rerendering with the same declaration object keeps the same snapshot reference. Regression
  guard: a fresh array per read makes `useSyncExternalStore` re-render forever.

`features/entry-editor/test/unit/entry-page-actions.test.ts`, unit, `// @vitest-environment node`.
`describe("buildEntryPageActions")`:
- `it` returns null while the form is not ready.
- `it` the action ids per editor state match the table (array-driven: live edit → save, delete,
  copy-id; draft context with dropdown → save, publish-draft, discard-draft, copy-id; pending draft
  outside draft context → save, discard-draft, delete, copy-id; create → save; read-only → copy-id).
- `it` the save label follows the button (array-driven: draft context, create in draft context,
  create, live edit → key).
- `it` save requires content:create in create mode and content:update otherwise, scoped to the seed;
  delete requires content:delete.
- `it` only publish-draft carries a confirmation.
- `it` while a mutation is in flight every mutating action carries the busy reason and copy-id stays
  enabled.
- `it` delete carries the blocked-by-references reason when references restrict it.
- `it` each action runs its own handler (array-driven: action id → handler called once, others not).
- `it` the declaration targets the entry id, and null in create mode.

`features/command-palette/test/unit/context-actions-provider.test.ts`, unit,
`// @vitest-environment node`. `describe("createContextActionsProvider")`:
- `it` without declarations it yields no rows.
- `it` yields one row per action in declaration order, sectioned by the declaration title, with id
  `context:<hostId>:<targetId>:<actionId>`.
- `it` a create-mode declaration (null target) yields ids with `new` in place of the target.
- `it` carries requires, unavailableReason and keywords from the action.
- `it` an action without confirm keeps its own perform (run function identity, copy value).
- `it` an action with confirm runs requestConfirm with the host, the target and the action, and does
  not run the action.

`features/entry-editor/test/unit/use-entry-editor-dialog.test.tsx`, edit. A local helper renders the
hook like `editor()` with `open: true`. Add:
- `it` without open the editor publishes nothing.
- `it` when open with the draft loaded it publishes the editor's declaration targeting the entry.
- `it` editing a field keeps the published declaration object. Regression guard: re-publishing per
  keystroke re-renders the palette on every edit (finding 7).
- `it` running the save action saves the draft through the same request as the submit button
  (`mocked.draftPut` called once with the entry id).
- `it` running the publish-draft action publishes through the draft publish request.
- `it` unmounting the editor withdraws its declaration.

`features/command-palette/test/unit/command-palette.test.tsx`, edit. A local `Host` component calls
`useDeclarePageActions(declaration)` and renders nothing; a helper renders it next to
`CommandPalette` inside the existing providers. Existing cases are untouched. New cases:
- `it` with a page declaration the idle root lists its section before the navigation rows.
- `it` Enter on an action without confirm runs it once and closes the dialog.
- `it` Enter on an action with confirm closes the palette, opens the confirmation and runs nothing.
- `it` confirming runs the frozen action once and leaves the palette closed.
- `it` cancelling the confirmation runs nothing and reopens the palette on root.
- `it` confirming after the host changed its target runs nothing and toasts an error. Regression
  guard: the same editor instance can switch records (finding 6). ARRANGE: select, rerender `Host`
  with another `targetId`; ACT: confirm.
- `it` an action whose requirement fails is disabled with the missing permission and Enter runs
  nothing.
- `it` with the `=` prefix no page action is listed.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repository root unless stated otherwise.

- `npx tsc --noEmit -p apps/dashboard/tsconfig.app.json`
- In `apps/dashboard`:
  `npx vitest run src/features/command-palette src/features/shared src/features/entry-editor src/test/cross-slice src/pages/palette-providers.test.ts`
- `pnpm beech lint`
- `node scripts/check-design-tokens.mjs --format agent apps/dashboard/src/features/command-palette/command-palette.tsx apps/dashboard/src/features/entry-editor/hooks/use-entry-editor-dialog.tsx`
- `pnpm --filter @beechcms/dashboard build`
- `pnpm beech test --diff`. This sprint touches no `packages/` or `apps/api` file; a `packages/core`
  "no tests were run" failure from earlier stacked sprints is known (sprint 5 review) and not caused here.
- `graphify update . --force`, then `graphify path "CommandPalette()" "useEntryEditorDialog()"` must
  still show only the shared `usePermissions` hop.
- Manual gate (human, dev stack):
  - open an entry, press Cmd/Ctrl+K: the entry's actions lead the list under its title;
  - Save from the palette behaves like the button (toast, dialog closes; with a required field empty,
    the same field errors);
  - in draft context, Publish draft asks for confirmation; Cancel returns to the palette; Confirm
    publishes;
  - Discard draft opens the editor's own confirmation; Delete deletes with Undo;
  - Copy ID copies the entry id;
  - a role without `content:delete` on the seed sees Delete disabled with the missing permission;
  - open a related entry from a relation field: its Copy ID group appears above the outer editor's;
  - with no entry open, no page action is listed.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `PageActionRequirement`, `PageActionConfirm`, `PageAction`, `PageActionDeclaration`,
      `useDeclarePageActions`, `usePageActionDeclarations` and `getPageActionDeclarations` match
      Section 4 verbatim and are exported by `@/features/shared`.
- [ ] The store re-renders readers only when a declaration is added, replaced or removed; newest first;
      no React context or provider added.
- [ ] `PendingPageAction` and `createContextActionsProvider` match their signatures; the provider is pure.
- [ ] `EntryPageActionHandlers`, `EntryPageActionsInput`, `ENTRY_EDITOR_HOST_ID` and
      `buildEntryPageActions` match their signatures; the actions and conditions match the Task 4 table.
- [ ] The editor publishes only while `open` and the form is on screen; unmount or close withdraws it.
- [ ] Every mutating action calls the editor's existing handler; the submit button and the palette's
      save share `handleSave`. No new request, mutation or API call.
- [ ] Publish draft asks for confirmation through `ConfirmDialog`; discard uses the editor's own
      confirmation; delete keeps its Undo toast and no confirm.
- [ ] Cancelling a confirmation runs nothing and reopens the palette; confirming never reopens it.
- [ ] A confirmation whose `hostId` + `targetId` is no longer published runs nothing and shows
      `commandPalette.context.targetGone`.
- [ ] Missing permissions disable rows with the permission named; a busy editor disables its mutating
      rows with `content.editor.busy`.
- [ ] Page actions come before navigation on the idle root and are silent under any prefix.
- [ ] `SchemaFormViewModel`, `schema-form-shell.tsx` and every `EntryEditorDialog` mount site are unchanged.
- [ ] `features/command-palette` and `features/entry-editor` do not import each other; both reach the
      contract through `@/features/shared`.
- [ ] Every new string exists in `en.json` and `it.json`.
- [ ] Existing test cases pass unedited; tsc, lint, design-token check, the scoped vitest run and the
      dashboard build pass.
- [ ] `docs/features/command-palette.md` describes page actions.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- Duplicate entry and revision history: no such feature exists (no button, no endpoint). Each needs
  its own brief; once built, the editor adds one row to its declaration (roadmap entry 6 note).
- Media library actions (upload, filter images, empty trash) → roadmap entry 6b
  `BeechPalMediaActions`, blocked until a media library page exists.
- Page actions for the content list, trash, drafts, settings or dashboard pages.
- A palette confirmation on delete (the design contract's Undo toast stays the only safeguard).
- Keyboard shortcuts per action, secondary row actions on page-action rows, a prefix for page actions.
- Keeping the palette open after an action, or reopening it after a confirmed one.
- Any change to `SchemaFormViewModel`, `schema-form-shell.tsx`, `components/ui/confirm-dialog.tsx`,
  `collect-palette-items.ts`, `use-command-palette.ts`, `_parts/*`, `src/pages/*`, `App.tsx`.
- System commands, the `>` prefix, recent items → roadmap entry 7 `BeechPalSystemCommands`.
- UI preferences and pins → roadmap entries 8 `UiPreferencesApi` and 9 `BeechPalPins` (page-action
  rows are never pinnable).
- Any change in `apps/api` or `packages/*`.
