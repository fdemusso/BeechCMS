# Runtime Seeds — Sprint 05: Dashboard Seed Builder UI

> **Audience:** an AI coding agent with no prior knowledge of Beech CMS. Everything is
> inline. Trust live code over snippets if they drift.
>
> **Depends on Sprint 03** (the `/api/seeds` CRUD API). Read [`00-overview.md`](./00-overview.md).

## 0. Role & ground rules

Senior front-end engineer, Beech CMS dashboard (`apps/dashboard`): React 19 + Vite +
Tailwind 4 + shadcn/radix + TanStack Query + axios + React Router + react-hook-form + zod
+ i18next. **Vertical Slice Architecture**: new feature lives in
`apps/dashboard/src/features/<name>/` with an `index.ts` public barrel; never import
another slice's internals. All visible text goes through `t()` (i18n) with keys in both
`apps/dashboard/src/locales/it.json` and `en.json`. Docs English.

## 1. What this sprint builds

A **Seed Builder**: the admin UI to create, edit, and soft-delete content types at
runtime, driving the sprint-03 `/api/seeds` API. After this sprint a user with the admin
role can add a content type, give it fields (branches) with types/policies, set its
sidebar config and capability flags, and see it appear live in the sidebar and content
views — no code, no redeploy.

New slice: `apps/dashboard/src/features/seed-builder/` with:
- `index.ts` — barrel.
- `api/seeds.api.ts` — typed axios wrappers for `/api/seeds`.
- `hooks/use-seeds.ts` — TanStack Query hooks (list + mutations) with cache invalidation.
- `components/SeedBuilderPage.tsx` — list of content types + create button.
- `components/SeedEditorDialog.tsx` — create/edit a seed (metadata + flags + dashboard config).
- `components/BranchEditor.tsx` — add/edit branches (the field list inside a seed).
- `components/DeleteSeedDialog.tsx` — soft-delete confirmation.

New page route (e.g. `/settings/content-types` or `/content-types`) registered in
`apps/dashboard/src/App.tsx`, guarded by the existing `ProtectedRoute`, and admin-gated in
the UI (hide/disable for non-admins — the API enforces it regardless).

## 2. How schema flows today (must integrate, not duplicate)

`apps/dashboard/src/features/schema/hooks/use-schema.ts`:

```ts
export function useSchema() {
  const query = useQuery<Seed[]>({
    queryKey: ["schema"],
    queryFn: async () => (await api.get<Seed[]>("/schema")).data,
    staleTime: 1000 * 60 * 5,
  })
  useEffect(() => { if (query.data) registerSeeds(query.data) }, [query.data])
  return query
}
```

`["schema"]` is the cache key the **entire dashboard** reads for content types (sidebar
via `buildContentMenu`, content list, entry editor, etc.). It also calls
`registerSeeds(query.data)` to populate the global `@beechcms/core` registry used by
field renderers.

> **The integration rule:** every Seed Builder mutation must, on success,
> `queryClient.invalidateQueries({ queryKey: ["schema"] })`. That single invalidation
> refreshes the sidebar, content views, and the builder's own list — the UI updates live
> without a reload. Do not build a parallel schema cache.

`api` is the shared axios client (`apps/dashboard/src/lib/api.ts`) with the JWT bearer +
refresh interceptor. Use it for all calls. The Seed type and field metadata come from
`@beechcms/core`.

## 3. API wrappers — `api/seeds.api.ts`

Wrap the sprint-03 endpoints. Note `/api/seeds` returns **raw** `SeedRecord`s (incl.
`status`, `source`, soft-deleted) — distinct from `/schema` (active + enriched layouts).

```ts
import { api } from "../../../lib/api"
import type { Seed } from "@beechcms/core"

export interface SeedRecordDTO {
  slug: string
  definition: Seed
  status: "active" | "deleted"
  source: "code" | "runtime"
  createdAt: number
  updatedAt: number
}

export const seedsApi = {
  list:   async () => (await api.get<SeedRecordDTO[]>("/seeds")).data,
  get:    async (slug: string) => (await api.get<SeedRecordDTO>(`/seeds/${slug}`)).data,
  create: async (seed: Seed) => (await api.post<{ slug: string }>("/seeds", seed)).data,
  update: async (slug: string, seed: Seed) => (await api.put(`/seeds/${slug}`, seed)).data,
  addBranch: async (slug: string, branch: Omit<Branch, "id">) =>
    (await api.post<{ id: string }>(`/seeds/${slug}/branches`, branch)).data,
  remove: async (slug: string) => (await api.delete(`/seeds/${slug}`)).data,
}
```

(Send branches **without** `id`; the server assigns `br_NN` — sprint 03 contract.)

## 4. Hooks — `hooks/use-seeds.ts`

```ts
export function useSeeds() {
  return useQuery({ queryKey: ["seeds"], queryFn: seedsApi.list, staleTime: 1000 * 30 })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ["seeds"] })
    qc.invalidateQueries({ queryKey: ["schema"] }) // refresh sidebar + content views live
  }
}

export function useCreateSeed()  { const inv = useInvalidate(); return useMutation({ mutationFn: seedsApi.create,  onSuccess: inv }) }
export function useUpdateSeed()  { const inv = useInvalidate(); return useMutation({ mutationFn: ({slug, seed}) => seedsApi.update(slug, seed), onSuccess: inv }) }
export function useDeleteSeed()  { const inv = useInvalidate(); return useMutation({ mutationFn: seedsApi.remove,  onSuccess: inv }) }
```

Show errors via `sonner` toasts. Map RFC 7807 `detail` / validation messages from the API
into readable toast text (the API returns `application/problem+json`; surface `detail`).

## 5. The UI

### SeedBuilderPage
- Table/list of content types from `useSeeds()`. Columns: label, slug, #branches,
  `source` badge (`code` = "Defined in code", `runtime` = "Created here"), status.
- Soft-deleted seeds shown dimmed with a "Deleted" badge (or filtered behind a toggle).
- "New content type" button → opens `SeedEditorDialog` in create mode (admin only).
- Row actions: Edit, Delete (admin only).

### SeedEditorDialog (create + edit)
react-hook-form + zod. Fields:
- `slug` (create only; immutable on edit — slug is the table name). Validate `^[a-z0-9_]+$`,
  show inline error.
- `label`, `labelPlural`, `displayNameAlias` (a select over the seed's branch aliases).
- Capability flags (checkboxes): `allowPublicRead`, `allowPublicPost`, `allowPublicEdit`,
  `allowDrafts`.
- Dashboard config: `icon` (text or a picker over the names in
  `apps/dashboard/src/lib/icon-registry.ts`), `group`, `order`, `hidden`, `description`,
  and the `features` toggles (`search`, `filter`, `export`, `bulkDelete`).
- Branches managed by the embedded `BranchEditor`.
- Submit: create → `useCreateSeed`; edit → `useUpdateSeed`. On success, close + toast.

> **Edit constraints from sprint 03 — enforce in the UI to avoid round-trip 422s:**
> - Editing an **existing** branch: allow label, policies, options, number/file options.
> - **Do not** allow changing an existing branch's `alias` or `type` (the API rejects
>   alias rename / type change in this phase — sprint 06). Render those inputs read-only
>   with a tooltip ("Renaming/retyping a field requires the Danger Zone — coming soon").
> - Allow **adding** new branches freely.
> - Allow **removing** a branch, but warn: "The field stops being used; existing data is
>   retained in the database and not deleted." (Additive-only orphaning.)

### BranchEditor
A list of branch rows + "Add field". Each row edits: `alias` (new only; `^[a-z0-9_]+$`,
not in the automation reserved words — mirror the server check for instant feedback),
`label`, `type` (select over `BranchType`), and type-conditional sub-forms:
- `relation` → `targetSeed` (select over existing active seeds) + `multiple` + `onDelete`
  (`CASCADE`/`RESTRICT`/`SET NULL`; disable `SET NULL` when `multiple`).
- `number` → `numberOptions` (format/currency/min/max/step/control…).
- `file` → `multiple` / `format: 'asset-list'`, `fileOptions.accept`.
- `text`/`richtext` → nothing extra; `tags`/`json` → `options[]`.
- `policies` (all types): privacy, visibility, search, filter, sort, public.

Reuse the field-type knowledge that already exists in the field registry slice
(`apps/dashboard/src/features/fields/`) for labels/icons per type — but **do not import
its internals**; if a shared list of `BranchType` metadata is needed, read it from
`@beechcms/core` or add a tiny local constant. Adding a brand-new branch calls
`seedsApi.addBranch` (server allocates the id) or is sent as part of the full `update`
payload — pick one path and be consistent (the full-`update` path is simpler: build the
whole `Seed` and `PUT`).

### DeleteSeedDialog
Confirmation for soft-delete. Explain clearly: "This hides the content type. Its data is
**not** deleted — the table is kept and can be restored by re-creating the type with the
same slug. Permanent deletion will be available in the Danger Zone." If the API returns
`409 seed-referenced`, show which seeds reference it and block (sprint 03 guard).

## 6. Sidebar / navigation

The sidebar (`AppSidebar` → `buildContentMenu`) is driven by `/schema` data. Because Seed
Builder invalidates `["schema"]`, new/edited/removed content types appear in the sidebar
automatically. **Do not** hardcode the new content types anywhere. Add the Seed Builder
page's own nav entry (e.g. under a "Settings" or "Configuration" group), admin-only.

## 7. i18n

Add a `seedBuilder.*` (or `settings.contentTypes.*`) key group to **both** `it.json` and
`en.json`: page title, column headers, field labels, type names, policy labels, the
additive-only warnings, delete confirmation copy, toasts. No hardcoded strings in
components.

## 8. Tests

Testing Library + vitest (match existing dashboard tests, e.g. those under
`apps/dashboard/src/test/`):
- SeedBuilderPage renders content types from a mocked `useSeeds`.
- Create flow: filling the form + submit calls `seedsApi.create` with the assembled
  `Seed`; on success invalidates `["schema"]` and `["seeds"]` (assert via a spy/queryClient).
- Edit: existing branch's `alias`/`type` inputs are disabled; new branch can be added.
- Delete: confirmation calls `seedsApi.remove`; `409 seed-referenced` shows the blocking
  message.
- Non-admin: create/edit/delete controls hidden or disabled.

## 9. Acceptance criteria

- [ ] New `seed-builder` slice with `index.ts` barrel; no cross-slice internal imports.
- [ ] Admin can create a content type, add fields, set flags + dashboard config, and it
      appears in the sidebar + content views **live** (via `["schema"]` invalidation).
- [ ] Edit allows label/policies/options + adding fields; blocks alias rename, type
      change (UI), warns on field removal.
- [ ] Soft-delete works with confirmation + reference guard.
- [ ] All text via `t()`; keys in both locales.
- [ ] `npm run lint`, `npm run build`, `npm run test` pass in `apps/dashboard`.

## 10. Do NOT

- Do not build a second schema cache — reuse `["schema"]` + invalidate it.
- Do not import internals of other feature slices.
- Do not expose destructive operations (real delete / rename / retype) — sprint 06.
- Do not hardcode content-type names, icons, or groups anywhere (Seed config is the only
  source — see SYSTEM_MAP "Dashboard sidebar & Seed UI config").
