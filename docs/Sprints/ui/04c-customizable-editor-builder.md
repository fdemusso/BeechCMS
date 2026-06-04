# UI Refactoring — Sprint 04c: Customizable Entry Editor — Layout Builder UI

> **Audience:** an AI coding agent. Everything needed is inline.

This is the **third and final** sprint. Sprint **04a** built the persistence
and API. Sprint **04b** rewrote the editor as a Dialog driven by a
`FormLayout` JSON. This sprint adds the drag-and-drop Layout Builder UI
matching the mockup in `docs/images/editorPersonalizzazione.png`.

End user-visible result: admins (and only admins) see an "Edit Layout" button
that opens a second dialog showing the current Seed's layout in builder mode —
they can drag sections/columns/fields, change section options via a context
menu, add new fields from a dropdown of remaining branches, save the result
back to the API, or hit Reset to restore the generated default.

---

## 0. ROLE & GROUND RULES

You are a senior TypeScript engineer working on the **Beech CMS monorepo**.

Hard rules:

1. **i18n is mandatory.** No hardcoded UI strings. Add new keys to both
   `apps/dashboard/src/locales/it.json` and `en.json`.
2. **Reuse Shadcn UI components.** Drag-and-drop uses `@dnd-kit/core` (and
   `@dnd-kit/sortable`). Verify with `cat apps/dashboard/package.json`. If
   missing, add: `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities -w apps/dashboard`.
3. **RBAC** is enforced **both** server-side (already done in 04a — the
   `PUT/DELETE` endpoints return 403 to non-admins) and client-side (hide the
   button). Use `canEditLayout(user.role)` from `@beechcms/core` for the
   client check.
4. **Sprint 04a contracts assumed.** Endpoints:
   - `GET /api/schema` — returns seeds with `layout?: FormLayout`.
   - `PUT /api/schema/:slug/layout` — admin-only, validates and stores the layout.
   - `DELETE /api/schema/:slug/layout` — admin-only, removes the stored row
     (frontend will regenerate the default).
5. **Sprint 04b contracts assumed.** The Entry Editor Dialog renders from
   `FormLayout`. The Builder lives **next to** it (separate dialog).
6. **No glassmorphism.** Use standard `DialogContent` styling.

---

## 1. WHAT THIS SPRINT BUILDS

1. **"Edit Layout" button** in the Entry Editor Dialog header — visible only
   when `canEditLayout(user.role)` is true.
2. **Builder Dialog** (`LayoutBuilderDialog`) — mirrors the
   `editorPersonalizzazione.png` mockup. Renders a draft `FormLayout` in
   editable mode with:
   - Tabs at the top with a `…` context menu (rename, delete) and a `+` to add
     a new tab.
   - Section list: each section card shows a drag handle, the section label
     (or "No Label" placeholder), a field-count badge, a `…` context menu
     (hide label, hide border, collapsible, rename, remove), and an internal
     grid of columns.
   - Column: drag handle, branch label, `×` to clear the field, "+ Add Field"
     dropdown for empty columns.
   - "+ Add Section" footer button.
   - "Show Preview" toggle, "Reset" and "Save" buttons in the header.
3. **Drag and drop** via `@dnd-kit`:
   - Sortable **tabs** in the tab strip (left-to-right). The tab at index 0
     is the tab opened by default in the editor (Sprint 04b's
     `LayoutRenderer` already uses `layout.tabs[0].id` as initial
     `activeTabId`), so reordering tabs is how the admin chooses the
     default-open tab.
   - Sortable **sections** within a tab.
   - Sortable **columns** within a section.
   - Sortable **fields** across columns and across sections (move a field
     from a column in section A to a column in section B, even on a
     different tab via the tab strip-drop affordance — see §5.6.4). Moving
     onto a non-empty column **swaps** the two fields.
4. **Field picker dropdown** — opens from "+ Add Field" in any empty column.
   Lists every branch in the Seed that is:
   - `isLayoutableBranch(branch) === true` (Sprint 04a predicate), AND
   - not already placed in the draft layout.
   The picker uses Shadcn `Command` (`CommandInput`, `CommandList`,
   `CommandItem`) for filtering.
5. **Full-width auto-enforcement.** Trying to drop a `richtext` or gallery
   branch into a section that already has other fields triggers a `toast`
   warning and refuses the drop. Same rule when adding via the dropdown.
6. **Reset** — `DELETE /api/schema/:slug/layout` then re-derive
   `generateDefaultLayout(seed)` and replace the draft state.
7. **Save** — `PUT /api/schema/:slug/layout` with the current draft. On
   success, close the builder, invalidate the schema query, and the editor
   re-renders with the new layout.

---

## 2. CONFIRMED DESIGN DECISIONS

### D1 — Builder works on a local draft, not on live state
The builder holds a local `draftLayout` state. Drag-and-drop mutates the draft.
Save persists it. Cancel/Close discards. Reset replaces the draft with the
freshly generated default (and deletes the stored row server-side so reopening
later still shows the default).

### D2 — Branch picker = remaining layoutable branches
A branch can appear in the layout **at most once**. The picker enumerates
`seed.branches.filter(isLayoutableBranch)` and subtracts every branch already
referenced in the draft.

### D3 — Sections without label
Section `label` is optional. When unset, the card header displays "No Label"
(i18n) as a subdued placeholder, matching the mockup. The rename action opens
an inline input.

### D4 — Tab labels
Tabs always have a label (Zod requires `min(1)`). Default new tab label is
`New Tab` (i18n). Inline rename via `…` → Rename.

### D5 — Show Preview
The "Show Preview" toggle renders the layout in **read-only** mode — reusing
the `LayoutRenderer` from Sprint 04b with `formData = createInitialFormData()`.
Toggle off returns to the editable builder.

### D6 — Reset confirmation
Reset asks for confirmation via `AlertDialog` (existing UI primitive). Same for
"Discard changes" when closing with unsaved edits.

---

## 3. CURRENT STATE (verbatim reference from 04a/04b)

### 3.1 Core exports (from 04a)
```ts
import {
  // types
  type FormLayout, type LayoutTab, type LayoutSection,
  type LayoutColumn, type LayoutField,
  // predicates
  isLayoutableBranch, isFullWidthBranch, isSeoBranch, isGalleryBranch,
  SYSTEM_ALIASES, UNSUPPORTED_BRANCH_TYPES, FULL_WIDTH_BRANCH_TYPES,
  // generator & schema
  generateDefaultLayout, formLayoutSchema, validateLayoutAgainstSeed,
  // RBAC
  canEditLayout, ROLES_ALLOWED_TO_EDIT_LAYOUT,
} from '@beechcms/core'
```

### 3.2 API endpoints (from 04a)
- `PUT /api/schema/:slug/layout` — body = `FormLayout`. Responses: 200
  `{ ok: true, layout }`, 403, 404, 422.
- `DELETE /api/schema/:slug/layout` — 200 `{ ok: true }`, 403, 404.

### 3.3 Dashboard auth (from 04a)
`useAuth().user?.role` is `'admin' | 'editor' | undefined`. The "Edit Layout"
button condition is `canEditLayout(user?.role)`.

### 3.4 Sprint 04b renderer
`LayoutRenderer` exported from
`apps/dashboard/src/features/entry-editor/index.ts`. Pure component that takes
`(layout, branchById, formData, fieldErrors, onChange)`. Reuse for Show Preview.

### 3.5 Existing shadcn components to reuse
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`
- `Button`, `Input`, `Label`
- `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`,
  `DropdownMenuItem`, `DropdownMenuSeparator`, `DropdownMenuCheckboxItem`
- `AlertDialog` (for Reset / Discard confirms)
- `Command`, `CommandInput`, `CommandList`, `CommandItem`, `CommandEmpty`
  (for the field picker)
- `Badge` (for the "6 fields" badge in the mockup)
- `Switch` (for "Show Preview")
- `Tooltip`

### 3.6 `@dnd-kit` usage pattern (reproduce literally)
```tsx
import {
  DndContext, closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, arrayMove, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <button type="button" className="cursor-grab" {...listeners}>⋮⋮</button>
      {children}
    </div>
  )
}
```
The drag handle button is the `⋮⋮` icon in the mockup (use `GripVertical` from
`lucide-react`).

---

## 4. BUILDER STATE & OPERATIONS

New file:
`apps/dashboard/src/features/entry-editor/builder/use-layout-builder.ts`
(custom hook encapsulating all state mutations — keeps the dialog component
thin and the operations unit-testable).

### 4.1 State
```ts
interface UseLayoutBuilderArgs {
  seed: Seed
  initialLayout: FormLayout
}
interface UseLayoutBuilderResult {
  draft: FormLayout
  activeTabId: string
  setActiveTabId: (id: string) => void
  isDirty: boolean
  // tab ops
  addTab(): void
  renameTab(tabId: string, label: string): void
  removeTab(tabId: string): void
  /** Reorders tabs. Note: layout.tabs[0] is the default-open tab in the editor,
   *  so reordering is also how the admin picks which tab opens first. */
  reorderTabs(fromIndex: number, toIndex: number): void
  // section ops
  addSection(tabId: string, columnCount?: number): void
  removeSection(tabId: string, sectionId: string): void
  reorderSections(tabId: string, fromIndex: number, toIndex: number): void
  toggleSectionFlag(tabId: string, sectionId: string, flag: 'hideLabel'|'hideBorder'|'collapsible'): void
  renameSection(tabId: string, sectionId: string, label: string | undefined): void
  setSectionColumnCount(tabId: string, sectionId: string, n: 1|2|3|4): void
  // column ops
  reorderColumns(tabId: string, sectionId: string, fromIndex: number, toIndex: number): void
  // field ops
  assignField(tabId: string, sectionId: string, columnId: string, branchId: string): boolean // false if rejected (full-width violation)
  clearField(tabId: string, sectionId: string, columnId: string): void
  moveField(args: { from: { tabId; sectionId; columnId }, to: { tabId; sectionId; columnId } }): boolean // swap-or-move; false on full-width violation
  reset(): void  // replace draft with generateDefaultLayout(seed)
  getUsedBranchIds(): Set<string>   // Branch.id (br_XX) values referenced anywhere in the draft
  getAvailableBranches(): Branch[]
}
```

### 4.2 Full-width enforcement
Before `assignField`/`moveField` performs the mutation, check:
- If the **incoming** branch is full-width and the destination section has
  **other** columns/fields → reject and toast a warning.
- If the **destination** is in a section that contains a full-width field and
  we're adding a normal field → reject.
Implement once in a helper `wouldViolateFullWidth(targetSection, incomingBranch)`.

### 4.3 Dirty tracking
Compare current `draft` to `initialLayout` via `JSON.stringify`. Sufficient for
this UI; the layout is small.

### 4.4 ID generation
Use `crypto.randomUUID()` for new tabs/sections/columns.

---

## 5. BUILDER DIALOG COMPONENT

New file:
`apps/dashboard/src/features/entry-editor/builder/layout-builder-dialog.tsx`

### 5.1 Props
```ts
interface LayoutBuilderDialogProps {
  seed: Seed
  open: boolean
  onClose: () => void
  onSaved: (layout: FormLayout) => void   // called after a successful PUT
}
```

### 5.2 Layout
```tsx
<Dialog open={open} onOpenChange={(o) => { if (!o) handleAttemptClose() }}>
  <DialogContent className="max-w-5xl w-[min(100vw-2rem,1100px)] max-h-[calc(100vh-2rem)] overflow-y-auto">
    <DialogHeader>
      <div className="flex items-center justify-between gap-4">
        <DialogTitle>{t('layoutBuilder.title', { seed: seed.label })}</DialogTitle>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={showPreview} onCheckedChange={setShowPreview} />
            {t('layoutBuilder.showPreview')}
          </label>
          <Button variant="outline" size="sm" onClick={onResetClick}>{t('layoutBuilder.reset')}</Button>
          <Button size="sm" onClick={onSaveClick} disabled={!isDirty || isSaving}>
            {isSaving ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
            {t('layoutBuilder.save')}
          </Button>
        </div>
      </div>
    </DialogHeader>

    {showPreview ? (
      <LayoutRenderer
        layout={draft}
        branchById={branchById}
        formData={previewFormData}
        fieldErrors={{}}
        onChange={() => { /* readonly preview */ }}
      />
    ) : (
      <BuilderBody
        seed={seed}
        draft={draft}
        activeTabId={activeTabId}
        ops={builderOps}    // pass the hook result
      />
    )}
  </DialogContent>
</Dialog>
```

### 5.3 BuilderBody composition
- **Tab strip** — horizontal list of pills (`bg-muted/50 px-3 py-1.5 rounded`),
  the active one highlighted. Each pill carries a drag handle and a
  trailing `…` that opens the tab `DropdownMenu` (Rename, Delete). A
  trailing `+` icon adds a tab. The tab strip is wrapped in its own
  `SortableContext` (horizontal strategy) so tabs are draggable
  left-to-right. **The first tab (`layout.tabs[0]`) is the default-open
  tab** when the entry editor opens — a small "Default" badge appears on it
  (i18n key `layoutBuilder.defaultTabBadge`) to make this discoverable.
- **Active tab body** — `DndContext` wrapping a `SortableContext` of the
  active tab's sections.
  - Each section is a `SectionCard` (drag handle, label/rename inline,
    field-count `Badge`, `…` context menu, internal column grid).
  - Inside `SectionCard`, an inner `SortableContext` for the columns.
    - Each column is a `ColumnCard` (drag handle, current branch label + `×`,
      or "+ Add Field" dropdown when empty).
- Below all sections: full-width `Button variant="outline"` → "+ Add Section".

### 5.4 Section context menu items
- **Rename** → opens inline edit on the header label (or clears label →
  "No Label" placeholder).
- **Hide Label** (toggle) → `toggleSectionFlag(..., 'hideLabel')`.
- **Hide Border** (toggle) → `toggleSectionFlag(..., 'hideBorder')`.
- **Collapsible** (toggle) → `toggleSectionFlag(..., 'collapsible')`. (The
  renderer in 04b currently does **not** honor `collapsible` — that's fine,
  the flag is stored and the renderer will pick it up later.)
- **Columns** submenu → `1 / 2 / 3 / 4` choices → `setSectionColumnCount`.
- **Remove** → calls `removeSection` after an inline confirm (use `confirm()`
  or a small `AlertDialog`).

### 5.5 ColumnCard
Empty state:
```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline" className="w-full justify-center text-muted-foreground">
      <Plus className="size-4 mr-2" /> {t('layoutBuilder.addField')}
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent className="p-0">
    <Command>
      <CommandInput placeholder={t('layoutBuilder.searchFields')} />
      <CommandList>
        <CommandEmpty>{t('layoutBuilder.noFields')}</CommandEmpty>
        {availableBranches.map(b => (
          <CommandItem key={b.alias} onSelect={() => ops.assignField(tabId, sectionId, columnId, b.alias)}>
            {b.label} <span className="text-muted-foreground ml-2 text-xs">{b.type}</span>
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  </DropdownMenuContent>
</DropdownMenu>
```
Non-empty state:
```tsx
<div className="flex items-center justify-between rounded border bg-card px-3 py-2">
  <div className="flex items-center gap-2">
    <GripVertical className="size-4 cursor-grab" {...listeners} />
    <span>{branch.label}</span>
  </div>
  <Button variant="ghost" size="icon" onClick={() => ops.clearField(tabId, sectionId, columnId)}>
    <X className="size-4" />
  </Button>
</div>
```

### 5.6 onDragEnd handler
A single top-level `DndContext` (with `collisionDetection={closestCenter}`)
wraps **the whole builder body including the tab strip** so we can do
cross-tab field moves via "drop on a tab pill" (§5.6.4). Encode each
draggable's id with a prefix to disambiguate:

- Tab drag id: `tab:<tabId>`
- Section drag id: `section:<tabId>:<sectionId>`
- Column drag id (for column reordering AND for cross-section/cross-tab field
  moves — a column drag carries the field it contains): `column:<tabId>:<sectionId>:<columnId>`

On `onDragEnd({active, over})`:

1. **Tab reorder** — both ids start with `tab:` → `ops.reorderTabs(fromIndex, toIndex)`.
2. **Section reorder within tab** — both ids start with `section:` and share
   the same `tabId` → `ops.reorderSections(tabId, fromIndex, toIndex)`.
3. **Section move across tabs** — both `section:` but different `tabId` → for
   this sprint, **reject** (no-op + toast "Move sections within their tab.").
   Cross-tab section move is a future enhancement.
4. **Column drag → tab pill** — `active` is `column:` and `over` is `tab:` →
   move the FIELD from the source column into the **last empty column of the
   first section** of the target tab. If no empty column exists in that tab,
   reject and toast `layoutBuilder.warnNoEmptyColumn`. (This is the only way
   to move a field across tabs in 04c.)
5. **Column reorder within section** — both `column:` and share
   `tabId`+`sectionId` → `ops.reorderColumns(tabId, sectionId, fromIndex, toIndex)`.
6. **Column-as-field move across sections (same tab)** — both `column:`,
   same `tabId`, different `sectionId` → `ops.moveField({from, to})`
   (swap-or-fill semantics).
7. **Column-as-field move across tabs** — both `column:`, different `tabId` →
   `ops.moveField({from, to})` (same swap-or-fill). The active tab does
   not need to change.
8. Anything that fails `wouldViolateFullWidth` is rejected with a toast.

**Note on @dnd-kit configuration:** because the tab strip is horizontal and
the section list is vertical, use distinct `SortableContext`s with
appropriate strategies (`horizontalListSortingStrategy` for tabs and the
column rows; `verticalListSortingStrategy` for sections). Nested
`SortableContext`s are supported by `@dnd-kit/sortable` — see their docs
for "nested sortable" patterns.

### 5.7 Save flow
```ts
async function onSaveClick() {
  setIsSaving(true)
  try {
    const { data } = await api.put(`/schema/${seed.slug}/layout`, draft)
    toast.success(t('layoutBuilder.saved'))
    queryClient.invalidateQueries({ queryKey: ['schema'] })
    onSaved(data.layout as FormLayout)
    onClose()
  } catch (err) {
    const ax = err as AxiosError<{ title?: string; detail?: string }>
    toast.error(ax.response?.data?.detail ?? ax.response?.data?.title ?? t('layoutBuilder.saveError'))
  } finally {
    setIsSaving(false)
  }
}
```

### 5.8 Reset flow
```ts
async function onResetConfirmed() {
  await api.delete(`/schema/${seed.slug}/layout`)
  const fresh = generateDefaultLayout(seed)
  ops.replace(fresh)         // exposed by the hook (a setter that resets draft + initial)
  queryClient.invalidateQueries({ queryKey: ['schema'] })
  toast.success(t('layoutBuilder.resetDone'))
}
```

### 5.9 Close-while-dirty
```ts
function handleAttemptClose() {
  if (!isDirty) { onClose(); return }
  setShowDiscardConfirm(true)  // AlertDialog
}
```

---

## 6. WIRING INTO THE ENTRY EDITOR DIALOG (from 04b)

In `entry-editor-dialog.tsx`:

```tsx
const { user } = useAuth()
const canEdit = canEditLayout(user?.role)
const [builderOpen, setBuilderOpen] = useState(false)

// In the DialogHeader, next to the title:
{canEdit && (
  <Button variant="outline" size="sm" onClick={() => setBuilderOpen(true)}>
    <Pencil className="size-4 mr-1" />
    {t('layoutBuilder.editLayout')}
  </Button>
)}

// At the end of the component tree:
{seed && (
  <LayoutBuilderDialog
    seed={seed}
    open={builderOpen}
    onClose={() => setBuilderOpen(false)}
    onSaved={() => { /* schema query invalidation handled inside */ }}
  />
)}
```

The editor dialog already re-renders when the schema query refetches, so the
new layout takes effect automatically.

---

## 7. API CALLS

Add helpers in `apps/dashboard/src/features/entry-editor/api/layout.api.ts`:

```ts
import { api } from '@/lib/api'
import type { FormLayout } from '@beechcms/core'

export async function saveLayout(slug: string, layout: FormLayout): Promise<FormLayout> {
  const { data } = await api.put<{ ok: true; layout: FormLayout }>(`/schema/${slug}/layout`, layout)
  return data.layout
}

export async function resetLayout(slug: string): Promise<void> {
  await api.delete(`/schema/${slug}/layout`)
}
```

Call from the builder dialog. `api` is the existing axios instance from
`@/lib/api`.

---

## 8. i18n KEYS

Add to **both** locale files under a new `layoutBuilder` namespace:

| Key | EN | IT |
|---|---|---|
| `layoutBuilder.editLayout` | "Edit Layout" | "Modifica layout" |
| `layoutBuilder.title` | "Edit Quick Entry Layout — {{seed}}" | "Modifica layout — {{seed}}" |
| `layoutBuilder.showPreview` | "Show Preview" | "Mostra anteprima" |
| `layoutBuilder.reset` | "Reset" | "Ripristina" |
| `layoutBuilder.resetConfirmTitle` | "Reset to default?" | "Ripristinare il default?" |
| `layoutBuilder.resetConfirmDesc` | "This removes the custom layout. The default will be used." | "Rimuove il layout personalizzato. Verrà usato il default." |
| `layoutBuilder.resetDone` | "Layout reset to default." | "Layout ripristinato al default." |
| `layoutBuilder.save` | "Save" | "Salva" |
| `layoutBuilder.saved` | "Layout saved." | "Layout salvato." |
| `layoutBuilder.saveError` | "Could not save the layout." | "Impossibile salvare il layout." |
| `layoutBuilder.discardTitle` | "Discard changes?" | "Annullare le modifiche?" |
| `layoutBuilder.discardDesc` | "Unsaved layout edits will be lost." | "Le modifiche non salvate andranno perse." |
| `layoutBuilder.addSection` | "Add Section" | "Aggiungi sezione" |
| `layoutBuilder.addField` | "Add Field" | "Aggiungi campo" |
| `layoutBuilder.addTab` | "Add Tab" | "Aggiungi tab" |
| `layoutBuilder.newTab` | "New Tab" | "Nuova tab" |
| `layoutBuilder.searchFields` | "Search fields…" | "Cerca campi…" |
| `layoutBuilder.noFields` | "No fields available." | "Nessun campo disponibile." |
| `layoutBuilder.noLabel` | "No Label" | "Senza etichetta" |
| `layoutBuilder.fieldCount_one` | "{{count}} field" | "{{count}} campo" |
| `layoutBuilder.fieldCount_other` | "{{count}} fields" | "{{count}} campi" |
| `layoutBuilder.sectionMenu.rename` | "Rename" | "Rinomina" |
| `layoutBuilder.sectionMenu.hideLabel` | "Hide Label" | "Nascondi etichetta" |
| `layoutBuilder.sectionMenu.hideBorder` | "Hide Border" | "Nascondi bordo" |
| `layoutBuilder.sectionMenu.collapsible` | "Collapsible" | "Collassabile" |
| `layoutBuilder.sectionMenu.columns` | "Columns" | "Colonne" |
| `layoutBuilder.sectionMenu.remove` | "Remove" | "Rimuovi" |
| `layoutBuilder.tabMenu.rename` | "Rename tab" | "Rinomina tab" |
| `layoutBuilder.tabMenu.delete` | "Delete tab" | "Elimina tab" |
| `layoutBuilder.warnFullWidth` | "{{label}} requires a dedicated full-width section." | "{{label}} richiede una sezione full-width dedicata." |
| `layoutBuilder.warnNoEmptyColumn` | "Target tab has no empty column. Add one first." | "La tab di destinazione non ha colonne vuote. Aggiungine una prima." |
| `layoutBuilder.warnNoCrossTabSection` | "Move sections within their tab." | "Sposta le sezioni all'interno della loro tab." |
| `layoutBuilder.defaultTabBadge` | "Default" | "Predefinita" |

---

## 9. FILES TO TOUCH (checklist)

New:
- `apps/dashboard/src/features/entry-editor/builder/use-layout-builder.ts`
- `apps/dashboard/src/features/entry-editor/builder/layout-builder-dialog.tsx`
- `apps/dashboard/src/features/entry-editor/builder/section-card.tsx`
- `apps/dashboard/src/features/entry-editor/builder/column-card.tsx`
- `apps/dashboard/src/features/entry-editor/api/layout.api.ts`
- Unit tests for `use-layout-builder.ts` under
  `apps/dashboard/src/features/entry-editor/builder/__tests__/`

Modified:
- `apps/dashboard/src/features/entry-editor/index.ts` — export
  `LayoutBuilderDialog`
- `apps/dashboard/src/features/entry-editor/entry-editor-dialog.tsx` — mount
  the "Edit Layout" button + builder dialog
- `apps/dashboard/src/locales/it.json`, `en.json` — new keys (§8)
- `apps/dashboard/package.json` — add `@dnd-kit/*` deps if missing

---

## 10. ACCEPTANCE

1. **Types & build:** `npm run build` at root passes. `npm run dev` runs the
   stack.
2. **Visibility:** the "Edit Layout" button appears for an admin user, is
   absent for a non-admin (create an editor user via the seed and try).
3. **Builder open:** clicking the button opens the builder dialog. The current
   layout (stored or default) is shown editable.
4. **Drag operations:**
   - Reorder tabs (drag a tab pill left/right): order persists; the tab at
     index 0 becomes the default-open tab and shows the "Default" badge.
   - Reorder sections within the active tab.
   - Reorder columns within a section.
   - Drag a field card from one column to another (different section, same
     tab): the field moves, the source column becomes empty.
   - Drag a field column onto a different tab pill: the field moves into the
     first empty column of the first section of that tab; if no empty column
     exists, a toast appears and nothing happens.
   - Drag a field onto a non-empty column (same tab or cross-tab via the
     column-as-field path): the two fields swap.
5. **Section context menu:** rename, hide label, hide border, collapsible,
   columns (1/2/3/4), remove all work and update the draft.
6. **Field picker:** "+ Add Field" opens the Command popover; the list excludes
   branches already in the draft, excludes hidden/system/json branches; typing
   filters. Selecting a branch assigns it to the column.
7. **Full-width rule:** drag a richtext branch into a column inside a
   multi-field section → drop is rejected and a toast appears. Same for
   gallery (`file` + `multiple:true`).
8. **Auto-cleanup on save:** if you save a layout that still references a
   stale branch, the server (04a) strips it and returns the cleaned layout;
   the builder consumes the response and updates its initial state.
9. **Reset:** confirming Reset removes the stored layout server-side and the
   draft becomes the freshly generated default. Reopening the builder shows
   the default.
10. **Save:** confirming Save persists the layout, closes the builder, and
    the Entry Editor below it re-renders with the new layout (TanStack Query
    `['schema']` invalidation).
11. **Dirty guard:** closing the builder with unsaved changes triggers a
    confirmation alert.
12. **Server RBAC:** with a non-admin token, directly calling
    `PUT /api/schema/articoli/layout` returns 403 (verified in 04a — re-check
    here to make sure the dashboard never relies on client-only checks).
13. **i18n:** every visible string resolves in both `it` and `en`.

---

## 11. OPEN QUESTIONS

- **Section column count = 1?** Single-column section is what full-width
  branches use; the user should not be able to manually convert a 1-col
  section back to multi when it contains a full-width branch (validator
  rejects). Confirm.
- **Mobile builder UX** — drag and drop on touch devices via dnd-kit's
  `TouchSensor`. Is mobile a priority? *Default: desktop-first; add
  `TouchSensor` opportunistically.*

### Resolved (do not re-ask)
- **Column reordering inside a section:** YES (drag handles in the mockup).
- **Column-as-field move across sections:** YES.
- **Column-as-field move across tabs:** YES, via the "drop on tab pill"
  affordance (§5.6.4 / §5.6.7).
- **Tab reordering:** YES, drag-and-drop on the tab strip. `layout.tabs[0]`
  is the default-open tab in the editor — reordering tabs is how the admin
  selects it; the first tab shows a "Default" badge.
- **Cross-tab section move:** NO (rejected with toast). Future enhancement.
