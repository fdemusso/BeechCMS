You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

Do NOT explore the codebase further. All relevant context is provided in
this prompt. Read it fully before writing any code.

This sprint covers **Sprint 1 of the Analytics & GA4 milestone**:
introducing the neutral `IAnalyticsProvider` contract and DTOs in
`@beechcms/core`. No HTTP, no GA4, no dashboard work yet.

### Stack

- API: Hono on Cloudflare Workers, D1 (SQLite), R2
- Dashboard: React + TanStack Query + axios
- Shared package: `@beechcms/core` (pure TypeScript, zero HTTP/cloud deps)
- Monorepo: Turborepo

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS
==========================================================================

The dashboard must show traffic / geo / engagement analytics without ever
binding to a specific vendor. Following the `IEmailProvider` precedent,
the contract for "external analytics" lives in `@beechcms/core` as a pure
interface. GA4 will be the first concrete implementation (Sprint 02), but
the dashboard and the API slice (Sprints 03/04) will only ever know the
interface.

**Why a new interface and not an extension of `IAnalyticsRepository`?**
`IAnalyticsRepository` is the **internal** D1-backed counter (per-day,
per-seed request volume) used by the cockpit. External analytics have a
different scope (visitors, sessions, geo, devices, referrers, real-time)
and a different source of truth (GA4). Merging them would couple two
unrelated lifecycles and break the email-module separation.

==========================================================================
SECTION 2 — DELIVERABLES
==========================================================================

### 2.1 New files in `packages/core/src/`

```
analytics-provider/
├── analytics.provider.ts        # IAnalyticsProvider interface
├── analytics.types.ts           # All neutral DTOs + AnalyticsRange
├── analytics.errors.ts          # AnalyticsProviderError + error codes
└── analytics.stub.ts            # NoOpAnalyticsProvider (test default)
```

A subfolder is acceptable here (mirrors the email module sitting in
`apps/api/src/features/email/`); we keep it inside `packages/core/src/`
because the contract is shared across apps.

### 2.2 Updated barrel

`packages/core/src/index.ts` must re-export:
- `IAnalyticsProvider`
- All DTO types (see §3)
- `AnalyticsProviderError`, `ANALYTICS_ERROR_CODES`
- `NoOpAnalyticsProvider`

==========================================================================
SECTION 3 — CONTRACT SHAPE
==========================================================================

### 3.1 Range primitive

```typescript
export type AnalyticsRangePreset =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_28_days'
  | 'last_90_days'
  | 'last_12_months';

export interface AnalyticsRange {
  /** Inclusive ISO date (YYYY-MM-DD) in UTC. */
  startDate: string;
  /** Inclusive ISO date (YYYY-MM-DD) in UTC. */
  endDate: string;
  /** Optional preset hint (drives provider-side optimisations). */
  preset?: AnalyticsRangePreset;
  /** Optional comparison range — same shape; used for delta widgets. */
  compareTo?: { startDate: string; endDate: string };
}
```

The provider receives only the resolved `startDate`/`endDate`. Preset →
date resolution lives in a pure helper in `analytics.types.ts`
(`resolveAnalyticsRange(preset, today?: Date): AnalyticsRange`).

### 3.2 Neutral DTOs

```typescript
export interface TrafficOverview {
  visitors: number;
  sessions: number;
  pageViews: number;
  avgEngagementSeconds: number;
  bounceRate: number;        // 0..1
}

export interface GeoBreakdownEntry {
  countryCode: string;       // ISO 3166-1 alpha-2; 'ZZ' for unknown
  countryName: string;       // English display name
  visitors: number;
  share: number;             // 0..1, sums to 1 across entries
}
export interface GeoBreakdown {
  entries: GeoBreakdownEntry[];
  totalVisitors: number;
}

export interface PagePerformanceEntry {
  path: string;              // normalised, leading slash, no query string
  title: string | null;
  views: number;
  avgEngagementSeconds: number;
  entries: number;           // sessions that started here
  exits: number;
}
export interface PagePerformance {
  entries: PagePerformanceEntry[];
}

export interface TimeSeriesPoint {
  /** ISO date (YYYY-MM-DD) bucket start, UTC. */
  date: string;
  value: number;
}
export type AnalyticsSeries =
  | 'visitors'
  | 'sessions'
  | 'pageViews'
  | 'avgEngagementSeconds';

export interface DeviceBreakdownEntry {
  category: 'desktop' | 'mobile' | 'tablet' | 'other';
  visitors: number;
  share: number;
}
export interface DeviceBreakdown {
  entries: DeviceBreakdownEntry[];
}

export interface ReferrerBreakdownEntry {
  source: string;            // 'google', 'direct', 'newsletter', host, …
  medium: string;            // 'organic', 'referral', 'email', '(none)', …
  visitors: number;
  share: number;
}
export interface ReferrerBreakdown {
  entries: ReferrerBreakdownEntry[];
}

export interface RealtimeSnapshot {
  activeUsers: number;
  /** Top countries by active users in the last 30 minutes. */
  topCountries: Array<{ countryCode: string; activeUsers: number }>;
  /** Top pages by active users in the last 30 minutes. */
  topPages: Array<{ path: string; activeUsers: number }>;
}
```

### 3.3 The provider interface

```typescript
export interface IAnalyticsProvider {
  /** Smoke test — must succeed with valid credentials and property ID. */
  health(): Promise<{ ok: true; propertyId: string }>;

  getOverview(range: AnalyticsRange): Promise<TrafficOverview>;
  getGeoBreakdown(range: AnalyticsRange, limit?: number): Promise<GeoBreakdown>;
  getPagePerformance(range: AnalyticsRange, limit?: number): Promise<PagePerformance>;
  getTimeSeries(
    range: AnalyticsRange,
    series: AnalyticsSeries,
    granularity?: 'day' | 'week' | 'month',
  ): Promise<TimeSeriesPoint[]>;
  getDeviceBreakdown(range: AnalyticsRange): Promise<DeviceBreakdown>;
  getReferrerBreakdown(range: AnalyticsRange, limit?: number): Promise<ReferrerBreakdown>;
  getRealtimeSnapshot(): Promise<RealtimeSnapshot>;
}
```

Every method has a JSDoc explaining **why** it exists, not just what it
does. Methods are intentionally orthogonal (one network call per method)
to keep TanStack Query keys clean and to allow per-widget caching.

### 3.4 Error envelope

```typescript
export const ANALYTICS_ERROR_CODES = {
  UNAUTHENTICATED: 'analytics/unauthenticated',
  FORBIDDEN:       'analytics/forbidden',
  NOT_CONFIGURED:  'analytics/not-configured',
  RATE_LIMITED:    'analytics/rate-limited',
  UPSTREAM:        'analytics/upstream-error',
  INVALID_RANGE:   'analytics/invalid-range',
} as const;

export type AnalyticsErrorCode =
  typeof ANALYTICS_ERROR_CODES[keyof typeof ANALYTICS_ERROR_CODES];

export class AnalyticsProviderError extends Error {
  constructor(
    public readonly code: AnalyticsErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AnalyticsProviderError';
  }
}
```

The API slice (Sprint 03) maps these to RFC 7807 responses. The dashboard
never sees raw GA4 messages.

### 3.5 NoOp implementation

`NoOpAnalyticsProvider` returns empty / zero shapes for every method.
Used:
- as the default registered by `analyticsProviderMiddleware` when the
  GA4 secrets are missing (Sprint 03),
- as the seed value in all tests until a fixture provider is needed.

==========================================================================
SECTION 4 — RULES
==========================================================================

- Zero imports of Hono, Cloudflare types, `googleapis`, `google-auth-library`,
  `axios`, or any HTTP library inside `packages/core/src/analytics-provider/`.
- Every interface method has a JSDoc with **purpose, units, edge cases**
  (e.g. "`share` sums to 1.0 ± 0.001 across entries; unknown bucket is
  emitted as `countryCode: 'ZZ'`").
- All numbers in DTOs are non-negative integers, except `share`,
  `bounceRate`, and durations expressed in seconds. Durations are floats.
- Country codes are ISO 3166-1 alpha-2 uppercase; the conversion table
  lives in `analytics.types.ts` as a pure const (no runtime fetches).
- Time strings are ISO `YYYY-MM-DD`, UTC. No timezone arithmetic in the
  provider contract.

==========================================================================
SECTION 5 — TESTS
==========================================================================

`packages/core/src/analytics-provider/__tests__/analytics.types.test.ts`:
- `resolveAnalyticsRange('last_7_days', new Date('2026-05-30'))` →
  `{ startDate: '2026-05-23', endDate: '2026-05-29' }` (yesterday-inclusive
  GA4 convention).
- `resolveAnalyticsRange('today', …)` returns same-day start/end.
- `resolveAnalyticsRange` is pure: same input → same output.

`packages/core/src/analytics-provider/__tests__/analytics.stub.test.ts`:
- `NoOpAnalyticsProvider.getOverview()` returns all zeros.
- `getGeoBreakdown()` returns `{ entries: [], totalVisitors: 0 }`.
- `getTimeSeries({ startDate, endDate }, 'visitors')` returns one point
  per day in the range, all with `value: 0`.

==========================================================================
SECTION 6 — COMPLETION CHECKLIST
==========================================================================

- [ ] `packages/core/src/analytics-provider/` folder created with the
      four files listed in §2.1.
- [ ] `packages/core/src/index.ts` re-exports everything in §2.2.
- [ ] All interface methods have JSDoc covering purpose, units, edges.
- [ ] No HTTP / cloud / Google imports anywhere in the new folder.
- [ ] Tests in §5 pass.
- [ ] `pnpm run build -w @beechcms/core` succeeds.
- [ ] `apps/api` and `apps/dashboard` still build (the new exports do
      not break the existing barrel).
- [ ] `SYSTEM_MAP.md` updated with a one-liner under "Phase 8 — External
      Analytics" listing the new types and interface.
