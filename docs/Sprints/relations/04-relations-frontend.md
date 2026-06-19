You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

Do NOT explore the codebase further. All relevant context is provided in this prompt.
Read it fully before writing any code.

This is **Sprint 4 of 4** — the final sprint for the `relation` field type. Sprints
1–3 have shipped: DDL emission with FK + index, validation, RFC 7807 error mapping,
draft-promotion safety, and the canonical `articles.author_id → team` relation
end-to-end on the API.

This sprint delivers the **dashboard UX**: a display renderer that resolves the
target's label via TanStack Query, an edit renderer with a searchable combobox, list
table integration, and an N+1 mitigation strategy.

### Stack

- Dashboard: React 19, Vite 7, TanStack Query v5, TanStack Table v8, Shadcn/ui,
  Tailwind v4, Axios (`src/lib/api.ts`, base `/api`).
- i18n: `react-i18next`, keys in `apps/dashboard/src/locales/{en,it}.json`.
- Field rendering: registry pattern in `apps/dashboard/src/features/fields/`.

==========================================================================
SECTION 1 — RELEVANT FILES (current state)
==========================================================================

apps/dashboard/src/features/fields/
  registry.ts                 -- maps `branch.type` → { Display, Edit } renderers.
                                  ADD a new mapping for `'relation'`.
  field-registry.ts           -- secondary registry hook (verify, single registry only).
  types.ts                    -- `FieldDisplayProps`, `FieldEditProps`.
  display/                    -- one file per type: boolean, date, json, media,
                                  number, richtext, text.
  edit/                       -- mirror of display, plus number variants.
  index.ts                    -- public barrel of the feature.

apps/dashboard/src/features/content-management/
  api/content.api.ts          -- `fetchById`, `fetchList`, ...
  consts/content.keys.ts      -- `CONTENT_QUERY_KEYS.detail(slug, id)` and `.list(...)`.
  hooks/use-content-item.ts   -- existing CRUD hooks.

apps/dashboard/src/pages/
  content-list.tsx            -- TanStack Table list view.
  entry-editor.tsx            -- create/edit form.

apps/dashboard/src/lib/dynamic-columns.tsx
                              -- column factory for the list view.

==========================================================================
SECTION 2 — WHAT THIS SPRINT DELIVERS
==========================================================================

1. `RelationDisplay` (display/relation.tsx): renders a link to the target entry
   labelled by the target's `displayNameAlias` (or `'title'` as fallback), using
   the existing TanStack Query cache. Shows an em-dash for null values.
2. `RelationEdit` (edit/relation.tsx): a searchable combobox (Shadcn `Command`)
   that lists target entries paginated, displays them by `displayNameAlias`,
   and writes back the chosen id. Allows clearing.
3. Both renderers registered in `registry.ts` under the `'relation'` key.
4. **N+1 mitigation** on the list view: extend the list endpoint to embed a
   compact `_relations` projection AND prime the dashboard query cache with it
   so each `RelationDisplay` resolves synchronously without firing a new
   request. See Section 4.
5. List view: relation columns render the embedded label, sortable + filterable
   only if the branch policy says so. Reuse the existing `dynamic-columns.tsx`
   path; no new component, just a new mapping.
6. i18n keys for placeholder, empty state, loading state, and ARIA labels.

==========================================================================
SECTION 3 — STEP-BY-STEP PLAN
==========================================================================

--------------------------------------------------------------------------
STEP 1 — RelationDisplay
File: apps/dashboard/src/features/fields/display/relation.tsx (new)
--------------------------------------------------------------------------

VERIFIED facts (direct read):
- `ContentEntry` (apps/dashboard/src/lib/dynamic-columns.tsx:36) is:
  `{ id, schema_slug, slug, status, has_pending_draft?, data, created_at, updated_at }`.
  There is NO `meta` field and NO embedded `displayNameAlias`.
- `displayNameAlias` lives on the `Seed` object (packages/core/src/types.ts:150),
  not on the entry. The dashboard already has the Seed available client-side
  (`dynamic-columns.tsx` consumes `seed.branches` to build columns) — find the
  existing seed-lookup hook/util and reuse it. Do NOT add a new one.

```tsx
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { contentApi, CONTENT_QUERY_KEYS } from '@/features/content-management'
import { useSeed } from '@/features/<existing-seed-hook>'   // locate before importing
import type { FieldDisplayProps } from '../types'

const RELATION_STALE_MS = 5 * 60 * 1000

export function RelationDisplay({ branch, value }: FieldDisplayProps) {
  const { t } = useTranslation()
  const targetSlug = branch.targetSeed
  const id = typeof value === 'string' && value.length > 0 ? value : null

  const targetSeed = useSeed(targetSlug)
  const labelAlias = targetSeed?.displayNameAlias ?? 'title'

  const { data: entry, isLoading } = useQuery({
    queryKey: CONTENT_QUERY_KEYS.detail(targetSlug ?? '', id ?? ''),
    queryFn: () => contentApi.fetchById(targetSlug!, id!),
    enabled: Boolean(targetSlug && id),
    staleTime: RELATION_STALE_MS,
  })

  if (!id) return <span className="text-muted-foreground">—</span>
  if (isLoading) return <span className="text-muted-foreground">{t('common.loading')}</span>

  const label = (entry?.data as Record<string, unknown> | undefined)?.[labelAlias] ?? id

  return (
    <Link
      to={`/content/${targetSlug}/${id}`}
      className="text-primary hover:underline truncate"
    >
      {String(label)}
    </Link>
  )
}
```

Notes:
- `branch.targetSeed` is GUARANTEED present after Sprint 2's validation step;
  the `targetSlug ?? ''` guard is purely defensive.
- The TanStack cache priming added in Step 4 makes this query resolve
  synchronously in the list view. In the editor it may fire one real request
  per relation field — acceptable.
- If no `useSeed`-style hook exists today, lift the existing seed source
  (likely a top-level provider populated at app boot) into a tiny shared
  selector. Do NOT introduce a new HTTP endpoint for seed metadata — the
  client already has the registry.

--------------------------------------------------------------------------
STEP 2 — RelationEdit
File: apps/dashboard/src/features/fields/edit/relation.tsx (new)
--------------------------------------------------------------------------

VERIFIED API (content.api.ts:32):

```ts
fetchList(slug: string, params: {
  page?: number
  limit?: number
  search?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  filters?: unknown
}): Promise<{ items: ContentEntry[]; total: number; page: number; limit: number }>
```

Build on the existing Shadcn `Command` + `Popover` combobox pattern already used
elsewhere in the dashboard (find a prior usage and mirror its imports). The
component must:

1. Accept `branch`, `value`, `onChange`, and `disabled` props (`FieldEditProps`).
2. Read `branch.targetSeed` and call
   `contentApi.fetchList(targetSeed, { search, limit: 20, page: 1 })` through
   TanStack Query, with a debounced search term (250ms). Use `keepPreviousData`
   to avoid flicker between keystrokes.
3. Resolve the label from each `ContentEntry` via `entry.data[targetSeed.displayNameAlias]`,
   falling back to `entry.slug ?? entry.id`. The target Seed comes from the same
   `useSeed`-style selector used by `RelationDisplay` — do not duplicate.
4. Render results as `<CommandItem>` rows: primary text = resolved label;
   secondary text (muted) = `entry.id` for disambiguation.
5. On select, call `onChange(selectedEntry.id)` and close the popover.
6. Show the currently selected entry's label in the trigger button. If the
   selected id has no cached entry yet, fire a single `fetchById` to resolve
   it (same query key the display uses → automatic dedup).
7. Include a "Clear" affordance that calls `onChange(null)` ONLY when the
   branch is not required for the current operation:
   - In create mode: hide Clear if `branch.requiredOnCreate === true`.
   - In edit mode:   hide Clear if `branch.requiredOnUpdate === true`.
   The editor knows its mode (`isCreate` boolean in `entry-editor.tsx`).
   Pass it down via props.

The component MUST be self-contained (single file) and must NOT export anything
besides `RelationEdit`. It MAY reuse small helpers from `@/components/ui` and
`@/lib`, but never reach into another feature's internals.

NAMING REMINDER: `Branch` does NOT have a `required` field. Use
`requiredOnCreate` / `requiredOnUpdate` (types.ts:78–80).

--------------------------------------------------------------------------
STEP 3 — Register the renderers
File: apps/dashboard/src/features/fields/registry.ts
--------------------------------------------------------------------------

```ts
import { RelationDisplay } from './display/relation'
import { RelationEdit } from './edit/relation'

// inside the map literal:
relation: { Display: RelationDisplay, Edit: RelationEdit },
```

Make sure the map's TypeScript key type matches the new `BranchType` value.
Do NOT touch the other entries.

--------------------------------------------------------------------------
STEP 4 — N+1 mitigation via list endpoint projection + cache priming
--------------------------------------------------------------------------

### 4a — API: embed compact relation labels in list responses
File: apps/api/src/features/content/list.handler.ts (or the equivalent)

VERIFIED current shape (content.api.ts:18):
```ts
ContentListWithMeta { items: ContentEntry[]; total: number; page: number; limit: number }
```

After the main `SELECT * FROM content_<slug> ...` query, build a single map of
referenced ids per relation branch and run ONE batched query per target seed:

```ts
// For each relation branch in `seed.branches`:
//   collect non-null ids from result rows
//   resolve targetSeed.displayNameAlias from the registry
//   if any ids: SELECT id, <displayNameAlias> FROM content_<targetSeed> WHERE id IN (?, ?, ...)
//
// Attach a top-level `relations` field (NOT `_relations` — drop the underscore
// to match the existing naming convention; `items`, `total`, `page`, `limit`
// are all unprefixed).
//
// Final shape:
// {
//   items: ContentEntry[],
//   total, page, limit,
//   relations: {
//     '<branch.alias>': { '<targetId>': '<labelString>', ... }
//   }
// }
```

Bounded at O(R) extra queries per list page where R = number of relation
branches on the seed. `ContentListWithMeta` on the client must be extended
with `relations?: Record<string, Record<string, string>>`. Older list code
that ignores the field continues to work — the field is optional.

### 4b — Dashboard: prime the TanStack cache from `relations`
File: apps/dashboard/src/features/content-management/hooks/use-content-list.ts
       (or wherever `fetchList` is consumed)

In the `onSuccess` (or equivalent post-fetch hook), iterate the response's
`relations` field and prime the per-entry detail cache:

```ts
for (const [alias, idLabelMap] of Object.entries(response.relations ?? {})) {
  const branch = seed.branches.find(b => b.alias === alias)
  if (!branch || branch.type !== 'relation' || !branch.targetSeed) continue
  const targetSlug = branch.targetSeed
  const targetSeed = seedRegistryClient.get(targetSlug)
  const labelAlias = targetSeed?.displayNameAlias ?? 'title'
  for (const [id, label] of Object.entries(idLabelMap)) {
    queryClient.setQueryData<ContentEntry>(
      CONTENT_QUERY_KEYS.detail(targetSlug, id),
      {
        id,
        schema_slug: targetSlug,
        slug: null,
        status: 'published',
        data: { [labelAlias]: label },
        created_at: null,
        updated_at: null,
      }
    )
  }
}
```

The minimal payload conforms to the real `ContentEntry` shape (verified at
dynamic-columns.tsx:36), so `RelationDisplay` reads `entry.data[labelAlias]`
and renders synchronously without firing a network request.

--------------------------------------------------------------------------
STEP 5 — List columns
File: apps/dashboard/src/lib/dynamic-columns.tsx
--------------------------------------------------------------------------

Relation branches must appear as columns when `branch.policies.list === true`
(or whatever the existing default is — match the behaviour of `text` columns
verbatim). Render via `RelationDisplay`. No special branching at the call site:
the registry handles it.

Sortability and filterability follow `branch.policies.sort` / `branch.policies.filter`
exactly as for other types — no special-casing.

--------------------------------------------------------------------------
STEP 6 — i18n
Files: apps/dashboard/src/locales/en.json, it.json
--------------------------------------------------------------------------

Add under `content.editor` (or the appropriate namespace mirroring existing
field-renderer keys):

en:
```json
"relation": {
  "placeholder": "Select a related entry…",
  "search": "Search…",
  "clear": "Clear selection",
  "empty": "No results",
  "loading": "Loading…"
}
```

it:
```json
"relation": {
  "placeholder": "Seleziona una voce correlata…",
  "search": "Cerca…",
  "clear": "Rimuovi selezione",
  "empty": "Nessun risultato",
  "loading": "Caricamento…"
}
```

--------------------------------------------------------------------------
STEP 7 — Tests
--------------------------------------------------------------------------

### Component tests (`@testing-library/react`)
File: apps/dashboard/src/test/fields/relation.test.tsx (new)

1. `RelationDisplay` renders an em-dash when value is null.
2. `RelationDisplay` renders the target's `displayNameAlias` value as link text
   when the cache is primed.
3. `RelationDisplay` falls back to the id when neither cache nor fetch yield
   a label (simulate via QueryClient mock without priming).
4. `RelationEdit` opens the popover on click, fires the list query with the
   typed search term (debounced), and calls `onChange(id)` when an item is
   selected.
5. `RelationEdit` calls `onChange(null)` when "Clear" is clicked AND the branch
   is not required; the Clear control is absent when `required: true`.

### Integration test for cache priming
File: apps/dashboard/src/test/features/content-list-relation.test.tsx (new)

1. Render the list page with a mocked API response carrying `_relations`.
2. Assert that the relation column shows the human label (e.g. "Ada Lovelace")
   in the same render tick — i.e. no `Loading…` state is visible.
3. Assert via a network spy that NO `fetchById` call was made for the
   resolution.

==========================================================================
SECTION 4 — UX GUARANTEES
==========================================================================

- The list view never fires per-row label requests. R queries per page max.
- The editor fires at most one request per relation field on initial load to
  resolve the currently-selected entry's label.
- The combobox's search list query is debounced and uses `keepPreviousData`
  to avoid flicker between keystrokes.
- All strings flow through `react-i18next` — no hardcoded English / Italian
  in any new file.
- Clearing a relation in the editor is only available when the branch is not
  `required`.

==========================================================================
SECTION 5 — OUT OF SCOPE FOR THIS SPRINT (delivered in 5–8)
==========================================================================

- Multi-select / many-to-many relations — **Sprint 5**.
- "Referenced by" back-reference panel on the target's detail page — **Sprint 6**.
- Inline creation of a target entry from inside the combobox — **Sprint 7**.
- Bulk re-assignment from the list view — **Sprint 8**.

Polymorphism (a single column referencing multiple seeds) is explicitly NOT
on the roadmap.

Sprint 4 must leave hooks open for these:
- `RelationEdit` accepts an optional `onInlineCreate?: () => void` prop, unused
  in this sprint but consumed in Sprint 7.
- The list-view bulk-toolbar layout (Sprint 8) is not modified here; only the
  per-row Display renderer is added.

==========================================================================
SECTION 6 — COMPLETION CHECKLIST
==========================================================================

[ ] `display/relation.tsx` renders a link labelled by the target's
    `displayNameAlias` and falls back gracefully.
[ ] `edit/relation.tsx` provides a searchable, debounced, clearable combobox.
[ ] Both renderers are registered under `'relation'` in `registry.ts`.
[ ] List endpoint emits `_relations` with batched O(R) extra queries.
[ ] Dashboard primes TanStack cache from `_relations` so the list view
    performs zero per-row label fetches.
[ ] Relation columns appear in the list table when the policy allows it,
    with the existing sort / filter rules respected.
[ ] All new strings exist in both `en.json` and `it.json`.
[ ] All new tests pass (`pnpm run test` in `apps/dashboard` and `apps/api`).
[ ] No regression on existing field types in the editor or list views.
[ ] No file outside the dashboard and the list handler in the API was touched.
