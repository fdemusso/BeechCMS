# Sprint Plan — Dynamic View Configuration

> Feature source: `stages/00_ideation/output/feature_brief.md`
> Planner: Senior Systems Architect (graphify-verified)

---

### Pre-Computation Analysis

**a) God Nodes identified via CLI**

| Node | Source | Degree | Role |
|------|--------|--------|------|
| `FieldRegistryImpl` | `apps/dashboard/src/features/fields/field-registry.ts:38` | 11 | Canonical registry pattern to mirror for `ViewRegistry` |
| `IFieldRegistry` | `apps/dashboard/src/features/fields/field-registry.ts:9` | 5 | Interface contract to mirror |
| `isGalleryBranch()` | `packages/core/src/seed-layout.ts:94` | 3 | Layout full-width heuristic. **NOT** a view-availability consumer (verified: no active `.ts/.tsx` caller outside `dist/`). Untouched by this sprint. |
| `DashboardSeedConfig` | `packages/core/src/types.ts:169` | 2 | Target for the new `views` authorization field |
| `resolveKanbanConfig()` | `packages/core/src/kanban.ts:64` | high | Current implicit availability driver (KB-S26 auto-add/remove effect) |

**b) Architectural boundaries affected**

- `@beechcms/core`
  - `packages/core/src/types.ts` — extend `DashboardSeedConfig` (interface only, no runtime).
  - `packages/core/src/view-authorization.ts` — **NEW** pure resolver (`resolveAuthorizedViews`), mirrors the shape of `kanban.ts` / `seed-layout.ts` pure helpers. Zero DB, zero I/O.
  - `packages/core/src/index.ts` — re-export.
- `apps/api`
  - **ZERO code changes.** Verified: `validateSeedDefinitions` (`packages/core/src/seed-validation.ts:30`) does not inspect `dashboard`; the seed definition is persisted as an opaque JSON blob by the seeds handler (`apps/api/src/features/seeds/seeds.handler.ts`). `dashboard.views` rides through create/update unmodified. **No D1 migration.**
- `apps/dashboard`
  - `features/content-toolbar` — **NEW** `view-registry.ts` (registry) + `view-registry.bootstrap.ts` (composition root). `ViewType` already lives in `shared.ts:14`.
  - `features/content-gallery/index.ts`, `features/content-kanban/index.ts` — expose a per-slice `registerXView(registry)` (self-registration; no cross-slice imports).
  - `pages/content-list.tsx` — replace hardcoded `views` state (`:239`) + the KB-S26 `useEffect` (`:264`) with `resolveAuthorizedViews(seed)`; add `?view=` URL guard around `activeViewId` (`:170`).
  - `features/seed-builder/lib/meta-seed-layout.ts` + `lib/seed-form-mapping.ts` — new `dash_views` meta-branch + mapping.

**c) Impact analysis (`graphify affected` substitute)**

> NOTE: `graphify affected` is documented in `tooling_graphify.md` but is **not implemented** in the installed CLI (`error: unknown command 'affected'`). Impact was reconstructed via `graphify explain` + reverse `grep` on exact symbol names, per the Decision Heuristic ("if you already know the exact symbol name → use grep/Read directly").

- `isGalleryBranch` → consumers: only `isFullWidthBranch()` (same file) + `dist/`. **No view-availability blast radius.** Removing the *view* heuristic does not touch layout generation.
- `resolveKanbanConfig` → consumers: `content-list.tsx:228`, `content-kanban.tsx:149`. The `content-kanban.tsx` internal use (axis capability) stays; only the `content-list.tsx` availability coupling is severed.
- `DashboardSeedConfig` → degree 2, both intra-`types.ts`. Additive optional field = zero breaking change downstream.

---

### VETO Audit

Evaluated against `ponytail_arch.md`.

1. **Botanical Invariant (no `@beech/core` bypass).** ✅ View authorization is resolved by a pure `@beechcms/core` function (`resolveAuthorizedViews`). No dashboard code reads/writes D1 for views; it reads the already-hydrated `Seed.dashboard.views`. No hardcoded field names — the resolver operates on the typed `DashboardView` union, and kanban capability continues to reference branches by `br_XX` id via `resolveKanbanConfig`. **No D1 query added anywhere.**

2. **VSA Enforcement (zero cross-feature imports).** ⚠️→✅ *Initial risk:* a `ViewRegistry` that imports `content-gallery` and `content-kanban` from `content-toolbar` would be a cross-slice import. *Adjustment:* the registry object is a passive `Map` (in `content-toolbar`, the neutral toolbar-owner slice); each feature slice self-registers via an exported `registerContentKanbanView(registry)` / `registerContentGalleryView(registry)`. A single composition root (`view-registry.bootstrap.ts`, imported once by the app shell before routes mount) wires them — mirroring the accepted central-bootstrap pattern of `fields/registry.ts`. Slices never import each other. **Compliant.**

3. **Cloudflare Purity.** ✅ No ORM, no background job, no runtime schema mutation. Additive TS + a client-side registry.

4. **YAGNI / Minimalist Blueprint.** ✅ Authorizable set constrained to the three *rendered* views (`table | gallery | kanban`). `grid` / `chart` exist in `ViewType` but are unrendered — **excluded** from authorization to avoid dead config. No new table (`SeedViewConfig` card layout stays where it is — explicitly out of scope per brief §5).

**Verdict: no invariant violation after the VSA self-registration adjustment. Plan proceeds.**

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

The current dashboard derives view availability from **implicit heuristics**: `table` + `gallery` are hardcoded into `content-list.tsx` state (`:239`), and `kanban` is auto-injected/removed by a `useEffect` (`:264`) keyed on `resolveKanbanConfig`. This produces the exact UX defect in the brief — empty galleries forced on every seed — and gives admins zero control.

This sprint establishes the **contract layer** that every downstream view behaviour depends on, and it must land before any UI polish because:

- **Botanical Engine invariant:** view authorization is a property of the `Seed` definition and therefore must be resolved in `@beechcms/core` (single source of truth), not re-derived per-component. Until `resolveAuthorizedViews` exists in core, the dashboard has nowhere authoritative to read from.
- **VSA invariant:** the `ViewRegistry` is the seam that lets `content-gallery` / `content-kanban` self-register without `content-list.tsx` importing them by hardcoded conditionals. Building the registry contract first prevents the slices from growing new cross-imports.
- **Fallback safety:** the "table is universal fallback" rule (brief §2, §4) is a security/robustness guarantee (`?view=kanban` on an unauthorized seed must not break). It belongs in the core resolver so both the URL guard and the switcher share one enforcement point.

Contracts + wiring first; then heuristic removal is a safe deletion rather than a risky refactor.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**View type (dashboard):** `apps/dashboard/src/features/content-toolbar/shared.ts:14`
```ts
export type ViewType = "table" | "gallery" | "grid" | "kanban" | "chart"
export interface UserViewInstance { id: string; label: string; type: ViewType; enabledTools: ToolbarTool[]; conditionalFormats?: ConditionalFormatRule[] }
```

**Dashboard config (core):** `packages/core/src/types.ts:169`
```ts
export interface DashboardSeedConfig {
  icon?: string; group?: string; order?: number; hidden?: boolean; description?: string
  features?: { search?: boolean; filter?: boolean; export?: boolean; bulkDelete?: boolean }
}
```

**Current availability logic:** `apps/dashboard/src/pages/content-list.tsx`
- `:170` `const [activeViewId, setActiveViewId] = React.useState("table")` — **not URL-synced** (`useSearchParams` imported but only used for `status` prefilter at `:146`).
- `:239` hardcoded `views` state = `table` + `gallery` (gallery always present).
- `:264` `useEffect` mutates `views` from `resolveKanbanConfig(seed).compatible` (KB-S26). ← implicit heuristic to remove.
- `:980 / :988 / :1010` render branches gated on `activeViewId === "gallery" | "kanban"`.

**Registry pattern to mirror:** `apps/dashboard/src/features/fields/field-registry.ts` (`IFieldRegistry` + `FieldRegistryImpl`, `Map`-backed) and its composition root `fields/registry.ts` (single module that instantiates the singleton and performs all `register*` calls at import time, then exports accessor fns + the singleton).

**Meta-seed edit surface:** `features/seed-builder/lib/meta-seed-layout.ts` (`META` id map + `buildMetaBranches` + `buildMetaLayout` → the `dashboard` tab) and `lib/seed-form-mapping.ts` (`seedToFormData` / `formDataToSeed`, the `dash_*` ↔ `dashboard.*` bridge). No multi-select field type exists yet; `select` (single) is registered in `fields/registry.ts:56`.

**Server:** `validateSeedDefinitions` (`seed-validation.ts:30`) ignores `dashboard`; seed definition persisted as JSON blob → **no API/D1 work**.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**Contracts + wiring + heuristic removal. No new view UI components** (table/gallery/kanban renderers already exist).

*Created:*
1. `packages/core/src/view-authorization.ts` — `DashboardView`, `AUTHORIZABLE_VIEWS`, `DEFAULT_AUTHORIZED_VIEWS`, `resolveAuthorizedViews`, `isViewAuthorized`.
2. `apps/dashboard/src/features/content-toolbar/view-registry.ts` — `IViewRegistry`, `ViewRegistryImpl`, `ViewDefinition`, singleton `viewRegistry`.
3. `apps/dashboard/src/features/content-toolbar/view-registry.bootstrap.ts` — composition root calling each slice's `registerXView`.

*Modified:*
4. `packages/core/src/types.ts` — add `views?` to `DashboardSeedConfig`.
5. `packages/core/src/index.ts` — `export * from './view-authorization.js'`.
6. `apps/dashboard/src/features/content-gallery/index.ts` — export `registerContentGalleryView`.
7. `apps/dashboard/src/features/content-kanban/index.ts` — export `registerContentKanbanView`.
8. `apps/dashboard/src/pages/content-list.tsx` — consume `resolveAuthorizedViews`; delete hardcoded state + KB-S26 effect; add `?view=` URL guard.
9. `apps/dashboard/src/features/seed-builder/lib/meta-seed-layout.ts` — `META.dashViews` branch + dashboard-tab placement.
10. `apps/dashboard/src/features/seed-builder/lib/seed-form-mapping.ts` — `dash_views` ↔ `dashboard.views`.
11. `apps/dashboard/src/main.tsx` — import `view-registry.bootstrap` once (before route mount).

*Tests:*
12. `packages/core/src/view-authorization.test.ts` (fallback, dedupe, table-guarantee, unknown-view stripping).

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

**D1 Migrations:** **NONE.** View authorization is stored inside the existing `Seed.dashboard` JSON. No `CREATE TABLE` / `CREATE INDEX`. (The `SeedViewConfig` card-layout table is untouched — out of scope.)

**4.1 — `packages/core/src/types.ts` (extend interface)**
```ts
// inside DashboardSeedConfig, after `features?: {...}`
  /**
   * Views authorized for this seed in the content manager. When omitted,
   * the dashboard falls back to DEFAULT_AUTHORIZED_VIEWS. 'table' is always
   * guaranteed at read time by resolveAuthorizedViews (universal fallback).
   */
  views?: DashboardView[]
```
Add the import-free type reference — `DashboardView` is declared in `view-authorization.ts`; import it at the top of `types.ts`:
```ts
import type { DashboardView } from './view-authorization.js'
```

**4.2 — `packages/core/src/view-authorization.ts` (NEW — pure, zero-dependency except sibling types)**
```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso
import type { Seed } from './types.js'

/** The views that can be authorized on a seed. Only rendered views are listed
 *  (grid/chart in the dashboard ViewType union are unrendered and excluded). */
export type DashboardView = 'table' | 'gallery' | 'kanban'

/** Order is significant: it drives the ViewSwitcher tab order. */
export const AUTHORIZABLE_VIEWS: readonly DashboardView[] = ['table', 'gallery', 'kanban'] as const

/** Applied to seeds with no explicit `dashboard.views` (backward compatibility). */
export const DEFAULT_AUTHORIZED_VIEWS: readonly DashboardView[] = ['table'] as const

const VALID = new Set<DashboardView>(AUTHORIZABLE_VIEWS)

/**
 * Resolves the effective, deduplicated, canonically-ordered set of authorized
 * views for a seed. Invariants:
 *  - 'table' is ALWAYS present (universal fallback — relational backing).
 *  - Unknown/legacy values are stripped.
 *  - Empty/undefined config → DEFAULT_AUTHORIZED_VIEWS (then table-guaranteed).
 */
export function resolveAuthorizedViews(seed: Pick<Seed, 'dashboard'>): DashboardView[] {
  const raw = seed.dashboard?.views
  const source = Array.isArray(raw) && raw.length > 0 ? raw : DEFAULT_AUTHORIZED_VIEWS
  const allowed = new Set<DashboardView>()
  for (const v of source) if (VALID.has(v as DashboardView)) allowed.add(v as DashboardView)
  allowed.add('table') // universal fallback, never removable
  return AUTHORIZABLE_VIEWS.filter((v) => allowed.has(v))
}

/** URL-guard helper: is `view` authorized for this seed? */
export function isViewAuthorized(seed: Pick<Seed, 'dashboard'>, view: string): view is DashboardView {
  return VALID.has(view as DashboardView) && resolveAuthorizedViews(seed).includes(view as DashboardView)
}
```
> Circular-type note: `types.ts` imports `DashboardView` (type-only) and `view-authorization.ts` imports `Seed` (type-only). Type-only imports do not create a runtime cycle; keep both as `import type`.

**4.3 — `apps/dashboard/src/features/content-toolbar/view-registry.ts` (NEW — mirrors `IFieldRegistry`)**
```ts
import type { ComponentType } from 'react'
import type { DashboardView } from '@beechcms/core'
import type { ToolbarTool } from './shared'

export interface ViewDefinition {
  type: DashboardView
  labelKey: string                     // i18n key, e.g. 'content.list.kanban'
  enabledTools: ToolbarTool[]
}

export interface IViewRegistry {
  register(def: ViewDefinition): void   // later wins, mirrors FieldRegistry
  get(type: DashboardView): ViewDefinition | undefined
  list(): ViewDefinition[]
}

export class ViewRegistryImpl implements IViewRegistry {
  private readonly map = new Map<DashboardView, ViewDefinition>()
  register(def: ViewDefinition): void { this.map.set(def.type, def) }
  get(type: DashboardView): ViewDefinition | undefined { return this.map.get(type) }
  list(): ViewDefinition[] { return [...this.map.values()] }
}

export const viewRegistry: IViewRegistry = new ViewRegistryImpl()
```

**4.4 — Per-slice self-registration (VSA-safe)**

`content-gallery/index.ts` (append):
```ts
import type { IViewRegistry } from '@/features/content-toolbar/view-registry'
export function registerContentGalleryView(registry: IViewRegistry): void {
  registry.register({ type: 'gallery', labelKey: 'content.list.gallery',
    enabledTools: ['filter', 'sort', 'automation', 'search', 'create'] })
}
```
`content-kanban/index.ts` (append):
```ts
import type { IViewRegistry } from '@/features/content-toolbar/view-registry'
export function registerContentKanbanView(registry: IViewRegistry): void {
  registry.register({ type: 'kanban', labelKey: 'content.list.kanban',
    enabledTools: ['filter', 'search', 'settings', 'create'] })
}
```

**4.5 — `view-registry.bootstrap.ts` (NEW — composition root; the ONLY module allowed to import slices)**
```ts
import { viewRegistry } from './view-registry'
import { registerContentGalleryView } from '@/features/content-gallery'
import { registerContentKanbanView } from '@/features/content-kanban'

// 'table' is the built-in universal fallback — registered here, not owned by a slice.
viewRegistry.register({ type: 'table', labelKey: 'content.list.table',
  enabledTools: ['filter', 'sort', 'automation', 'search', 'settings', 'create'] })
registerContentGalleryView(viewRegistry)
registerContentKanbanView(viewRegistry)
```
`main.tsx`: add side-effect import `import '@/features/content-toolbar/view-registry.bootstrap'` **before** the router renders.

**4.6 — `content-list.tsx` (heuristic removal + URL guard)**

Delete `:239–261` hardcoded `views` state and `:264–282` KB-S26 `useEffect`. Replace with:
```ts
const authorizedViews = React.useMemo<DashboardView[]>(
  () => (seed ? resolveAuthorizedViews(seed) : ['table']), [seed])

const views = React.useMemo<UserViewInstance[]>(
  () => authorizedViews.map((type) => {
    const def = viewRegistry.get(type)!
    return { id: type, label: type, type, enabledTools: def.enabledTools, conditionalFormats: [] }
  }), [authorizedViews])
```
`VIEW_LABELS` stays (uses `viewRegistry.get(type).labelKey` if preferred). URL guard around `activeViewId` (`:170`):
```ts
const requestedView = searchParams.get('view')
const [activeViewId, setActiveViewId] = React.useState('table')
React.useEffect(() => {
  if (!seed) return
  const target = requestedView && isViewAuthorized(seed, requestedView) ? requestedView : 'table'
  setActiveViewId((cur) => (authorizedViews.includes(cur as DashboardView) ? cur : target))
}, [seed, requestedView, authorizedViews])
```
`kanbanCompat` / `resolveKanbanConfig` usage in `content-list.tsx` is **removed from view gating** but kept only where it feeds `kanbanCandidates`/axis config (leave `content-kanban.tsx:149` untouched — that is capability, not availability).

**4.7 — Meta-seed authoring UI**

`meta-seed-layout.ts`: add `dashViews: "br_meta_dash_views"` to `META`; add branch in `buildMetaBranches` (multi-value select over view labels). Reuse `type: 'select'` with `options: ['table','gallery','kanban']` is single-select only — for multi-select, register a `multiselect` edit component OR model as three booleans. **Minimal (YAGNI) recommendation:** three boolean meta-branches `dash_view_table` (readOnly, always true), `dash_view_gallery`, `dash_view_kanban`, placed in a new `dashboard-views` section of the `dashboard` tab. Mapping then assembles the array.

`seed-form-mapping.ts`:
```ts
// seedToFormData:
dash_view_gallery: (d?.dashboard?.views ?? ['table']).includes('gallery'),
dash_view_kanban:  (d?.dashboard?.views ?? ['table']).includes('kanban'),
// formDataToSeed → dashboard:
views: (['table',
  ...(f.dash_view_gallery ? ['gallery'] : []),
  ...(f.dash_view_kanban ? ['kanban'] : []),
] as DashboardView[]),
```

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
```bash
# Core contract build + unit tests
pnpm --filter @beechcms/core run build
pnpm --filter @beechcms/core run test        # includes view-authorization.test.ts

# Dashboard type safety (registry wiring, VSA imports)
pnpm --filter @beechcms/dashboard exec tsc --noEmit

# Workspace-wide (unified CLI)
pnpm beech test --diff

# Manual smoke (no DB migration expected):
#  - seed with dashboard.views:['table'] → only Table tab; ?view=kanban → silently renders Table
#  - seed with ['table','kanban'] → Kanban tab present; empty gallery never forced
pnpm beech dev
```
> `pnpm beech db:migrate` / `db:reset` are **not required** — this sprint adds no D1 migration.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] `DashboardSeedConfig.views?: DashboardView[]` added; `DashboardView = 'table'|'gallery'|'kanban'`.
- [ ] `resolveAuthorizedViews` guarantees `'table'` in output for every input (incl. `{}`, `[]`, unknown values).
- [ ] `packages/core` builds and `view-authorization.ts` has **zero runtime imports** beyond `import type`.
- [ ] `apps/api` has **zero diff**; `pnpm beech test --diff` green with no migration.
- [ ] `ViewRegistry` mirrors `IFieldRegistry` (Map-backed, later-wins).
- [ ] `content-toolbar` does **not** import `content-gallery` or `content-kanban` except inside `view-registry.bootstrap.ts`; slices do not import each other (VSA).
- [ ] Hardcoded `views` state + KB-S26 `useEffect` deleted from `content-list.tsx`; view list derives from `resolveAuthorizedViews(seed)`.
- [ ] Direct navigation to an unauthorized `?view=` renders Table without error (URL guard).
- [ ] Existing seeds (no `dashboard.views`) still open on Table with no console errors (backward compat).
- [ ] `tsc --noEmit` clean in dashboard; no `any` introduced in new files.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- **No `SeedViewConfig` / kanban-card-layout changes** (brief §5 — separate table, stays put).
- **No D1 migration / schema mutation.**
- **No API or `@beechcms/core` DB-repository changes** (`seed.repository`, `seed-validation`).
- **No `grid` / `chart` authorization** — unrendered `ViewType` members excluded (YAGNI).
- **No user-level view persistence** (the `content-list.tsx:238` TODO stays a TODO).
- **No removal/refactor of `isGalleryBranch`** (layout heuristic, unrelated to view availability).
- **No new view renderer components** — table/gallery/kanban UIs already exist.
- **No multi-select field-type framework** — view authoring uses the minimal three-boolean model.
