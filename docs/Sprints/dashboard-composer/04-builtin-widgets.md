# Dashboard Composer — Sprint 04: Built-in Widgets (KPI, Charts, Table, Text)

> **Audience:** an AI coding agent implementing this sprint end-to-end with no prior
> knowledge of the Beech CMS codebase. Everything needed to implement is inline.
> Do not grep beyond what is referenced here unless something disagrees with the
> live code — in that case, trust live code and note the drift.

Depends on [Sprint 03](./03-widget-registry-and-renderer.md) (registry +
renderer). Adds the configurable widget catalog that makes the builder
(Sprint 05) worth opening: KPI stat card, line/bar/area charts, pie/donut
chart, data table, and a text/notes widget — plus the one missing backend
query (`distribution`) that pie charts need.

---

## 0. ROLE & GROUND RULES

You are a senior full-stack TypeScript engineer working on the **Beech CMS monorepo**.

1. **Botanical Engine invariant.** Any column reference coming from widget
   config is a branch **alias** validated server-side against the seed before
   composing SQL — the existing `D1WidgetRepository` already does this
   (`UNSAFE_COLUMN` error). Never interpolate unvalidated input.
2. **Branch policies.** Data-table column visibility respects
   `resolvePolicies()` — masked/hidden branches never render values.
3. **Charts: `recharts` only** (already at ^3.8.0). Wrap them lazily
   (`React.lazy`) so the dashboard bundle doesn't pay for recharts unless a
   chart widget is on screen.
4. **Repository pattern** for the new `distribution` query: contract in core,
   D1 impl in `apps/api`, route in the existing widget slice.
5. **Docs are English.**

---

## 1. WHAT THIS SPRINT BUILDS

Backend:
1. `IWidgetRepository.distribution(...)` + D1 implementation + tests.
2. `GET /api/widget/distribution/:seed` route.

Frontend (all registered via Sprint 03's `registerWidget`):
3. `core/stat` **extended** — formula-driven KPI card with trend.
4. `core/line-chart`, `core/bar-chart`, `core/area-chart` — one shared
   timeseries base, three registrations.
5. `core/pie-chart` — pie/donut over the new distribution endpoint.
6. `core/data-table` — paginated seed table over `/api/widget/list`.
7. `core/text` — static notes widget (no data fetch).
8. `/widget-lab` page extended with a "Composer widgets" section showcasing
   all of the above.

Existing content widgets (`core/recent-content`, `core/pending-drafts`,
`core/activity-feed`, ...) were already registered in Sprint 03 — no work here.

---

## 2. CURRENT STATE (verbatim reference)

### 2.1 Widget data API — `apps/api/src/widget.ts`, mounted at `/api/widget`

| Route | Repository call | Notes |
|---|---|---|
| `GET /aggregate/:seed?formula&window` | `aggregate(seed, formula, window)` | formula = JSON `AggregateFormula` |
| `GET /growth/:seed?formula&window` | `growth(...)` → `{currentValue, previousValue}` | trend pairs |
| `GET /leaderboard/:seed?scoreColumn&limit&orderDirection` | `leaderboard(...)` | |
| `GET /list/:seed?limit&offset&search&filters&orderByColumn&orderDirection` | `list(...)` → `{entries, totalCount}` | entries are raw DB records; deserialize client-side or via `deserializeFromDb` |
| `GET /timeseries/:seed?formula&window&groupColumn` | `timeseries(...)` → `TimeseriesPoint[]` | date-bucketed, no zero-fill |

### 2.2 Core contract — `packages/core/src/widget/widget.repository.ts`

`AggregateFormula` is a discriminated union:
`count | sum | avg | min | max | countWhere | percentageOf`.
`TimeWindow = 'week' | 'month' | 'year' | 'all'`. The interface doc mandates:
validate aliases against the seed, parameterize values, hardcode SQL keywords.

### 2.3 Missing piece: group-by-value distribution

`timeseries` groups by **date** only. Pie/donut needs counts grouped by a
column's **values** (e.g. entries per `status`, per `category`). Nothing in the
repo provides this today — it is this sprint's only backend addition.

### 2.4 Presentational building blocks

- `DashboardWidgetShell` — card chrome used by every v2 widget.
- `components/widgets/_parts/widget-empty.tsx`, `widget-error.tsx` — states.
- `StatCard` (`components/stat-card.tsx`) — title/value/icon/trend layout to
  reuse for the KPI card.
- `components/ui/data-table.tsx` + `lib/dynamic-columns.tsx`
  (`generateColumns(seed, ...)`) — TanStack Table v8 wiring + policy-aware
  column generation used by the content list. The data-table widget reuses
  `generateColumns` in read-only mode.

---

## 3. BACKEND — `distribution`

### 3.1 Contract (add to `packages/core/src/widget/widget.repository.ts`)

```ts
export interface DistributionSlice {
  label: string    // stringified column value; NULL bucket → '∅'
  value: number    // count of entries
}

export interface IWidgetRepository {
  // ...existing methods...
  /**
   * Counts entries grouped by the values of `column` within the window,
   * descending by count, capped at `limit` slices. Implementations must
   * validate `column` against the seed (UNSAFE_COLUMN on failure) and must
   * return [] on empty results. Values beyond `limit` are NOT merged into
   * an 'other' bucket — the client decides how to present truncation.
   */
  distribution(seed: Seed, column: string, window: TimeWindow, limit: number): Promise<DistributionSlice[]>
}
```

### 3.2 D1 implementation — `apps/api/src/shared/d1-widget.repository.ts`

Follow the existing safe-column resolution used by `leaderboard`/`timeseries`
(alias → `br_XX` column via the seed, reject otherwise). Shape:

```sql
SELECT <col> AS label, COUNT(*) AS value
FROM content_<slug>
[WHERE created_at >= ?]      -- window bracket, same helper as timeseries
GROUP BY <col>
ORDER BY value DESC
LIMIT ?
```

### 3.3 Route — `apps/api/src/widget.ts`

`GET /distribution/:seed?column&window&limit` mirroring the
`leaderboard` route: 404 unknown seed, 400 missing column, bounded `limit`
(default 8, max 24), `UNSAFE_COLUMN` → 400 problem. Add handler tests next to
the existing widget route tests.

---

## 4. FRONTEND WIDGETS

Shared data hooks first — `features/dashboard/api/widget-data.api.ts` +
`features/dashboard/hooks/use-widget-data.ts` (new): thin TanStack Query
wrappers `useWidgetAggregate`, `useWidgetGrowth`, `useWidgetTimeseries`,
`useWidgetDistribution`, `useWidgetList`, keyed on
`['widget', endpoint, seedSlug, params]`, `staleTime` 60 s. Sprint 07 lifts
these into the SDK — keep them dependency-free beyond `@/lib/api`.

### 4.1 `core/stat` (extend the Sprint 03 registration)

Config:
```ts
{
  // preset mode (legacy, kept): one of the four statKeys, OR formula mode:
  statKey?: 'total' | 'visitors' | 'traffic' | 'storage',
  seedSlug?: string,
  formula?: AggregateFormula,          // default { op: 'count' }
  window?: TimeWindow,                 // default 'month'
  label?: string,
  icon?: string,                       // lucide name
  showTrend?: boolean,                 // default true → /widget/growth
}
```
Formula mode renders via `StatCard`: value from `useWidgetAggregate`, trend
percentage computed from `useWidgetGrowth` (`(current-previous)/previous`,
guard divide-by-zero). `statKey` mode keeps the Sprint 03 behavior.

### 4.2 Timeseries charts — `core/line-chart` | `core/bar-chart` | `core/area-chart`

One component `TimeseriesChartWidget` with a `kind: 'line'|'bar'|'area'` prop;
three `registerWidget` entries (category `charts`, `minColumnSpan: 4`).

Config:
```ts
{
  seedSlug: string,
  formula?: AggregateFormula,    // default { op: 'count' }
  window?: TimeWindow,           // default 'month'
  groupColumn?: string,          // default 'created_at'
  color?: string,                // CSS var token, default 'var(--chart-1)'
}
```
Implementation notes: `ResponsiveContainer` inside `DashboardWidgetShell`;
axis/tooltip styling from Tailwind CSS variables (match the dark theme);
empty result → `WidgetEmpty`; remember `timeseries` does **not** zero-fill —
fill gaps client-side for line/area so trends don't lie.

### 4.3 `core/pie-chart`

Config:
```ts
{
  seedSlug: string,
  column: string,            // branch alias to group by
  window?: TimeWindow,       // default 'all'
  donut?: boolean,           // default true
  limit?: number,            // default 8
}
```
Data via `useWidgetDistribution`. Legend with counts; slices colored from the
`--chart-1..5` palette cycling.

### 4.4 `core/data-table`

Config:
```ts
{
  seedSlug: string,
  columns?: string[],        // branch aliases; default = first 4 layoutable branches
  pageSize?: number,         // default 5, max 25
  orderByColumn?: string,
  orderDirection?: 'ASC' | 'DESC',
}
```
Data via `useWidgetList` (limit/offset paging). Columns through
`generateColumns(seed, ...)` filtered to the configured aliases — this keeps
policy enforcement (masked/hidden) in one place. Row click navigates to the
entry editor (`/content/:slug/:id`). Compact density; no toolbar/selection.

### 4.5 `core/text`

Config: `{ content: string, align?: 'left'|'center' }`. Renders the text with
line breaks preserved (`whitespace-pre-wrap`), muted typography inside the
shell. **No HTML rendering** — plain text only (XSS surface stays closed; the
TipTap/BlockNote pipeline is overkill here). Category `system`,
`minColumnSpan: 2`.

### 4.6 Widget Lab

Add a "Composer widgets" `LabSection` to `pages/widget-lab.tsx` mounting each
new widget with a representative config against the first available seed.
This is the manual QA surface — keep it exhaustive.

---

## 5. FILES TO TOUCH (checklist)

Core:
- `packages/core/src/widget/widget.repository.ts` — `DistributionSlice`, method
- barrel export if `DistributionSlice` isn't re-exported automatically

API:
- `apps/api/src/shared/d1-widget.repository.ts` — `distribution` impl
- `apps/api/src/widget.ts` — route
- existing widget repository/handler test files — add distribution cases

Dashboard (new):
- `features/dashboard/api/widget-data.api.ts`
- `features/dashboard/hooks/use-widget-data.ts`
- `features/dashboard/components/widgets/stat-widget.tsx` (formula mode)
- `features/dashboard/components/widgets/timeseries-chart-widget.tsx`
- `features/dashboard/components/widgets/pie-chart-widget.tsx`
- `features/dashboard/components/widgets/data-table-widget.tsx`
- `features/dashboard/components/widgets/text-widget.tsx`
- registrations in `features/dashboard/registry/builtin-widgets.tsx`
- tests under `src/test/dashboard/widgets/`

Modified:
- `apps/dashboard/src/pages/widget-lab.tsx`
- locale files — `dashboard.widgets.{lineChart,barChart,areaChart,pieChart,dataTable,text}.*`

---

## 6. ACCEPTANCE

1. `npx tsc --noEmit` green in core, api, dashboard; all `npm run test` suites pass.
2. **distribution:** repository test over D1TestDatabase — seeded rows grouped
   correctly, NULL bucket labeled, limit respected, window bracket applied,
   unsafe column rejected. Handler test: 200 happy path, 400 missing/unsafe
   column, 404 unknown seed.
3. Each new widget: renders with minimal valid config; empty-data state; config
   parse failure falls back to `defaultConfig` (renderer behavior from
   Sprint 03 — assert one widget as regression).
4. recharts is **not** in the initial dashboard chunk (verify via
   `vite build` output) when no chart widget is in the layout.
5. `core/data-table` never renders a value for a branch with
   `visibility: 'hidden'|'masked'` even if listed in `config.columns` (test).
6. `/widget-lab` shows every new widget.
7. `docs/api-reference.md` documents `GET /api/widget/distribution/:seed`.

---

## 7. OPEN QUESTIONS (defaults inline)

- **Zero-fill in the API instead of client-side?** Touching `timeseries`
  semantics risks the existing consumers. *Default: client-side fill.*
- **'Other' bucket for pie truncation?** *Default: no — show top-N and a
  "+N more" caption; revisit if users ask.*
- **Leaderboard widget?** The API exists (`/widget/leaderboard/:seed`). *Default:
  out of scope here; trivially added post-series as a follow-up registration.*
