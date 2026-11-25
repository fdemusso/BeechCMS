# UI Refactoring — Sprint 04a: Customizable Entry Editor — Backend Foundation

> **Audience:** an AI coding agent implementing this sprint end-to-end with no prior
> knowledge of the Beech CMS codebase. Everything needed to implement is inline.
> Do not grep beyond what is referenced here unless something disagrees with the live
> code — in that case, trust live code and note the drift.

This is the **first of three implementation sprints**. It depends on the
**prerequisite sprint** [`04-pre — Foundation Fixes`](./04-pre-foundation-fixes.md),
which **MUST be merged first**. That sprint introduces the missing
`Branch.id: 'br_XX'` field and unifies `JwtPayload`/`JwtClaims`. This sprint
assumes both are done — if `Branch.id` isn't on the type or the auth types
still diverge, STOP and run `04-pre` first.

After this sprint nothing visible changes for end users; we lay the data,
contract, and repository foundation.

- **04a (this sprint):** Data model + persistence layer + read/write API + types.
- **04b — Renderer & Dialog:** rewrite `entry-editor.tsx` to render from a `FormLayout`
  JSON; convert the editor surface from a full page into a Shadcn `<Dialog>` opened
  over the content list; URL-driven open state preserves deep-linking.
- **04c — Layout Builder UI:** the drag-and-drop layout editor (the mockup in
  `docs/public/images/editorPersonalizzazione.png`).

---

## 0. ROLE & GROUND RULES

You are a senior TypeScript engineer working on the **Beech CMS monorepo** (Turborepo).

Hard rules that override any default behavior:

1. **Cloudflare Workers runtime.** `apps/api` runs on the Workers runtime — no
   filesystem at request time. Any SQL must be a compiled-in TS string.
2. **Repository pattern is mandatory.** Handlers never touch `context.env.DB`
   directly. Every persistence call goes through a repository interface declared in
   `@beechcms/core`, implemented under `apps/api/src/shared/*.repository.d1.ts`,
   wired in `apps/api/src/middleware/repository.middleware.ts`, typed on
   `apps/api/src/types.ts`, and read with `context.get('<name>Repository')`.
3. **Botanical Engine invariant.** Branch IDs (`br_XX`) are the only stable DB keys.
   Aliases can be renamed; never use the alias as a stable reference. *This sprint
   anticipates that constraint*: the layout JSON references **branch IDs**, not
   aliases (see §4).
4. **Beta DB.** Local D1 is disposable. Add a new numbered migration —
   **do not** edit applied migrations.
5. **Docs are English.** This file stays in English.
6. **Forward-compatibility note.** Seeds will become DB-resident at runtime in a
   future sprint (no work here). The layout store you build now is keyed by Seed
   `slug` and is independent of where the Seed definition lives, so it will keep
   working unchanged.

---

## 1. WHAT THIS SPRINT BUILDS

A persistent layout store and the API surface to read/write it.

1. **New D1 table** `seed_layouts(slug PRIMARY KEY, layout TEXT NOT NULL, updated_at, updated_by)`.
2. **New core types** `FormLayout`, `LayoutTab`, `LayoutSection`, `LayoutColumn`,
   `LayoutField` exported from `@beechcms/core`.
3. **New repository** `ISeedLayoutRepository` (in core) + `D1SeedLayoutRepository`
   (in api) wired through the middleware.
4. **`GET /api/schema`** continues to return the seed list — extended so each Seed
   carries an optional `layout?: FormLayout` field merged from the store.
5. **New endpoint** `PUT /api/schema/:slug/layout` (admin-only) that **upserts** the
   layout JSON for a Seed. Validates against a Zod schema.
6. **New endpoint** `DELETE /api/schema/:slug/layout` (admin-only) that removes the
   stored layout — used by the "Reset" button in the future Builder UI.
7. **`role` propagated through JWT and AuthContext** so the frontend can gate the
   future "Edit Layout" button. Today the JWT carries `email`/`name`/`surname` but
   **not** `role` — fix it.
8. **Default layout generator** in core: pure function that, given a `Seed`,
   produces the fallback `FormLayout` (2 tabs `Data`/`SEO`, grouped sections by
   type + RichText/Gallery as full-width singletons, branches in seed order, hidden
   branches excluded, system IDs/timestamps excluded). Used as the "factory reset"
   target and as the initial layout shipped to the frontend when no override exists.

---

## 2. CONFIRMED DESIGN DECISIONS (do not re-litigate)

### D1 — Layout is global per Seed
One layout per Seed, shared by all users. No per-user personalization, no versioning,
no rollback beyond "Reset", which means "go back to the generated default" (see D5).

### D2 — Branch references = stable `branchId: 'br_XX'`
After Sprint `04-pre`, `Branch.id` (format `^br_[A-Za-z0-9]+$`) is required
on every branch and validated at boot. The layout JSON references branches
**by id, not by alias**:

- `LayoutField.branchId` holds e.g. `'br_03'`.
- Aliases can be renamed without breaking the layout.
- When a referenced `branchId` no longer exists on the Seed (branch
  removed), the renderer/loader silently strips it on read (auto-cleanup).
- Resolve references via `findBranchById(seed, field.branchId)` from
  `@beechcms/core` (exported by `04-pre`).

### D3 — Special field types are auto full-width
`richtext`, `file` (when `multiple: true` or `format: 'asset-list'` — i.e. gallery)
are forced into a dedicated single-column section by both the **default generator**
and the **layout validator**. `json` is **excluded** from the form for now (per the
PM: "JSON editor va completamente rivisto per ora abbandoniamolo"). Branches with
`type === 'json'` are dropped from the default layout and rejected by the validator
if a builder UI tries to add them.

### D4 — Hidden/system branches are excluded
A branch is excluded from default layouts and rejected by the validator if:
- `branch.policies.visibility === 'hidden'`, **or**
- its alias is one of the **system columns**: `id`, `slug`, `status`, `created_at`,
  `updated_at`. (`slug` and `status` are handled by the existing `StatusAndSlugFields`
  bar at the top of the editor — they are not configurable in the layout.)

### D5 — Reset = revert to generated default + clear DB row
`DELETE /api/schema/:slug/layout` removes the stored row. On next `GET /api/schema`
the Seed comes back without `layout`, the frontend regenerates the default at render
time. The Builder UI's "Reset" button calls this endpoint. **Confirm:** ok with this
or do you want Reset to write the default explicitly into the row?
> **Default if unanswered:** delete the row; frontend recomputes default. Simpler,
> no drift between server default and client default.

### D6 — RBAC: admin only, but extensible
Only `role === 'admin'` may write the layout. Encode this as a **single constant**
imported by both the route guard and the dashboard, so adding `editor` (or a new
`layout:edit` permission) later is a one-line change. **Mark the constant with a
prominent comment** so the next reviewer knows what to touch.

---

## 3. CURRENT STATE (verbatim reference)

### 3.1 SeedRegistry (`packages/core/src/seed-registry.ts`)
```ts
export interface ISeedRegistry {
  all(): Seed[]
  get(slug: string): Seed | null
  visibleInDashboard(): Seed[]
  publicReadable(): Seed[]
  draftEnabled(): Seed[]
}
export class SeedRegistry implements ISeedRegistry { /* in-memory map keyed by slug */ }
```

### 3.2 `Seed` and `Branch` (`packages/core/src/types.ts`, abridged)
```ts
export type BranchType = 'text'|'number'|'boolean'|'json'|'date'|'richtext'|'file'|'tags'|'relation'

export interface Branch {
  alias: string              // SQL column name AND today's stable key
  label: string
  type: BranchType
  format?: 'plain'|'markdown'|'html'|'date'|'datetime'|'asset-list'
  multiple?: boolean         // when true on type:'file' → gallery
  options?: string[]
  requiredOnCreate?: boolean
  requiredOnUpdate?: boolean
  policies?: {
    privacy?: 'plain'|'hash'|'encrypt'
    visibility?: 'full'|'masked'|'hidden'
    search?: boolean; filter?: boolean; sort?: boolean; public?: boolean
  }
  numberOptions?: NumberFieldOptions
  fileOptions?: FileFieldOptions
  targetSeed?: string        // when type === 'relation'
  onDelete?: 'CASCADE'|'SET NULL'|'RESTRICT'
}

export interface Seed {
  slug: string
  label: string
  labelPlural?: string
  allowPublicRead?: boolean; allowPublicPost?: boolean; allowPublicEdit?: boolean
  allowDrafts?: boolean
  displayNameAlias: string
  branches: Branch[]
  dashboard?: DashboardSeedConfig
}
```

### 3.3 `GET /api/schema` handler (`apps/api/src/features/schema/schema.handler.ts`)
```ts
schemaApp.get('/', async (context) => {
  const registry = context.get('seedRegistry')
  return context.json(registry.all())
})
```
The handler is mounted at `apiProtected.route('/schema', schemaApp)` (JWT-protected).

### 3.4 Repository middleware (`apps/api/src/middleware/repository.middleware.ts`)
Each repo is constructed with `const database = context.env.DB` and set on the
context. Add new wiring inline next to `siteSettingsRepository`:
```ts
context.set('seedLayoutRepository',
  overrides?.seedLayoutRepository ?? new D1SeedLayoutRepository(database))
```
Also add `seedLayoutRepository?: ISeedLayoutRepository` to the `RepositoryOverrides`
interface in the same file.

### 3.5 Context typing (`apps/api/src/types.ts`)
`Variables` lists every repository getter (e.g. `siteSettingsRepository: ISiteSettingsRepository`).
Add `seedLayoutRepository: ISeedLayoutRepository`.

### 3.6 JWT issuance (`apps/api/src/factory.ts`, two sites)
Today (lines ~224 and ~264):
```ts
const accessToken = await context.get('tokenService').issue({
  sub: user.id, email: user.email,
  name: user.name ?? undefined, surname: user.surname ?? undefined
})
```
**Add** `role: user.role` to both `issue(...)` payloads. `user.role` is already on
`UserRecord` (string, `'admin' | 'editor'`).

### 3.7 `JwtClaims` (after `04-pre`)
Sprint `04-pre` already:
- Added `role?: string` and `surname?: string` to `JwtClaims` in
  `packages/core/src/auth/token-service.ts`.
- Deleted the local `JwtPayload` in `apps/api/src/middleware.ts`.
- Re-typed `Variables.jwtPayload` to `JwtClaims` in `apps/api/src/types.ts`.

So **this sprint only needs to**:
- In `apps/api/src/factory.ts` (lines ~224 and ~264), add `role: user.role`
  to both `tokenService.issue(...)` payloads. The claim now flows
  type-safely through to handlers.

Context key remains **`'jwtPayload'`** — every protected handler reads
`context.get('jwtPayload')`.

### 3.8 Dashboard auth context (`apps/dashboard/src/lib/auth-context.tsx`)
Today:
```ts
interface AuthState {
  status: AuthStatus
  user: { email: string; name?: string; surname?: string } | null
  setToken: (token: string) => void
  clearToken: () => void
}
function decodeUser(token: string) {
  const payload = JSON.parse(atob(token.split('.')[1]))
  return { email: payload.email ?? '', name: payload.name ?? 'Admin', surname: payload.surname }
}
```
**Extend** `user` with `role?: 'admin'|'editor'` and `decodeUser` to read `payload.role`.

### 3.9 Existing site-settings migration / repo as a pattern
Sprint 03 introduced `site_settings(key, value)` and `D1SiteSettingsRepository`.
Copy that shape for `seed_layouts` — it is the closest precedent.

---

## 4. CORE TYPES — to add in `packages/core/src/seed-layout.ts` (new file)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed, Branch } from './types.js'

/** Reference to a Seed branch by its stable id (e.g. 'br_03').
 *  Aliases can be renamed — ids cannot. When the id does not match any
 *  branch on the Seed at read time, the field is silently stripped from
 *  the layout (auto-cleanup). */
export interface LayoutField {
  branchId: string
}

export interface LayoutColumn {
  id: string                 // stable client-generated id, e.g. crypto.randomUUID()
  field: LayoutField | null  // null = empty column ("+ Add Field" target)
}

export interface LayoutSection {
  id: string
  label?: string             // optional, hideLabel controls render
  hideLabel?: boolean
  hideBorder?: boolean
  collapsible?: boolean
  /** Max 4 columns. Enforced by validator. */
  columns: LayoutColumn[]
}

export interface LayoutTab {
  id: string
  label: string              // e.g. 'Data', 'SEO'
  sections: LayoutSection[]
}

export interface FormLayout {
  /** Format version — bump when introducing breaking changes. */
  version: 1
  tabs: LayoutTab[]
}

// ---------------------------------------------------------------------------
// Branch-type rules used by both the default generator and the validator.
// ---------------------------------------------------------------------------

/** Branch types that must occupy a section alone, full width. */
export const FULL_WIDTH_BRANCH_TYPES = new Set<Branch['type']>(['richtext'])

/** Returns true when a branch is a gallery (file + multiple/asset-list). */
export function isGalleryBranch(branch: Branch): boolean {
  return branch.type === 'file'
    && (branch.multiple === true || branch.format === 'asset-list')
}

/** Branch types currently unsupported in the Layout Builder (hidden from the field picker). */
export const UNSUPPORTED_BRANCH_TYPES = new Set<Branch['type']>(['json'])

/** Aliases that are NEVER included in the editor form (handled by other UI). */
export const SYSTEM_ALIASES = new Set<string>([
  'id', 'slug', 'status', 'created_at', 'updated_at',
])

/** True when the branch is eligible to appear in the layout at all. */
export function isLayoutableBranch(branch: Branch): boolean {
  if (SYSTEM_ALIASES.has(branch.alias)) return false
  if (branch.policies?.visibility === 'hidden') return false
  if (UNSUPPORTED_BRANCH_TYPES.has(branch.type)) return false
  return true
}

/** True when the branch must occupy a dedicated full-width section. */
export function isFullWidthBranch(branch: Branch): boolean {
  return FULL_WIDTH_BRANCH_TYPES.has(branch.type) || isGalleryBranch(branch)
}

/** Aliases considered SEO fields. Matches the existing rule in entry-editor.tsx. */
export function isSeoBranch(branch: Branch): boolean {
  return branch.alias.startsWith('meta')
}
```

Export everything from `packages/core/src/index.ts` (the barrel).

---

## 5. DEFAULT LAYOUT GENERATOR — `generateDefaultLayout(seed)`

Pure function in the same `seed-layout.ts` module. Algorithm:

```
function generateDefaultLayout(seed: Seed, opts?: { newId: () => string }): FormLayout {
  const newId = opts?.newId ?? defaultIdFactory   // see note below
  const layoutable = seed.branches.filter(isLayoutableBranch)

  const seo = layoutable.filter(isSeoBranch)
  const main = layoutable.filter(b => !isSeoBranch(b))

  const dataTab = {
    id: newId(),
    label: 'Data',
    sections: buildSectionsForBranches(main, newId),
  }
  const seoTab = {
    id: newId(),
    label: 'SEO',
    sections: buildSectionsForBranches(seo, newId),
  }

  return { version: 1, tabs: [dataTab, seoTab] }
}
```

`buildSectionsForBranches(branches, newId)`:

1. Iterate `branches` **in their declared seed order**.
2. Maintain a current "compact section" (3 columns) with running fills.
3. When encountering a **full-width branch** (`isFullWidthBranch`), close the current
   compact section (if any), then emit a **dedicated single-column section** for that
   branch. (label = branch label, hideLabel=true to mimic the mockup.)
4. Other branches accumulate into the compact section, one branch per column,
   max 3 columns/section (matching the screenshot). When the current section is
   full, close it and start a new one.
5. If a tab ends up with **zero sections** (e.g. no SEO branches), emit a single
   empty section with one empty column so the Builder UI has a "+ Add Field" target.

**Why 3 columns by default and not 4?** The mockup `EditorCustom.png` shows 3-column
groupings. Type cap is 4 (matches the `LayoutSection` doc), default uses 3.

**ID factory.** In Workers we have `crypto.randomUUID()` available globally and on
the frontend too. Use it directly: `const defaultIdFactory = () => crypto.randomUUID()`.
Accept an override (`opts.newId`) for deterministic tests.

---

## 6. VALIDATOR

Add a Zod schema in `seed-layout.ts`:

```ts
import { z } from 'zod'

export const layoutFieldSchema = z.object({ branchId: z.string().regex(/^br_[A-Za-z0-9]+$/) })
export const layoutColumnSchema = z.object({
  id: z.string().min(1),
  field: layoutFieldSchema.nullable(),
})
export const layoutSectionSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  hideLabel: z.boolean().optional(),
  hideBorder: z.boolean().optional(),
  collapsible: z.boolean().optional(),
  columns: z.array(layoutColumnSchema).min(1).max(4),
})
export const layoutTabSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(60),
  sections: z.array(layoutSectionSchema).min(1),
})
export const formLayoutSchema = z.object({
  version: z.literal(1),
  tabs: z.array(layoutTabSchema).min(1).max(8),
})
```

Additionally, a **semantic validator** `validateLayoutAgainstSeed(layout, seed)`
that returns `{ ok: true, cleaned: FormLayout } | { ok: false, errors: string[] }`:

1. Drop every `LayoutField` whose `branchAlias` does not exist in `seed.branches`
   → not an error, this is **auto-cleanup** (D2/PM rule).
2. Drop fields referencing **unsupported** types (`UNSUPPORTED_BRANCH_TYPES`) or
   system aliases — these never should have been here.
3. Detect duplicate `branchAlias` across all columns of the entire layout → error.
4. For every full-width branch placed in a section that also contains other fields,
   return an error: `"Branch '<alias>' (type=richtext/gallery) must occupy a dedicated
   section"`. The Builder UI will use the same predicate to show a warning before
   submit; here we hard-reject.

`PUT /api/schema/:slug/layout` calls Zod first (shape), then
`validateLayoutAgainstSeed` (semantic), then stores the **cleaned** layout.

`validateLayoutAgainstSeed` uses `findBranchById(seed, field.branchId)` to
resolve every reference. Auto-cleanup drops fields whose `branchId` is not
found on the Seed.

---

## 7. REPOSITORY — `ISeedLayoutRepository`

New file `packages/core/src/seed-layout.repository.ts`:

```ts
import type { FormLayout } from './seed-layout.js'

export interface SeedLayoutRecord {
  slug: string
  layout: FormLayout
  updatedAt: number    // unix seconds
  updatedBy: string    // user id
}

export interface ISeedLayoutRepository {
  /** Return the stored layout for a seed, or null if none was ever saved. */
  get(slug: string): Promise<SeedLayoutRecord | null>
  /** Return all stored layouts, keyed by slug — used by GET /api/schema to enrich. */
  getAllAsMap(): Promise<Map<string, FormLayout>>
  /** Upsert. `updatedBy` is the writer's user id. */
  upsert(slug: string, layout: FormLayout, updatedBy: string): Promise<void>
  /** Remove the stored row — used by the "Reset" action. */
  remove(slug: string): Promise<void>
}
```

Export from the core barrel.

### D1 implementation — `apps/api/src/shared/seed-layout.repository.d1.ts`

```ts
export class D1SeedLayoutRepository implements ISeedLayoutRepository {
  constructor(private readonly db: D1Database) {}

  async get(slug: string): Promise<SeedLayoutRecord | null> {
    const row = await this.db
      .prepare('SELECT slug, layout, updated_at, updated_by FROM seed_layouts WHERE slug = ? LIMIT 1')
      .bind(slug).first<{ slug: string; layout: string; updated_at: number; updated_by: string }>()
    if (!row) return null
    return {
      slug: row.slug,
      layout: JSON.parse(row.layout) as FormLayout,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    }
  }

  async getAllAsMap(): Promise<Map<string, FormLayout>> {
    const rs = await this.db
      .prepare('SELECT slug, layout FROM seed_layouts').all<{ slug: string; layout: string }>()
    const map = new Map<string, FormLayout>()
    for (const r of (rs.results ?? [])) {
      try { map.set(r.slug, JSON.parse(r.layout) as FormLayout) }
      catch { /* skip corrupt row */ }
    }
    return map
  }

  async upsert(slug: string, layout: FormLayout, updatedBy: string): Promise<void> {
    const json = JSON.stringify(layout)
    const now = Math.floor(Date.now() / 1000)
    await this.db.prepare(`
      INSERT INTO seed_layouts (slug, layout, updated_at, updated_by) VALUES (?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET layout=excluded.layout, updated_at=excluded.updated_at, updated_by=excluded.updated_by
    `).bind(slug, json, now, updatedBy).run()
  }

  async remove(slug: string): Promise<void> {
    await this.db.prepare('DELETE FROM seed_layouts WHERE slug = ?').bind(slug).run()
  }
}
```

---

## 8. MIGRATION

New file `apps/api/migrations/00XX_seed_layouts.sql` — pick the next sequential
number after the highest existing one in `apps/api/migrations/`. List the file in
`apps/api/wrangler.jsonc` if migrations are registered explicitly (Sprint 03 confirms
auto-discovery via `migrations_dir`, so just dropping the file is enough; double-check
by running `pnpm run db:reset:local` in `apps/api/`).

```sql
CREATE TABLE IF NOT EXISTS seed_layouts (
  slug         TEXT NOT NULL PRIMARY KEY,
  layout       TEXT NOT NULL,           -- JSON of FormLayout
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by   TEXT NOT NULL            -- users.id of the writer
);
```

---

## 9. API ENDPOINTS

### 9.1 Constant for who can edit the layout
New file `packages/core/src/layout-permissions.ts`:
```ts
// NOTE: change this list to extend write-access to other roles
// (e.g. add 'editor', or introduce a fine-grained 'layout:edit' permission).
// Single source of truth — used by both API guards and dashboard buttons.
export const ROLES_ALLOWED_TO_EDIT_LAYOUT: ReadonlyArray<string> = ['admin']
export function canEditLayout(role: string | undefined | null): boolean {
  if (!role) return false
  return ROLES_ALLOWED_TO_EDIT_LAYOUT.includes(role)
}
```
Export both from the core barrel.

### 9.2 Extend `GET /api/schema`
```ts
schemaApp.get('/', async (context) => {
  const registry = context.get('seedRegistry')
  const layouts = await context.get('seedLayoutRepository').getAllAsMap()
  const enriched = registry.all().map(seed => {
    const stored = layouts.get(seed.slug)
    if (!stored) return seed
    const { cleaned } = validateLayoutAgainstSeed(stored, seed) /* always returns cleaned even on errors */
    return { ...seed, layout: cleaned }
  })
  return context.json(enriched)
})
```
> `validateLayoutAgainstSeed` should return a `{ cleaned }` even when there are
> semantic errors (auto-cleanup is graceful by design). The `ok: false` branch
> only matters in the `PUT` handler.

Add `layout?: FormLayout` to the `Seed` type in `packages/core/src/types.ts`
(optional, ignored by the Botanical Engine).

### 9.3 `PUT /api/schema/:slug/layout`
```ts
schemaApp.put('/:slug/layout', async (context) => {
  const role = context.get('jwtPayload')?.role
  if (!canEditLayout(role)) {
    return publicProblem(context, { type: 'forbidden', title: 'Forbidden', status: 403, detail: 'Layout edit requires admin role.' })
  }
  const slug = context.req.param('slug')
  const seed = context.get('seedRegistry').get(slug)
  if (!seed) {
    return publicProblem(context, { type: 'seed-not-found', title: 'Seed not found', status: 404, detail: `No seed with slug '${slug}'` })
  }
  let body: unknown
  try { body = await context.req.json() } catch {
    return publicProblem(context, { type: 'invalid-json', title: 'Invalid JSON', status: 400, detail: 'Body must be valid JSON.' })
  }
  const parsed = formLayoutSchema.safeParse(body)
  if (!parsed.success) {
    return publicProblem(context, { type: 'invalid-layout', title: 'Invalid layout', status: 422, detail: parsed.error.message })
  }
  const semantic = validateLayoutAgainstSeed(parsed.data, seed)
  if (!semantic.ok) {
    return publicProblem(context, { type: 'invalid-layout', title: 'Invalid layout', status: 422, detail: semantic.errors.join('; ') })
  }
  const userId = context.get('jwtPayload')?.sub ?? 'unknown'
  await context.get('seedLayoutRepository').upsert(slug, semantic.cleaned, userId)
  return context.json({ ok: true, layout: semantic.cleaned })
})
```

> **Context key resolved:** the variable is **`jwtPayload`** (see §3.7 above).
> `authMiddleware` sets it via `c.set('jwtPayload', claims as JwtPayload)` in
> `apps/api/src/middleware.ts`.

### 9.4 `DELETE /api/schema/:slug/layout`
Same RBAC guard. Calls `seedLayoutRepository.remove(slug)`. Returns `{ ok: true }`.

### 9.5 Mount paths
Routes live in `apps/api/src/features/schema/schema.handler.ts`. The `schemaApp`
is mounted at `/schema` under the JWT-protected app, so the final paths are
`/api/schema`, `PUT /api/schema/:slug/layout`, `DELETE /api/schema/:slug/layout`.

---

## 10. JWT + DASHBOARD AUTH

1. In `apps/api/src/factory.ts` at **both** `tokenService.issue(...)` call sites,
   add `role: user.role` to the claim payload.
2. In `@beechcms/core`'s `JwtClaims` type, add `role?: string` (or whatever names
   already exist — match the convention).
3. In `apps/dashboard/src/lib/auth-context.tsx`:
   - Extend `user` to `{ email: string; name?: string; surname?: string; role?: 'admin'|'editor' }`.
   - In `decodeUser` add `role: payload.role`.

These changes alone do not surface UI — Sprint 04c will use `user.role` plus
`canEditLayout(user.role)` (re-exported via `@beechcms/core`) to toggle the
"Edit Layout" button.

---

## 11. FILES TO TOUCH (checklist)

Core:
- `packages/core/src/seed-layout.ts` (new) — types, predicates, default generator, Zod schema, semantic validator
- `packages/core/src/seed-layout.repository.ts` (new) — `ISeedLayoutRepository` + `SeedLayoutRecord`
- `packages/core/src/layout-permissions.ts` (new) — `ROLES_ALLOWED_TO_EDIT_LAYOUT`, `canEditLayout`
- `packages/core/src/types.ts` — add `layout?: FormLayout` to `Seed`
- `packages/core/src/index.ts` (barrel) — export everything above

API:
- `apps/api/migrations/00XX_seed_layouts.sql` (new)
- `apps/api/src/shared/seed-layout.repository.d1.ts` (new)
- `apps/api/src/middleware/repository.middleware.ts` — wire `seedLayoutRepository`, add to `RepositoryOverrides`
- `apps/api/src/types.ts` — add `seedLayoutRepository: ISeedLayoutRepository` to `Variables`
- `apps/api/src/features/schema/schema.handler.ts` — enrich `GET /`, add `PUT /:slug/layout`, `DELETE /:slug/layout`
- `apps/api/src/factory.ts` — include `role: user.role` in both `tokenService.issue(...)` calls (lines ~224 and ~264)

Dashboard:
- `apps/dashboard/src/lib/auth-context.tsx` — add `role` to `user` type + `decodeUser`

---

## 12. ACCEPTANCE

1. **Types:** `npx tsc --noEmit` passes in `packages/core`, `apps/api`,
   `apps/dashboard`. Core builds first.
2. **DB:** `pnpm run db:reset:local` in `apps/api/` succeeds with the new table.
3. **API smoke (manual, with the dashboard running and an admin logged in):**
   - `GET /api/schema` returns seeds; for seeds without stored layouts, no `layout`
     key is present.
   - `PUT /api/schema/articoli/layout` with a valid `FormLayout` body returns
     `200 { ok: true, layout }`. The next `GET /api/schema` includes that
     `layout` on the `articoli` seed.
   - `PUT` with an invalid body returns `422` and a problem+json.
   - `PUT` with a non-admin JWT returns `403`.
   - `DELETE /api/schema/articoli/layout` returns `200 { ok: true }`, the next
     `GET /api/schema` omits `layout` again.
4. **Default generator unit tests** in `packages/core` (vitest):
   - Seed with one `richtext` branch + 5 normal branches → 2 tabs, RichText in its
     own full-width section, normals in compact 3-col sections, no SEO branches
     means SEO tab has an empty section with one empty column.
   - Seed with `id`/`slug`/`status`/`created_at`/`updated_at` aliases → those are
     excluded.
   - Seed with a `json` branch → that branch is excluded.
   - Seed with a `file` branch `multiple:true` → forced into its own full-width
     section, like richtext.
   - Hidden branch (`policies.visibility:'hidden'`) → excluded.
   - SEO branches (`alias.startsWith('meta')`) land on the SEO tab.
5. **Auto-cleanup test:** save a layout that references a `branchAlias` not in the
   seed → `GET /api/schema` returns the same layout with that field stripped.
6. **No visible UI change** — `entry-editor.tsx` still works exactly as before
   (Sprint 04b is where it starts consuming `seed.layout`).
7. **JWT carries `role`:** decode the access token returned by `/auth/login` (jwt.io
   or local), confirm `role` is present. Frontend `useAuth().user?.role` is
   defined.

---

## 13. OPEN QUESTIONS (defaults inline)

- **(D5)** Reset = DELETE row vs UPSERT with regenerated default? *Default: DELETE.*
- **Default section column count:** 3 (per `EditorCustom.png` screenshot). Type
  caps at 4 for the builder. Confirm.

### Resolved (do not re-ask)
- **Branch references:** use `branchId` (e.g. `'br_03'`). Introduced by
  `04-pre`. Resolve via `findBranchById(seed, id)` from `@beechcms/core`.
- **JWT type unification:** done in `04-pre`. `JwtClaims` from core is the
  single source of truth; `Variables.jwtPayload: JwtClaims`. Context key
  remains `'jwtPayload'`.
