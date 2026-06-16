You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

Do NOT explore the codebase further. All relevant context is provided in
this prompt. Read it fully before writing any code.

This sprint covers **Sprint 2 of the Analytics & GA4 milestone**: the
concrete GA4 implementation of `IAnalyticsProvider` from Sprint 01,
following the **email module gold standard** for layout and isolation.

### Stack

- API: Hono on Cloudflare Workers, D1 (SQLite), R2
- HTTP: `fetch` (Workers global) — **no Node SDK, no `googleapis` package**
- JWT signing for service-account auth: `jose` (already in deps)
- Shared package: `@beechcms/core` (Sprint 01 contracts)

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS
==========================================================================

Sprint 01 delivered the neutral `IAnalyticsProvider` contract. Until this
sprint lands, the API slice (03) registers `NoOpAnalyticsProvider`. Once
this sprint merges, when the operator sets the three GA4 secrets, the
middleware swaps in the real provider and the dashboard starts showing
real numbers — without a single feature handler knowing the word "GA4".

The Cloudflare Worker runtime has **no Node APIs**. The official
`googleapis` / `@google-analytics/data` packages depend on
`google-auth-library` which pulls in Node crypto. We **must** call the
Data API directly via `fetch`, and we **must** sign the service-account
JWT with `jose` (which is already used for our own JWTs and is
Workers-compatible).

==========================================================================
SECTION 2 — DELIVERABLES
==========================================================================

### 2.1 New folder (mirrors the email module exactly)

```
apps/api/src/features/analytics-provider/
├── index.ts                          # Public API barrel — exports createAnalyticsProvider
├── analytics-provider.service.ts     # Factory: chooses real provider or NoOp
├── analytics-provider.types.ts       # Local types (config shape, internal row types)
└── providers/
    ├── ga4-analytics.provider.ts     # The only file that knows GA4
    ├── ga4-jwt.ts                    # Service-account JWT signing via jose
    ├── ga4-mappers.ts                # Raw GA4 rows → neutral DTOs (pure functions)
    └── ga4-countries.ts              # GA4 region → ISO 3166 alpha-2
```

> Layout rationale: identical to `apps/api/src/features/email/` —
> `index.ts` is the **only** importable file from outside the feature;
> `*.service.ts` is the factory; `*.provider.ts` interface is in core (not
> re-declared here); concrete implementation in `providers/`.

### 2.2 Updated middleware

`apps/api/src/middleware/analytics-provider.middleware.ts` — new file —
injects `IAnalyticsProvider` into `c.var.analyticsProvider`. Registered
**after** `repositoryMiddleware` (it does not depend on D1) and **before**
`observabilityMiddleware` in `factory.ts`.

```typescript
import { createAnalyticsProvider } from '../features/analytics-provider';

export function analyticsProviderMiddleware() {
  return async (context: Context<AppEnv>, next: Next) => {
    const provider = createAnalyticsProvider({
      propertyId:  context.env.GA4_PROPERTY_ID,
      clientEmail: context.env.GA4_CLIENT_EMAIL,
      privateKey:  context.env.GA4_PRIVATE_KEY,
    });
    context.set('analyticsProvider', provider);
    await next();
  };
}
```

### 2.3 AppEnv extension

`apps/api/src/types.ts`:
- `Bindings`: add `GA4_PROPERTY_ID?: string`, `GA4_CLIENT_EMAIL?: string`,
  `GA4_PRIVATE_KEY?: string` (all optional — when any is missing the
  factory returns `NoOpAnalyticsProvider`).
- `Variables`: add `analyticsProvider: IAnalyticsProvider`.

### 2.4 Wrangler

`apps/api/wrangler.jsonc` documentation comment listing the three secrets.
The values are added via `wrangler secret put` — never committed.

==========================================================================
SECTION 3 — GA4 DATA API SURFACE
==========================================================================

We hit two endpoints only:

1. **`runReport`** —
   `POST https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:runReport`
2. **`runRealtimeReport`** —
   `POST https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:runRealtimeReport`

(Optional, used only if we batch later: `:batchRunReports`. Skip for now —
each `IAnalyticsProvider` method makes one call; clarity > batching.)

### 3.1 Auth — service-account JWT

`ga4-jwt.ts` exports `getAccessToken(config, fetch)` which:

1. Builds a JWT with header `{ alg: 'RS256', typ: 'JWT' }` and claims:
   ```
   {
     iss:   config.clientEmail,
     scope: 'https://www.googleapis.com/auth/analytics.readonly',
     aud:   'https://oauth2.googleapis.com/token',
     iat:   now,
     exp:   now + 3600,
   }
   ```
2. Signs with `jose.SignJWT(...).setProtectedHeader(...).sign(privateKey)`.
   `privateKey` is imported via `jose.importPKCS8(config.privateKey, 'RS256')`.
3. POSTs to `https://oauth2.googleapis.com/token` with
   `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=<signed>`.
4. Returns `{ accessToken, expiresAt }`. Caller caches in a closure for
   `expiresAt - 60s` to avoid signing on every request.

> The `GA4_PRIVATE_KEY` secret stores the **PKCS#8 PEM** form with literal
> `\n` newlines preserved. `ga4-jwt.ts` replaces `\\n` → `\n` once at
> import time. Never log the key, never include it in error messages.

### 3.2 Mapping rules (`ga4-mappers.ts`)

Pure functions, one per DTO. Each takes the raw `runReport` response
and returns the neutral DTO from Sprint 01.

- **Country normalisation:** `countryId` (GA4 dimension) is already
  ISO 3166-1 alpha-2 but uppercase normalisation is enforced. `(not set)`
  → `'ZZ'`. `ga4-countries.ts` provides the English country-name lookup
  (offline static table — no `Intl.DisplayNames` to keep test snapshots
  stable across runtimes).
- **Path normalisation:** `pagePath` is trimmed, lowercased host-stripped
  if absolute, query string removed (`?` and after), fragments removed.
  Empty → `/`.
- **Share computation:** `share = visitors / totalVisitors`. When
  `totalVisitors === 0`, every entry's `share` is `0` — never `NaN`.
- **Engagement duration:** GA4 `averageSessionDuration` is seconds (float).
  Pass through; round to 2 decimals before returning.
- **Bounce rate:** GA4 `bounceRate` is `0..1` (not percent). Pass through.

### 3.3 Per-method request shapes

| Provider method | GA4 endpoint | Dimensions | Metrics |
|---|---|---|---|
| `getOverview` | runReport | — | `totalUsers`, `sessions`, `screenPageViews`, `averageSessionDuration`, `bounceRate` |
| `getGeoBreakdown` | runReport | `country`, `countryId` | `totalUsers` (limit param applied via `limit` field) |
| `getPagePerformance` | runReport | `pagePath`, `pageTitle` | `screenPageViews`, `averageSessionDuration`, `sessions`, `exits` |
| `getTimeSeries('visitors')` | runReport | `date` | `totalUsers` |
| `getTimeSeries('sessions')` | runReport | `date` | `sessions` |
| `getTimeSeries('pageViews')` | runReport | `date` | `screenPageViews` |
| `getTimeSeries('avgEngagementSeconds')` | runReport | `date` | `averageSessionDuration` |
| `getDeviceBreakdown` | runReport | `deviceCategory` | `totalUsers` |
| `getReferrerBreakdown` | runReport | `sessionSource`, `sessionMedium` | `totalUsers` |
| `getRealtimeSnapshot` | runRealtimeReport | top-N for countries (`country`) and pages (`unifiedScreenName`) | `activeUsers` |

`granularity: 'week' | 'month'` is implemented by swapping the date
dimension to `yearWeek` / `yearMonth` and reformatting back to the first
day of the bucket as `YYYY-MM-DD`.

### 3.4 Error mapping

| GA4 response | Throws |
|---|---|
| `401` invalid creds / expired JWT | `AnalyticsProviderError('analytics/unauthenticated')` |
| `403` insufficient permissions | `AnalyticsProviderError('analytics/forbidden')` |
| `429` quota | `AnalyticsProviderError('analytics/rate-limited')` |
| `4xx` other | `AnalyticsProviderError('analytics/upstream-error')` with `cause` = redacted response |
| `5xx` | retry once with 250 ms backoff, then `AnalyticsProviderError('analytics/upstream-error')` |
| Network failure | `AnalyticsProviderError('analytics/upstream-error')` |

Error `message` strings are **safe to surface** — never include the JWT,
the private key, or raw GA4 row data.

==========================================================================
SECTION 4 — FACTORY (`analytics-provider.service.ts`)
==========================================================================

```typescript
import { NoOpAnalyticsProvider, type IAnalyticsProvider } from '@beechcms/core';
import { Ga4AnalyticsProvider } from './providers/ga4-analytics.provider';

export interface AnalyticsProviderConfig {
  propertyId?: string;
  clientEmail?: string;
  privateKey?: string;
}

export function createAnalyticsProvider(
  config: AnalyticsProviderConfig,
): IAnalyticsProvider {
  if (!config.propertyId || !config.clientEmail || !config.privateKey) {
    return new NoOpAnalyticsProvider();
  }
  return new Ga4AnalyticsProvider({
    propertyId:  config.propertyId,
    clientEmail: config.clientEmail,
    privateKey:  config.privateKey,
  });
}
```

`index.ts` exports **only** `createAnalyticsProvider`. Nothing else
crosses the feature boundary.

==========================================================================
SECTION 5 — TESTS
==========================================================================

Co-located under `apps/api/src/features/analytics-provider/__tests__/`:

- `ga4-mappers.test.ts` — table-driven tests with fixture JSON payloads
  in `__tests__/fixtures/`. One fixture per provider method covering:
  empty response, single row, multiple rows, `(not set)` country,
  zero-totals edge case (no `NaN`).
- `ga4-jwt.test.ts` — verifies the JWT claims (`iss`, `aud`, `scope`,
  `exp - iat === 3600`), and that `getAccessToken` caches and reuses the
  token until 60s before `expiresAt`. Uses `MSW` or a hand-rolled
  `fetch` mock; `jose` is **not** mocked.
- `ga4-analytics.provider.test.ts` — integration-style: mocks `fetch`,
  asserts the URL, the body (`dimensions`, `metrics`, `dateRanges`), and
  the mapped DTO for one happy-path call per method.
- `analytics-provider.service.test.ts` — missing config → NoOp; full
  config → `Ga4AnalyticsProvider` instance.

> No real network calls. The mocked `fetch` is injected via constructor
> (`new Ga4AnalyticsProvider(config, { fetch: customFetch })`) — default
> is the global `fetch` in production.

==========================================================================
SECTION 6 — RULES
==========================================================================

- The string `googleapis` MUST NOT appear in any `package.json`.
- The strings `'@google-analytics/data'`, `'google-auth-library'` MUST
  NOT appear anywhere.
- No file outside `apps/api/src/features/analytics-provider/providers/`
  may import `jose` for GA4-related signing. (Existing JWT code for our
  own auth is untouched.)
- The string `'GA4_'` MUST appear in exactly two places: `types.ts`
  (Bindings declaration) and `analytics-provider.middleware.ts` (env
  read). Anywhere else is a leak.
- The Ga4 provider class constructor takes its dependencies (config,
  optional `fetch`, optional `IClock`) — **never** a Hono `Context`.

==========================================================================
SECTION 7 — COMPLETION CHECKLIST
==========================================================================

- [ ] `apps/api/src/features/analytics-provider/` matches the layout in
      §2.1 exactly.
- [ ] `index.ts` exports only `createAnalyticsProvider`.
- [ ] `analytics-provider.middleware.ts` injects the provider and is
      mounted in `factory.ts` between `repositoryMiddleware` and
      `observabilityMiddleware`.
- [ ] `types.ts` updated with the three optional bindings and the new
      `Variables` entry.
- [ ] All tests in §5 pass.
- [ ] `pnpm run test -w @beechcms/api` green.
- [ ] `wrangler dev` boots without errors when GA4 secrets are absent
      (NoOp path).
- [ ] `SYSTEM_MAP.md` updated: middleware list + `Variables` table.
- [ ] No forbidden strings (§6) introduced anywhere.
