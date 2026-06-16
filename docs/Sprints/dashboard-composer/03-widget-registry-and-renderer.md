# Dashboard Composer — Sprint 03: Widget Registry & Runtime Renderer

> **Audience:** an AI coding agent implementing this sprint end-to-end with no prior
> knowledge of the Beech CMS codebase. Everything needed to implement is inline.
> Do not grep beyond what is referenced here unless something disagrees with the
> live code — in that case, trust live code and note the drift.

Depends on [Sprint 01](./01-dashboard-layout-core.md) (core types + generator)
and [Sprint 02](./02-layout-persistence-and-api.md) (`GET /api/dashboard-layout`).

This sprint is pure frontend. It replaces the hardcoded bento grid with a
layout-driven renderer and replaces the if-chain widget resolver with a typed
registry. **Acceptance bar: with no stored layout, the dashboard must look
functionally equivalent to today** (same widgets, same visual hierarchy — exact
pixel parity is not required because the grid moves from 8 to 12 units).

---

## 0. ROLE & GROUND RULES

You are a senior React/TypeScript engineer working on the **Beech CMS monorepo**.

1. **Vertical Slice Architecture.** All new code lives under
   `apps/dashboard/src/features/dashboard/`. Other features import only via the
   feature's `index.ts`.
2. **TanStack Query v5** for server state; Axios via `@/lib/api` (it already
   prefixes `/api`). No raw `fetch` in feature code.
3. **No new dependencies.** Shadcn/ui + Tailwind v4 for UI.
4. **i18n.** All user-visible strings go through `react-i18next` keys under
   `dashboard.*` (see existing `dashboard.widgets.*` keys in the locale files).
5. **Do not break `/widget-lab`** — it imports widget components directly from
   `@/features/dashboard/widgets` and must keep compiling.
6. **Docs are English.**

---

## 1. WHAT THIS SPRINT BUILDS

1. **`WidgetDefinition` contract + registry module** — a typed map replacing the
   `WidgetRegistry` if-chain.
2. **Registration of all 15 existing widgets** under namespaced `core/*` types,
   each with a Zod config schema and an adapter mapping `config` → current
   component props.
3. **`useDashboardLayout()` hook** — fetches `GET /api/dashboard-layout`, falls
   back to `generateDefaultDashboardLayout(seeds)` from core.
4. **Runtime renderer** — Pages (URL-driven tabs) → Sections (12-unit grid) →
   Columns (vertical stacks) → Widgets (registry + error boundary +
   unknown-type placeholder).
5. **`dashboard-page.tsx` rewired** to the renderer; greeting header preserved.
6. Legacy `getDashboardConfig` + `WidgetInstance{x,y,span}` model deleted.

Out of scope: the builder (Sprint 05), new widgets (Sprint 04), role scopes (06).

---

## 2. CONFIRMED DESIGN DECISIONS

- **(D3)** Unknown `type` renders a neutral placeholder card ("Widget
  unavailable: `<type>`") — never crashes, never silently disappears.
- **Type migration is code-only.** Today's layout is never persisted, so there
  is no data to migrate. Rename freely: `'stat'` → `'core/stat'`,
  `'recent-content'` → `'core/recent-content'`, etc.
- **Page navigation via search param** `?page=<slug>` on the existing `/` route
  (URL-driven state, same philosophy as the entry-editor dialog's deep links).
  Invalid/absent param → first page. No new routes in `App.tsx`.
- **Responsive strategy** carries over from today's bento CSS: 12-unit spans at
  `lg`, halved at `md`, single column on mobile (reuse/adapt the
  `.bento-cell` CSS-variable utility in `index.css`).

---

## 3. CURRENT STATE (verbatim reference)

### 3.1 Resolver to replace — `components/widget-registry.tsx`

`WidgetRegistry({ instance, data })` wraps `WidgetContent` in
`WidgetErrorBoundary` and resolves `instance.type` through an if-chain over the
`WidgetType` union (15 types). The `stat` case derives props from a shared
`data` bundle (`statsData`, `cfData`, loading flags) computed in
`dashboard-page.tsx` via `useDashboardStats()` / `useCloudflareStats()`.

**Keep** `WidgetErrorBoundary` (`components/widget-error-boundary.tsx`) and
`DashboardWidgetShell` — they are reused as-is.

### 3.2 Page to rewire — `pages/dashboard-page.tsx`

Renders sidebar/header chrome, a greeting block, then maps
`getDashboardConfig(seeds).layout` onto an 8-col bento grid with inline
CSS-variable spans and clamping. The chrome + greeting stay; the grid mapping
is replaced by the renderer.

### 3.3 Existing widgets and their props (adapters must cover all)

From `components/widget-registry.tsx` and `components/widgets/*`:

| New type | Component | Config (Zod) |
|---|---|---|
| `core/stat` | `StatCard` (legacy `statKey` variant) | `{ statKey: 'total'\|'visitors'\|'traffic'\|'storage' }` — superseded by the configurable stat in Sprint 04, kept for the default layout |
| `core/recent-activity` | `RecentActivity` | `{}` |
| `core/system-health` | `SystemHealth` | `{}` |
| `core/content-pulse` | `ContentPulse` | `{}` |
| `core/ai-insights` | `AIInsights` | `{}` |
| `core/quick-actions` | `QuickActions` | `{}` |
| `core/recent-content` | `RecentContentWidget` | `{ seedSlug: string, variant?: string }` |
| `core/quick-draft` | `QuickDraftWidget` | `{ variant?: string }` — the adapter computes the `seeds` prop internally via `useSchema()` (today it arrives pre-baked in `props.seeds`; that coupling dies here) |
| `core/pending-drafts` | `PendingDraftsWidget` | `{ seedSlug: string, variant?: string }` |
| `core/publication-stats` | `PublicationStatsWidget` | `{ variant?: string }` |
| `core/site-status` | `SiteStatusWidget` | `{ variant?: string }` |
| `core/storage` | `StorageWidget` | `{ variant?: string, totalBytes?: number }` |
| `core/media-gallery` | `MediaGalleryWidget` | `{ seedSlug: string, variant?: string }` |
| `core/activity-feed` | `ActivityFeedWidget` | `{ seedSlug: string, variant?: string, limit?: number }` |
| `core/setup-checklist` | `SetupChecklistWidget` | `{ variant?: string }` |

Callback props (`onOpen`, `onPublish`, `onCreated`) are navigation concerns —
adapters wire them to `useNavigate()` internally; they are NOT part of config.

### 3.4 Data hooks

`hooks/use-dashboard-stats.ts` exposes `useDashboardStats()` and
`useCloudflareStats()` over `api/dashboard.api.ts`
(`/content/stats/total`, `/content/stats/cloudflare`, ...). The `core/stat`
adapter calls these hooks itself — the page-level `data` bundle prop is
removed.

### 3.5 Core imports available after Sprints 01–02

`@beechcms/core`: `DashboardLayout`, `DashboardPageLayout`, `DashboardSection`,
`DashboardColumn`, `DashboardWidgetInstance`, `dashboardLayoutSchema`,
`generateDefaultDashboardLayout`, `canEditDashboard`.

---

## 4. WIDGET DEFINITION CONTRACT — `features/dashboard/registry/widget-definition.ts` (new)

```ts
import type { ComponentType } from 'react'
import type { z } from 'zod'
import type { DashboardWidgetInstance } from '@beechcms/core'

export interface DashboardWidgetProps<TConfig = unknown> {
  instance: DashboardWidgetInstance
  config: TConfig              // parsed + defaulted via configSchema
}

export interface WidgetDefinition<TConfig = unknown> {
  /** Namespaced type: 'core/<name>' for built-ins, pnpm name for custom. */
  type: string
  /** i18n key for the picker (built-ins); plain string allowed (custom). */
  labelKey: string
  descriptionKey?: string
  /** Lucide icon name for the picker. */
  icon?: string
  category: 'stats' | 'charts' | 'content' | 'system' | 'custom'
  /** Zod schema with .default()/.catch() so partial configs always parse. */
  configSchema: z.ZodType<TConfig>
  defaultConfig: TConfig
  component: ComponentType<DashboardWidgetProps<TConfig>>
  /** Builder hint (Sprint 05): minimum sensible column span out of 12. */
  minColumnSpan?: number
  /** Builder hint (Sprint 05): config panel. Absent = "no options" notice. */
  ConfigPanel?: ComponentType<{ config: TConfig; onChange: (next: TConfig) => void }>
}
```

### Registry — `features/dashboard/registry/widget-registry.ts` (new)

```ts
const definitions = new Map<string, WidgetDefinition<any>>()

export function registerWidget<T>(def: WidgetDefinition<T>): void   // throws on duplicate type
export function getWidgetDefinition(type: string): WidgetDefinition | undefined
export function listWidgetDefinitions(): WidgetDefinition[]          // stable order: category, then labelKey
export function knownWidgetTypes(): ReadonlySet<string>              // feeds validateDashboardLayout in the builder
```

Built-ins self-register from
`features/dashboard/registry/builtin-widgets.tsx` (new), which is imported once
from the feature barrel. Each entry is ~10 lines: type, metadata, config schema
from §3.3, and an adapter component delegating to the existing widget
component. Sprint 07 adds a second import site for custom packs — keep
`registerWidget` free of built-in assumptions.

---

## 5. LAYOUT HOOK — `features/dashboard/hooks/use-dashboard-layout.ts` (new)

```ts
export function useDashboardLayout(): {
  layout: DashboardLayout      // stored ?? generated default
  isStored: boolean            // false when rendering the generated fallback
  isLoading: boolean
}
```

- Query key `['dashboard-layout']`, `GET /dashboard-layout` via `@/lib/api`.
- `layout === null` in the response → `generateDefaultDashboardLayout(seeds)`
  with `seeds` from the existing `useSchema()` hook (`@/features/schema`).
- Memoize the generated default on the seeds reference — `crypto.randomUUID` in
  the generator means an unmemoized call changes ids every render.

---

## 6. RENDERER — `features/dashboard/renderer/` (new folder)

```
renderer/
  dashboard-layout-renderer.tsx   // pages → tabs; orchestrates below
  dashboard-section.tsx           // 12-unit grid + optional label/collapse
  dashboard-column.tsx            // vertical widget stack
  dashboard-widget-host.tsx       // registry lookup + boundary + placeholder
```

Behavior:

- **Pages:** if `layout.pages.length > 1`, render a Shadcn `Tabs`-style strip
  under the greeting; active page from `useSearchParams()` `page` param;
  changing tabs calls `setSearchParams` (replace, not push). One page → no strip.
- **Sections:** CSS grid `grid-cols-12` at `lg`; column `i` gets
  `columnSpans?.[i] ?? Math.floor(12 / columns.length)` (distribute remainder
  left-to-right). `label` + `collapsible` render a thin header row (reuse the
  section header treatment from the entry-editor renderer for visual
  consistency). `hideLabel` → no header.
- **Columns:** `flex flex-col gap-6`; widgets in array order.
- **Widget host:** parse `instance.config` with the definition's
  `configSchema.safeParse`; on failure, render the widget with `defaultConfig`
  and log a console warning (config drift must not blank a dashboard). Unknown
  type → placeholder card with the type name (i18n
  `dashboard.widgetRegistry.unknown`, already exists). Everything wrapped in
  `WidgetErrorBoundary`.

---

## 7. REWIRE & DELETE

- `pages/dashboard-page.tsx`: keep chrome + greeting; replace the bento map
  with `<DashboardLayoutRenderer layout={layout} />` from `useDashboardLayout()`.
- **Delete:** `config/dashboard.config.ts`, the if-chain body of
  `components/widget-registry.tsx` (file removed; `getStatData` helper moves
  into the `core/stat` adapter), `WidgetType` / `WidgetInstance` /
  `DashboardConfig` in `types/widget.types.ts` (file removed; update the
  feature barrel and any test imports).
- `features/dashboard/index.ts`: export `DashboardPage`, registry functions,
  renderer, `useDashboardLayout`. Keep `./widgets` barrel untouched for
  `/widget-lab`.

---

## 8. FILES TO TOUCH (checklist)

New:
- `features/dashboard/registry/widget-definition.ts`
- `features/dashboard/registry/widget-registry.ts`
- `features/dashboard/registry/builtin-widgets.tsx`
- `features/dashboard/hooks/use-dashboard-layout.ts`
- `features/dashboard/renderer/dashboard-layout-renderer.tsx`
- `features/dashboard/renderer/dashboard-section.tsx`
- `features/dashboard/renderer/dashboard-column.tsx`
- `features/dashboard/renderer/dashboard-widget-host.tsx`
- Tests: `src/test/dashboard/widget-registry.test.ts(x)`,
  `src/test/dashboard/dashboard-layout-renderer.test.tsx`,
  `src/test/dashboard/use-dashboard-layout.test.ts`

Modified:
- `features/dashboard/pages/dashboard-page.tsx`
- `features/dashboard/index.ts`
- locale files (`dashboard.pages.*` tab strings if any, placeholder strings)

Deleted:
- `features/dashboard/config/dashboard.config.ts`
- `features/dashboard/components/widget-registry.tsx`
- `features/dashboard/types/widget.types.ts`

---

## 9. ACCEPTANCE

1. `pnpm run build` (tsc -b + vite) and `pnpm run test` pass in `apps/dashboard`;
   `pnpm run lint` clean.
2. **Visual equivalence:** with no stored layout and seeds present, `/` shows
   the same widgets in the same order/grouping as before this sprint
   (setup-checklist row, status row of four, content pair, media/activity pair).
3. With a stored layout (PUT one manually via the API), the dashboard renders
   it; `?page=<slug>` selects pages; bad slug falls back to page 1.
4. A layout containing type `@acme/ghost` renders the placeholder card; the
   rest of the dashboard is intact.
5. A widget whose config fails its schema renders with `defaultConfig` (assert
   via test, not by hand).
6. `registerWidget` throws on duplicate type registration (test).
7. `/widget-lab` still compiles and renders.
8. `docs/frontend-guide.md` gains a "Dashboard renderer & widget registry"
   section (registration steps: define → register in `builtin-widgets.tsx` →
   done; explicitly note the old 3-step comment in the deleted file is obsolete).

---

## 10. OPEN QUESTIONS (defaults inline)

- **Tabs vs sidebar entries for pages?** *Default: in-page tab strip. Sidebar
  integration (one entry per dashboard page) can ride along with Sprint 05 if
  the navigation feature exposes a cheap API; do not block on it.*
- **Should `core/stat` keep the legacy `statKey` config?** *Default: yes in this
  sprint (needed by the generated default); Sprint 04 extends the same widget
  with formula-based config and keeps `statKey` as a preset shorthand.*
