You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

This sprint covers **UI Refactoring — Sprint 01: Live/Draft Separation & Unified Drafts view**.

Today drafts live in a per-seed shadow table `content_{slug}_drafts` (one table per seed
with `allowDrafts: true`). The dashboard can already show pending drafts **for a single seed**
(`pending-drafts-widget.tsx`, which filters `/content/:slug?has_pending_draft=1`), but there is
**no unified view across all seeds**. Editors must open each seed page one by one.

This sprint introduces:
1. A new backend endpoint `GET /api/content/drafts` that aggregates pending drafts across every
   draft-enabled seed in a single optimised query.
2. A static "Drafts" link in the dashboard sidebar.
3. A unified `/drafts` page with one `DataTable` listing all drafts: seed type, entry title,
   last-modified date, last editor.
4. Per-row actions: Edit, Publish, Discard.

> **IMPORTANT — read before coding.** This plan was written after auditing the actual codebase.
> Follow it literally. The architecture is **Vertical Slice Architecture** (see
> `docs/vertical-slice.md`). The two hard rules that this sprint must respect:
> - **No inline SQL inside a Hono handler.** All D1 access lives behind a `ContentRepository`
>   method in `apps/api/src/shared/`. The handler stays thin.
> - **No cross-feature imports.** The dashboard Drafts UI is its own slice under
>   `apps/dashboard/src/features/drafts/`; the page file only orchestrates.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS
==========================================================================

1. **UX differentiation**: editors cannot see, in one place, what work is in progress (draft)
   versus published. A centralised drafts page improves visibility and control.
2. **Simplified audit & review**: a unified queue lets editors review/approve drafts before
   publishing, without hunting through every content category.

==========================================================================
SECTION 2 — VERIFIED CURRENT STATE (audited — trust these facts)
==========================================================================

### Backend
- **Draft tables are generated dynamically**, NOT in a migration. `generateDraftTable(seed)` in
  `packages/core/src/engine.ts` emits `content_{slug}_drafts` with this exact shape:
  - `entry_id TEXT NOT NULL PRIMARY KEY REFERENCES content_{slug}(id) ON DELETE CASCADE`
  - one column per branch, **named by `branch.alias`** (post-v0.4.0 the columns are aliases,
    not internal `br_xx` ids — so you may reference alias columns directly in SQL)
  - `updated_at INTEGER NOT NULL DEFAULT (unixepoch())` (unix **seconds**)
- The live table `content_{slug}` uses `id` (not `entry_id`) as primary key and also has
  alias-named columns. Join is `live.id = draft.entry_id`.
- The display column is `seed.displayNameAlias` (a real alias → a real column in both tables).
- **Draft repository methods already exist** on `ContentRepository`
  (`packages/core/src/content.repository.ts`, implemented in
  `apps/api/src/shared/content.repository.d1.ts`):
  `saveDraft`, `getDraft`, `publishDraft`, `deleteDraft`. The D1 class exposes `this.database`.
- **Draft HTTP routes already exist** in `apps/api/src/features/draft/draft.handler.ts`
  (exported as `draftApp`), all guarded by `draftGuard` and shaped `/:slug/:id/draft...`:
  - `PUT  /:slug/:id/draft`            — save draft
  - `GET  /:slug/:id/draft`            — read draft
  - `POST /:slug/:id/draft/publish`    — publish draft
  - `DELETE /:slug/:id/draft`          — discard draft
- `draftApp` is mounted in `apps/api/src/factory.ts` via `apiProtected.route('/content', draftApp)`
  at **line 313**, BEFORE `contentFeature` (line 315). Hono matches in registration order, so a
  **static** `GET /content/drafts` added to `draftApp` resolves to `draftApp` and never collides
  with `contentFeature`'s `/:slug`. (This ordering is the reason the endpoint goes in `draftApp`,
  not in a new feature.)
- `seedRegistry` is in the Hono context (`factory.ts` line 112). Use
  `context.get('seedRegistry').draftEnabled()` — it already returns `seeds.filter(s => s.allowDrafts)`.
  Do not re-implement the filter.
- `activity_logs` (defined in `apps/api/migrations/0000_v040_base.sql`, lines 139–150) columns:
  `id, user_id, user_email, user_name, action, entity_type, entity_id, entity_slug, details, created_at`.
  Draft saves/publishes are logged by `logDraftActivity` with `action: 'update'`,
  `entity_slug: <seed slug>`, `entity_id: <entry id>`, and `details` JSON containing
  `{ title, note: 'draft saved' | 'draft published' }`. **The "last editor" must be the last
  person who saved THIS draft** — i.e. the most recent `update` log whose `details` note is
  `'draft saved'` for that `entity_slug` + `entity_id`. Filtering only on `action='update'` would
  pick up generic live-content edits too, which is wrong; the subquery must match the draft note.

### Frontend
- Locales live at `apps/dashboard/src/locales/en.json` and `it.json` (single `translation`
  namespace). **There is NO top-level `navigation` section** — there is a `sidebar` section.
  (The original draft of this plan referenced `config/i18n/locales` and `navigation.drafts`;
  both are wrong. Use the paths below.)
- The axios client (`apps/dashboard/src/lib/api.ts`) has `baseURL: '/api'`. So `api.get('/content/drafts')`
  hits `/api/content/drafts`. Timestamps from the API are unix **seconds** → render with
  `new Date(updatedAt * 1000)`.
- Static sidebar menu: `getStaticMenu(t)` in `apps/dashboard/src/config/dashboard-menu.ts`
  returns `NavItem[]`. Static items import lucide icons directly (e.g. `LayoutDashboard`, `Settings`).
- Routing: `apps/dashboard/src/App.tsx` uses `createBrowserRouter` with `basename: '/admin'`;
  protected routes are wrapped in `<ProtectedRoute>`.
- Full-page layout pattern (copy it): pages render
  `SidebarProvider > SiteHeader + (AppSidebar + SidebarInset)`; see `apps/dashboard/src/pages/content-list.tsx`.
  `AppSidebar` and `SiteHeader` are imported from `@/features/navigation`.
- Reusable table: `DataTable` from `@/components/ui/data-table`. `date-fns` (^4.1.0) is available;
  locale map pattern: `{ it: itLocale, en: enUS }` keyed on `i18n.language` (see
  `pending-drafts-widget.tsx`).
- **Reuse, do not duplicate carelessly**: the per-seed widget already calls
  `POST /content/:slug/:id/draft/publish` and `DELETE /content/:slug/:id/draft`. The new Drafts
  slice gets its own thin api file calling the same endpoints (slice isolation forbids importing
  another slice's internals; small duplication is the sanctioned VSA trade-off).

### Database / migrations
- **No migration is required for this sprint.** Draft tables are auto-generated by the engine and
  `activity_logs` already exists in `0000_v040_base.sql`. If a future change ever needs a schema
  edit, the project is in beta — edit **`apps/api/migrations/0000_v040_base.sql` in place**
  (the DB is reset, never additively migrated). This sprint needs none.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

- **Phase A — Backend: Unified Drafts API (repository-backed, single query)**
  - Add a `DraftSummary` type + a `findPendingDrafts(seeds)` method to the `ContentRepository`
    interface in `packages/core`.
  - Implement it in `apps/api/src/shared/content.repository.d1.ts` as a single `UNION ALL` + CTE
    query, joined to `activity_logs` for the last editor.
  - Add a **thin** `GET /drafts` handler to `draftApp` that just calls the repository.
  - Co-locate tests.

- **Phase B — Dashboard menu, route, i18n**
  - Add "Drafts" to `getStaticMenu`.
  - Add the `/drafts` route in `App.tsx`.
  - Add i18n keys (correct paths) in `en.json` and `it.json`.

- **Phase C — Drafts slice + page**
  - New dashboard slice `apps/dashboard/src/features/drafts/` (api, hooks, types, index).
  - Thin page `apps/dashboard/src/pages/drafts-list.tsx` using the standard layout + `DataTable`.

==========================================================================
SECTION 4 — PHASE DETAILS
==========================================================================

### Phase A — Backend: Unified Drafts API

#### A.1 — Core contract (`packages/core/src/content.repository.ts`)

Add the shared type and the interface method (JSDoc explains **why**, per core rules):

```typescript
/**
 * One row of the cross-seed pending-drafts overview. Aggregates the minimum a
 * reviewer needs to triage a draft without opening it: which seed it belongs to,
 * a human title, when it was last touched, and who touched it.
 */
export interface DraftSummary {
  id: string                 // entry id (draft.entry_id)
  seedSlug: string
  seedLabel: string          // labelPlural ?? label, for display
  title: string              // displayName value (draft, falling back to live), or id
  updatedAt: number          // unix seconds (draft.updated_at)
  lastModifiedBy: {
    name: string | null
    email: string
  }
}
```

Add to the `ContentRepository` interface (near the other draft methods):

```typescript
  /**
   * Aggregates pending drafts across every draft-enabled seed in a single round-trip.
   * Exists so the unified /drafts view never issues one query per seed.
   * @param seeds The draft-enabled seeds to scan (caller passes seedRegistry.draftEnabled()).
   * @returns Drafts newest-first; empty array when no seeds or no drafts.
   */
  findPendingDrafts(seeds: Seed[]): Promise<DraftSummary[]>
```

Export `DraftSummary` from `packages/core/src/index.ts` (follow the existing export style there).

#### A.2 — D1 implementation (`apps/api/src/shared/content.repository.d1.ts`)

Implement `findPendingDrafts`. Build a dynamic `UNION ALL` over each seed's draft table, wrap in a
CTE, and resolve the last editor with a correlated subquery against `activity_logs`. Bind every
dynamic value with `?` placeholders (no string interpolation of user data; seed slugs come from the
registry and are safe identifiers, but bind the literals you select).

```typescript
async findPendingDrafts(seeds: Seed[]): Promise<DraftSummary[]> {
  if (seeds.length === 0) return []

  const unionSelects: string[] = []
  const bindings: (string | number)[] = []

  for (const seed of seeds) {
    const draftTable = `content_${seed.slug}_drafts`
    const liveTable = `content_${seed.slug}`
    const titleCol = seed.displayNameAlias            // real alias column in both tables
    const seedLabel = seed.labelPlural ?? seed.label

    unionSelects.push(`
      SELECT
        ? AS seed_slug,
        ? AS seed_label,
        d.entry_id AS id,
        d.updated_at AS updated_at,
        COALESCE(d.${titleCol}, l.${titleCol}) AS title
      FROM ${draftTable} d
      LEFT JOIN ${liveTable} l ON l.id = d.entry_id
    `)
    bindings.push(seed.slug, seedLabel)
  }

  const sql = `
    WITH all_drafts AS (
      ${unionSelects.join('\nUNION ALL\n')}
    )
    SELECT
      ad.seed_slug   AS seedSlug,
      ad.seed_label  AS seedLabel,
      ad.id          AS id,
      ad.updated_at  AS updatedAt,
      ad.title       AS title,
      al.user_name   AS lastName,
      al.user_email  AS lastEmail
    FROM all_drafts ad
    LEFT JOIN activity_logs al
      ON al.id = (
        SELECT id FROM activity_logs
        WHERE entity_id = ad.id
          AND entity_slug = ad.seed_slug
          AND action = 'update'
          AND json_extract(details, '$.note') = 'draft saved'
        ORDER BY created_at DESC
        LIMIT 1
      )
    ORDER BY ad.updatedAt DESC
  `

  const { results } = await this.database.prepare(sql).bind(...bindings).all()

  return (results ?? []).map((row: any): DraftSummary => ({
    id: String(row.id),
    seedSlug: String(row.seedSlug),
    seedLabel: String(row.seedLabel),
    title: row.title != null && String(row.title).trim() ? String(row.title) : String(row.id),
    updatedAt: Number(row.updatedAt),
    lastModifiedBy: {
      name: row.lastName ?? null,
      email: row.lastEmail ?? '',
    },
  }))
}
```

Notes for the implementer:
- `displayNameAlias` is guaranteed to be a column in both `content_{slug}` and
  `content_{slug}_drafts`, so `COALESCE(d.<alias>, l.<alias>)` is safe. Title columns are text;
  no `deserializeFromDb` needed for this overview.
- Wrap the body in the same `try/catch` + `this.mapError(...)` pattern used by the other methods in
  this file (e.g. `getDraft`), for consistent error mapping.
- Keep the method near the other draft methods.

#### A.3 — Thin handler (`apps/api/src/features/draft/draft.handler.ts`)

Add this route. It must be **static** and registered in `draftApp` (do NOT add `draftGuard` — that
guard reads `:slug` and is for per-entry routes). Place it before the `/:slug/:id/draft` routes for
clarity (Hono distinguishes by path anyway):

```typescript
// GET /drafts — Unified list of pending drafts across all draft-enabled seeds.
// Thin handler: delegates the single aggregated query to the repository.
draftApp.get('/drafts', async (context) => {
  const seeds = context.get('seedRegistry').draftEnabled()
  const repository = context.get('repository')
  const drafts = await repository.findPendingDrafts(seeds)
  return context.json(drafts)
})
```

No new mounting in `factory.ts` is needed — `draftApp` is already mounted at `/content` before
`contentFeature`, so the path is `GET /api/content/drafts`.

#### A.4 — Tests (co-located, per VSA)

Add cases to the existing D1 repository test
`apps/api/src/shared/content.repository.d1.test.ts` (it already exercises draft methods):
- Seeds drafts across ≥2 draft-enabled seeds; asserts `findPendingDrafts` returns them newest-first
  with correct `seedSlug`, `seedLabel`, `title`, and `updatedAt`.
- Asserts `lastModifiedBy` is populated from the latest `activity_logs` row for that entry with
  `action='update'` AND `details.note='draft saved'` (a generic live-edit `update` log on the same
  entry must be ignored — add such a row in the test and assert it is NOT picked). Falls back to
  `{ name: null, email: '' }` when no matching draft-save log exists.
- Asserts `[]` when no seed has `allowDrafts`.

If you prefer a handler-level integration test, co-locate it as
`apps/api/src/features/draft/draft.handler.test.ts` and assert `GET /content/drafts` returns the
aggregated JSON. Do **not** create an `apps/api/test/` directory — tests live next to their source.

---

### Phase B — Dashboard menu, route, i18n

#### B.1 — i18n keys (correct files & paths)

Edit `apps/dashboard/src/locales/en.json` and `it.json`. Add a new top-level `drafts` section
(used by both the page and its columns) and a `sidebar.drafts` label for the menu item.

`en.json`:
```json
"sidebar": {
  "navigation": "Navigation",
  "drafts": "Drafts"
},
"drafts": {
  "title": "Drafts",
  "subtitle": "All pending drafts across your content",
  "columns": {
    "seed": "Type",
    "name": "Name",
    "updatedAt": "Last modified",
    "user": "Modified by"
  },
  "actions": {
    "edit": "Edit",
    "publish": "Publish",
    "discard": "Discard"
  },
  "empty": "No pending drafts",
  "discardConfirm": "Discard this draft? This cannot be undone.",
  "published": "Draft published",
  "discarded": "Draft discarded",
  "error": "Action failed"
}
```

`it.json` (mirror, translated):
```json
"sidebar": {
  "navigation": "Navigazione",
  "drafts": "Bozze"
},
"drafts": {
  "title": "Bozze",
  "subtitle": "Tutte le bozze in sospeso tra i tuoi contenuti",
  "columns": {
    "seed": "Tipo",
    "name": "Nome",
    "updatedAt": "Ultima modifica",
    "user": "Modificato da"
  },
  "actions": {
    "edit": "Modifica",
    "publish": "Pubblica",
    "discard": "Scarta"
  },
  "empty": "Nessuna bozza in sospeso",
  "discardConfirm": "Scartare questa bozza? L'operazione è irreversibile.",
  "published": "Bozza pubblicata",
  "discarded": "Bozza scartata",
  "error": "Azione non riuscita"
}
```
(The existing `sidebar` object already has `navigation`; just add the `drafts` sibling key.)

#### B.2 — Sidebar menu (`apps/dashboard/src/config/dashboard-menu.ts`)

Import an editing icon directly (consistent with the other static items) and add the entry to the
array returned by `getStaticMenu(t)`:

```typescript
import { LayoutDashboard, Settings, PenLine } from "lucide-react"
// ...
{
  title: t("sidebar.drafts"),
  url: "/drafts",
  icon: PenLine,
},
```

#### B.3 — Route (`apps/dashboard/src/App.tsx`)

Import the page and add the protected route (anywhere among the protected children — `/drafts` has
its own prefix so order is irrelevant):

```typescript
import { DraftsListPage } from "@/pages/drafts-list"
// ...
{
  path: "/drafts",
  element: (
    <ProtectedRoute>
      <DraftsListPage />
    </ProtectedRoute>
  ),
},
```

---

### Phase C — Drafts slice + page

Follow the dashboard slice structure from `docs/vertical-slice.md` §10. Create the slice; the page
only orchestrates layout + slice.

#### C.1 — Slice scaffold

```
apps/dashboard/src/features/drafts/
├── index.ts                 # public barrel (hooks + types only)
├── types/draft-summary.ts   # DraftSummary type (mirror of API shape)
├── api/drafts.api.ts        # axios calls (own copy — slice isolation)
└── hooks/
    ├── use-global-drafts.ts
    ├── use-publish-draft.ts
    └── use-discard-draft.ts
```

`types/draft-summary.ts`:
```typescript
export interface DraftSummary {
  id: string
  seedSlug: string
  seedLabel: string
  title: string
  updatedAt: number          // unix seconds
  lastModifiedBy: { name: string | null; email: string }
}
```

`api/drafts.api.ts` (baseURL is `/api`, so paths are relative to it):
```typescript
import { api } from "@/lib/api"
import type { DraftSummary } from "../types/draft-summary"

export async function fetchGlobalDrafts(): Promise<DraftSummary[]> {
  const { data } = await api.get<DraftSummary[]>("/content/drafts")
  return data
}

export async function publishDraft(seedSlug: string, id: string): Promise<void> {
  await api.post(`/content/${seedSlug}/${id}/draft/publish`)
}

export async function discardDraft(seedSlug: string, id: string): Promise<void> {
  await api.delete(`/content/${seedSlug}/${id}/draft`)
}
```

`hooks/use-global-drafts.ts`:
```typescript
import { useQuery } from "@tanstack/react-query"
import { fetchGlobalDrafts } from "../api/drafts.api"

export const GLOBAL_DRAFTS_QUERY_KEY = ["global-drafts"] as const

export function useGlobalDrafts() {
  return useQuery({
    queryKey: GLOBAL_DRAFTS_QUERY_KEY,
    queryFn: fetchGlobalDrafts,
    staleTime: 60 * 1000,
  })
}
```

`hooks/use-publish-draft.ts` and `hooks/use-discard-draft.ts`: `useMutation` wrappers that call the
api functions and, on success, `queryClient.invalidateQueries({ queryKey: GLOBAL_DRAFTS_QUERY_KEY })`.
Take `{ seedSlug, id }` as the mutation variable. Surface a `sonner` `toast` for success/error in
the page (or inside the hook — keep it consistent with how `pending-drafts-widget.tsx` does it).

`index.ts` exports only the public API:
```typescript
export * from "./hooks/use-global-drafts"
export * from "./hooks/use-publish-draft"
export * from "./hooks/use-discard-draft"
export type { DraftSummary } from "./types/draft-summary"
```

#### C.2 — Page (`apps/dashboard/src/pages/drafts-list.tsx`)

A thin page that:
1. Renders the standard shell: `SidebarProvider > SiteHeader + (AppSidebar + SidebarInset)`
   (copy the wrapper from `content-list.tsx`; import `AppSidebar`, `SiteHeader` from
   `@/features/navigation`). Header shows `t("drafts.title")` / `t("drafts.subtitle")`.
2. Consumes `useGlobalDrafts()`, `usePublishDraft()`, `useDiscardDraft()` from `@/features/drafts`.
3. Renders `DataTable` (`@/components/ui/data-table`) with these columns (use TanStack
   `ColumnDef<DraftSummary>[]` defined with `useMemo`):
   - **Type** (`t("drafts.columns.seed")`): render `row.seedLabel` (a `Badge` is fine).
   - **Name** (`t("drafts.columns.name")`): `row.title` as a React Router `<Link to={`/content/${seedSlug}/${id}`}>`
     so it opens the editor.
   - **Last modified** (`t("drafts.columns.updatedAt")`):
     `formatDistanceToNow(new Date(row.updatedAt * 1000), { addSuffix: true, locale })`
     using the `{ it: itLocale, en: enUS }` map keyed on `i18n.language` (see widget for the exact
     import: `import { it as itLocale, enUS } from "date-fns/locale"`).
   - **Modified by** (`t("drafts.columns.user")`): `row.lastModifiedBy.name ?? row.lastModifiedBy.email`;
     show the email as a `title`/tooltip when a name is present.
4. Row actions via the DataTable's `renderRowContextMenuContent` (same prop `content-list.tsx` uses)
   and/or an actions column with a `DropdownMenu`:
   - **Edit** → `navigate(`/content/${seedSlug}/${id}`)`.
   - **Publish** → `publishDraft.mutate({ seedSlug, id })`; on success toast `t("drafts.published")`.
   - **Discard** → confirm with the shared `AlertDialog` (`@/components/ui/alert-dialog`) using
     `t("drafts.discardConfirm")`, then `discardDraft.mutate({ seedSlug, id })`; toast
     `t("drafts.discarded")`. On error toast `t("drafts.error")`.
5. Empty state (`t("drafts.empty")`), loading skeleton, and error state — mirror the patterns
   already used in `content-list.tsx` / the widgets.

All visible strings go through `t(...)`. Reuse existing `@/components/ui/*` only (Button, Badge,
DropdownMenu, AlertDialog, etc.) — do not introduce new primitives.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

1. **Typecheck**: `npx tsc --noEmit` in `packages/core`, `apps/api`, and `apps/dashboard`
   (build core first: `pnpm run build` in `packages/core`, since api/dashboard depend on its types).
2. **Tests**: `pnpm run test` in `apps/api` (repository/handler cases) and `apps/dashboard`.
3. **Manual** (`pnpm run dev` at root; dashboard on http://localhost:5173/admin):
   - Save a draft on a draft-enabled seed (e.g. an article).
   - Open "Drafts" / "Bozze" in the sidebar.
   - Verify the row shows: Type = seed label, Name = your title (links to the editor),
     Last modified ≈ "just now", Modified by = your name/email.
   - Click the Name → editor opens.
   - Publish from the row action → toast appears, row disappears from the list.
   - Save another draft, Discard it → confirm dialog → row disappears.
   - Switch language → all labels and the relative date localise.

==========================================================================
SECTION 6 — DEFINITION OF DONE (VSA checklist)
==========================================================================

- [ ] No inline SQL in any handler; the aggregated query lives in `content.repository.d1.ts`.
- [ ] `DraftSummary` + `findPendingDrafts` defined in `packages/core` and exported from its index.
- [ ] `GET /content/drafts` is a thin handler in `draftApp` (no `draftGuard`, no new factory mount).
- [ ] Dashboard Drafts UI is a self-contained slice under `features/drafts/`; the page imports it
      only via the slice barrel; no cross-feature imports.
- [ ] i18n keys added under `sidebar.drafts` and a new `drafts` section in **both** `en.json` and
      `it.json` (files in `apps/dashboard/src/locales/`).
- [ ] Tests co-located; typecheck + test suites green.
- [ ] No new migration (drafts tables are engine-generated; `activity_logs` already exists).
