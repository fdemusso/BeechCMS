# UI Refactoring — Sprint 04b: Customizable Entry Editor — Renderer & Dialog

> **Audience:** an AI coding agent. Everything needed is inline.

This is the **second** of three sprints. Sprint **04a** built the data model,
storage, API endpoints, and types. This sprint replaces the rigid two-column /
single-column editor with a **JSON-driven layout renderer** and converts the
editor surface from a full-page route into a Shadcn **`<Dialog>`** opened over
the content list. URL-driven open state preserves deep-linking.

End user-visible result: when an admin clicks "+ New" or a row in the content
list, a centered modal opens with the editor; closing it returns to the list
without losing scroll/filter state. Layouts are loaded from `seed.layout`
(stored or generated default).

---

## 0. ROLE & GROUND RULES

You are a senior TypeScript engineer working on the **Beech CMS monorepo**.

Hard rules:

1. **i18n is mandatory** in the dashboard. No hardcoded UI strings. Every visible
   string goes through `t('section.key')` and must be added to **both**
   `apps/dashboard/src/locales/it.json` and `en.json`. Tab labels stored in
   `FormLayout` are **content** (created by the admin via the Builder UI) — they
   are NOT translated; render them as-is.
2. **Reuse Shadcn UI components** from `apps/dashboard/src/components/ui/`.
3. **No glassmorphism, no premium-floating styling.** Use the existing `Dialog`
   component look. The PM confirmed: "secondo me deve essere un vero dialog
   sopra la lista".
4. **Sprint 04a contract assumed.** `seed.layout?: FormLayout` is provided by
   `GET /api/schema`. If absent, generate via `generateDefaultLayout(seed)`
   from `@beechcms/core`.
5. **No layout editing in this sprint.** The Builder UI ships in 04c. Here we
   only **read** the layout and render fields from it.

---

## 1. WHAT THIS SPRINT BUILDS

1. **Dialog conversion** — the `EntryEditorPage` becomes
   `EntryEditorDialog` mounted inside the content list page. Opening rules are
   URL-driven so direct links keep working.
2. **Layout-driven renderer** — new components `LayoutTabsRenderer`,
   `SectionRenderer`, `ColumnRenderer`, `LayoutFieldRenderer` iterate the
   `FormLayout` and render existing `<FieldEdit />` instances.
3. **Default-layout fallback** — when `seed.layout` is missing, the dialog calls
   `generateDefaultLayout(seed)` once on open and uses it for the render pass.
4. **All existing editor behavior preserved** — Status, Slug, drafts dropdown,
   auto-slug from first text field, unsaved-changes blocker, validation,
   back-refs panel. The renderer **replaces only the body** that used to be
   `SplitEditorLayout` / `SingleColumnEditorLayout`.

---

## 2. CONFIRMED DESIGN DECISIONS

### D1 — Dialog opens **over** the content list, URL still drives state
- New URL pattern stays the same: `/content/:slug/new` (create) and
  `/content/:slug/:id` (edit).
- The list page (`apps/dashboard/src/pages/content-list.tsx`) mounts the dialog;
  it is "open" when the URL matches the editor pattern. Closing the dialog
  navigates back to `/content/:slug`.
- This means we move the route from `App.tsx` such that the editor URLs render
  the **list page** with an open dialog, not a standalone page. Deep-links
  still work (paste URL → list page mounts → dialog opens).

> **OPEN Q (D1):** Confirm `/content/:slug/new` is the right path for "create"
> in this routing. Today create is `/content/:slug/new` per `App.tsx` — verify
> with a grep and adjust if it's a different path.

### D2 — Tabs are always rendered
Even when the layout has only one tab, render the tab strip (matches the
Builder UI mockup and keeps the renderer uniform). If a tab has no sections
(should not happen — generator always produces at least one empty section),
render an empty state placeholder string from i18n.

### D3 — Status & Slug bar stays outside the tab body
The Status select + Slug input + draft notice + top action bar (Save / dropdown
/ Delete) remain at the **top of the dialog**, above the tab strip. These are
not part of the customizable layout (per 04a §D4 — system aliases are excluded
from the layout).

### D4 — SEO tab fallback rule
If `seed.layout` was generated with a SEO tab that has zero fields (legacy seed
with no `meta*` branches), still render the empty SEO tab — the empty section
+ empty column is the "+ Add Field" target the Builder will use. For the
viewer (this sprint), an empty tab just shows an i18n placeholder
("No fields in this tab yet.") inside the empty column slot.

### D5 — RichText sizing inside the dialog
The dialog must accommodate a comfortable RichText height. Use
`max-w-5xl w-[min(100vw-2rem,1100px)] max-h-[calc(100vh-2rem)] overflow-y-auto`
on `DialogContent`. RichText sections render with `min-h-[50vh]` and the
existing editor's internal scroll handles overflow.

---

## 3. CURRENT STATE (verbatim reference)

### 3.1 Current `entry-editor.tsx` shape
Lives at `apps/dashboard/src/pages/entry-editor.tsx`. Renders an
`EditorShellLayout` (Sidebar + Header + Inset), an internal `<form>` with a top
action bar, optional draft notices, and either `<SplitEditorLayout>` (when a
richtext branch exists) or `<SingleColumnEditorLayout>` (otherwise).

Key local helpers we **keep**:
- `createInitialFormData(branches)` — initial state for create mode
- `prepareSubmissionPayload({branches, formData, slug, status})`
- `validateEntryJsonFields(branches, formData)` — *will become a no-op now that
  json fields are excluded; keep the function but it will never branch*
- `slugFromText`, `deriveAutoSlugText`
- `isSeoBranch` — **replace** the local copy by importing from
  `@beechcms/core` (Sprint 04a exports it from `seed-layout.ts`).
- `BranchFieldsGroup` — **delete**, replaced by the new renderer
- `StatusAndSlugFields` — **keep**, used by the top bar

Key state we **keep**:
- `formData`, `status`, `slug`, `slugTouched`, `isDirty`, `fieldErrors`,
  `showDiscardConfirm`, `showDeleteConfirm`, `hasRestrictedRefs`
- All draft hooks (`useDraftEntry`, `useSaveDraft`, `usePublishDraft`,
  `useDiscardDraft`) and `useBlocker` for unsaved changes
- All save/publish/discard/delete handlers — copy verbatim

The `EditorShellLayout`, `SplitEditorLayout`, `SingleColumnEditorLayout`
wrappers are **deleted** (we're inside a dialog now, not a page).

### 3.2 Field rendering
`FieldEdit` is imported from `@/features/fields`:
```ts
import { FieldEdit } from '@/features/fields'
<FieldEdit branch={branch as any} value={formData[branch.alias]}
           onChange={(val) => onInputChange(branch.alias, val)} />
```
`FieldEdit` internally consults `getEditComponent(branch.type)` from
`apps/dashboard/src/features/fields/registry.ts`. **Do not touch the registry**
in this sprint.

### 3.3 Shadcn `<Dialog>` (`apps/dashboard/src/components/ui/dialog.tsx`)
Already imported and used elsewhere. Exports:
`Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle,
DialogDescription, DialogFooter, DialogClose`. Built on Radix. Default
`DialogContent` is `max-w-lg` — we override with a wider class.

### 3.4 Routing today
`apps/dashboard/src/App.tsx` declares the editor routes. Grep `EntryEditorPage`
in `App.tsx` to find them. They currently render the page component directly.
After this sprint they will render the list page, which detects the URL pattern
and opens the dialog.

### 3.5 Content list page
`apps/dashboard/src/pages/content-list.tsx`. It already mounts the sidebar
shell and a content table. We **add** the dialog as a sibling — open state
derived from `useParams()` + `useMatch()`.

### 3.6 Seed.layout & default generator (Sprint 04a)
```ts
import {
  generateDefaultLayout,
  type FormLayout, type LayoutTab, type LayoutSection,
  type LayoutColumn, type LayoutField,
  isLayoutableBranch, isFullWidthBranch,
} from '@beechcms/core'
```
`useActiveSeed(slug)` returns `{ seed: Seed | null; isLoading }`. The seed
optionally has a `layout?: FormLayout`. When missing, fall back at render
time:
```ts
const layout = React.useMemo(
  () => seed?.layout ?? (seed ? generateDefaultLayout(seed) : null),
  [seed]
)
```

### 3.7 Tabs component
Use Shadcn `Tabs` from `apps/dashboard/src/components/ui/tabs.tsx` (exists —
verify via `Glob "apps/dashboard/src/components/ui/tabs.tsx"`). Standard usage:
```tsx
<Tabs value={activeTabId} onValueChange={setActiveTabId}>
  <TabsList>
    {layout.tabs.map(tab => <TabsTrigger key={tab.id} value={tab.id}>{tab.label}</TabsTrigger>)}
  </TabsList>
  {layout.tabs.map(tab => (
    <TabsContent key={tab.id} value={tab.id}>
      <TabSections tab={tab} {...rendererProps} />
    </TabsContent>
  ))}
</Tabs>
```

---

## 4. RENDERER COMPONENTS

New file: `apps/dashboard/src/features/entry-editor/renderer/layout-renderer.tsx`
(new `entry-editor` feature folder — keep this sprint's code self-contained;
the Builder UI lands in the same folder in 04c).

Public API exported from `apps/dashboard/src/features/entry-editor/index.ts`:
- `EntryEditorDialog` — the main exported component
- `LayoutRenderer` — internal but exported for tests

### 4.1 Renderer props
```ts
interface RendererBranchMap { [id: string]: Branch }   // keyed by Branch.id (br_XX)
interface RendererProps {
  layout: FormLayout
  branchById: RendererBranchMap  // id → Branch, prebuilt for O(1) lookup
  formData: Record<string, unknown>
  fieldErrors: Record<string, string>
  onChange: (alias: string, value: unknown) => void   // formData is still keyed by alias (SQL column name)
}
```

### 4.2 Algorithm
```
LayoutRenderer(props):
  activeTabId, setActiveTabId  // default = layout.tabs[0].id
  return <Tabs value=activeTabId onValueChange=setActiveTabId>
    <TabsList>… one TabsTrigger per layout.tabs …</TabsList>
    {layout.tabs.map(tab => <TabsContent value=tab.id>
      <TabSections tab=tab {...rest} />
    </TabsContent>)}
  </Tabs>

TabSections(tab, branchById, …):
  if tab.sections.length === 0 → emit empty-state i18n string
  return tab.sections.map(section => <SectionRenderer section=section … />)

SectionRenderer(section, …):
  const containerClass = section.hideBorder ? "" : "rounded-lg border p-4"
  return <section className=`${containerClass} space-y-3`>
    {!section.hideLabel && section.label
       ? <header className="text-sm font-medium text-muted-foreground">{section.label}</header>
       : null}
    <div className={`grid gap-4 ${gridClassFor(section.columns.length)}`}>
      {section.columns.map(col => <ColumnRenderer column=col … />)}
    </div>
  </section>

gridClassFor(n):
  1: 'grid-cols-1'
  2: 'grid-cols-1 sm:grid-cols-2'
  3: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3'
  4: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-4'
  // (use Tailwind responsive classes; do not compute dynamic class names —
  //  Tailwind purger needs static strings in source.)

ColumnRenderer(column, branchById, formData, fieldErrors, onChange):
  if column.field == null → render placeholder "<empty>" (i18n) — viewer mode,
       this should be rare unless a Builder left it empty.
  const branch = branchById[column.field.branchId]
  if branch == null →
     // Auto-cleanup safety net: render nothing. Sprint 04a strips these on
     // read, but defend against races (seed cache vs layout cache).
     // Note: formData / FieldEdit still use branch.alias (the SQL column name) —
     // only the LAYOUT REFERENCE uses the stable id.
     return null
  return <div className="space-y-2">
    <Label htmlFor={branch.alias}>{branch.label}{requiredMark(branch)}</Label>
    <FieldEdit branch={branch as any} value={formData[branch.alias]}
               onChange={(v) => onChange(branch.alias, v)} />
    {fieldErrors[branch.alias] && <p className="text-xs text-destructive">{fieldErrors[branch.alias]}</p>}
  </div>

requiredMark(branch):
  branch.requiredOnCreate ? <span className="text-destructive ml-1">*</span> : null
  // (we don't have isCreate context here; show * for required-on-create branches.
  //  This matches user expectation per the mockup.)
```

### 4.3 BranchMap
Build once with `useMemo`:
```ts
const branchById = React.useMemo<RendererBranchMap>(
  () => Object.fromEntries((seed?.branches ?? []).map(b => [b.id, b])),
  [seed]
)
```

### 4.4 Initial state & submit — submit ALL branches (per-Seed semantics)
The layout describes **how to render** the editor for entries of a given Seed,
not which fields exist. Every entry of `articoli` has the same columns in
D1 regardless of which fields the layout exposes. So:

- `createInitialFormData(branches)` walks **all** seed branches → keep as-is.
- `prepareSubmissionPayload({branches, formData, slug, status})` walks **all**
  seed branches → keep as-is. The save payload always contains every column
  for that Seed.

Branches that are not referenced anywhere in the current layout are still
initialized to their default value (`''`/`false`/empty richtext doc) and
submitted unchanged. This is intentional: a future layout edit that re-adds
the field must show the previously stored value, not blank it.

---

## 5. DIALOG WRAPPER `EntryEditorDialog`

New file `apps/dashboard/src/features/entry-editor/entry-editor-dialog.tsx`.

### 5.1 Props
```ts
interface EntryEditorDialogProps {
  schemaSlug: string                  // from URL
  entryId: string | undefined         // undefined → create mode
  isDraftContext: boolean             // from location.state
  open: boolean                       // controlled
  onClose: () => void                 // navigate back to /content/:slug
}
```

### 5.2 Shell
```tsx
<Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
  <DialogContent
    className="max-w-5xl w-[min(100vw-2rem,1100px)] max-h-[calc(100vh-2rem)] overflow-y-auto p-0"
  >
    <DialogHeader className="px-6 pt-6">
      <DialogTitle>{pageTitle}</DialogTitle>
    </DialogHeader>
    <div className="px-6 pb-6 space-y-4">
      {/* draft notices, status & slug bar, action bar, layout renderer, backrefs */}
    </div>
  </DialogContent>
</Dialog>
```

The previous `EditorShellLayout` (sidebar+header) is **gone** — we're inside
the list page, which already has its own shell. The Save/Delete/Dropdown bar
moves into the dialog footer area (above the body or sticky at the bottom —
match `EditorCustom.png` which shows Save at bottom-right):

```tsx
<div className="flex items-center justify-between border-t px-6 py-4 sticky bottom-0 bg-background">
  <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
  <div className="flex items-center gap-2">
    {/* delete + split save dropdown — copy current entry-editor.tsx markup */}
  </div>
</div>
```

`overflow-y-auto` on `DialogContent` + sticky footer means the body scrolls but
the action bar stays visible.

### 5.3 Behavior
Copy the entire body of `EntryEditorPage` from `entry-editor.tsx` into the
dialog, replacing:
- `<SplitEditorLayout>` / `<SingleColumnEditorLayout>` with
  `<LayoutRenderer layout={layout} branchById={branchById} formData={formData}
   fieldErrors={fieldErrors} onChange={handleInputChange} />`.
- Remove `<EditorShellLayout>` (no sidebar inside the dialog).
- After successful save, call `onClose()` instead of `navigate(...)`. The list
  page already invalidates queries via the existing TanStack Query setup
  (verify: if not, call `queryClient.invalidateQueries(['content', schemaSlug])`
  manually).
- `goBack` is now `onClose`.
- `useBlocker` keeps working — when dirty, closing the dialog triggers the
  existing AlertDialog confirmation.

### 5.4 Loading / error states inside the dialog
- Seed loading: render a `Skeleton` block inside the DialogContent body.
- Seed not found: render the existing error markup, with a "Close" button
  calling `onClose`.

---

## 6. LIST-PAGE INTEGRATION

In `apps/dashboard/src/pages/content-list.tsx`:

```tsx
// At top of the page component:
const { slug: schemaSlug, id: entryId } = useParams<{ slug: string; id?: string }>()
const location = useLocation()
const navigate = useNavigate()
const isCreatePath = location.pathname.endsWith('/new')
const isEditPath = !!entryId && !isCreatePath
const dialogOpen = isCreatePath || isEditPath

const handleDialogClose = () => navigate(`/content/${schemaSlug}`)

// In the JSX, after the existing list markup:
{schemaSlug && dialogOpen && (
  <EntryEditorDialog
    schemaSlug={schemaSlug}
    entryId={isCreatePath ? undefined : entryId}
    isDraftContext={!!(location.state as { isDraftContext?: boolean } | null)?.isDraftContext}
    open={dialogOpen}
    onClose={handleDialogClose}
  />
)}
```

In `apps/dashboard/src/App.tsx`, change the editor routes so they render the
**list page** with the editor URL underneath:
```tsx
<Route path="/content/:slug" element={<ContentListPage />} />
<Route path="/content/:slug/new" element={<ContentListPage />} />
<Route path="/content/:slug/:id" element={<ContentListPage />} />
```
The dialog's open state derives from the URL — direct-linking still works.

> **OPEN Q (6):** confirm `ContentListPage` is the actual exported name; check
> `apps/dashboard/src/pages/content-list.tsx` for the export. If different,
> use the real name.

Delete the `EntryEditorPage` import from `App.tsx`. The old page file
(`apps/dashboard/src/pages/entry-editor.tsx`) can be **deleted** entirely once
all its hooks are referenced from the dialog. (Move shared helpers like
`createInitialFormData` into the new feature folder — they were not used
anywhere else.) Verify with a workspace grep before deleting.

---

## 7. i18n

Add the following keys to **both** `apps/dashboard/src/locales/it.json` and
`en.json` under a new `content.editor` (extending the existing group if
present) and `layout` namespaces:

| Key | EN | IT |
|---|---|---|
| `content.editor.emptyTab` | "No fields in this tab yet." | "Nessun campo in questa tab." |
| `content.editor.emptyColumn` | "Empty" | "Vuoto" |
| `common.cancel` | "Cancel" | "Annulla" |

Other strings (Save, Saving, Status, Slug, Draft, etc.) already exist in the
current `entry-editor.tsx` — reuse the same keys when moving the markup.

---

## 8. FILES TO TOUCH (checklist)

New:
- `apps/dashboard/src/features/entry-editor/index.ts` — barrel export `EntryEditorDialog`
- `apps/dashboard/src/features/entry-editor/entry-editor-dialog.tsx`
- `apps/dashboard/src/features/entry-editor/renderer/layout-renderer.tsx` —
  exports `LayoutRenderer`, `SectionRenderer`, `ColumnRenderer`
- (move into here) `createInitialFormData`, `prepareSubmissionPayload`,
  `slugFromText`, `deriveAutoSlugText`, `validateEntryJsonFields`,
  `StatusAndSlugFields` from `entry-editor.tsx`

Modified:
- `apps/dashboard/src/App.tsx` — collapse the three editor routes onto
  `ContentListPage`
- `apps/dashboard/src/pages/content-list.tsx` — mount `EntryEditorDialog`,
  derive open state from URL
- `apps/dashboard/src/locales/it.json` and `en.json` — new keys (§7)

Deleted (after verifying no external import):
- `apps/dashboard/src/pages/entry-editor.tsx`

---

## 9. ACCEPTANCE

1. **Types & build:** `pnpm run build` at root passes (core builds first).
   `pnpm run dev` starts API and dashboard cleanly.
2. **Direct link works:** open `/content/articoli/<id>` in the browser → list
   page loads, dialog is open with the entry. Closing it → URL becomes
   `/content/articoli`, list still shows.
3. **Default layout renders:** delete any stored layout for `articoli`
   (`DELETE /api/schema/articoli/layout`), reload → editor renders 2 tabs
   `Data` / `SEO`, RichText fields are in dedicated full-width sections, normal
   fields in 3-column grids, in the order declared in `seeds.ts`.
4. **Stored layout renders:** `PUT` a custom layout that puts `First Name`,
   `Last Name`, `Email` in three columns of one section, and `Gender` in a
   second section alone. Open the editor → the rendered grouping matches.
5. **Auto-cleanup tolerated:** put a `LayoutField` referencing a non-existent
   `branchId` in the stored layout → renderer skips it without error
   (Sprint 04a's enriched `GET /api/schema` should have already stripped it).
6. **Behavior preserved:** save, delete, draft save, draft publish, draft
   discard, unsaved-changes warning, slug auto-derivation, JSON field
   validation (no-op now), back-refs panel — all still work.
7. **Dialog UX:** body scrolls, footer sticky, Esc closes (and triggers
   unsaved-changes warning when dirty), Escape after Save closes silently.
8. **No glassmorphism, no premium-floating treatment** — uses default
   `DialogContent` look.
9. **i18n:** every new string resolves in both `it` and `en`.

---

## 10. OPEN QUESTIONS

- **(D1)** Confirm `/content/:slug/new` path.
- **(6)** Real export name of the content list page component.
- **Tabs component exists?** Verify `apps/dashboard/src/components/ui/tabs.tsx`.
  If missing, add it via `npx shadcn@latest add tabs` first.
- **Back-refs panel placement:** today it's at the bottom of the page. Inside
  the dialog, keep it at the bottom of the scrollable body (after the layout
  renderer) — confirm.

### Resolved (do not re-ask)
- **(4.4)** Submit ALL branches (per-Seed semantics — the layout describes
  rendering, not the data shape). Resolved §4.4 above.
