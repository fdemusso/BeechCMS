# Dashboard Composer — Sprint 01: Layout Core (`@beechcms/core`)

> **Audience:** an AI coding agent implementing this sprint end-to-end with no prior
> knowledge of the Beech CMS codebase. Everything needed to implement is inline.
> Do not grep beyond what is referenced here unless something disagrees with the
> live code — in that case, trust live code and note the drift.

First sprint of the series. Pure `@beechcms/core` work: types, Zod schemas,
default generator, semantic validator, RBAC constant. **No API change, no UI
change, no migration.** After this sprint nothing visible changes anywhere.

Read [`00-overview.md`](./00-overview.md) first — the cross-cutting decisions
D1–D10 are binding and are not repeated in full here.

---

## 0. ROLE & GROUND RULES

You are a senior TypeScript engineer working on the **Beech CMS monorepo** (Turborepo).

1. **This sprint touches only `packages/core`.** Build with `pnpm run build` in
   `packages/core`; tests with `vitest` (the package already has `*.test.ts` files
   colocated with sources).
2. **Mirror the entry-editor layout module.** `packages/core/src/seed-layout.ts`
   is the proven template: interfaces → Zod schemas → default generator →
   semantic validator returning `{ ok, errors, cleaned }`. Match its style,
   naming discipline, and SPDX header (`MIT` for core files).
3. **Docs are English.**
4. **No React, no D1, no Hono imports in core.** Everything here must be pure
   and runnable in Workers, Node (tests), and the browser.

---

## 1. WHAT THIS SPRINT BUILDS

1. **New module** `packages/core/src/dashboard-layout.ts`:
   - interfaces `DashboardWidgetInstance`, `DashboardColumn`, `DashboardSection`,
     `DashboardPageLayout`, `DashboardLayout`
   - Zod schemas for all of the above
   - `generateDefaultDashboardLayout(seeds)` — pure port of today's hardcoded
     `getDashboardConfig` (see §3.1) into the new hierarchy
   - `validateDashboardLayout(layout, ctx)` — semantic validator + auto-cleanup
2. **New module** `packages/core/src/dashboard-permissions.ts`:
   - `ROLES_ALLOWED_TO_EDIT_DASHBOARD`, `canEditDashboard(role)`
3. **Barrel exports** from `packages/core/src/index.ts`.
4. **Unit tests** for generator and validator.

---

## 2. CONFIRMED DESIGN DECISIONS (from 00-overview, applied here)

- **(D2)** Sections use a **12-unit span grid**. `columnSpans` is an optional
  array parallel to `columns`; when absent, columns split equally. 1–4 columns
  per section.
- **(D3)** `DashboardWidgetInstance.type` is a namespaced string. Validation
  regex: `^[a-z0-9@][a-z0-9@/_-]*$` (lowercase pnpm-name-compatible). Built-ins
  use the `core/` prefix; this module does **not** know the list of valid
  types — that knowledge lives in the frontend registry (Sprint 03) and,
  optionally, in the validator context.
- **(D4)** `config` is `Record<string, unknown>`, opaque. The only key with
  core-level meaning is `seedSlug` (string) — used for auto-cleanup.
- **(D6)** RBAC constant identical in shape to
  `packages/core/src/layout-permissions.ts`.

---

## 3. CURRENT STATE (verbatim reference)

### 3.1 Today's hardcoded dashboard config (to be ported, NOT modified)

`apps/dashboard/src/features/dashboard/config/dashboard.config.ts` builds a flat
`WidgetInstance[]` with absolute bento coordinates (`x`, `y`, `span {w,h}` on an
8-column grid). Summary of its output:

| Row | Widgets (type → props) | Condition |
|---|---|---|
| 0 | `setup-checklist` (w8) `{variant:'full'}` | always |
| 1 | `site-status` (w2) `{variant:'badge'}`, `storage` (w2) `{variant:'gauge'}`, `publication-stats` (w2) `{variant:'trio'}`, `quick-draft` (w2) `{variant:'minimal', seeds}` | quick-draft only if `seeds.length > 0` |
| 2–3 | `recent-content` (w4) + `pending-drafts` (w4), both `{seedSlug, variant:'list'}` | if seeds |
| 4–5 | `media-gallery` (w4) `{variant:'grid'}` + `activity-feed` (w4) `{variant:'feed'}` | if seeds |

`defaultSeedSlug = seeds.find(s => s.slug === 'articoli')?.slug ?? seeds[0].slug`.

This function and `types/widget.types.ts` (`WidgetType`, `WidgetInstance`,
`DashboardConfig`) are retired in Sprint 03 — **leave them untouched in this
sprint**.

### 3.2 The template module — `packages/core/src/seed-layout.ts`

Already in the repo. Key conventions to copy:
- interfaces first, then a `// Branch-type rules` style section for shared
  predicates, then Zod schemas, then the generator (with injectable
  `opts?: { newId: () => string }` defaulting to `crypto.randomUUID`), then the
  validator returning `{ ok: true; cleaned } | { ok: false; errors; cleaned }`
  (cleaned is **always** returned — auto-cleanup is graceful by design).

### 3.3 RBAC template — `packages/core/src/layout-permissions.ts`

```ts
export const ROLES_ALLOWED_TO_EDIT_LAYOUT: ReadonlyArray<string> = ['admin']
export function canEditLayout(role: string | undefined | null): boolean {
  if (!role) return false
  return ROLES_ALLOWED_TO_EDIT_LAYOUT.includes(role)
}
```

### 3.4 `Seed` (from `packages/core/src/types.ts`)

The generator receives `Seed[]`. Relevant fields: `slug`, `label`,
`displayNameAlias`, `branches[]` (each with `alias`, `label`), and
`dashboard?: DashboardSeedConfig` (sidebar metadata — not used here).

---

## 4. TYPES — `packages/core/src/dashboard-layout.ts` (new file)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { z } from 'zod'
import type { Seed } from './types.js'

/** A placed widget. `type` is namespaced ('core/stat', '@acme/weather').
 *  `config` is opaque to core/API except for the optional `seedSlug` key,
 *  which enables auto-cleanup when the referenced seed disappears. */
export interface DashboardWidgetInstance {
  id: string                       // stable client-generated id (crypto.randomUUID)
  type: string
  title?: string                   // optional user override of the widget's default title
  config: Record<string, unknown>
}

export interface DashboardColumn {
  id: string
  widgets: DashboardWidgetInstance[]   // ordered vertical stack; may be empty
}

export interface DashboardSection {
  id: string
  label?: string
  hideLabel?: boolean
  collapsible?: boolean
  /** 1–4 columns. Enforced by validator. */
  columns: DashboardColumn[]
  /** Optional spans on a 12-unit grid, parallel to `columns`, must sum to 12.
   *  Absent = equal split. */
  columnSpans?: number[]
}

export interface DashboardPageLayout {
  id: string
  /** URL identity (?page=<slug>). Unique within the layout. */
  slug: string
  label: string
  /** Lucide icon name, same convention as DashboardSeedConfig.icon. */
  icon?: string
  sections: DashboardSection[]
}

export interface DashboardLayout {
  /** Format version — bump when introducing breaking changes. */
  version: 1
  pages: DashboardPageLayout[]
}
```

### Zod schemas (same file)

```ts
export const WIDGET_TYPE_REGEX = /^[a-z0-9@][a-z0-9@/_-]*$/

export const dashboardWidgetInstanceSchema = z.object({
  id: z.string().min(1),
  type: z.string().regex(WIDGET_TYPE_REGEX),
  title: z.string().max(80).optional(),
  config: z.record(z.string(), z.unknown()),
})
export const dashboardColumnSchema = z.object({
  id: z.string().min(1),
  widgets: z.array(dashboardWidgetInstanceSchema),
})
export const dashboardSectionSchema = z.object({
  id: z.string().min(1),
  label: z.string().max(60).optional(),
  hideLabel: z.boolean().optional(),
  collapsible: z.boolean().optional(),
  columns: z.array(dashboardColumnSchema).min(1).max(4),
  columnSpans: z.array(z.number().int().min(1).max(12)).optional(),
})
export const dashboardPageSchema = z.object({
  id: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).max(40),
  label: z.string().min(1).max(60),
  icon: z.string().max(40).optional(),
  sections: z.array(dashboardSectionSchema).min(1),
})
export const dashboardLayoutSchema = z.object({
  version: z.literal(1),
  pages: z.array(dashboardPageSchema).min(1).max(8),
})
```

> Note (Zod v4): `z.record` requires an explicit key schema —
> `z.record(z.string(), z.unknown())`, matching usage elsewhere in core.

---

## 5. DEFAULT LAYOUT GENERATOR

```ts
export function generateDefaultDashboardLayout(
  seeds: Seed[],
  opts?: { newId: () => string },
): DashboardLayout
```

Algorithm — a faithful structural port of §3.1 into one page named **Overview**
(`slug: 'overview'`, `icon: 'LayoutDashboard'`):

1. **Section "setup"** (`hideLabel: true`): 1 column, one widget
   `core/setup-checklist` with `config: { variant: 'full' }`.
2. **Section "status"** (`hideLabel: true`): if there are seeds, 4 equal columns
   with `core/site-status {variant:'badge'}`, `core/storage {variant:'gauge'}`,
   `core/publication-stats {variant:'trio'}`, `core/quick-draft
   {variant:'minimal'}`; with zero seeds, 3 columns (no quick-draft).
   - **Drift from today:** the current config precomputes a `seeds` prop array
     for quick-draft. In the new model widgets fetch their own data (Sprint 03
     adapters use `useSchema()` internally), so the config carries no seed list.
3. If `seeds.length > 0`, with
   `defaultSeedSlug = seeds.find(s => s.slug === 'articoli')?.slug ?? seeds[0].slug`:
   - **Section "content"**: 2 columns `[6, 6]` —
     `core/recent-content {seedSlug, variant:'list'}` |
     `core/pending-drafts {seedSlug, variant:'list'}`.
   - **Section "media-activity"**: 2 columns `[6, 6]` —
     `core/media-gallery {seedSlug, variant:'grid'}` |
     `core/activity-feed {seedSlug, variant:'feed'}`.

IDs come from `opts?.newId ?? (() => crypto.randomUUID())` — injectable for
deterministic tests, identical to `generateDefaultLayout` in `seed-layout.ts`.

The "setup"/"status"/"content"/"media-activity" names above are internal labels
for this spec — emitted sections have generated `id`s and **no `label`**
(`hideLabel: true`), matching today's chrome-less bento look.

---

## 6. VALIDATOR + AUTO-CLEANUP

```ts
export interface DashboardLayoutContext {
  /** Slugs of currently registered seeds (from ISeedRegistry.all()). */
  seedSlugs: ReadonlySet<string>
  /** Optional: widget types known to the caller (frontend registry).
   *  When provided, unknown types produce WARNINGS, never strips. */
  knownWidgetTypes?: ReadonlySet<string>
}

export type ValidateDashboardLayoutResult =
  | { ok: true; cleaned: DashboardLayout; warnings: string[] }
  | { ok: false; errors: string[]; cleaned: DashboardLayout; warnings: string[] }

export function validateDashboardLayout(
  layout: DashboardLayout,
  ctx: DashboardLayoutContext,
): ValidateDashboardLayoutResult
```

Rules (Zod shape validation is the **caller's** job, as in the entry-editor flow):

**Auto-cleanup (silent, never an error):**
1. Drop any widget whose `config.seedSlug` is a string not present in
   `ctx.seedSlugs` (the seed was deleted/renamed). Record a warning.

**Errors (reject on write):**
2. Duplicate widget `id` anywhere in the layout.
3. Duplicate page `slug`.
4. `columnSpans` present but `length !== columns.length`.
5. `columnSpans` present but sum ≠ 12.
6. Serialized `config` of any single widget exceeds **8192 bytes**
   (`JSON.stringify(widget.config).length > 8192`) — guards D1 row bloat.

**Warnings (returned, never block):**
7. Widget `type` not in `ctx.knownWidgetTypes` (when the set is provided).
   Per decision D3 the server must NOT strip unknown types — custom widgets are
   invisible to the Worker.

`cleaned` is always returned, errors or not (same contract as
`validateLayoutAgainstSeed`).

---

## 7. RBAC — `packages/core/src/dashboard-permissions.ts` (new file)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

// NOTE: change this list to extend write-access to other roles
// (e.g. add 'editor', or introduce a fine-grained 'dashboard:edit' permission).
// Single source of truth — used by both API guards and dashboard buttons.
export const ROLES_ALLOWED_TO_EDIT_DASHBOARD: ReadonlyArray<string> = ['admin']

export function canEditDashboard(role: string | undefined | null): boolean {
  if (!role) return false
  return ROLES_ALLOWED_TO_EDIT_DASHBOARD.includes(role)
}
```

---

## 8. FILES TO TOUCH (checklist)

- `packages/core/src/dashboard-layout.ts` (new) — types, Zod, generator, validator
- `packages/core/src/dashboard-permissions.ts` (new) — RBAC constant + predicate
- `packages/core/src/dashboard-layout.test.ts` (new) — unit tests
- `packages/core/src/index.ts` — export everything above from the barrel

**Do not touch:** `apps/dashboard/**`, `apps/api/**`, `seed-layout.ts`.

---

## 9. ACCEPTANCE

1. `pnpm run build` passes in `packages/core`; `pnpm run test` (vitest) passes.
2. **Generator tests** (deterministic via injected `newId`):
   - 0 seeds → 1 page, 2 sections (setup + status with 3 columns), no
     content/media sections, every widget id unique.
   - ≥1 seed without `articoli` → `seedSlug` of content widgets = first seed's slug.
   - seed list containing `articoli` → `seedSlug === 'articoli'`.
   - output passes `dashboardLayoutSchema.parse` round-trip.
3. **Validator tests:**
   - widget with `config.seedSlug: 'ghost'` not in ctx → stripped, `ok: true`,
     1 warning, other widgets intact.
   - duplicate widget id → `ok: false` with explicit error message.
   - duplicate page slug → error.
   - `columnSpans: [6, 5]` on 2 columns → error (sum 11).
   - `columnSpans: [6, 6, 6]` on 2 columns → error (length mismatch).
   - config > 8 KB → error.
   - unknown type with `knownWidgetTypes` provided → warning, NOT stripped, `ok: true`.
   - `cleaned` returned even when `ok: false`.
4. `canEditDashboard('admin') === true`, `canEditDashboard('editor') === false`,
   `canEditDashboard(undefined) === false`.
5. No change in `apps/api` or `apps/dashboard` builds (they don't import the new
   modules yet).

---

## 10. OPEN QUESTIONS (defaults inline)

- **Max pages = 8?** Mirrors the entry-editor tab cap. *Default: 8.*
- **Should `columnSpans` allow a span < 2 for chart-bearing columns?** Widget
  minimum-width hints belong to the frontend `WidgetDefinition` (Sprint 03), not
  to core. *Default: core allows 1–12, frontend warns.*
