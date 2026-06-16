# Dashboard Composer — Sprint Series (Index)

> This initiative transforms the BeechCMS admin dashboard from a single hardcoded
> bento page into a **composable, customizable dashboard system**. The series is
> split into seven sub-sprints so each one can be handed to an AI agent
> independently. Read them in order.

## Goal

The dashboard becomes a layout-driven surface organized as:

**Dashboard → Pages → Sections → Columns → Widgets**

- a dashboard contains one or more **pages** (navigable tabs)
- each page contains one or more **sections**
- each section defines a layout with **1–4 columns** (12-unit span grid)
- each column contains an ordered vertical stack of **widgets**
- widgets can be reordered, moved, configured, and replaced via an admin-only
  drag-and-drop builder

This deliberately mirrors the **Customizable Entry Editor** initiative
(`docs/Sprints/ui/04-customizable-entry-editor.md`), which shipped the same
pattern for the entry form (Tabs → Sections → Columns → Fields). Every sprint in
this series reuses that proven shape: core types + Zod + default generator +
semantic validator with auto-cleanup, a D1 row store behind a repository
interface, RFC 7807 endpoints, an RBAC constant in core, and a dnd-kit builder.

## Sub-sprints

| File | Scope |
|---|---|
| [01 — Layout Core](./01-dashboard-layout-core.md) | Core types (`DashboardLayout`, `DashboardPageLayout`, `DashboardSection`, `DashboardColumn`, `DashboardWidgetInstance`), Zod schemas, default layout generator (port of today's `getDashboardConfig`), semantic validator + auto-cleanup, `ROLES_ALLOWED_TO_EDIT_DASHBOARD`. Pure `@beechcms/core`, no UI/API change. |
| [02 — Persistence & API](./02-layout-persistence-and-api.md) | `dashboard_layouts` D1 table, `IDashboardLayoutRepository` + D1 impl, repository middleware wiring, new VSA slice `features/dashboard-layout` with `GET/PUT/DELETE /api/dashboard-layout`. |
| [03 — Widget Registry & Renderer](./03-widget-registry-and-renderer.md) | Frontend `WidgetDefinition` contract + typed registry (replaces the if-chain), all 15 existing widgets re-registered as `core/*`, runtime renderer (Pages → Sections → Columns → Widgets), `dashboard-page.tsx` rewired. Default render is visually equivalent to today. |
| [04 — Built-in Widgets](./04-builtin-widgets.md) | New configurable widgets: KPI stat card, line/bar/area chart, pie/donut chart, data table, text/notes. Adds the missing `distribution` query to `IWidgetRepository` + `GET /api/widget/distribution/:seed`. |
| [05 — Dashboard Builder UI](./05-dashboard-builder-ui.md) | Admin-only drag-and-drop builder dialog (`@dnd-kit`): page manager, section/column editing, widget picker, per-widget config panel, Save / Reset / Preview. |
| [06 — Role-based Dashboards](./06-role-based-dashboards.md) | Optional. Scope resolution `role:{role}` → `default` → generated default; scope switcher in the builder. |
| [07 — Custom Widget SDK](./07-custom-widget-sdk.md) | Optional. `@beechcms/widget-sdk` package: `defineWidget()`, data hooks over `/api/widget/*`, build-time registration entry point for pnpm-installable widget packages, author documentation. |

## Execution order

```
01 → 02 → 03 → 04 → 05 → (06) → (07)
```

- 01–05 are the core deliverable and strictly sequential.
- 06 and 07 are independent of each other; both require 05. 06 only requires the
  `scope` column shipped in 02, so it can start as soon as 05 is feature-frozen.
- No sprint here blocks or is blocked by the `runtime-seeds` series: the layout
  store is keyed by seed **slug** and auto-cleanup tolerates seed deletion, so it
  keeps working when Seeds become DB-resident.

## Key decisions (cross-cutting — do not re-litigate inside sub-sprints)

- **D1 — One layout per scope, no per-user dashboards.** Sprint 02 ships a single
  `default` scope shared by everyone. Sprint 06 adds per-role scopes. No
  versioning, no rollback. Reset = revert to the generated default.
- **D2 — Structured hierarchy replaces bento coordinates.** Today's
  `WidgetInstance { x, y, span }` absolute grid is retired. Sections own a
  12-unit span grid (`columnSpans`, e.g. `[8, 4]`); columns stack widgets
  vertically in order. This is what makes drag-and-drop tractable.
- **D3 — Namespaced widget types.** Built-ins are `core/<name>` (e.g.
  `core/stat`, `core/line-chart`). Custom widgets use their pnpm package name
  (e.g. `@acme/weather`). The renderer shows an "unavailable widget" placeholder
  for unknown types — it never silently destroys them on read. Stripping only
  happens when an admin explicitly deletes the widget in the builder.
- **D4 — Widget `config` is opaque to the server.** The API validates the layout
  *shape* (Zod) and caps each widget's serialized config at 8 KB, but does not
  validate per-widget config semantics — custom widgets are unknown to the
  Worker. One convention is enforced: a widget whose config references a Seed
  uses the key **`seedSlug`**; server-side auto-cleanup strips widgets whose
  `seedSlug` no longer matches a registered seed.
- **D5 — Reset = DELETE row.** `DELETE /api/dashboard-layout` removes the stored
  row; the client regenerates the default via the core generator. Mirrors the
  entry-editor decision (no drift between server and client defaults).
- **D6 — RBAC constant in core.** `ROLES_ALLOWED_TO_EDIT_DASHBOARD = ['admin']`
  in `@beechcms/core`, mirroring `ROLES_ALLOWED_TO_EDIT_LAYOUT` in
  `layout-permissions.ts`. Used by both the API guard and the dashboard button.
- **D7 — Data access only through existing contracts.** Built-in widgets fetch
  via `/api/widget/*` (backed by `IWidgetRepository`) and `/api/content/stats/*`.
  Any new generic query (e.g. `distribution`) is added to `IWidgetRepository` —
  never as raw D1 in a handler. Botanical Engine invariant applies: column
  references resolved via seed branches, validated server-side.
- **D8 — No new heavy dependencies.** Charts: `recharts` (already installed).
  Drag-and-drop: `@dnd-kit/*` (already installed, already used by the
  entry-editor layout builder). Forms: existing Shadcn inputs.
- **D9 — Custom widgets are build-time, not runtime-loaded.** The dashboard is a
  static SPA; widget packages are pnpm dependencies registered in a single
  `widgets.custom.ts` entry point at build time. No remote code loading, no
  sandboxing requirement — custom widgets are trusted code.
- **D10 — i18n.** Built-in widget names/descriptions are i18n keys resolved via
  `react-i18next`. Custom widgets may supply plain strings.
- **D11 — Microanimations.** To make the dashboard feel more responsive and
  intuitive (widget enter/exit, drag-and-drop reordering, section
  collapse/expand, page switches), use a **lightweight** animation approach —
  Tailwind CSS transitions/`@keyframes` utilities and Radix's built-in
  open/close animation primitives (already exercised by Shadcn components)
  are sufficient and add zero new dependencies. If a small utility library is
  preferred (e.g. `tw-animate-css`, already common in Shadcn v4 setups), it
  must stay optional and not become a hard dependency for layout/widget logic.
  Keep animations subtle and respect `prefers-reduced-motion`.

## Reuse map (existing code each sprint builds on)

| Existing asset | Where | Reused by |
|---|---|---|
| Entry-editor layout system (types, validator, generator) | `packages/core/src/seed-layout.ts` | 01 (pattern template) |
| `ISeedLayoutRepository` + `D1SeedLayoutRepository` + tests | `packages/core/src/seed-layout.repository.ts`, `apps/api/src/shared/seed-layout.repository.d1.ts` | 02 (copy the shape) |
| `layout-permissions.ts` RBAC constant | `packages/core/src/layout-permissions.ts` | 01 |
| `IWidgetRepository` (aggregate/growth/leaderboard/list/timeseries) | `packages/core/src/widget/widget.repository.ts`, `apps/api/src/widget.ts` | 04 |
| Stats endpoints | `apps/api/src/features/stats/stats.handler.ts` (`/content/stats/*`) | 03, 04 |
| 15 existing widget components + `DashboardWidgetShell` + error boundary | `apps/dashboard/src/features/dashboard/components/**` | 03 |
| Entry-editor layout builder (dnd-kit patterns, confirm dialog) | `apps/dashboard/src/features/entry-editor/builder/**` | 05 |
| Widget Lab QA page | `apps/dashboard/src/pages/widget-lab.tsx` (`/widget-lab`) | 03, 04 |
| `recharts` 3.x | `apps/dashboard/package.json` | 04 |

## Documentation obligations

- Sprint 03 and 05 update `docs/frontend-guide.md` (renderer + builder).
- Sprint 02 updates `docs/api-reference.md` (new endpoints) and `docs/SYSTEM_MAP.md`.
- Sprint 07 authors a new `docs/custom-widgets.md`.
