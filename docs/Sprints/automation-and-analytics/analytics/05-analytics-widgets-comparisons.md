You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

Do NOT explore the codebase further. All relevant context is provided in
this prompt. Read it fully before writing any code.

This sprint covers **Sprint 5 of the Analytics & GA4 milestone**:
additive polish on top of the Analytics page from Sprint 04 — comparison
mode parity, drill-downs, CSV export, saved range presets.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS
==========================================================================

Sprint 04 ships a working Analytics page with comparison-capable
endpoints, but several widgets render only the primary range. This
sprint closes that gap and adds the "advanced editor" behaviours users
expect from a Beech-style page (drill-down via `Sheet`, CSV export per
widget, saved range presets) — entirely inside the existing shadcn
component vocabulary + shadcn Charts.

This sprint touches **only** `apps/dashboard/src/features/analytics/`
and adds no new runtime dependencies.

==========================================================================
SECTION 2 — DELIVERABLES
==========================================================================

### 2.1 Comparison parity for every widget

| Widget | Comparison rendering |
|---|---|
| Overview KPIs (Row 1) | already delta-badged in Sprint 04 — verify |
| World map | second tooltip line: `Δ +12% vs. prev. period` |
| Region donut | inline `<DeltaBadge>` next to each top slice |
| Performance pulse | dashed overlay line for `compare`; verified in 04 |
| Top Pages table | extra column "Δ" with `<DeltaBadge>` |
| By Seed table | same as Top Pages |
| Devices bars | inline `<DeltaBadge>` per bar |
| Referrers bars | inline `<DeltaBadge>` per bar |
| Realtime | no comparison (live-only) |

`<DeltaBadge>` (already exists from Sprint 04) gains a `variant`
prop (`'inline' | 'pill' | 'compact'`) so the same component is reused
in tables, tooltips, and headers.

### 2.2 Drill-down dialogs

Three drill-downs, all using the shadcn `Sheet` from the right side.
Each fetches its detail via a dedicated TanStack Query call **only when
opened** (not eagerly).

- **Region drill-down** — opened from the donut or any country bar.
  Shows: full country list with paginated table, share %, delta,
  small in-line `BarChart` for top-10 visitor counts.
- **Page drill-down** — opened from any row in the Top Pages table.
  Shows: full path, title, KPIs, time-series of page views for the
  selected range, top referrers feeding into this page.
- **Referrer drill-down** — opened from any row of the Referrers
  widget. Shows: `source/medium`, KPIs, time-series, top landing pages
  for visitors arriving from this referrer.

All three drill-downs reuse `dashboard-widget-shell` for sub-widgets
inside the sheet to keep visual rhythm.

### 2.3 CSV export per widget

Each widget's header (`<DashboardWidgetShell action={…}>`) gains a
"Download CSV" action when data is present. Implementation:

- Pure helper `widgets-to-csv.ts` (one converter per widget type).
- Filename pattern: `analytics-{widget}-{startDate}_{endDate}.csv`.
- UTF-8 BOM prefix for Excel compatibility.
- No third-party CSV library: a 30-line generator with proper escaping
  (quotes, commas, newlines).

Realtime is **not** exportable (snapshot, not historical).

### 2.4 Saved range presets

Users can save the current `{ preset | custom range }` + `compareTo`
+ `series` selection to `localStorage` under
`beech_analytics_saved_ranges` (max 5 entries, FIFO eviction). The
range picker grows a "Saved" section listing them; each entry has a
delete (×) affordance.

No backend persistence (single-user-per-browser is acceptable for v1).

### 2.5 URL state hardening

Sprint 04 already pushes range/compare/series to the URL. This sprint
adds:

- `?drillRegion=IT` opens the region drill-down on page load if the
  parameter is present.
- `?drillPage=/articoli/foo` opens the page drill-down on load.
- `?drillReferrer=google/organic` opens the referrer drill-down on load.

This enables sharing a "look at THIS country in our analytics" link
across the team.

==========================================================================
SECTION 3 — RULES
==========================================================================

- Zero new runtime dependencies.
- All comparisons computed on the **client**, from the `{ data, compare }`
  envelope returned by the API. No new endpoints in this sprint.
- A widget without `compare` data in its query response must render
  identically to its Sprint 04 form — comparison is purely additive.
- The CSV converters live in `parts/` and have unit tests.
- All new strings are i18n-routed under the `analytics` namespace.

==========================================================================
SECTION 4 — TESTS
==========================================================================

- `widgets-to-csv.test.ts` — one test per widget converter; covers
  escaping of values containing `"`, `,`, `\n`.
- `delta-badge.test.tsx` — renders `↑`, `↓`, `=` correctly for
  positive / negative / zero deltas; `variant` prop produces the
  expected DOM shape.
- `saved-ranges.test.ts` — pure store with `localStorage` mock:
  add / list / delete / FIFO eviction at 6th entry.
- One smoke test per drill-down `Sheet`: opens on trigger click, shows
  skeleton, then shows fetched data; closes on Escape.

==========================================================================
SECTION 5 — COMPLETION CHECKLIST
==========================================================================

- [ ] Every widget in §2.1 renders comparison data when present.
- [ ] All three drill-downs (§2.2) implemented and lazy-fetched.
- [ ] CSV export action on every non-realtime widget; tests in §4 green.
- [ ] Saved range presets in `localStorage`; UI section in range picker.
- [ ] URL parameters from §2.5 open the matching drill-down on load.
- [ ] No new entries in `package.json`.
- [ ] i18n keys added to both `en.json` and `it.json`.
- [ ] `docs/frontend-guide.md` §9 (added in Sprint 04) extended with a
      "Drill-downs and CSV export" subsection.
