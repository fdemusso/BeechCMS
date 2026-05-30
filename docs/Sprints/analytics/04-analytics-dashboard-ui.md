You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

Do NOT explore the codebase further. All relevant context is provided in
this prompt. Read it fully before writing any code.

This sprint covers **Sprint 4 of the Analytics & GA4 milestone**: the
dashboard slice that renders the Analytics page. Sprints 01–03 are
merged. The endpoints at `/api/analytics/*` already work.

### Stack

- React 19.2 + Vite 7.3
- TanStack Query v5
- shadcn/ui + Tailwind v4 + Lucide
- **Charts: shadcn Charts (Radix-Recharts integration —
  https://ui.shadcn.com/docs/components/radix/chart).** Use this as the
  primary chart vocabulary. Only when shadcn Charts cannot express a
  visualisation (world map, treemap, sankey) we evaluate one additional
  library — see §3.3.
- i18n via `react-i18next`

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS
==========================================================================

`apps/dashboard/src/pages/analytics.tsx` is currently a placeholder. This
sprint replaces it with a real bento-grid Analytics page that mirrors the
Dashboard page's widget architecture:

- bento grid layout,
- `dashboard-widget-shell.tsx` reused for every card,
- `widget-empty.tsx` / `widget-error.tsx` for empty/error states,
- TanStack Query hooks, one per endpoint, with 5-minute `staleTime`,
- Skeletons everywhere; no widget ever flashes "0" while loading.

Every visual primitive comes from shadcn (Cards, Tabs, Sheet, Badge,
ScrollArea, Tooltip, Skeleton) + shadcn Charts. The page must feel like
the Dashboard — not like Google Analytics.

==========================================================================
SECTION 2 — DISCUSSION CHECKPOINTS (HARD GATES)
==========================================================================

> The user has flagged the Analytics UI as a topic to align in depth
> before any component code lands. **Do not start coding §3 until each
> of these is resolved in chat.**

- **`> DISCUSS:`** Final widget inventory and bento grid layout. Initial
  proposal in §3.1 is a starting point, not a contract.
- **`> DISCUSS:`** World map library choice (Terrae vs. Shadcn Map vs.
  react-simple-maps). Constraints: must be tree-shakeable, must accept
  a `countryCode → value` map, must theme via CSS variables (dark mode
  parity with the rest of the dashboard).
- **`> DISCUSS:`** Default range. Proposal: `last_28_days` with
  `compareTo = previous_28_days`. GA4 default is 28d; matches user
  intuition.
- **`> DISCUSS:`** Realtime widget update strategy. Proposal: TanStack
  Query `refetchInterval: 30_000` while the tab is visible.
- **`> DISCUSS:`** Per-seed analytics. Proposal: extract `seed_slug`
  from `pagePath` regex against the Public API routing pattern. Needs
  agreement on the slug-from-path strategy.
- **`> DISCUSS:`** Empty-state when GA4 is not configured. Proposal: a
  single full-page card with a "Configure GA4" CTA and a link to setup
  docs — gated by `GET /api/analytics/health` returning 503.

==========================================================================
SECTION 3 — DELIVERABLES (after discussion is closed)
==========================================================================

### 3.1 Bento grid — initial widget inventory

The layout takes inspiration from the Dashboard page (`dashboard-page.tsx`
+ `widget-registry.tsx`). It is **not** edge-to-edge full-width: the
grid has the same outer padding as the Dashboard.

Row 1 — Overview KPIs (4 small cards, `<StatCard>` reused):
- Visitors • Sessions • Page views • Avg engagement time
- Each shows the delta vs. comparison range as a ↑/↓/= badge.

Row 2 — Geography (large, spans 2 columns of 3):
- **Left (2/3):** World map. Country fill intensity ∝ `visitors`.
  Hover tooltip via shadcn `Tooltip`.
- **Right (1/3):** Region donut (shadcn Charts `PieChart` variant).
  Slices for countries with `share ≥ 0.15`; everything else aggregated
  into "Other regions". Clicking a slice (or the legend) drills down
  into a `Sheet` listing the full breakdown.

Row 3 — Performance pulse (mirrors the Dashboard's `content-pulse`):
- Time-series chart (shadcn Charts `AreaChart`) for the selected
  series (`visitors` default), with a `Tabs` switcher
  (visitors / sessions / page views / engagement).
- Comparison overlay as a dashed line when comparison is enabled.

Row 4 — Per-seed / top pages (full-width):
- A shadcn `Tabs` with two tabs:
  - **Top Pages** — table built on shadcn `Table` + TanStack Table:
    columns `path`, `title`, `views`, `avgEngagement`, `entries`,
    `exits`. Row click opens a `Sheet` with the full path data and
    referrers for that page.
  - **By Seed** — same table, but aggregated by extracting the seed
    slug from the path. Empty when no path matches a known seed.

Row 5 — Side-by-side (2 columns):
- **Devices** — shadcn Charts `BarChart` horizontal, three bars
  (desktop / mobile / tablet) with share %.
- **Referrers** — shadcn Charts `BarChart` horizontal top-10, with
  `source / medium` chips.

Floating top-right of the page:
- `<RangePicker>` — preset dropdown + custom range; emits
  `AnalyticsRange`.
- `<CompareToggle>` — pill toggle; when ON, all widgets render the
  comparison delta and the time-series overlay.
- `<RealtimeBadge>` — small card top-right showing `activeUsers`, with
  a dotted pulse animation. Click expands a `Popover` listing top
  active countries and pages.

### 3.2 Folder layout

```
apps/dashboard/src/features/analytics/
├── index.ts                          # Public API barrel
├── analytics.api.ts                  # Axios calls, one per endpoint
├── query-keys.ts                     # ['analytics', endpoint, range, …]
├── hooks/
│   ├── use-analytics-health.ts
│   ├── use-analytics-overview.ts
│   ├── use-analytics-geo.ts
│   ├── use-analytics-pages.ts
│   ├── use-analytics-timeseries.ts
│   ├── use-analytics-devices.ts
│   ├── use-analytics-referrers.ts
│   └── use-analytics-realtime.ts
├── components/
│   ├── analytics-page.tsx            # Bento grid container
│   ├── analytics-range-picker.tsx
│   ├── analytics-compare-toggle.tsx
│   ├── analytics-realtime-badge.tsx
│   ├── widgets/
│   │   ├── overview-kpi-widget.tsx
│   │   ├── world-map-widget.tsx
│   │   ├── region-donut-widget.tsx
│   │   ├── performance-pulse-widget.tsx
│   │   ├── top-pages-widget.tsx
│   │   ├── by-seed-widget.tsx
│   │   ├── devices-widget.tsx
│   │   └── referrers-widget.tsx
│   └── parts/
│       ├── delta-badge.tsx
│       └── seed-from-path.ts         # Pure helper
├── types/
│   └── range.ts                      # Range / Preset / shared FE types
└── __tests__/
    └── seed-from-path.test.ts
```

`index.ts` exports **only** `<AnalyticsPage />` (and nothing else for now).

`apps/dashboard/src/pages/analytics.tsx` becomes a 5-line shell that
imports `<AnalyticsPage />` and wraps it with `SidebarProvider` /
`SiteHeader` (consistent with `dashboard-page.tsx`).

### 3.3 Charting decisions

- **Default:** shadcn Charts (Radix-Recharts wrappers) — Area, Bar, Pie,
  Line, Radial. Documented at https://ui.shadcn.com/docs/components/radix/chart .
  Use the official theme tokens (`var(--chart-1)` … `var(--chart-5)`) for
  series colors. This guarantees dark-mode parity for free.
- **World map:** shadcn Charts does **not** ship a map. Pick one of:
  1. **Terrae** (Mapbox-backed, beautiful, but adds a runtime token).
  2. **Shadcn Map / mapcn** (Leaflet-backed, copy-paste friendly).
  3. **react-simple-maps** (zero-dep SVG, no tile server, smallest
     bundle — likely the right call for our purposes).
  The decision happens in §2's discussion gate. Whichever wins is the
  **only** new runtime dependency this sprint introduces.
- **Treemap / Sankey:** not used in this sprint. If a future widget
  needs one, we'll evaluate Nivo for that single component — but stay
  inside shadcn Charts otherwise to keep the bundle and the design
  language consistent.

### 3.4 Reused dashboard primitives

These are imported, not duplicated:

| From | What |
|---|---|
| `@/features/dashboard/components/dashboard-widget-shell` | Widget card frame (title, subtitle, action, skeleton, error boundary) |
| `@/features/dashboard/components/stat-card` | KPI tile for Row 1 |
| `@/features/dashboard/components/widgets/_parts/widget-empty` | Empty state |
| `@/features/dashboard/components/widgets/_parts/widget-error` | Error state |
| `@/components/ui/*` | Card, Tabs, Sheet, Badge, Skeleton, ScrollArea, Tooltip, Popover, Table |
| `@/components/ui/chart` | shadcn Charts wrappers |

If a primitive is missing (e.g. no `delta-badge.tsx` exists yet),
implement it inside `analytics/components/parts/` first; promote to
`@/components/ui/` only when reused outside analytics.

### 3.5 i18n

All visible strings go through `react-i18next` under the
`analytics` namespace. Add `apps/dashboard/src/locales/{en,it}.json`
keys: `analytics.range.*`, `analytics.widget.*`, `analytics.empty.*`,
`analytics.error.*`. No hard-coded English/Italian in components.

### 3.6 Sidebar entry

The "Analytics" entry already exists in `app-sidebar.tsx`. Confirm the
route `/admin/analytics` resolves to the new page; no sidebar config
changes expected.

==========================================================================
SECTION 4 — RULES
==========================================================================

- VSA: no component outside `features/analytics/` imports from inside
  the slice except via `index.ts`.
- No direct `api.get('/api/analytics/...')` calls in components — only
  the hooks in `hooks/` may touch `analytics.api.ts`.
- No `switch (branch.type)` or any FieldRenderer logic — analytics is
  not a content type.
- No new state library. TanStack Query for server state, `useState` for
  local UI state, URL search params for shareable filters (`?preset=…`).
- Every widget handles `isLoading`, `isError`, and `data` empty case
  using the existing `widget-empty` / `widget-error` parts.
- Skeletons match the eventual content height (no layout shift).
- All numbers formatted via `Intl.NumberFormat` with the user locale;
  durations rendered as `1m 24s` via a pure `formatDuration` helper.

==========================================================================
SECTION 5 — TESTS
==========================================================================

- `seed-from-path.test.ts` — exhaustive table-driven test (slash
  trimming, query strings, sub-paths, locale prefixes).
- One smoke render test per widget asserting:
  - skeleton in loading state,
  - empty-state component when `data.entries.length === 0`,
  - error state when the query errors,
  - delta badge appears iff `compare` is present.
- Use `msw` (already in the dashboard test stack) to mock
  `/api/analytics/*`.

==========================================================================
SECTION 6 — COMPLETION CHECKLIST
==========================================================================

- [ ] All `> DISCUSS:` gates in §2 are resolved in chat **before**
      writing components.
- [ ] Folder layout matches §3.2 exactly.
- [ ] `pages/analytics.tsx` is a thin shell that mounts
      `<AnalyticsPage />`.
- [ ] shadcn Charts is used for every standard chart; the chosen map
      library is the **only** new runtime dependency.
- [ ] Every widget reuses `dashboard-widget-shell` and the
      `widget-empty` / `widget-error` parts.
- [ ] Range, compare, and series state survive a page reload via URL
      search params (`?preset=…&compare=1&series=visitors`).
- [ ] i18n keys added to both `en.json` and `it.json`.
- [ ] All widget smoke tests in §5 pass.
- [ ] `npm run lint -w apps/dashboard` and `npm run test -w apps/dashboard`
      green.
- [ ] `docs/frontend-guide.md` extended with `§9 Analytics widgets`
      mirroring the Dashboard section's structure.
- [ ] `SYSTEM_MAP.md` `apps/dashboard/src/features/` block updated with
      the new slice entry.
