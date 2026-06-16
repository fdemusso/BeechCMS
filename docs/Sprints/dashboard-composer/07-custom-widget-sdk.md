# Dashboard Composer — Sprint 07: Custom Widget SDK (optional)

> **Audience:** an AI coding agent implementing this sprint end-to-end with no prior
> knowledge of the Beech CMS codebase. Everything needed to implement is inline.
> Do not grep beyond what is referenced here unless something disagrees with the
> live code — in that case, trust live code and note the drift.

Depends on [Sprint 05](./05-dashboard-builder-ui.md) (builder + config-sheet
plumbing the SDK plugs into). This sprint makes the widget catalog a **public
extension point**: third-party widgets shipped as pnpm packages, registered at
build time, configured in the builder like built-ins.

Per decision **D9**: build-time registration only. The dashboard is a static
SPA on the edge — there is no runtime plugin loader, no remote code, no
sandbox. A custom widget is trusted code compiled into the operator's own
dashboard build.

---

## 0. ROLE & GROUND RULES

You are a senior TypeScript engineer working on the **Beech CMS monorepo**.

1. **New workspace package** `packages/widget-sdk` → `@beechcms/widget-sdk`.
   Follow `packages/core`'s build setup (tsc to `dist/`, ESM, same TS config
   conventions). `react` and `@tanstack/react-query` are **peer** dependencies.
2. **The SDK is a contract, not a grab-bag.** Export only what a widget author
   needs. Internal dashboard modules must NOT leak through it.
3. **No API changes.** Custom widgets consume the same authenticated
   `/api/widget/*` and `/api/content/stats/*` endpoints as built-ins.
4. **Docs are English.**
5. **Vertical Slice Architecture.** Dashboard-side changes stay inside
   `apps/dashboard/src/features/dashboard/` (registry re-exports, `main.tsx`
   wiring, `widgets.custom.ts`); other features must keep importing only via
   `features/dashboard`'s public API. Presentational primitives moved into the
   SDK (`WidgetShell`, `WidgetEmpty`, `WidgetError`) and the example widget's
   `ConfigPanel` are built on **Shadcn/ui + Tailwind v4**, matching the rest of
   the dashboard — no new UI dependencies.

---

## 1. WHAT THIS SPRINT BUILDS

1. **`@beechcms/widget-sdk` package**:
   - re-exported types: `WidgetDefinition`, `DashboardWidgetProps`,
     `DashboardWidgetInstance`, `AggregateFormula`, `TimeWindow`,
     `DistributionSlice` (from `@beechcms/core` / the dashboard contract)
   - `defineWidget<TConfig>(def): WidgetDefinition<TConfig>` — identity helper
     that gives authors full type inference and validates `type` against
     `WIDGET_TYPE_REGEX` + reserves the `core/` prefix (throws if used)
   - **data hooks**: `useWidgetAggregate`, `useWidgetGrowth`,
     `useWidgetTimeseries`, `useWidgetDistribution`, `useWidgetList` — the
     Sprint 04 hooks **move here** (the dashboard re-imports them from the SDK;
     single implementation, no fork)
   - `WidgetSdkProvider` — React context carrying the HTTP client; the
     dashboard mounts it once with its Axios instance (`@/lib/api`), so SDK
     hooks never hardcode a base URL or auth scheme
   - presentational primitives: `WidgetShell` (re-export of
     `DashboardWidgetShell`'s contract — see Open Questions), `WidgetEmpty`,
     `WidgetError`
2. **Registration entry point in the dashboard**:
   `apps/dashboard/src/widgets.custom.ts` — a file whose only job is:
   ```ts
   import { registerWidget } from '@/features/dashboard'
   // import { weatherWidget } from '@acme/beech-widget-weather'
   // registerWidget(weatherWidget)
   export {}
   ```
   imported once in `main.tsx` after built-in registration. Operators edit this
   file (and `package.json`) to install widgets — documented as THE supported
   mechanism.
3. **Example widget package** `examples/widget-hello-world/` (workspace,
   private): a minimal `defineWidget` with a config schema, a `ConfigPanel`,
   and one SDK data hook call — serving as living documentation and a
   compile-time test of the SDK surface.
4. **Author documentation** `docs/custom-widgets.md`: contract, lifecycle,
   naming rules (`type` = pnpm package name, optionally `pkg/sub-name` for
   multi-widget packs), config conventions (**`seedSlug` key ⇒ auto-cleanup**,
   8 KB config cap, no secrets in config — it's stored server-side in
   `dashboard_layouts` readable by any authenticated dashboard user), i18n
   options, versioning expectations (peer-dep ranges).

---

## 2. CURRENT STATE (verbatim reference)

- `WidgetDefinition` + `registerWidget`/`knownWidgetTypes` live in
  `apps/dashboard/src/features/dashboard/registry/` (Sprint 03). The interface
  itself must **move to the SDK package** and be re-exported by the dashboard
  registry, so authors depend only on `@beechcms/widget-sdk`. (`WidgetDefinition`
  references `ComponentType` — it can't live in `@beechcms/core`, which is
  React-free by ground rule; the SDK package is exactly the home for
  React-adjacent contracts.)
- Data hooks live in `features/dashboard/hooks/use-widget-data.ts` (Sprint 04)
  — move to the SDK, leave a re-export shim or update imports.
- Renderer behavior for unknown types (placeholder, pass-through on save) is
  already correct for the "package uninstalled" scenario — no renderer work.
- Monorepo wiring precedent: `@beechcms/core` is consumed via workspace
  protocol + Turborepo build pipeline (`turbo.json`); copy its arrangement so
  `widget-sdk` builds before the dashboard.

---

## 3. DESIGN NOTES

- **Why hooks move instead of duplicate:** one query-key scheme
  (`['widget', ...]`) keeps cache sharing between built-ins and custom widgets
  fetching the same data.
- **Type collision policy:** `registerWidget` already throws on duplicates
  (Sprint 03). The SDK docs instruct authors to namespace with their package
  name, making collisions a packaging bug, not a runtime ambiguity.
- **`category: 'custom'`** is forced by `registerWidget` when the type lacks
  the `core/` prefix — pickers group third-party widgets predictably,
  whatever the author declared.
- **SSR/Workers safety:** SDK modules must not touch `window` at import time
  (the dashboard may add SSR later; cheap discipline now).

---

## 4. FILES TO TOUCH (checklist)

New package:
- `packages/widget-sdk/package.json`, `tsconfig.json`
- `packages/widget-sdk/src/index.ts` (barrel)
- `packages/widget-sdk/src/define-widget.ts`
- `packages/widget-sdk/src/widget-definition.ts` (moved from dashboard)
- `packages/widget-sdk/src/provider.tsx`
- `packages/widget-sdk/src/hooks/use-widget-data.ts` (moved)
- `packages/widget-sdk/src/components/{widget-shell,widget-empty,widget-error}.tsx`
- tests (vitest): `defineWidget` validation, hooks against a mocked client

Modified:
- root `package.json` workspaces + `turbo.json` if pipeline lists packages explicitly
- `apps/dashboard/package.json` — depend on `@beechcms/widget-sdk`
- `apps/dashboard/src/features/dashboard/registry/*` — import the contract from
  the SDK; `registerWidget` gains the `category: 'custom'` coercion
- `apps/dashboard/src/main.tsx` — `WidgetSdkProvider` + `import './widgets.custom'`
- `apps/dashboard/src/widgets.custom.ts` (new)

Example + docs:
- `examples/widget-hello-world/**`
- `docs/custom-widgets.md` (new), linked from `docs/SYSTEM_MAP.md` and the
  Documentation Map in `CLAUDE.md`

---

## 5. ACCEPTANCE

1. Monorepo builds end-to-end (`pnpm run build` at root); dashboard imports the
   contract solely via the SDK.
2. `defineWidget` rejects `core/foo` and malformed types (tests); accepts
   `@acme/thing` and `acme-widgets/clock`.
3. Example widget: registered via `widgets.custom.ts` in a dev build, it
   appears in the builder picker under **Custom**, configures, saves, renders,
   and — after commenting its registration out — degrades to the
   unavailable-placeholder without breaking the stored layout.
4. SDK hooks hit the mocked client through `WidgetSdkProvider` (no hardcoded
   axios import inside the SDK — test asserts injection).
5. `docs/custom-widgets.md` walks an author from `pnpm init` to a rendered
   widget, including the security paragraph (trusted code, no secrets in
   config, config visible to all authenticated users).

---

## 6. OPEN QUESTIONS (defaults inline)

- **Ship `WidgetShell` as a real component or only its CSS contract?**
  Re-exporting the dashboard's `DashboardWidgetShell` from the SDK inverts the
  dependency direction (SDK must not depend on the app). *Default: move the
  shell component into the SDK and have the dashboard consume it from there —
  same maneuver as the hooks.*
- **Publish `@beechcms/widget-sdk` to pnpm in this sprint?** *Default: build it
  publish-ready (files/exports map), but actual publishing follows the repo's
  existing release process — out of scope.*
- **CLI scaffold (`beech create-widget`)?** Natural follow-up for the dev-cli
  series (`docs/Sprints/dev-cli/`). *Default: out of scope; leave a pointer.*
