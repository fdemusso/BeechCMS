You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

Do NOT explore the codebase further. All relevant context is provided in
this prompt. Read it fully before writing any code.

This sprint covers **Sprint 3 of the Analytics & GA4 milestone**: the
backend VSA slice that exposes the analytics provider over HTTP so the
dashboard (Sprint 04) can consume it.

### Stack

- API: Hono on Cloudflare Workers
- Sprints 01–02 already merged: `IAnalyticsProvider` lives in
  `@beechcms/core`, GA4 implementation lives in
  `apps/api/src/features/analytics-provider/`,
  `c.var.analyticsProvider` is populated by middleware.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS
==========================================================================

We need authenticated REST endpoints the dashboard can call via TanStack
Query. Each endpoint is one provider method, so widget caching is
per-endpoint and per-range. No business logic in handlers — pure
translation between HTTP and the injected provider.

VSA reminder: this slice **never** imports from
`apps/api/src/features/analytics-provider/`. Its only knowledge of
analytics is the `IAnalyticsProvider` interface obtained via
`c.get('analyticsProvider')`.

==========================================================================
SECTION 2 — DELIVERABLES
==========================================================================

### 2.1 New folder

```
apps/api/src/features/analytics/
├── index.ts                # Barrel — exports analyticsFeature (Hono sub-app)
├── constants.ts            # ANALYTICS_ERRORS, default limits
├── types.ts                # Zod schemas for query params; local TS types
└── handlers/
    ├── overview.ts
    ├── geo.ts
    ├── pages.ts
    ├── timeseries.ts
    ├── devices.ts
    ├── referrers.ts
    ├── realtime.ts
    └── health.ts
```

### 2.2 Routes (mounted at `/api/analytics` via `factory.ts`)

| Method | Path | Provider call |
|---|---|---|
| GET | `/api/analytics/health` | `health()` |
| GET | `/api/analytics/overview` | `getOverview(range)` |
| GET | `/api/analytics/geo` | `getGeoBreakdown(range, limit)` |
| GET | `/api/analytics/pages` | `getPagePerformance(range, limit)` |
| GET | `/api/analytics/timeseries` | `getTimeSeries(range, series, granularity)` |
| GET | `/api/analytics/devices` | `getDeviceBreakdown(range)` |
| GET | `/api/analytics/referrers` | `getReferrerBreakdown(range, limit)` |
| GET | `/api/analytics/realtime` | `getRealtimeSnapshot()` |

All endpoints are JWT-protected (mounted under `apiProtected` in
`factory.ts`, same as `/api/content`). Realtime is **not** publicly
exposed.

### 2.3 Query parameter contract

Common (all range-bearing endpoints):

| Param | Type | Required | Notes |
|---|---|---|---|
| `preset` | `AnalyticsRangePreset` | one of preset/custom required | Resolved server-side via `resolveAnalyticsRange` |
| `startDate` | ISO date | — | Required iff `preset` absent |
| `endDate` | ISO date | — | Required iff `preset` absent |
| `compareStartDate` | ISO date | optional | Together with `compareEndDate` enables comparison response shape |
| `compareEndDate` | ISO date | optional | — |

Endpoint-specific:

| Endpoint | Extra params |
|---|---|
| `/geo`, `/pages`, `/referrers` | `limit` (1–50, default 10) |
| `/timeseries` | `series` (enum), `granularity` (`day`\|`week`\|`month`, default `day`) |

Zod schemas in `types.ts`. Invalid input → RFC 7807 `400` with
`type: 'analytics/invalid-range'` and field-level `errors`.

### 2.4 Comparison response shape

When `compareStartDate`/`compareEndDate` are present, the handler runs
**two** provider calls in parallel (`Promise.all`) and wraps the result:

```typescript
{
  data: <DTO for the primary range>,
  compare: <DTO for the comparison range>
}
```

When absent, response shape is `{ data: <DTO> }`. The frontend's widget
shell tolerates both shapes; comparison logic is purely additive.

### 2.5 Caching

Per-request `Cache-Control: private, max-age=60` on every endpoint
**except** `/realtime` (no cache). The 60s window matches the Public API
widget cache convention and keeps GA4 quota usage predictable.

We do **not** use the Worker `caches.default` here because the response
is per-user (`private`) and per-JWT-claim could differ; instead, the
dashboard relies on its TanStack Query `staleTime` (5 min) for cross-tab
sharing.

### 2.6 Rate limiting

A dedicated Cloudflare Rate Limit binding `ANALYTICS_RATE_LIMITER`
(60 req / min per JWT `sub`) is added in `wrangler.jsonc`. Mount the
existing `rateLimiterMiddleware` for this binding inside the slice's
`index.ts`. RFC 7807 `429` on exceed.

==========================================================================
SECTION 3 — HANDLER PATTERN
==========================================================================

Every handler follows the same skeleton (example: overview):

```typescript
// apps/api/src/features/analytics/handlers/overview.ts
export async function overviewHandler(c: Context<AppEnv>) {
  const parsed = analyticsRangeQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return analyticsProblem(c, ANALYTICS_ERRORS.INVALID_RANGE, 400, parsed.error);
  }
  const range = resolveRangeFromQuery(parsed.data);
  const provider = c.get('analyticsProvider');

  try {
    if (range.compareTo) {
      const [data, compare] = await Promise.all([
        provider.getOverview({ startDate: range.startDate, endDate: range.endDate }),
        provider.getOverview({ startDate: range.compareTo.startDate, endDate: range.compareTo.endDate }),
      ]);
      c.header('Cache-Control', 'private, max-age=60');
      return c.json({ data, compare });
    }
    const data = await provider.getOverview(range);
    c.header('Cache-Control', 'private, max-age=60');
    return c.json({ data });
  } catch (error) {
    return mapProviderErrorToProblem(c, error);
  }
}
```

`mapProviderErrorToProblem` (in `analytics-problem.ts` inside the slice):

| `AnalyticsErrorCode` | HTTP | RFC 7807 `type` |
|---|---|---|
| `analytics/unauthenticated` | 502 | `analytics/upstream-auth` |
| `analytics/forbidden` | 502 | `analytics/upstream-forbidden` |
| `analytics/not-configured` | 503 | `analytics/not-configured` |
| `analytics/rate-limited` | 502 | `analytics/upstream-rate-limited` |
| `analytics/upstream-error` | 502 | `analytics/upstream-error` |
| `analytics/invalid-range` | 400 | `analytics/invalid-range` |

The `analytics/not-configured` branch is what the dashboard checks first
(via `/api/analytics/health`) to render the empty / "configure GA4" state
instead of every widget shouting an error.

==========================================================================
SECTION 4 — RULES
==========================================================================

- Handlers contain **only** parsing + provider call + response building.
  No inline date math, no fetches, no GA4 string anywhere.
- Range resolution is done by `resolveAnalyticsRange` from `@beechcms/core`
  (Sprint 01). Do not re-implement.
- Every handler is async, every error path is covered, no `TODO` comments.
- All string literals (error codes, default limits) live in `constants.ts`.
- The slice's `index.ts` is the only file referenced from `factory.ts`.

==========================================================================
SECTION 5 — TESTS
==========================================================================

Co-located under `apps/api/src/features/analytics/__tests__/`:

- `overview.test.ts` — happy path, invalid range, provider throws
  `analytics/unauthenticated` → 502, comparison shape with `compare` key.
- `timeseries.test.ts` — `granularity=week`, invalid `series`, missing
  required params.
- `realtime.test.ts` — happy path, no cache header.
- `health.test.ts` — `NoOpAnalyticsProvider` returns `{ ok: true,
  propertyId: '' }` → handler maps to `503 not-configured`.

Tests use `FakeAnalyticsProvider` (a test double living in
`apps/api/src/shared/fake-analytics.provider.ts`) injected via the
`analyticsProvider` override hook on `analyticsProviderMiddleware`
(add the same `{ analyticsProvider?: IAnalyticsProvider }` override
pattern used by `repositoryMiddleware`).

==========================================================================
SECTION 6 — COMPLETION CHECKLIST
==========================================================================

- [ ] `apps/api/src/features/analytics/` matches §2.1.
- [ ] All eight routes mounted under `/api/analytics` via `factory.ts`.
- [ ] Zod schemas in `types.ts`; no inline validation in handlers.
- [ ] `mapProviderErrorToProblem` covers every `AnalyticsErrorCode`.
- [ ] `Cache-Control: private, max-age=60` on all non-realtime endpoints.
- [ ] `ANALYTICS_RATE_LIMITER` binding added; `wrangler.jsonc` updated.
- [ ] Tests in §5 green.
- [ ] No import from `features/analytics-provider/` inside this slice.
- [ ] `docs/api-reference.md` extended with `§11 Analytics API` —
      request/response shapes and error table.
- [ ] `SYSTEM_MAP.md` route list updated.
