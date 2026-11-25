# Sprint Plan — Analytics & GA4 Integration

Implementation roadmap for the **external Analytics layer** in BeechCMS:
a provider-driven abstraction (interface in `@beechcms/core`, GA4 as the
first concrete implementation) plus a fully shadcn-styled Analytics page
that mirrors the existing Dashboard widget approach (bento grid, widget
registry, TanStack Query hooks).

> The internal `IAnalyticsRepository` (D1 counters for `requests` / `seed`)
> already exists and stays **untouched**. This roadmap is purely additive:
> a separate contract for **visitor / traffic / engagement** analytics
> sourced from external providers. Do not merge the two interfaces.

| # | Sprint | Scope |
|---|---|---|
| 1 | [01-analytics-core-contract.md](./01-analytics-core-contract.md) | `IAnalyticsProvider` interface in `@beechcms/core`, neutral DTOs (`TrafficOverview`, `GeoBreakdown`, `PagePerformance`, `TimeSeriesPoint`, `DeviceBreakdown`, `ReferrerBreakdown`, `RealtimeSnapshot`), `NoOpAnalyticsProvider` stub, normalized `AnalyticsRange` (preset + custom). Zero Hono / Google / Cloudflare imports in core. |
| 2 | [02-ga4-provider.md](./02-ga4-provider.md) | `apps/api/src/features/analytics-provider/providers/ga4-analytics.provider.ts` — Google Analytics Data API v1 client (service-account JWT via `jose`, batchRunReports), schema mapping to neutral DTOs, ISO-3166 country normalization, error envelope, secret handling. Mirrors the **email module gold standard** layout (`index.ts`, `*.provider.ts`, `*.service.ts`, `*.types.ts`, `providers/ga4-…`). |
| 3 | [03-analytics-api-slice.md](./03-analytics-api-slice.md) | Backend VSA slice `apps/api/src/features/analytics/` — thin Hono handlers for `GET /api/analytics/overview`, `/geo`, `/pages`, `/timeseries`, `/devices`, `/referrers`, `/realtime`, plus `/health`. RFC 7807 errors, response caching (`Cache-Control: private, max-age=60`), rate-limited per JWT. Provider injected via `analyticsProviderMiddleware`; no GA4 import outside `shared/`. |
| 4 | [04-analytics-dashboard-ui.md](./04-analytics-dashboard-ui.md) | Frontend slice `apps/dashboard/src/features/analytics/` — bento grid page reusing `dashboard-widget-shell.tsx`, `widget-registry.tsx`, and `widget-empty/error` parts. Widgets: World Map + Region Pie, Top Pages performance, Per-Seed table, Realtime visitors. Range selector + comparison toggle. Chart vocabulary: **shadcn Charts** (https://ui.shadcn.com/docs/components/radix/chart) as the default — Area, Bar, Pie, Line, Radial — themed via `var(--chart-*)`. A second library is added **only** for what shadcn Charts cannot express (world map; possibly treemap/sankey in future): candidate map libs Terrae / Shadcn Map / react-simple-maps, decided in this sprint's discussion gate. |
| 5 | [05-analytics-widgets-comparisons.md](./05-analytics-widgets-comparisons.md) | Period-over-period comparison toggle in every widget, delta badges (↑/↓/=), drill-down dialog for region / page / referrer, CSV export per widget, saved range presets in `localStorage`. Closes the parity gap with GA4's "Insights" UX while keeping all rendering inside the Beech component vocabulary. |

## Sequencing rules

- Sprints 1 → 2 → 3 must be executed strictly in order. Each finalises a
  contract the next depends on (core types → provider → API slice).
- Sprint 4 can start as soon as Sprint 3 exposes its endpoints, but the
  **UI design discussion (§ Discussion checkpoints in 04)** is a required
  gate before any component code lands.
- Sprint 5 is purely additive on top of Sprint 4. It can be parallelised
  with Sprint 4 polish, but must not block the initial Analytics page
  shipping.
- A sprint is "done" only when its checklist is fully green AND existing
  tests still pass.

## Architectural non-negotiables

These mirror `docs/vertical-slice.md` and `docs/SYSTEM_MAP.md` and apply to
every sprint in this folder:

- **The Email module is the gold standard.** Replicate its layout exactly
  for the analytics-provider feature (`*.provider.ts` interface, factory
  in `*.service.ts`, concrete implementation under `providers/`, public
  API via `index.ts` only).
- **Zero GA4 SDK / `googleapis` imports anywhere outside
  `apps/api/src/features/analytics-provider/providers/`.** Handlers see
  only `IAnalyticsProvider` via `c.get('analyticsProvider')`.
- **Zero raw GA4 response shapes in the dashboard.** The frontend consumes
  only the neutral DTOs defined in Sprint 1. Swapping GA4 → Plausible /
  Umami in the future must not touch a single dashboard component.
- **No new field types in the dashboard.** All widgets are composed from
  existing shadcn primitives (`Card`, `Tabs`, `Badge`, `Skeleton`,
  `ScrollArea`, `Tooltip`, `Sheet`), recharts, and Lucide icons. The map
  library is the only new dependency the UI may add — and only after
  approval in Sprint 4.
- **`c.var.analyticsProvider` is the only injection surface.** No factory
  call inside handlers. No environment variable reads inside handlers.
- **Service-account credentials live in Worker secrets** (`GA4_PROPERTY_ID`,
  `GA4_CLIENT_EMAIL`, `GA4_PRIVATE_KEY`). Never logged, never exposed via
  any endpoint, never sent to the dashboard.

## Explicit non-goals (across all five sprints)

- **No event ingestion from the public site.** Beech does not run its own
  tracker; analytics are read from GA4 (or any future provider) only.
- **No write operations against GA4** (no custom dimension/metric
  creation from the dashboard). Reporting only.
- **No multi-property dashboards.** One GA4 property per environment.
  Multi-property comes in a future "Analytics v2" plan.
- **No A/B testing / experimentation UI.** Out of scope; belongs to a
  separate growth-tools roadmap.
- **No automatic data warehousing / BigQuery export.** Beech queries GA4
  on demand and caches at the edge (60 s).
- **No replacement of the internal `IAnalyticsRepository`.** D1 counters
  remain the source of truth for in-app request volume and cockpit stats.

## Discussion checkpoints (UI)

Sprint 4 has explicit "DISCUSS BEFORE CODING" sections. The user has
flagged the Analytics page UI as a topic to be aligned in depth before
component work begins. Treat each `> DISCUSS:` block in 04 as a hard gate.

## Related documents

- [../../vertical-slice.md](../../vertical-slice.md) — VSA rules every
  sprint here obeys.
- [../../SYSTEM_MAP.md](../../SYSTEM_MAP.md) — middleware injection model
  and conventions.
- [../../api-reference.md](../../api-reference.md) — to be extended with
  `§11 Analytics API` after Sprint 3 lands.
- [../automation/02-automation-runner.md](../automation/02-automation-runner.md)
  — reference precedent for the "interface in core, runner in API" pattern
  this roadmap replicates.
