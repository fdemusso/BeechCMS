# Sprint 4 — `oauth-dashboard-consent-ui`

> Multi-sprint feature `OAuth 2.1 Authorization Server for MCP`.
> Roadmap: `output/backlog/ROADMAP.md` (entry #4). Previous sprints archived in `docs/Sprints/oauth-*`.

### Pre-Computation Analysis

**a) God Nodes identified via the graphify CLI**

| Node | Degree / evidence | Why it is a god node for this sprint |
|---|---|---|
| `oauthApp` (`apps/api/src/features/oauth/index.ts`) | `graphify affected "oauthApp" --depth 2` → 29 reverse edges (`src/factory.ts:L38`, `api/src/index.ts:L5`, and 26 `test/flow-*.test.ts` / `factory.*.test.ts` files that import the app factory transitively) | Every new OAuth route registration ripples into the whole API integration-test surface. Route additions must be additive only. |
| `SettingsDialog()` (`apps/dashboard/src/features/settings/components/settings-dialog.tsx:L88`) | `graphify explain "SettingsDialog"` → degree 5: `<- settings-page.tsx:L8`, `<- settings/index.ts:L6` (re_export), `<- settings-dialog.test.tsx:L8` | Sole composition shell for every settings tab. The "Connected apps" tab can only enter the UI through it. |
| `SettingsTab` (type, `settings.types.ts`) | `graphify affected "SettingsTab" --depth 2` → 6 nodes: `SettingsDialogProps:L43`, `SettingsGroup:L52`, `settings-dialog.tsx:L34`, `settings-dialog.test.tsx:L9`, `settings-page.tsx:L9`, `settings/index.ts:L6` | The tab union type is the single switch that gates `TabContent`, the URL `?tab=` param and the dialog test. Adding a member touches exactly these 6 places, no more. |
| `SecurityTab()` (`security-tab.tsx:L115`) | `graphify explain "SecurityTab"` → degree 5, calls `useSessions()`, `useSettingsActivity()`, `useRevokeSession()` | Reference implementation of the exact interaction this sprint must copy: a react-query list + per-row `AlertDialog` revoke + `sonner` toast. Do not invent a second pattern. |

**b) Architectural boundaries affected**

| Tier | Touched? | Detail |
|---|---|---|
| `packages/core` | **NO** | Zero changes. Every contract this sprint needs already exists and was verified by reading the source: `IOAuthConsentRepository.listForUser` / `.revoke`, `IOAuthTokenRepository.listAuthorizedClientsForUser` / `.revokeAllForClientAndUser` (its own doc comment says *"Backs 'revoke this app' in the dashboard"*), `IOAuthClientRepository.findActiveById`, `OAuthScope` / `OAUTH_SCOPES`. No new interface, no new migration, no new D1 table. |
| `apps/api` | **YES, additive only** | One new file in the existing slice `apps/api/src/features/oauth/` (`consents.ts` + test) and 4 added lines in that slice's `index.ts`. No file outside `features/oauth/` is modified; `factory.ts` already mounts `oauthApp` at `app.route('/', oauthApp)` (`factory.ts:L222`), so the new routes ship with zero factory edits. |
| `apps/dashboard` | **YES** | One new slice `src/features/oauth-consent/`, plus 5 surgical edits at the composition root and its neighbours: `App.tsx` (new route + `returnTo` on `ProtectedRoute`), `use-login-form.ts` (honour `returnTo`), `settings.types.ts` (+1 union member), `settings-dialog.tsx` (+1 group item, +1 `TabContent` case), `vite.config.ts` (+1 dev proxy entry), `locales/{en,it}.json`. |

**c) `graphify affected` impact analysis (breaking-change proof)**

```
$ graphify affected "oauthApp" --depth 2
- src/factory.ts [imports] apps/api/src/factory.ts:L38
- factory.csp.test.ts / factory.custom-routes.test.ts / factory.docs-parity.test.ts
- authorize.test.ts, revoke.test.ts, token.test.ts        (in-slice)
- api/src/index.ts [imports_from] apps/api/src/index.ts:L5
- 20 x apps/api/test/flow-*.test.ts + public-*.test.ts    (via createBeechApp)
```
Interpretation: the blast radius is entirely *route-registration* based. Because this sprint only **adds** `GET /oauth/consents` and `DELETE /oauth/consents/:clientId` and changes no existing handler signature, none of the 29 dependents break. Two of them were checked by hand:
- `factory.docs-parity.test.ts` asserts a fixed `routeDocMap` of 9 prefixes (`/auth/*`, `/api/*`) and only requires `routes.length > 20`. `/oauth/*` is not in the map, so new routes cannot fail it.
- `factory.csp.test.ts` / the `/admin/*` SPA fallback at `factory.ts:L279-289` already serve any unmatched `/admin/*` deep path from `index.html`, so the new SPA route `/admin/oauth/consent` needs no server change.

```
$ graphify affected "SettingsTab" --depth 2     -> 6 nodes (listed above)
$ graphify affected "ProtectedRoute" --depth 2  -> No affected nodes found   (local to App.tsx)
$ graphify affected "useLoginForm" --depth 2    -> No affected nodes found   (consumed only via the login-form barrel)
```
Interpretation: the two behavioural edits on the dashboard side (`ProtectedRoute` redirect, `useLoginForm` post-login navigation) have **zero** reverse dependencies in the graph — they are leaves of the composition root. The only fan-out is `SettingsTab`'s 6 nodes, all of which are in the deliverables list below.

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

1. **BOTANICAL INVARIANT — respected.** This sprint writes **no SQL and no D1 access of its own**. The two new API handlers call only repository interfaces already injected into `Variables` by `repositoryMiddleware` (`oauthConsentRepository`, `oauthTokenRepository`, `oauthClientRepository`), whose sole implementations are the D1 repositories from Sprint 1. Verified: `apps/api/src/types.ts:L225-233` declares all four OAuth repositories; `d1-oauth-token.repository.ts:L125` owns the only `oauth_tokens` SELECT for this use case. No handler in `features/oauth/consents.ts` may import `D1Database` or write a `prepare(...)` string — the acceptance criteria enforce this. Content tables are untouched, so `apiToDb`/`dbToApi` and Branch IDs (`br_XX`) are not in play at all.
2. **VSA — API side, respected.** All new code lands inside the *existing* `apps/api/src/features/oauth/` slice, which already owns the consent concept (`authorizeRequestHandler` reads `oauthConsentRepository` at `authorize.ts:L145`). No file under another `features/*` slice is read or written. `graphify affected "oauthApp"` shows the slice is only ever consumed through `factory.ts`, which stays unchanged.
3. **VSA — dashboard side, one boundary crossing, deliberately scoped.** `settings-dialog.tsx` will import `ConnectedAppsTab` from `@/features/oauth-consent`. This is a **composition-root import**, identical in kind to the pre-existing `import { SeedBuilderPage } from "@/features/seed-builder"` at `settings-dialog.tsx:L32`. The rule is honoured because the dependency is one-way: the `oauth-consent` slice imports **nothing** from `@/features/settings` — it owns its own api file, hooks, types and query keys. No shared logic is duplicated, therefore nothing needs promoting to `@beechcms/core` or `src/lib`. Adding a fourth `SettingsTab` member is a type edit inside the settings slice, not a reverse dependency. *If the executing agent finds itself importing anything from `@/features/settings` into `oauth-consent`, the plan is violated — stop and re-plan.*
4. **CLOUDFLARE PURITY — respected.** No ORM, no background job, no migration, no new binding. The dashboard is the existing Vite SPA served by Workers Assets; the only build-surface change is one dev-only proxy entry.
5. **YAGNI — scope trimmed here, before drafting.** Three things were considered and **cut**:
   - a new `IOAuthConsentRepository.listWithClientNames()` core method → rejected, `listForUser` + `findActiveById` per client already answer it, and the client count per user is single-digit;
   - a dedicated `authServerApi` axios instance in `src/lib/api.ts` for the non-`/api` OAuth paths → rejected, `api.get(url, { baseURL: '/' })` reuses the existing bearer-injection and 401-refresh-retry interceptors verbatim (`src/lib/api.ts:L49-118`);
   - a generic "OAuth applications admin" CRUD (client registration UI) → rejected, out of the brief, no user story asks for it.
6. **YAGNI — one addition kept that is not literally in the roadmap line.** `ProtectedRoute` currently renders `<Navigate to="/login" replace />` and `use-login-form.ts:L94` hard-codes `navigate('/', { replace: true })`. A logged-out user who follows `GET /oauth/authorize` is bounced to `/login` and then dumped on the dashboard home, **silently destroying every OAuth query parameter** — the flow is unusable. The `returnTo` round-trip is therefore not scope creep but the minimum required for the sprint's own deliverable to function. It is ~12 lines across 2 files.

Plan respects the invariants. Proceeding to the linear sprint plan.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprints 1–3 built an authorization server with **no human-facing surface**. Today `GET /oauth/authorize` validates the client and then redirects the browser to `CONSENT_SCREEN_PATH = '/admin/oauth/consent'` (`apps/api/src/features/oauth/constants.ts`), a route that **does not exist in the dashboard router**: the SPA fallback serves `index.html`, react-router matches nothing, and `ErrorPage` renders. The whole authorization-code flow is therefore reachable only from integration tests (`test/flow-oauth-authorization.test.ts` drives it by calling `POST /oauth/authorize/consent` directly with an admin JWT).

This sprint closes that gap and nothing else. It must land **before Sprint 5** (`mcp-pkce-client`) because the MCP client's entire premise is "open the system browser and let the user consent" — without a rendered consent screen there is nothing for the browser to show, and Sprint 5 could not be validated end to end by a human.

It must land **after Sprint 3** because the "Connected apps" list is only meaningful once scoped tokens are actually accepted by the resource server: before Sprint 3, revoking a token changed nothing observable.

**VSA adherence.** The work is split along the existing slice seams rather than across them. The API half stays inside `apps/api/src/features/oauth/`, the slice that already owns consent records. The dashboard half becomes its own slice `apps/dashboard/src/features/oauth-consent/`, owning its api client, hooks, query keys, types and both React surfaces (the standalone consent page and the settings tab). The settings dialog consumes it exactly the way it already consumes `@/features/seed-builder` — as a tab composition root, one-way.

**Botanical Engine adherence.** This sprint adds zero database access. Every read and write goes through repository interfaces defined in `packages/core/src/oauth/` and implemented once, in D1, under `apps/api/src/shared/db/repositories/`. The dashboard never sees a table name; it sees a JSON DTO shaped by the API slice.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**API — the OAuth slice as it stands (`apps/api/src/features/oauth/index.ts`)**

```
app.route('/', oauthApp)                                   factory.ts:L222
  GET  /oauth/authorize                 (public)           -> authorizeHandler
  use  /oauth/authorize/request         authMiddleware()
  use  /oauth/authorize/consent         authMiddleware()
  GET  /oauth/authorize/request         -> authorizeRequestHandler
  POST /oauth/authorize/consent         -> consentHandler
  POST /oauth/token                     (public, grant-authenticated)
  POST /oauth/revoke                    (public, RFC 7009)
```

Middleware registration order in `factory.ts` relevant to this sprint:

```
L219-222  app.route('/', authApp | setupApp | passwordResetApp | oauthApp)   <- no api gate
L225      const apiProtected = new Hono<{Bindings: Env; Variables: Variables}>()
L227      apiProtected.use('*', authMiddleware({ acceptOAuth: true }))
L230      apiProtected.use('*', oauthScopeMiddleware())     // fail-closed allowlist
L232-245  apiProtected.route('/settings' | '/schema' | '/seeds' | ...)
L275      app.route('/api', apiProtected)
L278-289  app.get('/admin', 301 -> '/admin/'); app.get('/admin/*', assets + SPA fallback)
```
Consequence that constrains this sprint: **`/oauth/*` is mounted outside `apiProtected`**, so it is never seen by `oauthScopeMiddleware`. Placing the connected-apps endpoints under `/oauth/consents` with an explicit `authMiddleware()` (default `acceptOAuth: false`) keeps them **admin-JWT-only** — an OAuth access token can never list or revoke consents, which would otherwise let a leaked MCP token revoke its own audit trail or enumerate the user's other clients. Putting them under `/api/...` instead would require an entry in `OAUTH_SCOPE_ROUTES` and is rejected.

**Existing handler already consumed by the consent screen (`authorize.ts`)**
- `authorizeHandler` — public; on success `302` to `` `${CONSENT_SCREEN_PATH}?${originalQueryString}` ``; fatal errors (`client_id` missing/unknown/disabled, bad `redirect_uri`) are `400 JSON`; redirectable errors go back to the client.
- `authorizeRequestHandler` (`GET /oauth/authorize/request`, JWT) — returns `AuthorizationRequestMetadata`: `{ client: {clientId,name}, requestedScopes, newScopes, consentRequired, redirectUri, state }`. `consentRequired` is already `newScopes.length > 0`, i.e. **incremental consent is server-side and done**; the UI only has to obey it.
- `consentHandler` (`POST /oauth/authorize/consent`, JWT) — body `ConsentDecisionBody` (snake_case OAuth params + `approved: boolean`); always answers `200 { redirectTo: string }`, both for approval and for `access_denied`.

**Core contracts available (read from `packages/core/src/oauth/`, all shipped in Sprint 1)**
```ts
IOAuthConsentRepository.listForUser(userId): Promise<ConsentRecord[]>          // live only, newest first
IOAuthConsentRepository.revoke(clientId, userId, now): Promise<boolean>
IOAuthTokenRepository.listAuthorizedClientsForUser(userId, now): Promise<AuthorizedClientSummary[]>
IOAuthTokenRepository.revokeAllForClientAndUser(clientId, userId, now): Promise<number>
IOAuthClientRepository.findActiveById(clientId): Promise<OAuthClientRecord | null>
ConsentRecord = { id, clientId, userId, scopes: OAuthScope[], createdAt, updatedAt, revokedAt }
AuthorizedClientSummary = { clientId, clientName, scope: OAuthScope[], lastIssuedAt }
OAUTH_SCOPES = ['schema:read','schema:write']
```
All four repositories are already in `Variables` (`apps/api/src/types.ts:L225-233`) and `context.get('clock').nowSeconds()` / `context.get('jwtPayload').sub` are the established accessors (`authorize.ts:L152,L214`).

**Dashboard — the shape to conform to**
- Router: `createBrowserRouter([...], { basename: '/admin' })` (`App.tsx:L235`). A route with `path: "/oauth/consent"` therefore resolves to `/admin/oauth/consent`, exactly `CONSENT_SCREEN_PATH`.
- `ProtectedRoute` (`App.tsx:L69-74`): `loading -> <SplashScreen/>`, `unauthenticated -> <Navigate to="/login" replace />` — **drops the current location**.
- `useLoginForm` (`use-login-form.ts:L88-94`): posts to `/auth/login` with bare `axios` (not the `/api` instance), `setToken(data.token)`, then `navigate('/', { replace: true })` — **hard-coded destination**.
- HTTP: `src/lib/api.ts` exports `api` (axios, `baseURL: '/api'`, `withCredentials`), a request interceptor injecting `Authorization: Bearer <in-memory token>`, and a response interceptor that on `401` calls `refreshToken()` once and replays the original request (`L86-118`). Access tokens live in a module-level variable, never in `localStorage`.
- Data layer: `@tanstack/react-query`; per-slice `*_QUERY_KEYS` const + `useQuery`/`useMutation` hooks (`features/settings/hooks/use-settings.ts:L9-17`).
- Revoke UX reference: `SessionRow` (`security-tab.tsx:L41-90`) — `AlertDialog` + `AlertDialogTrigger asChild` + ghost icon `Button` + `toast.success/error` from `sonner` + local `pending` state.
- Settings tabs: `SettingsTab` union (`settings.types.ts` last line), `groups[]` array and `TabContent` switch (`settings-dialog.tsx:L62-115`); icons come from `reicon-react` (verified present: `Key`, `Loader`, `Trash2`, `Global`, `ShieldSecurity`).
- i18n: flat `src/locales/en.json` / `it.json`, `useTranslation()`, keys `settings.security.*`, `common.cancel`, `common.confirm`.
- Tests: vitest + happy-dom, `include: ["src/**/*.test.{ts,tsx}"]`, setup `src/test/setup.ts`; co-located `*.test.tsx` next to components is the settings convention.
- Dev proxy (`vite.config.ts:L33-42`) forwards **only** `/api` and `/auth` to the Worker on `127.0.0.1:8789`. `/oauth` is **not** proxied — the consent screen's XHRs would hit the Vite dev server and 404. This is a real blocker for local validation and is fixed in this sprint.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**A. API (`apps/api`) — additive, inside the existing `oauth` slice**

| # | File | Action |
|---|---|---|
| A1 | `src/features/oauth/consents.ts` | **NEW** — `ConnectedAppSummary` type, `listConsentsHandler`, `revokeConsentHandler` |
| A2 | `src/features/oauth/consents.test.ts` | **NEW** — unit tests for both handlers |
| A3 | `src/features/oauth/index.ts` | **EDIT** — register the two routes behind `authMiddleware()` |
| A4 | `test/flow-oauth-connected-apps.test.ts` | **NEW** — end-to-end: login → authorize → consent → token → list → revoke → token rejected |

**B. Dashboard — new slice `apps/dashboard/src/features/oauth-consent/`**

| # | File | Action |
|---|---|---|
| B1 | `src/features/oauth-consent/types/oauth.types.ts` | **NEW** — `AuthorizationRequestMetadata`, `ConsentDecisionBody`, `ConnectedApp`, `OAuthScope` literal union |
| B2 | `src/features/oauth-consent/api/oauth.api.ts` | **NEW** — `oauthApi` object, 4 calls, all via `api` with `{ baseURL: '/' }` |
| B3 | `src/features/oauth-consent/hooks/use-oauth-consent.ts` | **NEW** — `OAUTH_QUERY_KEYS`, `useAuthorizationRequest`, `useSubmitConsent`, `useConnectedApps`, `useRevokeConnectedApp` |
| B4 | `src/features/oauth-consent/components/consent-screen.tsx` | **NEW** — the consent card (presentational + submit wiring) |
| B5 | `src/features/oauth-consent/components/connected-apps-tab.tsx` | **NEW** — settings tab: list + per-row revoke |
| B6 | `src/features/oauth-consent/pages/consent-page.tsx` | **NEW** — route shell: reads `useSearchParams`, handles silent re-consent, renders B4 |
| B7 | `src/features/oauth-consent/index.ts` | **NEW** — barrel: `ConsentPage`, `ConnectedAppsTab` |
| B8 | `src/features/oauth-consent/components/consent-screen.test.tsx` | **NEW** |
| B9 | `src/features/oauth-consent/components/connected-apps-tab.test.tsx` | **NEW** |

**C. Dashboard — surgical edits to existing files**

| # | File | Action |
|---|---|---|
| C1 | `src/App.tsx` | **EDIT** — import `ConsentPage`; add route `/oauth/consent`; make `ProtectedRoute` carry `returnTo` |
| C2 | `src/features/auth/components/login-form/use-login-form.ts` | **EDIT** — honour a validated `returnTo` query param after login |
| C3 | `src/features/settings/types/settings.types.ts` | **EDIT** — add `'connected-apps'` to the `SettingsTab` union |
| C4 | `src/features/settings/components/settings-dialog.tsx` | **EDIT** — one nav item in the `account` group + one `TabContent` case |
| C5 | `src/features/settings/components/settings-dialog.test.tsx` | **EDIT** — add `vi.mock("@/features/oauth-consent", ...)` |
| C6 | `src/locales/en.json`, `src/locales/it.json` | **EDIT** — `oauth.*` block + `settings.tabs.connectedApps` |
| C7 | `vite.config.ts` | **EDIT** — proxy `/oauth` to `127.0.0.1:8789` |

**Explicitly excluded from this sprint:** no `packages/core` change, no D1 migration, no change to `authorize.ts` / `token.ts` / `revoke.ts` / `oauth-scope.middleware.ts`, no `packages/mcp` change.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

## A1 — `apps/api/src/features/oauth/consents.ts` (NEW)

Header block: copy the SPDX/copyright 3-line header + `/// <reference types="@cloudflare/workers-types" />` used by every file in the slice.

```ts
import type { Context } from 'hono'
import type { OAuthScope } from '@beechcms/core'
import type { Env, Variables } from '../../types'

type OAuthContext = Context<{ Bindings: Env; Variables: Variables }>

/**
 * One row of the dashboard "Connected apps" list: a live consent, enriched with
 * the client's display name and with token liveness.
 */
export interface ConnectedAppSummary {
  /** Stable identifier of the OAuth client (e.g. `beech-mcp-cli`). */
  clientId: string
  /** Human-readable client name; falls back to `clientId` when the client row was disabled. */
  name: string
  /** Scopes the resource owner has cumulatively granted to this client. */
  scopes: OAuthScope[]
  /** Unix seconds when consent was first granted. */
  grantedAt: number
  /** Unix seconds of the most recent consent update (scope widening). */
  updatedAt: number
  /** Creation time of the newest live token, or null when no token is currently valid. */
  lastIssuedAt: number | null
  /** True when at least one unexpired, unrevoked token exists for this client. */
  hasActiveTokens: boolean
}

/**
 * `GET /oauth/consents`
 *
 * Lists the OAuth clients the authenticated resource owner has authorized.
 * Admin JWT only — deliberately outside `/api`, so an OAuth access token can
 * never enumerate or tamper with the consent ledger that governs it.
 */
export async function listConsentsHandler(context: OAuthContext): Promise<Response> {
  const userId = context.get('jwtPayload').sub
  const nowSeconds = context.get('clock').nowSeconds()

  const consents = await context.get('oauthConsentRepository').listForUser(userId)
  const liveTokens = await context.get('oauthTokenRepository')
    .listAuthorizedClientsForUser(userId, nowSeconds)
  const liveByClient = new Map(liveTokens.map(summary => [summary.clientId, summary]))

  const apps: ConnectedAppSummary[] = []
  for (const consent of consents) {
    const client = await context.get('oauthClientRepository').findActiveById(consent.clientId)
    const live = liveByClient.get(consent.clientId)
    apps.push({
      clientId: consent.clientId,
      name: client?.name ?? consent.clientId,
      scopes: consent.scopes,
      grantedAt: consent.createdAt,
      updatedAt: consent.updatedAt,
      lastIssuedAt: live?.lastIssuedAt ?? null,
      hasActiveTokens: live !== undefined,
    })
  }

  return context.json(apps, 200)
}

/**
 * `DELETE /oauth/consents/:clientId`
 *
 * Cascade revocation for one client: the consent row AND every live access and
 * refresh token, never one without the other (brief §4, "Revoca a cascata").
 * Tokens are revoked even when the consent row was already revoked, so a stale
 * grant can never leave live credentials behind.
 */
export async function revokeConsentHandler(context: OAuthContext): Promise<Response> {
  const clientId = context.req.param('clientId')
  const userId = context.get('jwtPayload').sub
  const nowSeconds = context.get('clock').nowSeconds()

  const consentRevoked = await context.get('oauthConsentRepository').revoke(clientId, userId, nowSeconds)
  const tokensRevoked = await context.get('oauthTokenRepository')
    .revokeAllForClientAndUser(clientId, userId, nowSeconds)

  if (!consentRevoked && tokensRevoked === 0) {
    return context.json({ error: 'not_found', error_description: 'no active authorization for this client' }, 404)
  }
  return context.json({ revoked: true, tokensRevoked }, 200)
}
```

Rules for the executing agent:
- Do **not** add a `prepare(...)` call or import `D1Database` in this file. Repository interfaces only.
- Keep the `for` loop sequential (D1 has no parallelism benefit inside a Worker request, and the list is single-digit).
- `listForUser` already filters to live consents; do not re-filter on `revokedAt`.

## A3 — `apps/api/src/features/oauth/index.ts` (EDIT)

Add the import and, **after** the existing consent-API block and **before** the client-facing endpoints, register:

```ts
import { listConsentsHandler, revokeConsentHandler } from './consents'

// Connected-apps management: admin JWT only (never `acceptOAuth`), so a leaked
// access token cannot list the user's other clients or revoke its own audit row.
oauthApp.use('/oauth/consents', authMiddleware())
oauthApp.use('/oauth/consents/:clientId', authMiddleware())
oauthApp.get('/oauth/consents', listConsentsHandler)
oauthApp.delete('/oauth/consents/:clientId', revokeConsentHandler)
```
Extend the router's JSDoc block with a `4. **Connected-apps management**` bullet mirroring the existing style.

## A2 — `apps/api/src/features/oauth/consents.test.ts` (NEW)

Mirror the structure of `authorize.test.ts` (same harness, `createBeechApp` + `D1TestDatabase` + `seedTestUsers` or the in-file context stub that file already uses — follow whichever `authorize.test.ts` uses; do not invent a third harness). Required cases:
1. `GET /oauth/consents` without a JWT → `401`.
2. `GET /oauth/consents` returns `[]` for a user with no consents.
3. `GET /oauth/consents` returns one row with `name` from the client registry, `scopes` from the consent row, `hasActiveTokens: true` and a non-null `lastIssuedAt` when a live token exists.
4. `hasActiveTokens: false` and `lastIssuedAt: null` when the only token is expired (advance the injected `clock`).
5. `name` falls back to `clientId` when `findActiveById` returns `null` (disabled client).
6. `DELETE /oauth/consents/:clientId` returns `200 { revoked: true, tokensRevoked: n }` and a subsequent `GET` no longer lists the client.
7. `DELETE` on a client the user never authorized → `404` with `error: 'not_found'`.
8. Isolation: a consent belonging to user B is neither listed nor revocable by user A.

## A4 — `apps/api/test/flow-oauth-connected-apps.test.ts` (NEW)

Copy the preamble of `test/flow-oauth-authorization.test.ts` verbatim (`D1TestDatabase`, `seedTestUsers(db, TEST_USERS)`, `createBeechApp({ seeds: [] })`, `CLIENT_ID = 'beech-mcp-cli'`, `REDIRECT_URI = 'http://127.0.0.1:8976/callback'`, `CODE_VERIFIER = 'a'.repeat(64)`, `deriveCodeChallenge`). One `it(...)`:

```
login -> POST /oauth/authorize/consent (approved) -> POST /oauth/token
  -> GET /oauth/consents            expect 1 row, hasActiveTokens true
  -> DELETE /oauth/consents/beech-mcp-cli   expect 200, tokensRevoked >= 2
  -> GET /oauth/consents            expect []
  -> GET /api/seeds with the revoked access token   expect 401
  -> POST /oauth/token grant_type=refresh_token with the revoked refresh token  expect 400 invalid_grant
```
The last two assertions are the point of the test: they prove the cascade actually reaches the resource server built in Sprint 3.

## B1 — `src/features/oauth-consent/types/oauth.types.ts` (NEW)

The dashboard must not depend on `apps/api` types. Redeclare the wire contracts locally (they are the HTTP boundary, not shared logic — do not promote them to `@beechcms/core`):

```ts
/** Scope vocabulary mirrored from the authorization server (`@beechcms/core` OAUTH_SCOPES). */
export type OAuthScope = 'schema:read' | 'schema:write'

/** Response of `GET /oauth/authorize/request`. */
export interface AuthorizationRequestMetadata {
  client: { clientId: string; name: string }
  requestedScopes: OAuthScope[]
  newScopes: OAuthScope[]
  consentRequired: boolean
  redirectUri: string
  state: string
}

/** Body of `POST /oauth/authorize/consent` (OAuth params stay snake_case on the wire). */
export interface ConsentDecisionBody {
  response_type: string
  client_id: string
  redirect_uri: string
  scope: string
  state: string
  code_challenge: string
  code_challenge_method: string
  approved: boolean
}

/** One row of `GET /oauth/consents`. */
export interface ConnectedApp {
  clientId: string
  name: string
  scopes: OAuthScope[]
  grantedAt: number
  updatedAt: number
  lastIssuedAt: number | null
  hasActiveTokens: boolean
}
```

## B2 — `src/features/oauth-consent/api/oauth.api.ts` (NEW)

```ts
import { api } from '@/lib/api'
import type { AuthorizationRequestMetadata, ConsentDecisionBody, ConnectedApp } from '../types/oauth.types'

/**
 * The authorization server lives at `/oauth/*`, outside the `/api` prefix that
 * `api` is configured with. Overriding `baseURL` per request keeps the bearer
 * injection and the single-flight 401 refresh/retry interceptor in `lib/api.ts`,
 * which a bare `axios` call (as used by `/auth/login`) would lose.
 */
const AUTH_SERVER = { baseURL: '/' } as const

export const oauthApi = {
  getAuthorizationRequest: async (params: URLSearchParams): Promise<AuthorizationRequestMetadata> => {
    const { data } = await api.get<AuthorizationRequestMetadata>(
      `/oauth/authorize/request?${params.toString()}`, AUTH_SERVER)
    return data
  },

  submitConsent: async (body: ConsentDecisionBody): Promise<{ redirectTo: string }> => {
    const { data } = await api.post<{ redirectTo: string }>('/oauth/authorize/consent', body, AUTH_SERVER)
    return data
  },

  getConnectedApps: async (): Promise<ConnectedApp[]> => {
    const { data } = await api.get<ConnectedApp[]>('/oauth/consents', AUTH_SERVER)
    return data
  },

  revokeConnectedApp: async (clientId: string): Promise<void> => {
    await api.delete(`/oauth/consents/${encodeURIComponent(clientId)}`, AUTH_SERVER)
  },
}
```

## B3 — `src/features/oauth-consent/hooks/use-oauth-consent.ts` (NEW)

Mirror `use-settings.ts` exactly in shape:

```ts
export const OAUTH_QUERY_KEYS = {
  all: ['oauth'] as const,
  authorizationRequest: (raw: string) => [...OAUTH_QUERY_KEYS.all, 'authorize-request', raw] as const,
  connectedApps: () => [...OAUTH_QUERY_KEYS.all, 'connected-apps'] as const,
}

export function useAuthorizationRequest(params: URLSearchParams) {
  const raw = params.toString()
  return useQuery({
    queryKey: OAUTH_QUERY_KEYS.authorizationRequest(raw),
    queryFn: () => oauthApi.getAuthorizationRequest(params),
    enabled: params.get('client_id') !== null,
    retry: false,          // a 400 invalid_client must surface immediately, not after 3 retries
    staleTime: 0,          // never reuse a cached authorization request across flows
    gcTime: 0,
  })
}

export function useSubmitConsent() {
  return useMutation({ mutationFn: oauthApi.submitConsent })
}

export function useConnectedApps() {
  return useQuery({
    queryKey: OAUTH_QUERY_KEYS.connectedApps(),
    queryFn: oauthApi.getConnectedApps,
    staleTime: 60 * 1000,
  })
}

export function useRevokeConnectedApp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: oauthApi.revokeConnectedApp,
    onSuccess: () => qc.invalidateQueries({ queryKey: OAUTH_QUERY_KEYS.connectedApps() }),
  })
}
```

## B6 — `src/features/oauth-consent/pages/consent-page.tsx` (NEW)

Behaviour, in order:

1. `const [searchParams] = useSearchParams()` — the full OAuth query string forwarded by `authorizeHandler`.
2. `const { data, isLoading, error } = useAuthorizationRequest(searchParams)`.
3. `isLoading` → the same spinner markup as `SplashScreen` (a local copy, 6 lines; do not import from `App.tsx`).
4. `error` → a `Card` with `t('oauth.consent.errorTitle')` and the server's `error_description` when the axios error carries one, plus a "Back to dashboard" `Button` navigating to `/`.
5. **Silent re-consent**: when `data.consentRequired === false`, do not render the screen — fire the approval mutation once in an effect guarded by a `useRef` latch, then leave the SPA:
   ```ts
   window.location.assign(redirectTo)   // external loopback URL: never react-router navigate()
   ```
6. Otherwise render `<ConsentScreen metadata={data} params={searchParams} />`.

Both the approve and the deny path end in `window.location.assign(redirectTo)` — the server answers `200 { redirectTo }` in both cases, and `redirectTo` already carries `?error=access_denied&state=...` on denial.

## B4 — `src/features/oauth-consent/components/consent-screen.tsx` (NEW)

Presentation, strictly on existing primitives (`card`, `button`, `badge`, `separator`, `alert`):

- `Card` centred on `min-h-svh bg-background`, `max-w-md`.
- `CardHeader`: `Key` icon from `reicon-react` in a `bg-primary/10 text-primary` rounded square (copy the treatment at `settings-dialog.tsx:L138-140`), `CardTitle` = `t('oauth.consent.title', { client: metadata.client.name })`, `CardDescription` = `t('oauth.consent.subtitle')`.
- `CardContent`: one row per scope, iterating `metadata.requestedScopes`. Each row shows the `Badge` with the raw scope string and a translated explanation `t('oauth.consent.scopes.' + scope)`. Scopes present in `metadata.requestedScopes` but **absent** from `metadata.newScopes` get `variant="secondary"` and the suffix `t('oauth.consent.alreadyGranted')` — this is the incremental-consent affordance required by the brief.
- An `Alert` showing the destination: `t('oauth.consent.redirectNotice', { uri: metadata.redirectUri })`.
- `CardFooter`: `Button variant="outline"` → deny, `Button` → approve. Both disabled while the mutation is pending; the approve button shows a spinning `Loader`.
- Submission builds `ConsentDecisionBody` from `params` (`response_type`, `client_id`, `redirect_uri`, `scope`, `state`, `code_challenge`, `code_challenge_method`, each defaulting to `''` when absent) plus `approved`. On success `window.location.assign(data.redirectTo)`; on error `toast.error(t('oauth.consent.submitError'))`.

The component must be pure of routing concerns beyond reading the passed `params`, so B8 can render it under a `MemoryRouter` with a stubbed hook.

## B5 — `src/features/oauth-consent/components/connected-apps-tab.tsx` (NEW)

Copy `SecurityTab`'s session block structurally (`security-tab.tsx:L41-90`), substituting the data:

- Wrapper `Card` + `CardHeader` (`t('oauth.apps.title')` / `t('oauth.apps.description')`), `CardContent` with a `ScrollArea`.
- `isLoading` → 3 `Skeleton` rows; empty → muted `t('oauth.apps.empty')`.
- One `AppRow` per `ConnectedApp`:
  - left: `Key` icon, `name`, then a muted line `t('oauth.apps.grantedAt', { date })` where `date` uses the same `formatDate(ts)` helper shape as `security-tab.tsx:L35` (**re-declare it locally** — importing it from the settings slice would be the cross-slice import the VETO audit forbids);
  - a `Badge` per scope; a `Badge variant="outline"` reading `t('oauth.apps.noActiveTokens')` when `hasActiveTokens === false`;
  - right: ghost icon `Button` with `Trash2`, wrapped in `AlertDialog`/`AlertDialogTrigger asChild`, confirming with `t('oauth.apps.revokeTitle')` / `t('oauth.apps.revokeDesc', { client: app.name })`; on confirm call `useRevokeConnectedApp().mutateAsync(app.clientId)` then `toast.success(t('oauth.apps.revokeSuccess'))`, `toast.error(t('oauth.apps.revokeError'))` on failure.

## B7 — `src/features/oauth-consent/index.ts` (NEW)

```ts
export { ConsentPage } from './pages/consent-page'
export { ConnectedAppsTab } from './components/connected-apps-tab'
export type { ConnectedApp, OAuthScope, AuthorizationRequestMetadata } from './types/oauth.types'
```
Nothing else is exported; the api file and hooks stay slice-private.

## C1 — `src/App.tsx` (EDIT)

Two changes only.

1. `ProtectedRoute` must preserve the destination:
```tsx
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <SplashScreen />
  if (status === 'unauthenticated') {
    // Deep links (notably /oauth/consent, whose query string IS the OAuth
    // authorization request) must survive the login bounce.
    const returnTo = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />
  }
  return <>{children}</>
}
```
`useLocation` is already imported at `App.tsx:L6`.

2. New route inside the same `children` array (place it next to `/settings`):
```tsx
{
  path: "/oauth/consent",
  element: (
    <ProtectedRoute>
      <ConsentPage />
    </ProtectedRoute>
  ),
},
```
with `import { ConsentPage } from "@/features/oauth-consent"` beside the other feature imports.

## C2 — `use-login-form.ts` (EDIT)

```ts
import { useNavigate, useSearchParams } from "react-router-dom"
...
const [searchParams] = useSearchParams()
...
/**
 * Only same-origin absolute paths are honoured. A protocol-relative value
 * ("//evil.tld") or an absolute URL would turn the login form into an open
 * redirect, so anything that is not a single-slash path falls back to "/".
 */
function safeReturnTo(raw: string | null): string {
  if (!raw) return '/'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/'
  return raw
}
```
and replace `navigate('/', { replace: true })` (L94) with
```ts
navigate(safeReturnTo(searchParams.get('returnTo')), { replace: true })
```
`safeReturnTo` is a module-level function in the same file; export it so the login-form test can assert the rejection cases directly.

## C3 — `settings.types.ts` (EDIT)

```ts
export type SettingsTab = 'profile' | 'interface' | 'security' | 'storage' | 'notifications' | 'general' | 'content-types' | 'connected-apps'
```

## C4 — `settings-dialog.tsx` (EDIT)

- `import { Key } from "reicon-react"` (add to the existing icon import list).
- `import { ConnectedAppsTab } from "@/features/oauth-consent"` — placed next to the existing `SeedBuilderPage` import (L32), the file's established composition-root pattern.
- In the `account` group's `items`, after `security`:
  ```tsx
  { id: "connected-apps", label: t("settings.tabs.connectedApps", "Connected apps"), icon: Key },
  ```
- In `TabContent`, before `default`:
  ```tsx
  case "connected-apps":
    return <ConnectedAppsTab />
  ```

## C5 — `settings-dialog.test.tsx` (EDIT)

The file mocks every tab to keep the render lightweight; the new import would otherwise mount a real react-query component with no `QueryClientProvider`. Add next to the other mocks:
```tsx
vi.mock("@/features/oauth-consent", () => ({ ConnectedAppsTab: () => <div>CONNECTED_APPS_CONTENT</div> }))
```

## C6 — `src/locales/en.json` + `src/locales/it.json` (EDIT)

Add `settings.tabs.connectedApps` and a new top-level `oauth` block. English:
```json
"oauth": {
  "consent": {
    "title": "{{client}} wants to access BeechCMS",
    "subtitle": "Review the permissions before granting access.",
    "alreadyGranted": "already granted",
    "redirectNotice": "After approving you will be sent back to {{uri}}.",
    "approve": "Allow access",
    "deny": "Deny",
    "errorTitle": "This authorization request is not valid",
    "submitError": "Could not complete the authorization",
    "scopes": {
      "schema:read": "Read your content types and schema (including dry-run migration plans)",
      "schema:write": "Apply schema migrations that change your content types"
    }
  },
  "apps": {
    "title": "Connected apps",
    "description": "Applications you have authorized to access BeechCMS on your behalf.",
    "empty": "No connected apps",
    "grantedAt": "Authorized on {{date}}",
    "noActiveTokens": "no active token",
    "revokeTitle": "Revoke access?",
    "revokeDesc": "{{client}} will immediately lose access. Any active token is invalidated.",
    "revokeSuccess": "Access revoked",
    "revokeError": "Error revoking access"
  }
}
```
Italian mirrors it key-for-key (`"Consenti accesso"`, `"Nega"`, `"App connesse"`, `"Revoca accesso?"`, …). Both files must stay structurally identical — a key present in one and missing in the other is a defect.

## C7 — `vite.config.ts` (EDIT)

```ts
      '/oauth': {
        target: 'http://127.0.0.1:8789',
        changeOrigin: true,
      },
```
added to `server.proxy` next to `/api` and `/auth`. Without it the consent screen's XHRs hit the Vite dev server and 404, which makes the whole sprint unverifiable locally.

> **Local dev caveat to document in the PR body, not to fix here:** `GET /oauth/authorize` is served by the Worker on `:8789` and redirects to `/admin/oauth/consent` relative to *its own* origin. In `pnpm beech dev` the browser therefore lands on the Worker-served build of the dashboard, not on the Vite dev server. Testing the redirect against hot-reloaded code means opening `http://localhost:5173/admin/oauth/consent?<query>` by hand. Production is unaffected: Worker Assets serve both.

## B8 / B9 — dashboard tests (NEW)

Co-located, vitest + `@testing-library/react`, wrapped in `MemoryRouter` and a fresh `QueryClientProvider` (`retry: false`). Mock `../api/oauth.api` with `vi.mock`.

`consent-screen.test.tsx`:
1. renders the client name and one row per requested scope;
2. a scope absent from `newScopes` renders the "already granted" marker;
3. clicking Allow posts `approved: true` with every PKCE parameter copied from the query string;
4. clicking Deny posts `approved: false`;
5. both paths call the injected navigation side-effect with `redirectTo` (stub `window.location.assign` via a prop or a module-level indirection — do **not** try to reassign `window.location` in happy-dom).

`connected-apps-tab.test.tsx`:
1. loading state renders skeletons;
2. empty list renders the empty message;
3. one app renders its name, its scope badges and the "no active token" badge only when `hasActiveTokens === false`;
4. confirming the dialog calls `revokeConnectedApp` with the right `clientId` and shows the success toast.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# 1. core must be untouched but still build (proves no accidental edit)
pnpm --filter @beechcms/core run build

# 2. API typecheck + tests
cd apps/api && npx tsc --noEmit && cd -
pnpm --filter @beechcms/api test -- consents.test.ts
pnpm --filter @beechcms/api test -- flow-oauth-connected-apps.test.ts
pnpm --filter @beechcms/api test -- flow-oauth-authorization.test.ts flow-oauth-resource-server.test.ts   # regression

# 3. Dashboard typecheck, lint, tests
pnpm --filter @beechcms/dashboard run type-check
pnpm --filter @beechcms/dashboard run lint
pnpm --filter @beechcms/dashboard test -- oauth-consent
pnpm --filter @beechcms/dashboard test -- settings-dialog barrels login-form   # regression on the edited files

# 4. Full workspace gate
pnpm beech test --diff
pnpm lint

# 5. Manual end-to-end (no migration needed: no schema change in this sprint)
pnpm beech dev
#   open:
#   http://127.0.0.1:8789/oauth/authorize?response_type=code&client_id=beech-mcp-cli
#     &redirect_uri=http://127.0.0.1:8976/callback&scope=schema:read%20schema:write
#     &state=xyz&code_challenge=<S256 of a 64-char verifier>&code_challenge_method=S256
#   expected: 302 -> /admin/oauth/consent?... ; logged out -> /admin/login?returnTo=... ;
#   after login the consent card renders; Allow -> 302 to 127.0.0.1:8976/callback?code=...&state=xyz
#   then Settings -> Connected apps lists "beech-mcp-cli"; revoke empties the list.
```
`pnpm beech db:migrate` / `db:reset` are **not** part of this sprint's validation: no migration is added.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

**Architecture**
- [ ] `git diff --stat packages/core` is empty. No core interface, type or migration was added or changed.
- [ ] No file under `apps/api/migrations/` was added or modified.
- [ ] `apps/api/src/features/oauth/consents.ts` contains no `prepare(`, no `D1Database`, no raw SQL, and no import from another `features/*` slice.
- [ ] `apps/dashboard/src/features/oauth-consent/**` imports nothing from `@/features/settings` (verify: `grep -r "@/features/settings" apps/dashboard/src/features/oauth-consent` returns nothing).
- [ ] The only import of `@/features/oauth-consent` outside its own slice is in `App.tsx` and `settings-dialog.tsx`, the two composition roots.
- [ ] `apps/api/src/factory.ts`, `authorize.ts`, `token.ts`, `revoke.ts` and `oauth-scope.middleware.ts` are unmodified.

**Security**
- [ ] `GET /oauth/consents` and `DELETE /oauth/consents/:clientId` are registered with `authMiddleware()` **without** `{ acceptOAuth: true }`; a valid OAuth access token receives `401` on both (asserted in `flow-oauth-connected-apps.test.ts`).
- [ ] Revocation is cascading: after `DELETE`, both the access token (→ `401` on `/api/seeds`) and the refresh token (→ `400 invalid_grant` on `/oauth/token`) are dead.
- [ ] A consent belonging to another user is neither listed nor revocable (test 8 in A2).
- [ ] `safeReturnTo` rejects `//evil.tld`, `https://evil.tld` and any value not starting with a single `/`, falling back to `/`; asserted by a unit test.
- [ ] The consent screen never reads or writes an OAuth token; it only carries query parameters and calls JWT-authenticated endpoints.

**Typing & build**
- [ ] `npx tsc --noEmit` in `apps/api` and `pnpm --filter @beechcms/dashboard run type-check` both pass with zero errors.
- [ ] No `any` in the new files; `ConnectedAppSummary`, `ConnectedApp`, `AuthorizationRequestMetadata` and `ConsentDecisionBody` are fully typed and JSDoc'd in the house style.
- [ ] `pnpm lint` passes (SPDX/copyright header present on every new file).

**Functional**
- [ ] `/admin/oauth/consent` renders one row per requested scope, marking already-granted scopes distinctly.
- [ ] `consentRequired === false` performs a silent re-consent and redirects without any user click, exactly once (ref-latched effect, no double submission in React StrictMode).
- [ ] Deny redirects to the client with `error=access_denied` and the original `state`.
- [ ] A logged-out user who opens `/oauth/authorize` completes the flow after logging in, with every OAuth parameter intact.
- [ ] Settings → Connected apps lists every live consent — including one whose tokens have all expired, flagged "no active token".
- [ ] Every user-visible string goes through `t(...)`, and `en.json` / `it.json` have identical key sets.

**Tests**
- [ ] `consents.test.ts` covers all 8 listed cases; `flow-oauth-connected-apps.test.ts` covers the full loop.
- [ ] `consent-screen.test.tsx` and `connected-apps-tab.test.tsx` cover the listed cases.
- [ ] `settings-dialog.test.tsx` passes with the added mock; `barrels.test.ts` and the login-form tests still pass.
- [ ] `pnpm beech test --diff` is green.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT build or modify:

1. **Anything in `packages/mcp`.** The browser + PKCE client, the loopback listener, the token cache and the removal of `BEECH_EMAIL` / `BEECH_PASSWORD` belong to **Sprint 5 `mcp-pkce-client`** (ROADMAP entry #5). The consent screen must be validated with a hand-crafted URL, not by wiring the MCP client.
2. **Any change to `packages/core`.** No new repository method (e.g. `listConsentsWithClientNames`), no new scope, no `IRoleGuard` adapter. The real role-based adapter is deferred until the roles feature exists (feature brief §5).
3. **An OAuth client-registration UI.** Creating, editing or disabling `oauth_clients` rows from the dashboard is not requested by any user story; clients stay seeded/registered out of band.
4. **New scopes or per-route scope changes.** `OAUTH_SCOPE_ROUTES` in `apps/api/src/middleware/oauth-scope.middleware.ts` is frozen for this sprint; it shipped in Sprint 3.
5. **Reference documentation for the OAuth endpoints.** `docs/reference/` has no `oauth-*.md` and `factory.docs-parity.test.ts` does not require one; writing the full OAuth reference is a separate docs task, not a UI sprint deliverable.
6. **Refactoring `src/lib/api.ts`.** No second axios instance, no interceptor rework — the per-request `{ baseURL: '/' }` override is the sanctioned mechanism.
7. **Extracting a shared `formatDate` helper.** Duplicating the 5-line formatter inside the new slice is deliberate; promoting it to `src/lib/utils.ts` is a cross-cutting refactor this sprint does not authorize.
8. **Multi-tenant / organisation consent flows, delegated consent, or a consent audit-log page.** Explicitly discarded in the feature brief §5.
9. **Changing `/auth/login`, `/auth/refresh` or `AuthProvider` semantics.** The only auth-adjacent edit permitted is the `returnTo` round-trip described in C1/C2.
