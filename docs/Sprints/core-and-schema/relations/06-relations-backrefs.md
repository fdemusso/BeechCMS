You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

Do NOT explore the codebase further. All relevant context is provided in this prompt.
Read it fully before writing any code.

This is **Sprint 6 of 8** for the `relation` field type. Sprints 1–5 shipped
single-value and many-to-many relations end-to-end. This sprint adds
**back-references**: from any target entry's detail page, surface every entry
that points to it.

### Why this matters

Without back-refs, an editor opening `team/ada-lovelace` cannot answer:
- "How many articles does she author?"
- "Is she referenced anywhere? Safe to delete?"

The data is already in the DB (the FKs are the source of truth). This sprint
makes it visible.

### Stack

- API: Hono on Cloudflare Workers, D1. New read-only endpoint.
- Dashboard: a new collapsible panel on the entry-editor page, populated by
  a TanStack Query hook.

==========================================================================
SECTION 1 — WHAT THIS SPRINT DELIVERS
==========================================================================

1. New API endpoint: `GET /content/<targetSlug>/<targetId>/backrefs`.
2. Response shape:
   ```ts
   {
     groups: Array<{
       sourceSlug: string             // e.g. 'articles'
       sourceLabel: string            // e.g. 'Articles' — from seed.labelPlural
       branchAlias: string            // e.g. 'author_id'
       branchLabel: string            // e.g. 'Author' — from branch.label
       relationship: 'single' | 'multi'
       total: number                  // total rows in this group
       items: Array<{
         id: string
         displayName: string          // resolved via seed.displayNameAlias
         status: string
         updated_at: number | null
       }>                             // capped at PAGE_LIMIT (see Section 3)
     }>
   }
   ```
3. Pagination: per-group offset paging via `?group=<sourceSlug>:<branchAlias>&page=<n>`.
4. Permission model: identical to read access on the target seed. If the user
   can see the target entry, they can see its back-refs.
5. Dashboard: a "Referenced by" collapsible card under the main editor form
   (only on edit mode, never on create — no entry yet to back-ref).
   - Shows up to PREVIEW_LIMIT (3) items per group inline.
   - "Show all N" expands to a paginated list dialog.
   - Each item is a link to its own editor.
6. Performance: bounded at O(R+M) queries where R = single relations pointing
   at this seed, M = multi relations. No N+1.

==========================================================================
SECTION 2 — DISCOVERY ALGORITHM
==========================================================================

At endpoint entry, iterate the Seed registry once and build a discovery map
(can be cached in memory at API factory time — it only changes when the
project's `seed.ts` changes, i.e. never within a process lifetime):

```ts
interface BackrefSource {
  sourceSlug: string
  branchAlias: string
  branchLabel: string
  relationship: 'single' | 'multi'
}

// Map: targetSlug → BackrefSource[]
const BACKREF_MAP = new Map<string, BackrefSource[]>()

for (const seed of Object.values(SEED_REGISTRY)) {
  for (const branch of seed.branches) {
    if (branch.type !== 'relation' || !branch.targetSeed) continue
    const sources = BACKREF_MAP.get(branch.targetSeed) ?? []
    sources.push({
      sourceSlug: seed.slug,
      branchAlias: branch.alias,
      branchLabel: branch.label,
      relationship: branch.multiple === true ? 'multi' : 'single',
    })
    BACKREF_MAP.set(branch.targetSeed, sources)
  }
}
```

Build this once at app factory time (`apps/api/src/factory.ts`) and inject it
via `c.set('backrefMap', ...)`. Same pattern as repositories.

==========================================================================
SECTION 3 — STEP-BY-STEP PLAN
==========================================================================

--------------------------------------------------------------------------
STEP 1 — Discovery map at factory boot
File: apps/api/src/factory.ts
      apps/api/src/types.ts (add `backrefMap` to AppEnv Variables)
--------------------------------------------------------------------------

Build the map once at factory construction (after seeds are loaded into the
registry, before the first request). It is read-only and pure-data, so safe
to share across requests.

```ts
import { buildBackrefMap } from '@beechcms/core'
// ...
const backrefMap = buildBackrefMap(seedRegistry)
app.use('*', (c, next) => { c.set('backrefMap', backrefMap); return next() })
```

`buildBackrefMap` is a pure function in `packages/core/src/relations.ts` (new
file — small enough). Exports the function and the `BackrefSource` type.

--------------------------------------------------------------------------
STEP 2 — New feature slice
File: apps/api/src/features/backrefs/backrefs.handler.ts (new)
      apps/api/src/features/backrefs/index.ts            (barrel)
      apps/api/src/factory.ts                            (register route)
--------------------------------------------------------------------------

Follow the existing Vertical Slice pattern (mirror the `draft` feature
folder structure). The handler accepts:

```
GET /content/:targetSlug/:targetId/backrefs
    ?group=<sourceSlug>:<branchAlias>      (optional — when paginating one group)
    &page=<n>                              (optional, default 1)
    &limit=<n>                             (optional, default 20, max 100)
```

Behaviour:

1. Resolve `seed = getSeed(targetSlug)`. If missing → 404 RFC 7807.
2. Verify `targetId` exists in `content_<targetSlug>`. If not → 404.
3. Read `backrefMap.get(targetSlug)`. If empty → return
   `{ groups: [] }` (200). No entries can possibly back-reference this seed.
4. Without `group`: for each source, run a preview query (LIMIT = PREVIEW_LIMIT
   = 3) and a count query. Return all groups, items pre-sorted by
   `updated_at DESC`.
5. With `group`: parse `<sourceSlug>:<branchAlias>`, validate that this pair
   exists in the discovery map for this target, then run a single paginated
   query with offset+limit. Return that group only, with full items array.

### Query shape — single-value source

```sql
SELECT id, slug, status, updated_at,
       <displayNameAlias> AS displayName
  FROM content_<sourceSlug>
 WHERE <branchAlias> = ?
 ORDER BY updated_at DESC
 LIMIT ? OFFSET ?;

SELECT COUNT(*) AS total FROM content_<sourceSlug> WHERE <branchAlias> = ?;
```

### Query shape — multi-relation source

```sql
SELECT c.id, c.slug, c.status, c.updated_at,
       c.<displayNameAlias> AS displayName
  FROM content_<sourceSlug> c
  JOIN rel_<sourceSlug>_<branchAlias> r ON r.parent_id = c.id
 WHERE r.target_id = ?
 ORDER BY c.updated_at DESC
 LIMIT ? OFFSET ?;

SELECT COUNT(DISTINCT parent_id) AS total
  FROM rel_<sourceSlug>_<branchAlias>
 WHERE target_id = ?;
```

Constants at the top of the file:
```ts
const PREVIEW_LIMIT = 3
const DEFAULT_PAGE_LIMIT = 20
const MAX_PAGE_LIMIT = 100
```

Build SQL using the source seed's `displayNameAlias` resolved at runtime. NEVER
interpolate user input — bind every parameter, even the dynamic table/column
names (which come from the registry, not the request).

--------------------------------------------------------------------------
STEP 3 — Visibility filtering
File: backrefs.handler.ts
--------------------------------------------------------------------------

A back-ref source row might be `status = 'archived'` or have field-level
privacy. Apply the existing `applyVisibility()` helper used by the regular
list handler (`apps/api/src/shared/apply-policies.ts`) to each row before
returning. If a source seed has a `public: false` policy for the columns
included in the response and the caller is unauthenticated, that group
returns `{ items: [], total: 0 }`.

For the dashboard (authenticated), no extra filtering is needed beyond
status visibility.

--------------------------------------------------------------------------
STEP 4 — Frontend API + hook
File: apps/dashboard/src/features/backrefs/api.ts          (new)
      apps/dashboard/src/features/backrefs/hooks/use-backrefs.ts (new)
      apps/dashboard/src/features/backrefs/index.ts        (barrel)
--------------------------------------------------------------------------

Standard slice. The hook:

```ts
export function useBackrefs(targetSlug: string, targetId: string) {
  return useQuery({
    queryKey: ['backrefs', targetSlug, targetId],
    queryFn: () => backrefsApi.fetch(targetSlug, targetId),
    enabled: Boolean(targetSlug && targetId),
    staleTime: 60 * 1000,
  })
}
```

Invalidation: when a source entry is created/updated/deleted, invalidate
`['backrefs', <every target slug>]`. Cheapest: invalidate the whole key
prefix via `queryClient.invalidateQueries({ queryKey: ['backrefs'] })`
inside the existing `useSaveContent` / `useDeleteContent` mutations.

--------------------------------------------------------------------------
STEP 5 — "Referenced by" panel
File: apps/dashboard/src/features/backrefs/referenced-by-panel.tsx (new)
      apps/dashboard/src/pages/entry-editor.tsx                    (mount it)
--------------------------------------------------------------------------

Mount the panel UNDER the main form, ONLY in edit mode (`!isCreate`).

UX:

- Collapsible card titled "Referenced by".
- Counter in the header: total across all groups (`X entries reference this`).
- Body: one section per group, with the group's `sourceLabel` + `branchLabel`
  as a subtitle (e.g. "Articles · Author").
- Up to PREVIEW_LIMIT items per section: each item is a row with the
  displayName, a status chip, the `updated_at` relative time, and a link to
  `/content/<sourceSlug>/<id>`.
- If `total > PREVIEW_LIMIT`: a "Show all N" button opens a Dialog with the
  full paginated list (fetched via the `?group=` variant of the endpoint).
- Empty groups are hidden. If ALL groups are empty, the panel is hidden
  entirely (not even a "no references" message — keep the page light).
- Loading state: a single muted skeleton row. The panel does not block the
  main form rendering.

This panel is also the visual cue to the `ON DELETE RESTRICT` warning: when
the user clicks Delete on an entry that has back-refs with RESTRICT
relationships, the existing 409 problem from Sprint 2 is shown. UX
improvement: pre-empt the click — if the backref panel shows any group
whose source branch has `onDelete: 'RESTRICT'` (this info needs to be
included in the API response — add `restricts: boolean` to each group),
disable the Delete button with a tooltip explaining why.

API contract addition:
```ts
groups: Array<{
  // ... existing fields ...
  restricts: boolean   // true when source branch.onDelete === 'RESTRICT'
}>
```

--------------------------------------------------------------------------
STEP 6 — i18n
Files: apps/dashboard/src/locales/{en,it}.json
--------------------------------------------------------------------------

en:
```json
"backrefs": {
  "title": "Referenced by",
  "summary_one": "1 entry references this",
  "summary_other": "{{count}} entries reference this",
  "showAll": "Show all {{count}}",
  "empty": "No references",
  "deleteBlocked": "Cannot delete: {{count}} entries depend on this record"
}
```

it:
```json
"backrefs": {
  "title": "Riferimenti in entrata",
  "summary_one": "1 voce fa riferimento a questa",
  "summary_other": "{{count}} voci fanno riferimento a questa",
  "showAll": "Mostra tutte le {{count}}",
  "empty": "Nessun riferimento",
  "deleteBlocked": "Eliminazione bloccata: {{count}} voci dipendono da questo record"
}
```

==========================================================================
SECTION 4 — TESTS
==========================================================================

### API
- Target seed with no inbound relations → `{ groups: [] }`.
- Target with 1 single-value source, 5 referencing rows → preview shows 3,
  `total = 5`, `restricts = false`.
- Target with 1 multi-relation source, 12 referencing rows → preview shows
  3, `total = 12`.
- Paginated request with `?group=articles:author_id&page=2&limit=4` returns
  rows 5–8.
- Unknown target slug → 404.
- Unknown target id (slug valid) → 404.
- Source seed with `public: false` columns + unauthenticated request →
  group present but items empty (or excluded; pick whichever is simpler
  with existing visibility helpers).

### Dashboard
- Panel renders nothing when API returns empty.
- Counter in header matches sum of totals.
- "Show all" opens dialog with paginated list.
- Delete button is disabled with tooltip when any group has `restricts: true`.

==========================================================================
SECTION 5 — OUT OF SCOPE
==========================================================================

- Inline create from the combobox — Sprint 7.
- Bulk reassign — Sprint 8.
- Filtering back-refs by status (just show all, sort by `updated_at`).
- Surfacing back-refs in the Public API. The endpoint is dashboard-only.

==========================================================================
SECTION 6 — COMPLETION CHECKLIST
==========================================================================

[ ] `buildBackrefMap` pure helper in `@beechcms/core`.
[ ] Factory builds the map once and injects it via context.
[ ] `GET /content/:slug/:id/backrefs` returns the documented shape.
[ ] Preview (3 items/group) on the no-`group` variant; full pagination
    on `?group=` variant.
[ ] Single and multi-relation sources both queried correctly, bound at
    O(R+M) queries.
[ ] Visibility filter applied per row.
[ ] Dashboard `ReferencedByPanel` mounted only in edit mode.
[ ] Delete button disabled with tooltip when any group has `restricts: true`.
[ ] i18n keys present in both locales.
[ ] All tests pass; no regression elsewhere.
