You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

Do NOT explore the codebase further. All relevant context is provided in this prompt.
Read it fully before writing any code.

This is **Sprint 7 of 8** for the `relation` field type. Sprints 1–6 shipped
single + many-to-many relations, validation, draft safety, and back-refs.
This sprint adds **inline-create**: from inside the `RelationEdit` combobox,
the user can create a new target entry without leaving the current editor.

### Why this matters

Today: to set `article.author_id`, the editor must navigate away to
`/content/team/new`, fill the form, save, navigate back to the article,
search for the new author, select. Lost context, lost form state.

After this sprint: a single "+ Create new Team Member" item appears at the
bottom of the combobox. Clicking opens a Dialog with a compact form, on
submit the new entry is created server-side and immediately selected as
the relation's value. The article editor never loses its in-progress state.

### Stack

- Dashboard: a new Dialog hosting a reduced version of the existing
  entry-editor logic.
- API: no new endpoints — reuses the existing `POST /content/:slug`.
- Authorization: identical to direct creation. If the user cannot create
  a `team` entry, the inline-create item is hidden in the combobox.

==========================================================================
SECTION 1 — UX SPECIFICATION
==========================================================================

### Combobox affordance

Inside `RelationEdit` (the file from Sprint 4, multi-aware after Sprint 5):

- A persistent footer row inside the popover: "+ Create new {{label}}".
  `{{label}}` = `targetSeed.label` (singular).
- The row is keyboard-reachable (TAB into it after the last result).
- Hidden when `onInlineCreate` is not wired up OR when the user lacks the
  permission to create in the target seed.

### Dialog

- Opens above the combobox popover (combobox closes first).
- Title: "New {{label}}".
- Body: a **minimal** form rendering ONLY the branches of the target seed
  whose `requiredOnCreate === true`, plus the `displayNameAlias` branch
  (even if not required — the user must give the new entry a recognisable
  name for the relation to be meaningful).
- A toggle "Show all fields" expands the form to all branches. Off by default.
- Reuses FieldEdit renderers from the registry (Sprint 4 baseline). No
  duplicate code paths for rendering.
- Bottom bar: "Cancel" / "Create & link" (primary).
- On submit: the dialog stays open with a loading state; on success it
  closes, the new id is selected in the combobox (single relation) or
  appended to the array (multi-relation, Sprint 5), and the popover
  re-opens with the new chip already visible.

### Recursion guard

If the inline-create dialog ITSELF contains a relation field with inline-create
available, the second-level combobox MUST hide the "+ Create new" affordance.
Editorial users cannot reason about deep nested dialogs. Track depth via a
React context: `<InlineCreateDepthContext>` defaults to `0`, the Dialog
provides `1`, the affordance only renders when depth `=== 0`.

==========================================================================
SECTION 2 — STEP-BY-STEP PLAN
==========================================================================

--------------------------------------------------------------------------
STEP 1 — Permission probe
File: apps/dashboard/src/features/auth/use-can-create.ts (verify existence;
       if absent, derive from the existing role / capability hook)
--------------------------------------------------------------------------

Determine the bool `canCreate(targetSlug)` from the current user's role/
capability set. If the project does not yet expose a per-seed permission
hook, locate the closest existing primitive (likely a `useUser` returning
role + permissions arrays) and add a tiny derived selector. Do NOT introduce
a new API call.

The combobox uses this to hide the inline-create row.

--------------------------------------------------------------------------
STEP 2 — Compact entry-editor component
File: apps/dashboard/src/features/inline-create/inline-create-dialog.tsx (new)
--------------------------------------------------------------------------

The Dialog is a new component, NOT a refactor of `entry-editor.tsx`. The
existing entry editor is a page; this is an embedded form. Sharing more
between them creates coupling that hurts both surfaces.

Required logic:

1. Receive props: `{ open, onOpenChange, targetSlug, onCreated(id, displayName) }`.
2. Resolve `targetSeed` via the seed selector used in Sprint 4.
3. Compute `quickFieldBranches`:
   ```ts
   const quickFieldBranches = targetSeed.branches.filter(
     b => b.requiredOnCreate || b.alias === targetSeed.displayNameAlias
   )
   ```
4. Hold `formData` local state.
5. Render each branch through `FieldEdit` from the existing registry.
   Wrap each in a `<InlineCreateDepthContext.Provider value={1}>`.
6. Validation: client-side via the existing Zod compiler from
   `@beechcms/core` (consume whatever helper the page editor uses, find it
   once and reuse).
7. Submit:
   - Call `contentApi.create(targetSlug, formData)` (Sprint 4 verified the
     signature).
   - On 4xx: render the Problem+JSON `detail` in an inline error region;
     keep the dialog open.
   - On success: extract the new id from the response, derive the
     displayName from `formData[displayNameAlias]`, call
     `onCreated(id, displayName)`, then close.
8. Cache priming: after success, prime
   `CONTENT_QUERY_KEYS.detail(targetSlug, newId)` with the minimal
   `ContentEntry` shape (the same shape Sprint 4 §4b primes for list
   responses). This makes the subsequent `RelationDisplay` for the new id
   render synchronously without an extra fetch.
9. Also invalidate `['backrefs', targetSlug]` (Sprint 6 query key) — the
   new entry could be a back-ref target.

Imports must come ONLY from the existing public barrels:
- `@/features/fields` (FieldEdit, registry)
- `@/features/content-management` (contentApi, CONTENT_QUERY_KEYS)
- `@beechcms/core` (validation, types)
- `@/components/ui` (Dialog, Button, Form primitives)

NEVER reach into another feature's internals.

--------------------------------------------------------------------------
STEP 3 — Wire the affordance into RelationEdit
File: apps/dashboard/src/features/fields/edit/relation.tsx (extend from Sprint 4)
--------------------------------------------------------------------------

Add to RelationEdit:

```tsx
import { useContext, useState } from 'react'
import { InlineCreateDepthContext, InlineCreateDialog } from '@/features/inline-create'
import { useCanCreate } from '@/features/auth'

// inside the component:
const depth = useContext(InlineCreateDepthContext) ?? 0
const canCreate = useCanCreate(branch.targetSeed!)
const [inlineOpen, setInlineOpen] = useState(false)

const showInlineCreate = depth === 0 && canCreate
```

In the combobox popover footer:

```tsx
{showInlineCreate && (
  <CommandItem onSelect={() => { setInlineOpen(true); setPopoverOpen(false) }}>
    <Plus className="mr-2 size-4" />
    {t('relation.createNew', { label: targetSeed?.label })}
  </CommandItem>
)}
```

Dialog rendering (outside the popover):

```tsx
{showInlineCreate && (
  <InlineCreateDialog
    open={inlineOpen}
    onOpenChange={setInlineOpen}
    targetSlug={branch.targetSeed!}
    onCreated={(newId, displayName) => {
      if (branch.multiple === true) {
        onChange([...(Array.isArray(value) ? value : []), newId])
      } else {
        onChange(newId)
      }
      // Optionally re-open the popover so the user can see the new chip;
      // skip for single-value since the trigger already shows the new label.
      if (branch.multiple === true) setPopoverOpen(true)
    }}
  />
)}
```

--------------------------------------------------------------------------
STEP 4 — Context provider for recursion guard
File: apps/dashboard/src/features/inline-create/depth-context.tsx (new)
--------------------------------------------------------------------------

```tsx
import { createContext } from 'react'
export const InlineCreateDepthContext = createContext<number>(0)
```

The Dialog wraps its body in `<InlineCreateDepthContext.Provider value={1}>`.
The RelationEdit inside the Dialog reads `depth === 1` and hides the
inline-create row.

--------------------------------------------------------------------------
STEP 5 — i18n
Files: apps/dashboard/src/locales/{en,it}.json
--------------------------------------------------------------------------

en:
```json
"relation": {
  "createNew": "+ Create new {{label}}",
  "createTitle": "New {{label}}",
  "createSubmit": "Create & link",
  "showAllFields": "Show all fields",
  "createSuccess": "{{label}} created and linked"
}
```

it:
```json
"relation": {
  "createNew": "+ Crea nuovo {{label}}",
  "createTitle": "Nuovo {{label}}",
  "createSubmit": "Crea e collega",
  "showAllFields": "Mostra tutti i campi",
  "createSuccess": "{{label}} creato e collegato"
}
```

(Merge these into the existing `relation` namespace from Sprint 4.)

==========================================================================
SECTION 3 — TESTS
==========================================================================

### Component tests

1. Inline-create affordance is hidden when `useCanCreate` returns false.
2. Inline-create affordance is hidden when depth context > 0 (recursion guard).
3. Clicking the affordance opens the dialog; the popover closes.
4. Submitting the dialog calls `contentApi.create` with the form payload;
   on success the dialog closes and `onChange` is called with the new id
   (single) or appended array (multi).
5. Server-side validation error renders inline in the dialog; the dialog
   stays open and the form state is preserved.
6. The newly created entry's display label appears immediately in the
   trigger button (cache priming works).

### Integration test
- Open the article editor, type a title, open the author combobox, click
  "+ Create new Team Member", fill name + email, submit. Assert:
  - The new team member exists in the DB.
  - The article form's title state is preserved.
  - The article's `author_id` field shows the new member's name.

==========================================================================
SECTION 4 — OUT OF SCOPE
==========================================================================

- Bulk reassign — Sprint 8.
- Inline-create from the back-refs panel (e.g. "Create a new article linked
  to this team member"). Useful but adds reverse-linking complexity. Defer
  until editorial feedback requests it.
- Pre-filling the dialog with values copied from the parent editor.
- Async validation that another editor might be creating the same record
  concurrently.

==========================================================================
SECTION 5 — COMPLETION CHECKLIST
==========================================================================

[ ] `useCanCreate(slug)` selector available.
[ ] `InlineCreateDialog` component implemented as documented.
[ ] `InlineCreateDepthContext` enforces depth-1 cap.
[ ] `RelationEdit` shows affordance only when allowed and depth === 0.
[ ] On success, the new id is selected (single) or appended (multi).
[ ] Cache priming for the new entry + backrefs invalidation.
[ ] Server-side validation errors surface inline without closing the dialog.
[ ] i18n keys present in both locales.
[ ] All tests pass; no regression in the standalone entry-editor page.

==========================================================================
SECTION 6 — CODEBASE EXPLORATION NOTES (added 2026-05-27)
==========================================================================

DO NOT RE-EXPLORE. All findings below are verified from the actual codebase.

--------------------------------------------------------------------------
6.1 — File paths (exact, verified)
--------------------------------------------------------------------------

EXISTING files to modify:
  apps/dashboard/src/features/fields/edit/relation.tsx      ← RelationEdit (single + multi)
  apps/dashboard/src/locales/en.json                        ← add keys under "content.editor.relation"
  apps/dashboard/src/locales/it.json                        ← add same keys

NEW files to create:
  apps/dashboard/src/features/auth/use-can-create.ts
  apps/dashboard/src/features/inline-create/depth-context.tsx
  apps/dashboard/src/features/inline-create/inline-create-dialog.tsx
  apps/dashboard/src/features/inline-create/index.ts
  apps/dashboard/src/test/features/inline-create/inline-create-dialog.test.tsx

--------------------------------------------------------------------------
6.2 — Permission system: no per-seed permissions exist
--------------------------------------------------------------------------

The JWT issued at login contains ONLY: { sub, email, name }
  → See: apps/api/src/factory.ts:223 — tokenService.issue({ sub, email, name })
  → See: packages/core/src/auth/token-service.ts — JwtClaims interface

The dashboard AuthContext (apps/dashboard/src/lib/auth-context.tsx) decodes:
  { email: string; name?: string }
  → No role, no permissions, no per-seed caps.

The DB has a `role` column on users (always 'admin' in current setup — only
one user type exists). See: apps/api/src/shared/d1-user.repository.ts:13

CONCLUSION: `useCanCreate(slug)` must be a stub returning `true` for all
authenticated users. Do NOT add API calls. Signature:

  // apps/dashboard/src/features/auth/use-can-create.ts
  import { useAuth } from "@/lib/auth-context"
  export function useCanCreate(_slug: string): boolean {
    const { status } = useAuth()
    return status === 'authenticated'
  }

Export from auth barrel when one exists, otherwise import directly.
NOTE: auth feature has NO index.ts barrel — import directly by path.
  apps/dashboard/src/features/auth/use-can-create.ts

--------------------------------------------------------------------------
6.3 — Schema / seed resolution pattern
--------------------------------------------------------------------------

Use `useSchema()` from apps/dashboard/src/features/schema/hooks/use-schema.ts

  const { data: seeds } = useSchema()
  const targetSeed = seeds?.find(s => s.slug === targetSlug)
  const labelAlias = targetSeed?.displayNameAlias ?? "title"

`Seed` type from @beechcms/core. `displayNameAlias` and `branches` are on it.
`Branch` type from @beechcms/core has: id, alias, type, label, requiredOnCreate,
requiredOnUpdate, targetSeed, multiple, etc.

--------------------------------------------------------------------------
6.4 — contentApi.create signature (verified)
--------------------------------------------------------------------------

  // apps/dashboard/src/features/content-management/api/content.api.ts:75
  create: async (slug: string, data: Record<string, unknown>): Promise<{ id: string }>

Returns `{ id: string }`. No slug/status needed for inline-create (API handles
defaults). Pass only the formData fields.

Cache key for priming:
  CONTENT_QUERY_KEYS.detail(targetSlug, newId)
  // from: apps/dashboard/src/features/content-management/consts/content.keys.ts

Backrefs invalidation key:
  BACKREF_QUERY_KEY = 'backrefs'
  // from: apps/dashboard/src/features/backrefs/hooks/use-backrefs.ts:8
  // invalidate: queryClient.invalidateQueries({ queryKey: ['backrefs', targetSlug] })

--------------------------------------------------------------------------
6.5 — FieldEdit usage pattern (from entry-editor.tsx)
--------------------------------------------------------------------------

  import { FieldEdit } from "@/features/fields"

  <FieldEdit
    branch={branch as any}   // cast needed: branch from seed is typed slightly differently
    value={formData[branch.alias]}
    onChange={(val) => onInputChange(branch.alias, val)}
  />

FieldEditProps = { branch: Branch, value: unknown, onChange: (value: unknown) => void }
FieldEdit.tsx checks resolvePolicies(branch).privacy and delegates to registry.
Wrap with <InlineCreateDepthContext.Provider value={1}> around each FieldEdit
inside the dialog (not around the whole dialog).

--------------------------------------------------------------------------
6.6 — Dialog component available
--------------------------------------------------------------------------

  apps/dashboard/src/components/ui/dialog.tsx  ← use this

Import:
  import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
  } from "@/components/ui/dialog"

--------------------------------------------------------------------------
6.7 — i18n: existing "relation" namespace location
--------------------------------------------------------------------------

In both en.json and it.json the existing keys are at:
  "content" > "editor" > "relation": { placeholder, search, clear, empty, loading }
  "content" > "editor" > "relationMulti": { add, moveUp, moveDown, remove, selectedItems }

ADD the Sprint 7 keys INSIDE "content" > "editor" > "relation":
  "createNew": "+ Create new {{label}}",
  "createTitle": "New {{label}}",
  "createSubmit": "Create & link",
  "showAllFields": "Show all fields",
  "createSuccess": "{{label}} created and linked"

Usage in code: t('content.editor.relation.createNew', { label: targetSeed?.label })

--------------------------------------------------------------------------
6.8 — Existing RelationEdit structure summary
--------------------------------------------------------------------------

relation.tsx exports:
  - RelationEdit (public, dispatches on branch.multiple)
  - SingleRelationEdit (internal)
  - MultiRelationEdit (internal)

SingleRelationEdit already has `onInlineCreate?: () => void` prop
BUT it is stubbed out: `void onInlineCreate` — not wired to UI yet.
Remove the stub and implement the full footer affordance.

MultiRelationEdit does NOT have `onInlineCreate` prop yet — needs adding.

RelationEdit (dispatcher) already accepts `onInlineCreate?: () => void`
but does NOT pass it to MultiRelationEdit — fix this in the dispatcher.

--------------------------------------------------------------------------
6.9 — Cache priming pattern (TanStack Query v5)
--------------------------------------------------------------------------

  const queryClient = useQueryClient()
  queryClient.setQueryData(
    CONTENT_QUERY_KEYS.detail(targetSlug, newId),
    {
      id: newId,
      slug: null,
      status: 'published',
      data: formData,       // formData already has displayNameAlias field
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies ContentEntry
  )

ContentEntry type is from: apps/dashboard/src/lib/dynamic-columns.ts
(imported in content.api.ts as `import type { ContentEntry } from "@/lib/dynamic-columns"`)

--------------------------------------------------------------------------
6.10 — Test file patterns
--------------------------------------------------------------------------

Existing test: apps/dashboard/src/test/pages/entry-editor.test.tsx
  → Uses vitest + @testing-library/react
  → Mocks: vi.mock('@/features/schema'), vi.mock('@/features/content-management')
  → Uses renderWithProviders pattern

New test file goes in:
  apps/dashboard/src/test/features/inline-create/inline-create-dialog.test.tsx

--------------------------------------------------------------------------
6.11 — Validation in the dialog
--------------------------------------------------------------------------

The sprint says "client-side via existing Zod compiler from @beechcms/core".
The relevant function is:
  validateAndSanitizeSeedPayload (used in API, not on dashboard)

On the dashboard, entry-editor.tsx does its own simple validation:
  validateEntryJsonFields() — checks JSON field syntax only
  No Zod schema validation on dashboard side currently.

DECISION: For the inline-create dialog, do minimal validation:
  1. Check required fields (requiredOnCreate === true) are non-empty
  2. Check JSON fields parse correctly (reuse validateEntryJsonFields logic)
  3. Let API return 4xx for deeper validation — show detail in error region

--------------------------------------------------------------------------
6.12 — BUSL header required
--------------------------------------------------------------------------

All new files must start with:
  // SPDX-License-Identifier: BUSL-1.1
  // Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
  // See LICENSE in the repository root for license terms.
