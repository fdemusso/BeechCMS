# Sprint Plan — `oauth-authorization-server`

Roadmap: Sprint 2 of 5 (`output/backlog/ROADMAP.md`). Depends on Sprint 1 `oauth-core-foundation`, already landed on `feature/oauth-core-foundation` (commit `00e3315`).

---

### Pre-Computation Analysis

**a) God Nodes identified via graphify CLI**

| Node | Evidence | Why it is a God Node for this sprint |
|---|---|---|
| `createBeechApp()` — `apps/api/src/factory.ts:99` | `graphify affected "createBeechApp" --depth 1` → 25 dependents (every `apps/api/test/flow-*.test.ts`, `apps/api/src/index.ts`, `public-add.test.ts`, `client-sdk-e2e.test.ts`) | Single composition root. Every route mount and middleware ordering change lands here and is observed by the whole integration suite. |
| `repositoryMiddleware()` — `apps/api/src/middleware/repository.middleware.ts:91` | `graphify explain "repositoryMiddleware"` → degree 5, called by `createBeechApp()` at `factory.ts:111`, community `repository.middleware.ts` | Sole DI container. The four `oauth*Repository` bindings already sit here (L142–L145); `roleGuard` must join them. |
| `authMiddleware()` — `apps/api/src/middleware/auth.middleware.ts:24` | `graphify explain "authMiddleware"` → degree 9; imported by `factory.ts:16`, `features/search/search.ts:18`, called at `factory.ts:217` and `factory.ts:254` | The only JWT gate. Sprint 2 *reuses it unchanged* on two OAuth sub-routes; Sprint 3 is the sprint that modifies it. Touching it now would break `search.ts` and both custom-route routers. |
| `buildDefaultRegistry()` — `apps/api/src/middleware/rate-limit.middleware.ts:25` | `graphify affected "buildDefaultRegistry" --depth 2` → `rateLimiterMiddleware()`, `createBeechApp()` (`factory.ts:134`), `rate-limit.middleware.test.ts`, `apps/api/test/flow-admin-auth.test.ts` | `RateLimiterName` is a closed union; adding `oauthToken` / `oauthTokenAccount` widens a type consumed by the registry record literal, which is exhaustiveness-checked. |
| `AllowAllRoleGuard` — `packages/core/src/oauth/role-guard.ts:35` | `graphify explain "AllowAllRoleGuard"` → degree 4: `contains`, `implements IRoleGuard`, `.arbitrate()`, and **only** `role-guard.test.ts` as importer | **Confirmed dangling contract.** Sprint 1 shipped it but never wired it; `grep -rn "roleGuard\|RoleGuard" apps/api/src` returns zero hits. Wiring it is a Sprint 2 deliverable, not an assumption. |

**b) Architectural boundaries affected**

| Package | Touched? | What exactly |
|---|---|---|
| `@beechcms/core` | **NO new code.** Read-only consumption. | Sprint 2 consumes only the already-exported Sprint 1 contracts (`packages/core/src/index.ts` L35–L41): `parseScopeString`, `formatScopes`, `isScopeSubset`, `OAuthScope`, `verifyPkceChallenge`, `PKCE_CHALLENGE_METHOD`, `IRoleGuard`, `AllowAllRoleGuard`, the four repository interfaces, plus the pre-existing `sha256hex`, `SystemClock`, `SystemIdGenerator`. Zero edits to `packages/core`. |
| `apps/api` | **YES — one new slice + 4 wiring edits.** | New `apps/api/src/features/oauth/`. Modified: `src/types.ts` (add `roleGuard` to `Variables`), `src/middleware/repository.middleware.ts` (bind `AllowAllRoleGuard`), `src/middleware/rate-limit.middleware.ts` (2 new limiter names), `src/factory.ts` (mount `oauthApp`, thread `roleGuard` override). |
| `apps/dashboard` | **NO.** | The consent screen is Sprint 4. `GET /oauth/authorize` redirects to `/admin/oauth/consent` — a route that does not exist yet and **must not** be created in this sprint. Until Sprint 4 lands, that redirect resolves to the SPA fallback (`factory.ts:276` serves `index.html` for any unmatched `/admin/*`), which is an acceptable interim state for a branch that is not user-facing. |

**c) `graphify affected` impact analysis (breaking-change proof)**

- `graphify affected "createBeechApp" --depth 1` — 25 dependents, **all of them test files or `apps/api/src/index.ts`**. No production module calls it besides the worker entrypoint. Adding `app.route('/', oauthApp)` is purely additive: Hono route registration order only matters against `app.route('/api', apiProtected)` (`factory.ts:262`), and `/oauth/*` shares no prefix with `/api`, `/auth`, `/admin` or `/api/v1/public`. **No existing route is shadowed.**
- `graphify affected "buildDefaultRegistry" --depth 2` — 5 dependents. The only type-level risk is the `Record<RateLimiterName, IRateLimiter>` literal at `rate-limit.middleware.ts:26`, which the compiler forces to be extended in the same commit. `flow-admin-auth.test.ts` builds a **partial** custom registry via `getLimiter`, so it is unaffected by new names it never requests.
- `graphify explain "authMiddleware"` — 9 edges. Sprint 2 **imports it without modifying it**, so all 9 edges are preserved. This is the explicit reason scope enforcement is deferred to Sprint 3.
- `graphify explain "AllowAllRoleGuard"` — degree 4, no `apps/api` importer. Adding the binding in `repositoryMiddleware` creates the first production edge into it; nothing can break because nothing depends on it yet.
- `graphify path "requestPasswordReset" "D1Database"` — **`No directed path found`**. Verified precedent: an existing public auth slice reaches persistence exclusively through context-injected repository interfaces, never through a D1 handle. The new OAuth slice must produce the same negative result.

---

### VETO Audit

Proposal evaluated against `_config/ponytail_arch.md`.

**1. Botanical Invariant — no D1 bypass.**
Every handler in `features/oauth/` obtains persistence solely via `context.get('oauthClientRepository' | 'oauthAuthorizationCodeRepository' | 'oauthTokenRepository' | 'oauthConsentRepository' | 'userRepository')`. The slice imports **no** `D1Database` type, **no** `context.env.DB`, and **no** `../shared/db/**` module. Verification is mechanical: `grep -rn "env.DB\|D1Database\|shared/db" apps/api/src/features/oauth/` must return zero, and `graphify path "issueAuthorizationCode" "D1Database"` must report `No directed path found`, matching the `requestPasswordReset` precedent above.
No Branch-ID (`br_XX`) concern arises: `oauth_*` are system tables written through repositories, not `content_{slug}` tables, so `apiToDb`/`dbToApi` are not on this path at all.

**2. VSA — zero cross-feature imports.**
`apps/api/src/features/oauth/` imports from exactly two external sources — `hono` and `@beechcms/core` — plus non-feature api modules under `../../`: `../../types`, `../../middleware/auth.middleware`, `../../shared/utils/opaque-token`, `../../shared/utils/dual-key-rate-limiter`, `../../shared/utils/request-utils`. It imports from **no directory under `features/` other than its own**. Enforcement check: no import matching `../<name>/` with a single `../` level (see SECTION 5 step 7).

One violation was found during drafting and corrected here: the first draft reused `generateRefreshToken()` from `apps/api/src/auth/utils/refresh-token.ts`, which belongs to the dashboard-session auth domain.

**Adjustment (revised).** The first fix — letting the slice define its own private `generateOpaqueToken()` — was wrong, and is rejected. Rule 3 of `ponytail_arch.md` reads *"If two slices need the same logic, mandate moving it to `@beechcms/core` or shared libs"*: it mandates promotion, not duplication. The rationale originally given ("a change to session-token generation would silently alter OAuth token entropy") inverted the argument — a single audited CSPRNG source is the goal, not a hazard. Duplicating four lines of *presentation* logic is cheap; duplicating the one place the system draws entropy is not, because a later change (32 → 48 bytes, hex → base64url) would have to be made twice and would silently rot in whichever copy is forgotten.

**Correct resolution:** promote the generator to `apps/api/src/shared/utils/opaque-token.ts` as `generateOpaqueToken()`, consumed by both `auth/auth.app.ts` and the OAuth slice. Measured cost: `grep -rn "utils/refresh-token" apps/api --include="*.ts"` returns **exactly one importer** (`auth/auth.app.ts:22`), plus one adjacent test file to relocate. Node count is unchanged (rule 5 satisfied), duplication is zero, and `shared/utils/` is the established home for exactly this — `dual-key-rate-limiter.ts` and `request-utils.ts` already sit there and are already shared between `auth/` and feature slices.

**`@beechcms/core` was considered and rejected as the destination.** Core already exports `sha256hex`, so adjacency would be defensible, but core is a published, versioned contracts package: widening its surface belongs to a sprint that owns its build and release. A CSPRNG helper is infrastructure, not a domain contract. `shared/utils/` is the right altitude, and it keeps this sprint's "zero edits to `packages/core`" boundary intact.

**3. Cloudflare purity.**
No ORM, no background job, no new binding, no schema change. Migration `0038_oauth_authorization.sql` already landed in Sprint 1 and is **not** re-opened. Expired rows are filtered at read time by `expires_at` (per the migration header), so no pruning cron is introduced.

**4. YAGNI.**
Rejected during audit and pushed to SECTION 7: dynamic client registration (RFC 7591), client secrets / confidential-client authentication, `/.well-known/oauth-authorization-server` discovery metadata, JWT-format access tokens, token introspection (RFC 7662), and any dashboard UI. Endpoint count held to five handlers across three URL prefixes — the minimum that closes an authorization-code + PKCE loop.

**5. Scope discipline vs. Sprint 3.**
`authMiddleware()` is deliberately left byte-identical. OAuth access tokens issued by this sprint are **not yet accepted** by `apiProtected`. That is correct and intentional: making them accepted is Sprint 3's single deliverable, and doing it here would put two independently-validatable boundaries in one merge.

Verdict: **no violation stands.** Plan approved. HANDOFF -> caveman_coder.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 1 landed four D1 tables and seven zero-dependency contracts in `@beechcms/core` with **no HTTP surface at all**. As of `00e3315` the system can persist authorization codes, tokens and consents, but nothing can create one: `oauth_clients` holds exactly one seeded row (`beech-mcp-cli`) and the other three tables can only ever be empty. `AllowAllRoleGuard` has, by graphify measurement, a single importer — its own unit test.

This sprint is the one that turns that dormant persistence layer into a working authorization server, and it must come before everything else downstream for a hard sequencing reason: **no token with a `scope` claim exists until the token endpoint issues one.** Sprint 3 (resource-server scope enforcement), Sprint 4 (consent UI) and Sprint 5 (MCP PKCE client) each require a real, redeemable token to validate against. Any of them planned before this one would be written against an imagined wire format.

**VSA adherence.** The authorization server is a new vertical slice, `apps/api/src/features/oauth/`, self-contained from HTTP parsing down to repository calls. It reaches no sibling slice and no sibling slice reaches it. Its only outward edges are the composition root (`factory.ts`), the shared context type (`types.ts`), the DI container (`repository.middleware.ts`) and the shared limiter registry (`rate-limit.middleware.ts`) — precisely the four wiring points every slice in this codebase touches, and nothing more.

**Botanical Engine adherence.** The slice holds no database handle. It reads and writes exclusively through the `IOAuth*Repository` interfaces injected into `Variables`, exactly as `features/password-reset/` does — a precedent verified structurally, not assumed: `graphify path "requestPasswordReset" "D1Database"` finds no directed path, and the OAuth slice must satisfy the same property.

**Role-guard invariant (feature brief rule 4).** The brief forbids role logic inside `/oauth/authorize` and `/oauth/token`. Sprint 1 defined `IRoleGuard` for this but never bound it. This sprint creates its first and only production call site — one `await roleGuard.arbitrate(...)` at consent time — so that introducing a real role system later means swapping one binding in `repositoryMiddleware` and touching no handler.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Composition root — `apps/api/src/factory.ts:99` `createBeechApp()`**

Middleware registration order on the root app, verbatim from the file:

| # | Line | Registration | Note |
|---|---|---|---|
| 1 | L111 | `app.use('*', repositoryMiddleware({...}))` | Must be first — `seedRegistryMiddleware` depends on `seedRepository`. Sets all repositories incl. the four `oauth*` ones (L142–L145). |
| 2 | L124 | `app.use('*', seedRegistryMiddleware())` | |
| 3 | L127 | `app.use('*', storageMiddleware({...}))` | |
| 4 | L131 | `app.use('*', queueMiddleware(...))` | |
| 5 | L133 | `app.use('*', authProvidersMiddleware())` | |
| 6 | L134 | `app.use('*', rateLimiterMiddleware(...))` | Sets `rateLimiters` registry. **Runs before any route**, so `/oauth/token` has the registry available. |
| 7 | L135 | `app.use('*', observabilityMiddleware())` | |
| 8 | L137 | inline CORS | `allowHeaders: ['Content-Type','Authorization','X-API-Key','Idempotency-Key']` |
| 9 | L178 | inline security headers | skipped for `/admin` |
| 10 | L189 | `app.use('/api/*', ...)` analytics | `/oauth/*` is **not** under `/api`, so it is not analytics-tracked. Acceptable. |

Route mount order:

| Line | Mount |
|---|---|
| L211 | `app.route('/', authApp)` — `/auth/login`, `/auth/refresh`, `/auth/logout` |
| L212 | `app.route('/', setupApp)` |
| L213 | `app.route('/', passwordResetApp)` — `/auth/features`, `/auth/forgot-password`, `/auth/reset-password` |
| L216–L232 | `apiProtected` built; `apiProtected.use('*', authMiddleware())` at L217 |
| L242 | `app.route('/api/v1/public', apiPublic)` |
| L245 | `app.route('/api/webhooks', webhooksApp)` |
| L247 | `app.get('/api/media/:key{.+}', ...)` |
| L250–L260 | optional `config.customRoutes` |
| L262 | `app.route('/api', apiProtected)` |
| L265–L288 | `/admin` SPA (Workers `ASSETS`, SPA fallback to `index.html` at L276) |

**Context contract — `apps/api/src/types.ts`**

`Variables` already carries (Sprint 1, verified in file):
```ts
oauthClientRepository: IOAuthClientRepository
oauthAuthorizationCodeRepository: IOAuthAuthorizationCodeRepository
oauthTokenRepository: IOAuthTokenRepository
oauthConsentRepository: IOAuthConsentRepository
```
plus pre-existing `jwtPayload: JwtClaims`, `userRepository`, `tokenService`, `rateLimiters`, `clock: IClock`, `idGenerator: IIdGenerator`.
**`roleGuard` is absent.** `AppEnv = { Bindings: Env; Variables: Variables }`.

**DI container — `apps/api/src/middleware/repository.middleware.ts`**

L142–L145 bind the four D1 OAuth repositories:
```ts
context.set('oauthClientRepository', overrides?.oauthClientRepository ?? new D1OAuthClientRepository(database))
context.set('oauthAuthorizationCodeRepository', overrides?.oauthAuthorizationCodeRepository ?? new D1OAuthAuthorizationCodeRepository(database, resolvedClock))
context.set('oauthTokenRepository', overrides?.oauthTokenRepository ?? new D1OAuthTokenRepository(database, resolvedClock))
context.set('oauthConsentRepository', overrides?.oauthConsentRepository ?? new D1OAuthConsentRepository(database, resolvedIdGenerator))
```
`RepositoryOverrides` (L41–L75) already declares the four optional overrides. No `roleGuard` entry.

**Rate limiting — `apps/api/src/middleware/rate-limit.middleware.ts`**

`RateLimiterName` is the closed union `'login' | 'loginAccount' | 'tokenRefresh' | 'forgotPassword' | 'forgotPasswordAccount' | 'resetPassword' | 'publicApiRead' | 'publicApiWrite'`; `buildDefaultRegistry` builds a `Record<RateLimiterName, IRateLimiter>` of `TokenBucketRateLimiter`s. The dual-key helper is `apps/api/src/shared/utils/dual-key-rate-limiter.ts` → `checkDualKeyRateLimit({ ipLimiter, accountLimiter, clientIp, accountKey })` returning `{ isAllowed, retryAfterSeconds?, blockedBy? }`, plus `normalizeAccountKey()`. Client IP comes from `getClientIp(context.req)` in `apps/api/src/shared/utils/request-utils.ts`.

**Hash-and-rotate precedent — `apps/api/src/auth/auth.app.ts`**

`/auth/login` (L164–L173): random token → `sha256hex(token)` → persist hash only, plaintext returned to the caller once.
`/auth/refresh` (L210–L240): **issue the new pair before revoking the old one**, and if `revokeByHash` returns `false`, revoke the just-issued token and return 401. Sprint 2's refresh-token rotation replicates this rollback shape exactly.

**Sprint 1 contracts consumed (read-only)**

- `scopes.ts`: `OAUTH_SCOPES = ['schema:read','schema:write']`, `parseScopeString(raw): OAuthScope[] | null` (null on empty **or** unknown scope), `formatScopes()`, `isScopeSubset(requested, granted)`.
- `pkce.ts`: `PKCE_CHALLENGE_METHOD = 'S256'`, `verifyPkceChallenge(verifier, challenge, method): Promise<boolean>` — never throws, returns `false` for non-`S256` methods, malformed verifiers and mismatches alike.
- `role-guard.ts`: `IRoleGuard.arbitrate(role: string | undefined, requestedScopes): Promise<ScopeGrantDecision>` where `ScopeGrantDecision = { grantedScopes, deniedScopes }`; `AllowAllRoleGuard` grants everything.
- `client.repository.ts`: `findActiveById(clientId): Promise<OAuthClientRecord | null>` — already returns `null` for disabled clients, so handlers must not re-check `disabledAt`.
- `authorization-code.repository.ts`: `save()`, `findByHash(codeHash, now)` (returns consumed codes too — caller inspects `consumedAt`), `consumeByHash(codeHash, now): Promise<boolean>` (true only for the first caller).
- `token.repository.ts`: `save()`, `findActiveByHash(hash, type, now)`, `revokeByHash()`, `revokeByAuthorizationCode(codeHash, now)`, `revokeAllForClientAndUser()`, `listAuthorizedClientsForUser()`.
- `consent.repository.ts`: `findActive(clientId, userId)`, `grant(id, clientId, userId, scopes, now)` (unions scopes, revives revoked rows), `revoke()`, `listForUser()`.

**D1 state (migration `0038`, already applied)**

Tables `oauth_clients`, `oauth_authorization_codes`, `oauth_tokens`, `oauth_consents`. Seeded client:
`client_id='beech-mcp-cli'`, `redirect_uris='["http://127.0.0.1/callback"]'`, `allowed_scopes='schema:read schema:write'`, `is_public=1`.
The migration header states Sprint 2 must match loopback redirect URIs on **host + path, ignoring the port** (OAuth 2.1 §8.4.2), since the local listener port is runtime-assigned.

**Test harness**

`apps/api/test/helpers/d1-test-database.ts` — `new D1TestDatabase()` runs every `NNNN_*.sql` migration containing `CREATE`/`ALTER TABLE` against in-memory `node:sqlite`, so `0038` and its seeded client row are present by default. `apps/api/test/helpers/seed-fixtures.ts` → `seedTestUsers(db, TEST_USERS)`; constants in `apps/api/test/fixtures.ts` (`TEST_USERS`, `TEST_ENV`). Apps are exercised via `app.request(path, init, { ...TEST_ENV, DB: db })`.

**Dashboard (not modified, referenced only as a redirect target)**

`apps/dashboard/src/App.tsx:235` — `createBrowserRouter([...], { basename: '/admin' })`, with `/login` at L126. The consent screen route will therefore be `/admin/oauth/consent` once Sprint 4 adds it.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**New files — `apps/api/src/features/oauth/` (the entire feature slice)**

| File | Contents |
|---|---|
| `constants.ts` | TTLs, error codes, error-message table. No logic. |
| `authorization-request.ts` | Pure functions: parse + validate the authorization request query, and loopback-aware redirect-URI matching. Zero I/O. |
| `authorization-request.test.ts` | Unit tests for the above. |
| `token-issuance.ts` | `issueTokenPair()` — persists the hashed access/refresh pair through `IOAuthTokenRepository`. Entropy comes from the shared `generateOpaqueToken()`, never from a private copy. |
| `authorize.ts` | `GET /oauth/authorize`, `GET /oauth/authorize/request`, `POST /oauth/authorize/consent`. Sole `roleGuard.arbitrate()` call site. |
| `token.ts` | `POST /oauth/token` — `authorization_code` and `refresh_token` grants, PKCE verification, replay cascade, refresh rotation. |
| `revoke.ts` | `POST /oauth/revoke` — RFC 7009, always 200. |
| `index.ts` | `oauthApp` router; applies `authMiddleware()` to the two authenticated sub-routes only. |
| `authorize.test.ts` | Handler tests (in-slice, `D1TestDatabase`). |
| `token.test.ts` | Handler tests incl. replay cascade and rotation rollback. |
| `revoke.test.ts` | Handler tests. |

**New file — integration**

| File | Contents |
|---|---|
| `apps/api/test/flow-oauth-authorization.test.ts` | Full loop through `createBeechApp`: login → authorize → consent → code → token → refresh → revoke, plus the replay-cascade and rate-limit paths. |

**Promoted shared util (moved, not duplicated)**

| File | Change |
|---|---|
| `apps/api/src/shared/utils/opaque-token.ts` | **New.** Holds `generateOpaqueToken()` — 256 bits of CSPRNG entropy, hex-encoded. Body is `refresh-token.ts` verbatim; only the name and the doc comment change. Sole entropy source for session refresh tokens, OAuth authorization codes, and OAuth access/refresh tokens. |
| `apps/api/src/shared/utils/opaque-token.test.ts` | **New (moved).** Relocated from `apps/api/src/auth/utils/refresh-token.test.ts`, renamed symbol, assertions unchanged. |
| `apps/api/src/auth/utils/refresh-token.ts` | **Deleted.** |
| `apps/api/src/auth/utils/refresh-token.test.ts` | **Deleted** (superseded by the moved test above). |

**Modified files (5: 4 wiring + 1 import rewrite)**

| File | Change |
|---|---|
| `apps/api/src/auth/auth.app.ts` | L22: replace `import { generateRefreshToken } from './utils/refresh-token'` with `import { generateOpaqueToken } from '../shared/utils/opaque-token'`; rename the two call sites (L164, L218). No behavioural change — same 32 bytes, same hex encoding. |
| `apps/api/src/types.ts` | Add `roleGuard: IRoleGuard` to `Variables`; add `IRoleGuard` to the `@beechcms/core` type import list. |
| `apps/api/src/middleware/repository.middleware.ts` | Add `roleGuard?: IRoleGuard` to `RepositoryOverrides`; import `AllowAllRoleGuard` (value) and `IRoleGuard` (type) from `@beechcms/core`; `context.set('roleGuard', ...)` after L145. |
| `apps/api/src/middleware/rate-limit.middleware.ts` | Extend `RateLimiterName` with `'oauthToken' \| 'oauthTokenAccount'`; add both to `buildDefaultRegistry`. |
| `apps/api/src/factory.ts` | Import `oauthApp`; `app.route('/', oauthApp)` immediately after L213; add `roleGuard?: IRoleGuard` to `BeechConfig` and thread it into the `repositoryMiddleware({...})` call. |

**Explicitly excluded from this sprint's code:** any file under `packages/core/`, any file under `apps/dashboard/`, any file under `apps/api/migrations/`, and `apps/api/src/middleware/auth.middleware.ts`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

## 4.0 D1 migrations

**None.** `0038_oauth_authorization.sql` landed in Sprint 1 and is complete for this sprint. Do **not** create `0039_*`, do not `ALTER` any `oauth_*` table, do not edit `0038`.

---

## 4.1 `apps/api/src/features/oauth/constants.ts`

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/** Authorization code lifetime. OAuth 2.1 §4.1.2 recommends <= 60s. */
export const AUTHORIZATION_CODE_TTL_SECONDS = 60

/** Access token lifetime, matching the 15m admin JWT convention. */
export const ACCESS_TOKEN_TTL_SECONDS = 900

/** Refresh token lifetime (30 days). */
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

/** Dashboard SPA route that renders the consent screen (built in Sprint 4). */
export const CONSENT_SCREEN_PATH = '/admin/oauth/consent'

/** RFC 6749 §4.1.2.1 / §5.2 + RFC 7636 error codes used by this slice. */
export const OAUTH_ERRORS = {
  INVALID_REQUEST: 'invalid_request',
  INVALID_CLIENT: 'invalid_client',
  INVALID_GRANT: 'invalid_grant',
  INVALID_SCOPE: 'invalid_scope',
  UNAUTHORIZED_CLIENT: 'unauthorized_client',
  UNSUPPORTED_RESPONSE_TYPE: 'unsupported_response_type',
  UNSUPPORTED_GRANT_TYPE: 'unsupported_grant_type',
  ACCESS_DENIED: 'access_denied',
  SERVER_ERROR: 'server_error',
} as const

export type OAuthErrorCode = (typeof OAUTH_ERRORS)[keyof typeof OAUTH_ERRORS]
```

---

## 4.2 `apps/api/src/features/oauth/authorization-request.ts`

Pure, I/O-free. Everything here is unit-testable without D1 or Hono.

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import {
  PKCE_CHALLENGE_METHOD,
  isScopeSubset,
  parseScopeString,
  type OAuthClientRecord,
  type OAuthScope,
} from '@beechcms/core'
import { OAUTH_ERRORS, type OAuthErrorCode } from './constants'

/** The raw authorization request as it arrives on the wire (query or JSON body). */
export interface RawAuthorizationRequest {
  responseType?: string
  clientId?: string
  redirectUri?: string
  scope?: string
  state?: string
  codeChallenge?: string
  codeChallengeMethod?: string
}

/** A request that passed every syntactic and client-bound check. */
export interface ValidAuthorizationRequest {
  clientId: string
  redirectUri: string
  scopes: OAuthScope[]
  state: string
  codeChallenge: string
  codeChallengeMethod: typeof PKCE_CHALLENGE_METHOD
}

/**
 * `fatal` errors MUST NOT redirect: the redirect target itself is untrusted
 * (RFC 6749 §4.1.2.1). `redirectable` errors are returned to the client as
 * query parameters on its registered redirect_uri.
 */
export type AuthorizationRequestValidation =
  | { ok: true; request: ValidAuthorizationRequest }
  | { ok: false; kind: 'fatal'; error: OAuthErrorCode; description: string }
  | { ok: false; kind: 'redirectable'; error: OAuthErrorCode; description: string; redirectUri: string; state: string }

/** Reads a raw authorization request out of URL search params. */
export function readAuthorizationRequestFromQuery(params: URLSearchParams): RawAuthorizationRequest {
  return {
    responseType: params.get('response_type') ?? undefined,
    clientId: params.get('client_id') ?? undefined,
    redirectUri: params.get('redirect_uri') ?? undefined,
    scope: params.get('scope') ?? undefined,
    state: params.get('state') ?? undefined,
    codeChallenge: params.get('code_challenge') ?? undefined,
    codeChallengeMethod: params.get('code_challenge_method') ?? undefined,
  }
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
}

/**
 * Matches a requested redirect_uri against the client's registered set.
 *
 * Loopback entries (OAuth 2.1 §8.4.2) are compared on protocol + hostname +
 * pathname ONLY: a native client binds an ephemeral port at runtime, so the
 * registered port is not knowable in advance. Every other URI must match
 * exactly, character for character.
 */
export function matchesRegisteredRedirectUri(requested: string, registered: readonly string[]): boolean {
  let requestedUrl: URL
  try {
    requestedUrl = new URL(requested)
  } catch {
    return false
  }
  if (requestedUrl.hash !== '') return false

  return registered.some(entry => {
    let registeredUrl: URL
    try {
      registeredUrl = new URL(entry)
    } catch {
      return false
    }
    if (isLoopbackHost(registeredUrl.hostname) && isLoopbackHost(requestedUrl.hostname)) {
      return (
        registeredUrl.protocol === requestedUrl.protocol &&
        registeredUrl.hostname === requestedUrl.hostname &&
        registeredUrl.pathname === requestedUrl.pathname
      )
    }
    return entry === requested
  })
}

/**
 * Validates a raw authorization request against a resolved, active client.
 *
 * Order is load-bearing: client and redirect_uri are settled FIRST, because
 * only after both are trusted may any further error be reported by redirect.
 */
export function validateAuthorizationRequest(
  raw: RawAuthorizationRequest,
  client: OAuthClientRecord,
): AuthorizationRequestValidation {
  const redirectUri = raw.redirectUri ?? ''
  if (!redirectUri || !matchesRegisteredRedirectUri(redirectUri, client.redirectUris)) {
    return { ok: false, kind: 'fatal', error: OAUTH_ERRORS.INVALID_REQUEST, description: 'redirect_uri is missing or not registered for this client' }
  }

  const state = raw.state ?? ''
  const fail = (error: OAuthErrorCode, description: string): AuthorizationRequestValidation =>
    ({ ok: false, kind: 'redirectable', error, description, redirectUri, state })

  if (!state) return fail(OAUTH_ERRORS.INVALID_REQUEST, 'state is required')
  if (raw.responseType !== 'code') return fail(OAUTH_ERRORS.UNSUPPORTED_RESPONSE_TYPE, 'only response_type=code is supported')
  if (raw.codeChallengeMethod !== PKCE_CHALLENGE_METHOD) return fail(OAUTH_ERRORS.INVALID_REQUEST, 'code_challenge_method must be S256')
  if (!raw.codeChallenge) return fail(OAUTH_ERRORS.INVALID_REQUEST, 'code_challenge is required')

  const scopes = raw.scope ? parseScopeString(raw.scope) : null
  if (!scopes) return fail(OAUTH_ERRORS.INVALID_SCOPE, 'scope is missing, empty or contains an unknown value')
  if (!isScopeSubset(scopes, client.allowedScopes)) return fail(OAUTH_ERRORS.INVALID_SCOPE, 'requested scope exceeds the scopes allowed for this client')

  return {
    ok: true,
    request: {
      clientId: client.clientId,
      redirectUri,
      scopes,
      state,
      codeChallenge: raw.codeChallenge,
      codeChallengeMethod: PKCE_CHALLENGE_METHOD,
    },
  }
}

/** Builds the client-facing redirect URL carrying an OAuth error. */
export function buildErrorRedirect(redirectUri: string, error: string, description: string, state: string): string {
  const url = new URL(redirectUri)
  url.searchParams.set('error', error)
  url.searchParams.set('error_description', description)
  if (state) url.searchParams.set('state', state)
  return url.toString()
}

/** Builds the client-facing redirect URL carrying a freshly issued code. */
export function buildSuccessRedirect(redirectUri: string, code: string, state: string): string {
  const url = new URL(redirectUri)
  url.searchParams.set('code', code)
  if (state) url.searchParams.set('state', state)
  return url.toString()
}
```

---

## 4.3a `apps/api/src/shared/utils/opaque-token.ts` (promoted — do this move FIRST)

Perform this move before writing any OAuth handler, so the slice has exactly one generator to import and no private copy is ever committed.

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />

/**
 * 256 bits of CSPRNG entropy, hex-encoded.
 *
 * The single entropy source for every bearer credential in the API: dashboard
 * session refresh tokens, OAuth authorization codes, and OAuth access/refresh
 * tokens. It lives in `shared/utils` — not inside `auth/` and not copied into a
 * feature slice — so that changing the length or the encoding is a one-line
 * change that cannot silently leave a second copy behind.
 *
 * Promoted from `auth/utils/refresh-token.ts` (`generateRefreshToken`) in the
 * `oauth-authorization-server` sprint. Body is unchanged.
 */
export function generateOpaqueToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}
```

Move steps, in order:

1. `git mv apps/api/src/auth/utils/refresh-token.ts apps/api/src/shared/utils/opaque-token.ts` and rename the export to `generateOpaqueToken`, replacing the doc comment with the one above.
2. `git mv apps/api/src/auth/utils/refresh-token.test.ts apps/api/src/shared/utils/opaque-token.test.ts`, updating the import path and the symbol name. Assertions stay as they are; add one case asserting the returned string is 64 hex characters if it is not already covered.
3. In `apps/api/src/auth/auth.app.ts`: replace the L22 import with `import { generateOpaqueToken } from '../shared/utils/opaque-token'`, then rename the call at L164 (`/auth/login`) and L218 (`/auth/refresh`). These are the only two call sites — `grep -rn "utils/refresh-token" apps/api --include="*.ts"` returns a single importer.
4. `grep -rn "generateRefreshToken" apps/api` must then return nothing.

No behavioural change: same byte count, same encoding, same function body. Session refresh tokens keep their exact current entropy.

## 4.3b `apps/api/src/features/oauth/token-issuance.ts`

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { sha256hex, type IIdGenerator, type IOAuthTokenRepository, type OAuthScope } from '@beechcms/core'
import { generateOpaqueToken } from '../../shared/utils/opaque-token'
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from './constants'

export interface IssueTokenPairInput {
  tokenRepository: IOAuthTokenRepository
  idGenerator: IIdGenerator
  clientId: string
  userId: string
  scope: OAuthScope[]
  /** Hash of the authorization code the whole family descends from. */
  authorizationCodeHash: string
  nowSeconds: number
}

export interface IssuedTokenPair {
  accessToken: string
  accessTokenHash: string
  refreshToken: string
  refreshTokenHash: string
  expiresIn: number
}

/**
 * Generates and persists an access/refresh pair. Only SHA-256 hashes reach D1;
 * the plaintext values are returned to the caller once and never stored.
 */
export async function issueTokenPair(input: IssueTokenPairInput): Promise<IssuedTokenPair> {
  const accessToken = generateOpaqueToken()
  const refreshToken = generateOpaqueToken()
  const accessTokenHash = await sha256hex(accessToken)
  const refreshTokenHash = await sha256hex(refreshToken)

  await input.tokenRepository.save({
    id: input.idGenerator.uuid(),
    tokenHash: accessTokenHash,
    tokenType: 'access',
    clientId: input.clientId,
    userId: input.userId,
    scope: input.scope,
    authorizationCodeHash: input.authorizationCodeHash,
    expiresAt: input.nowSeconds + ACCESS_TOKEN_TTL_SECONDS,
  })

  await input.tokenRepository.save({
    id: input.idGenerator.uuid(),
    tokenHash: refreshTokenHash,
    tokenType: 'refresh',
    clientId: input.clientId,
    userId: input.userId,
    scope: input.scope,
    authorizationCodeHash: input.authorizationCodeHash,
    expiresAt: input.nowSeconds + REFRESH_TOKEN_TTL_SECONDS,
  })

  return { accessToken, accessTokenHash, refreshToken, refreshTokenHash, expiresIn: ACCESS_TOKEN_TTL_SECONDS }
}
```

---

## 4.4 `apps/api/src/features/oauth/authorize.ts`

Three handlers. `GET /oauth/authorize` is the browser entry point and is **unauthenticated**; the other two are called by the (Sprint 4) consent screen with the dashboard's admin JWT and sit behind `authMiddleware()`.

**`GET /oauth/authorize` — behaviour**

1. Read the query into a `RawAuthorizationRequest`.
2. `client_id` missing → `400 { error: 'invalid_client', ... }` JSON. Never redirect.
3. `await oauthClientRepository.findActiveById(clientId)` → `null` → `400 { error: 'invalid_client' }` JSON. (The repository already excludes disabled clients; do not re-check `disabledAt`.)
4. `validateAuthorizationRequest(raw, client)`:
   - `kind: 'fatal'` → `400` JSON with `error` / `error_description`.
   - `kind: 'redirectable'` → `302` to `buildErrorRedirect(...)`.
5. Valid → `302` to `CONSENT_SCREEN_PATH` with the **original, unmodified** query string appended, resolved against the request origin: `new URL(CONSENT_SCREEN_PATH + '?' + url.search.slice(1), context.req.url)`. The API never renders HTML.

**`GET /oauth/authorize/request` — behaviour** (auth required)

Runs steps 1–4 identically, then answers the consent screen:

```ts
export interface AuthorizationRequestMetadata {
  client: { clientId: string; name: string }
  /** Every scope this request asks for. */
  requestedScopes: OAuthScope[]
  /** Subset not yet covered by a live consent — the only ones to prompt for. */
  newScopes: OAuthScope[]
  /** False when a live consent already covers every requested scope. */
  consentRequired: boolean
  redirectUri: string
  state: string
}
```
`consentRequired` is computed as `newScopes.length > 0`, where `newScopes` is `requestedScopes` minus the scopes on `await oauthConsentRepository.findActive(clientId, jwtPayload.sub)` (`[]` when there is no live consent). This is the "silent re-auth" rule from the brief: identical scope set → no prompt; superset → prompt for the delta only.

**`POST /oauth/authorize/consent` — behaviour** (auth required)

Body (`application/json`):
```ts
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
```
Response (`200`): `{ redirectTo: string }`. The dashboard performs the navigation; the API does not 302 an XHR.

Steps:
1. Resolve the client and re-run `validateAuthorizationRequest` on the body. `fatal` → `400` JSON; `redirectable` → `200 { redirectTo: buildErrorRedirect(...) }`.
2. `approved !== true` → `200 { redirectTo: buildErrorRedirect(redirectUri, OAUTH_ERRORS.ACCESS_DENIED, 'the resource owner denied the request', state) }`.
3. **The one and only role-guard call site:**
   ```ts
   const decision = await context.get('roleGuard').arbitrate(context.get('jwtPayload').role, request.scopes)
   ```
   `decision.grantedScopes.length === 0` → `200 { redirectTo: buildErrorRedirect(..., ACCESS_DENIED, 'no requested scope may be granted to this role', state) }`.
   `decision.deniedScopes.length > 0` with a non-empty grant → proceed with `decision.grantedScopes` only (downscoping is legal per RFC 6749 §3.3; the issued `scope` tells the client what it actually got).
   No handler in this slice may branch on `role` anywhere else.
4. `await oauthConsentRepository.grant(idGenerator.uuid(), clientId, userId, decision.grantedScopes, nowSeconds)` — unions into any existing grant.
5. Mint the code (`generateOpaqueToken` imported from `../../shared/utils/opaque-token` — the same generator the token endpoint and `/auth/login` use; do not hand-roll a second one here):
   ```ts
   const code = generateOpaqueToken()
   const codeHash = await sha256hex(code)
   await context.get('oauthAuthorizationCodeRepository').save({
     codeHash,
     clientId: request.clientId,
     userId,
     scope: decision.grantedScopes,
     redirectUri: request.redirectUri,
     codeChallenge: request.codeChallenge,
     codeChallengeMethod: 'S256',
     expiresAt: nowSeconds + AUTHORIZATION_CODE_TTL_SECONDS,
   })
   ```
6. `200 { redirectTo: buildSuccessRedirect(request.redirectUri, code, request.state) }`.

`userId` is always `context.get('jwtPayload').sub`; `nowSeconds` is always `context.get('clock').nowSeconds()`. Never `Date.now()`.

---

## 4.5 `apps/api/src/features/oauth/token.ts`

`POST /oauth/token`. Body is `application/x-www-form-urlencoded` (RFC 6749 §3.2) — read via `await context.req.parseBody()`, tolerating a JSON body as a convenience is **not** required and must not be added.

Every response carries `Cache-Control: no-store` and `Pragma: no-cache` (RFC 6749 §5.1), success and error alike.

**Step 0 — rate limit (before any parsing or crypto), mandatory in every environment:**
```ts
const clientIp = getClientIp(context.req)
const rateLimit = await checkDualKeyRateLimit({
  ipLimiter: context.get('rateLimiters').getLimiter('oauthToken'),
  accountLimiter: context.get('rateLimiters').getLimiter('oauthTokenAccount'),
  clientIp,
  accountKey: rawClientId || 'unknown',
})
if (!rateLimit.isAllowed) {
  return context.json({ error: 'invalid_request', error_description: 'Too many requests' }, 429,
    rateLimit.retryAfterSeconds !== undefined ? { 'Retry-After': String(rateLimit.retryAfterSeconds) } : {})
}
```
`rawClientId` is read from the body first purely as the limiter's account key; it is validated afterwards like any other field.

**Success response shape (both grants):**
```ts
export interface TokenResponseBody {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  refresh_token: string
  scope: string   // formatScopes(...)
}
```

**Error response:** `{ error: OAuthErrorCode, error_description: string }`; status `400`, except `invalid_client` → `401`.

### Grant `authorization_code`

Required fields: `code`, `redirect_uri`, `client_id`, `code_verifier`. Any missing → `invalid_request`.

1. `client = await oauthClientRepository.findActiveById(client_id)`; `null` → `401 invalid_client`.
2. `codeHash = await sha256hex(code)`; `record = await oauthAuthorizationCodeRepository.findByHash(codeHash, nowSeconds)`; `null` (unknown **or expired**) → `invalid_grant`.
3. **Replay:** `record.consumedAt !== null` →
   ```ts
   await context.get('oauthTokenRepository').revokeByAuthorizationCode(codeHash, nowSeconds)
   ```
   then `invalid_grant`. The cascade revokes every access **and** refresh token descended from that code — the brief's "un code riutilizzato deve invalidare tutti i token già emessi".
4. `record.clientId !== client_id` → `invalid_grant`. `record.redirectUri !== redirect_uri` → `invalid_grant`.
5. `await verifyPkceChallenge(code_verifier, record.codeChallenge, record.codeChallengeMethod)` → `false` → `invalid_grant`. (It never throws and rejects non-`S256` on its own; do not pre-check the method.)
6. `const consumed = await oauthAuthorizationCodeRepository.consumeByHash(codeHash, nowSeconds)`; `false` → concurrent redemption: run the same cascade revocation as step 3, then `invalid_grant`.
7. `issueTokenPair({ ..., scope: record.scope, authorizationCodeHash: codeHash })`; respond `200` with `scope: formatScopes(record.scope)`.

Order matters: consume only after PKCE passes, so a wrong-verifier attempt cannot burn a legitimate user's code.

### Grant `refresh_token`

Required: `refresh_token`, `client_id`. Optional: `scope` (narrowing only).

1. `client = await oauthClientRepository.findActiveById(client_id)`; `null` → `401 invalid_client`.
2. `oldHash = await sha256hex(refresh_token)`; `old = await oauthTokenRepository.findActiveByHash(oldHash, 'refresh', nowSeconds)`; `null` → `invalid_grant`.
3. `old.clientId !== client_id` → `invalid_grant`.
4. Scope resolution: absent `scope` → `old.scope`. Present → `parseScopeString(scope)`; `null` or `!isScopeSubset(parsed, old.scope)` → `invalid_scope`.
5. **Rotation, mirroring `auth.app.ts:210–240` exactly:**
   ```ts
   const pair = await issueTokenPair({ ..., scope: resolvedScopes, authorizationCodeHash: old.authorizationCodeHash })
   try {
     const revoked = await context.get('oauthTokenRepository').revokeByHash(oldHash, nowSeconds)
     if (!revoked) {
       await context.get('oauthTokenRepository').revokeByHash(pair.refreshTokenHash, nowSeconds)
       await context.get('oauthTokenRepository').revokeByHash(pair.accessTokenHash, nowSeconds)
       return tokenError(context, OAUTH_ERRORS.INVALID_GRANT, 'refresh token is no longer valid')
     }
   } catch (error) {
     await context.get('oauthTokenRepository').revokeByHash(pair.refreshTokenHash, nowSeconds).catch(() => {})
     await context.get('oauthTokenRepository').revokeByHash(pair.accessTokenHash, nowSeconds).catch(() => {})
     throw error
   }
   ```
   New pair issued **before** the old token is revoked, so a persistence failure can never lock the client out. `authorizationCodeHash` is carried over unchanged, keeping the whole rotation chain reachable by one cascade revocation.
6. `200` with the new pair.

### Any other `grant_type`

`unsupported_grant_type`, `400`.

### Unhandled exceptions

Mirror `handleAuthError` in `auth.app.ts`: log only when `context.env.ENV !== 'production'`, respond `500 { error: 'server_error', error_description: 'An error occurred' }`.

---

## 4.6 `apps/api/src/features/oauth/revoke.ts`

`POST /oauth/revoke`, form-encoded (RFC 7009). Fields: `token` (required), `client_id` (required), `token_type_hint` (optional, ignored beyond ordering the lookup).

1. IP rate limit with the `oauthToken` limiter (single key, not dual): exceeded → `429`.
2. **Always respond `200 {}`** when `token` and `client_id` are present, whatever the outcome — RFC 7009 §2.2 forbids leaking whether a token existed.
3. Missing `token` or `client_id` → `400 { error: 'invalid_request' }` (the one permitted non-200).
4. `hash = await sha256hex(token)`. Look up `findActiveByHash(hash, 'access', now)`, then `findActiveByHash(hash, 'refresh', now)` if the first misses (reverse the order when `token_type_hint === 'refresh_token'`).
5. Found and `record.clientId === client_id` →
   ```ts
   await context.get('oauthTokenRepository').revokeByAuthorizationCode(record.authorizationCodeHash, nowSeconds)
   ```
   Cascade, not `revokeByHash`: the brief requires revoking a client's access to kill **both** the access and the refresh token, never one without the other.
6. Not found, or `clientId` mismatch → do nothing, still `200 {}`.

---

## 4.7 `apps/api/src/features/oauth/index.ts`

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import type { Env, Variables } from '../../types'
import { authMiddleware } from '../../middleware/auth.middleware'
import { authorizeHandler, authorizeRequestHandler, consentHandler } from './authorize'
import { tokenHandler } from './token'
import { revokeHandler } from './revoke'

export const oauthApp = new Hono<{ Bindings: Env; Variables: Variables }>()

// Browser entry point: unauthenticated by design. Redirects to the dashboard
// consent screen, which performs the authenticated calls below.
oauthApp.get('/oauth/authorize', authorizeHandler)

// Consent-screen APIs: admin JWT required, same gate as the rest of the dashboard.
oauthApp.use('/oauth/authorize/request', authMiddleware())
oauthApp.use('/oauth/authorize/consent', authMiddleware())
oauthApp.get('/oauth/authorize/request', authorizeRequestHandler)
oauthApp.post('/oauth/authorize/consent', consentHandler)

// Client-facing endpoints: no session, authenticated by the grant material itself.
oauthApp.post('/oauth/token', tokenHandler)
oauthApp.post('/oauth/revoke', revokeHandler)
```

Register `/oauth/authorize` **before** the `/oauth/authorize/request` middleware lines is not required by Hono, but keep this exact order for readability. Note `oauthApp.use('/oauth/authorize/request', ...)` matches that exact path only, so `GET /oauth/authorize` stays unauthenticated.

---

## 4.8 `apps/api/src/types.ts` (modified)

Add `IRoleGuard` to the existing `@beechcms/core` type import list, then append to `Variables`, next to the OAuth repositories:

```ts
  /** Arbitrates which requested scopes a user's role may grant. Sole role-authorization seam in the OAuth flow. */
  roleGuard: IRoleGuard
```

## 4.9 `apps/api/src/middleware/repository.middleware.ts` (modified)

Add `AllowAllRoleGuard` to the existing **value** import from `@beechcms/core` (the one already bringing in `SystemClock, SystemIdGenerator, VirusTotalAntivirusProvider, PrivacyService`) and `IRoleGuard` to the **type** import list. Add to `RepositoryOverrides`:

```ts
  roleGuard?: IRoleGuard
```

Then, immediately after L145 (`oauthConsentRepository`):

```ts
    context.set('roleGuard', overrides?.roleGuard ?? new AllowAllRoleGuard())
```

## 4.10 `apps/api/src/middleware/rate-limit.middleware.ts` (modified)

```ts
export type RateLimiterName =
  | 'login'
  | 'loginAccount'
  | 'tokenRefresh'
  | 'forgotPassword'
  | 'forgotPasswordAccount'
  | 'resetPassword'
  | 'publicApiRead'
  | 'publicApiWrite'
  | 'oauthToken'
  | 'oauthTokenAccount'
```

and inside the `limiters` record in `buildDefaultRegistry`:

```ts
    oauthToken: new TokenBucketRateLimiter({ capacity: 20, refillRatePerSecond: 0.5 }), // IP burst: 20, 1 token/2s
    oauthTokenAccount: new TokenBucketRateLimiter({ capacity: 10, refillRatePerSecond: 0.2 }), // Per-client burst: 10, 1 token/5s
```

Rationale for the numbers: `/oauth/token` is exchanged once per authorization plus once per refresh, so it is closer to `tokenRefresh` (20 / 0.5) than to `login` (10 / 0.2); the per-client bucket is tightened to half that. No environment exemption exists — `BEECH_API_URL` already points at remote instances (feature brief rule 6).

## 4.11 `apps/api/src/factory.ts` (modified)

Three edits:

1. Import beside the other feature imports (after L20):
   ```ts
   import { oauthApp } from './features/oauth'
   ```
   and add `IRoleGuard` to the `@beechcms/core` type import at L37.
2. Add to `BeechConfig`:
   ```ts
   /**
    * Optional role-guard override. Defaults to AllowAllRoleGuard, which grants
    * every requested scope; inject a restrictive guard to exercise the denial path.
    */
   roleGuard?: IRoleGuard
   ```
   and thread it into the `repositoryMiddleware({...})` call at L111–L121 as `roleGuard: config.roleGuard,`.
3. Mount immediately after L213 (`app.route('/', passwordResetApp)`), inside the same "Auth, Setup & Password Reset" block:
   ```ts
   app.route('/', oauthApp)
   ```
   `/oauth/*` collides with no existing prefix (`/auth`, `/api`, `/api/v1/public`, `/api/webhooks`, `/admin`), so placement relative to `app.route('/api', apiProtected)` at L262 is not load-bearing — but keep it here so all root-mounted auth routers stay adjacent.

---

## 4.12 Tests to author

**`authorization-request.test.ts`** (pure, no D1)
- loopback `http://127.0.0.1:54312/callback` matches registered `http://127.0.0.1/callback`; a different path or scheme does not.
- non-loopback URIs require exact string equality.
- a URI carrying a fragment is rejected.
- missing/unregistered `redirect_uri` → `kind: 'fatal'`.
- missing `state`, `response_type=token`, `code_challenge_method=plain`, missing `code_challenge` → `kind: 'redirectable'` with the right error code.
- unknown scope → `invalid_scope`; `schema:write` requested by a client allowed only `schema:read` → `invalid_scope`.
- `buildErrorRedirect` / `buildSuccessRedirect` preserve pre-existing query params on the redirect URI.

**`authorize.test.ts`**
- unknown / disabled `client_id` → `400`, no `Location` header.
- valid request → `302` whose `Location` path is `/admin/oauth/consent` and whose query is byte-identical to the inbound one.
- `GET /oauth/authorize/request` without a Bearer token → `401`.
- `consentRequired` is `true` on first request, `false` when a live consent already covers the scopes, and `newScopes` holds only the delta when a superset is requested.
- `approved: false` → `redirectTo` carries `error=access_denied` and echoes `state`.
- with an injected guard returning `{ grantedScopes: [], deniedScopes: [...] }` → `access_denied`; with a partial grant → the code is stored with the granted subset only.
- happy path writes exactly one `oauth_authorization_codes` row whose `code_hash` equals `sha256hex(code)` and whose plaintext code appears **nowhere** in the table.

**`token.test.ts`**
- happy path returns all five body fields, `token_type: 'Bearer'`, `Cache-Control: no-store`.
- wrong `code_verifier` → `invalid_grant`, and the code is **still unconsumed** (a second, correct attempt succeeds).
- **replay:** redeem successfully, then redeem the same code again → `invalid_grant` **and** every token from the first redemption is revoked (`findActiveByHash` returns `null` for both).
- `redirect_uri` or `client_id` differing from the stored code → `invalid_grant`.
- expired code (clock advanced past `AUTHORIZATION_CODE_TTL_SECONDS`) → `invalid_grant`.
- refresh rotation: old refresh token stops working, new one works, `authorization_code_hash` is preserved across the rotation.
- refresh with a narrowing `scope` succeeds; with a widening one → `invalid_scope`.
- `grant_type=password` → `unsupported_grant_type`.
- with a pre-exhausted `rateLimiterRegistry` injected through `BeechConfig` → `429` with `Retry-After`.

**`revoke.test.ts`**
- revoking an access token also kills its sibling refresh token, and vice versa.
- unknown token → `200 {}`.
- `client_id` mismatch → `200 {}` and the token stays alive.
- missing `token` → `400`.

**`apps/api/test/flow-oauth-authorization.test.ts`** — one uninterrupted loop against `createBeechApp`: `POST /auth/login` → `GET /oauth/authorize` (assert redirect) → `GET /oauth/authorize/request` with the admin JWT → `POST /oauth/authorize/consent` → extract `code` from `redirectTo` → `POST /oauth/token` → `POST /oauth/token` (refresh) → `POST /oauth/revoke` → refresh again and assert `invalid_grant`. Uses the seeded `beech-mcp-cli` client from migration `0038` with `redirect_uri=http://127.0.0.1:8976/callback` (deliberately a different port than registered, to prove loopback port-agnostic matching end to end).

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# 1. Core is untouched, but must still build — the slice consumes its published types.
pnpm --filter @beechcms/core run build

# 2. Type-check the API (the RateLimiterName union and Variables changes surface here).
pnpm --filter @beechcms/api exec tsc --noEmit

# 3. Lint.
pnpm beech lint

# 4. Tests: scoped first, then the full workspace.
pnpm beech test --diff
pnpm beech test

# 5. Schema sanity: 0038 must be the newest migration and must apply cleanly.
#    If this creates a 0039_*.sql, the sprint has gone out of scope — revert it.
pnpm beech db:reset
pnpm beech db:migrate
ls apps/api/migrations | tail -3

# 6. Botanical Invariant — both greps MUST return nothing.
grep -rn "env\.DB\|D1Database\|shared/db" apps/api/src/features/oauth/ || echo "OK: no direct D1 access"

# 7. VSA — no sibling-slice import. Single-level '../<name>/' is a violation;
#    '../../<shared module>' is allowed. MUST return nothing.
grep -rn "from '\.\./[^./][^/]*/" apps/api/src/features/oauth/ \
  | grep -v "from '\.\./\.\./" || echo "OK: no sibling-slice import"

# 7b. Review the full relative-import surface of the slice by hand.
#     Allowed exactly: ../../types, ../../middleware/auth.middleware,
#     ../../shared/utils/opaque-token, ../../shared/utils/dual-key-rate-limiter,
#     ../../shared/utils/request-utils
grep -rho "from '\.\.[^']*'" apps/api/src/features/oauth/ | sort -u

# 8. Role logic confined to the guard — MUST match exactly one line, in authorize.ts.
grep -rn "roleGuard\|\.role" apps/api/src/features/oauth/

# 8b. Entropy generator is promoted, not duplicated.
grep -rn "generateRefreshToken" apps/api                    # MUST return nothing
grep -rn "getRandomValues" apps/api/src                     # MUST match ONLY shared/utils/opaque-token.ts
test ! -e apps/api/src/auth/utils/refresh-token.ts && echo "OK: old util removed"

# 9. Refresh the graph and re-prove the boundary.
graphify update . --force
graphify path "issueTokenPair" "D1Database"        # expect: No directed path found
graphify explain "AllowAllRoleGuard"               # expect: a new edge from repository.middleware.ts
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

**Architecture**
- [ ] `apps/api/src/features/oauth/` imports nothing from any other directory under `apps/api/src/features/`.
- [ ] The slice contains no reference to `context.env.DB`, `D1Database`, or `apps/api/src/shared/db/**`; all persistence goes through `IOAuth*Repository` / `IUserRepository` read from context.
- [ ] `graphify path "issueTokenPair" "D1Database"` reports `No directed path found`.
- [ ] Zero files changed under `packages/core/`, `apps/dashboard/`, or `apps/api/migrations/`.
- [ ] `apps/api/src/middleware/auth.middleware.ts` is byte-identical to `master`.
- [ ] `role` is read in exactly one place in the slice: the `roleGuard.arbitrate(...)` call in `authorize.ts`. No `if (role === ...)` anywhere.
- [ ] The bearer-credential generator is **promoted, not duplicated**: `generateOpaqueToken()` exists only in `apps/api/src/shared/utils/opaque-token.ts`, `apps/api/src/auth/utils/refresh-token.ts` is deleted, `grep -rn "generateRefreshToken" apps/api` returns nothing, and `crypto.getRandomValues` appears in exactly one non-test file across `apps/api/src` (verified pre-change: `refresh-token.ts` is currently its only occurrence).
- [ ] `/auth/login` and `/auth/refresh` keep their exact previous behaviour after the rename — same 64-character hex token, `apps/api/test/flow-admin-auth.test.ts` green with no assertion edited.

**Wiring**
- [ ] `Variables.roleGuard: IRoleGuard` exists in `types.ts` and is set on every request by `repositoryMiddleware`, defaulting to `new AllowAllRoleGuard()`.
- [ ] `BeechConfig.roleGuard` threads an override through `createBeechApp` → `repositoryMiddleware`.
- [ ] `RateLimiterName` includes `'oauthToken'` and `'oauthTokenAccount'`, and `buildDefaultRegistry` returns a limiter for both.
- [ ] `oauthApp` is mounted at `'/'` in `factory.ts` and shadows no pre-existing route (`app.routes` still contains every `/auth/*`, `/api/*` and `/admin/*` path present before the change).

**Protocol correctness**
- [ ] `code_challenge_method` other than `S256` is rejected at `/oauth/authorize`; `plain` is never accepted anywhere.
- [ ] `state` is mandatory on the authorization request.
- [ ] An unknown or unregistered `redirect_uri` produces a `400` and **never** a redirect.
- [ ] Loopback redirect URIs match on protocol + host + path with the port ignored; every other URI matches exactly.
- [ ] Authorization codes are single-use: a second redemption returns `invalid_grant` **and** cascade-revokes every token descended from that code.
- [ ] A failed PKCE verification does **not** consume the code.
- [ ] Refresh rotation issues the new pair before revoking the old token and rolls the new pair back if the revocation fails or throws.
- [ ] `POST /oauth/revoke` returns `200` for unknown tokens and for `client_id` mismatches, and cascade-revokes access **and** refresh together when it does revoke.
- [ ] Every `/oauth/token` response, success or error, carries `Cache-Control: no-store`.
- [ ] Codes, access tokens and refresh tokens exist in D1 only as SHA-256 hex hashes — asserted by a test that greps the plaintext value against the stored row.

**Rate limiting**
- [ ] `/oauth/token` runs `checkDualKeyRateLimit` (IP + `client_id`) before parsing or crypto, in every environment, with no `ENV` exemption.
- [ ] A rate-limited response is `429` and carries `Retry-After` when a retry delay is known.

**Quality gates**
- [ ] `pnpm --filter @beechcms/api exec tsc --noEmit` passes with no new errors; no `any`, no `@ts-expect-error`, no non-null assertion introduced in the slice.
- [ ] `pnpm beech lint` passes.
- [ ] `pnpm beech test` passes in full, including every pre-existing `flow-*.test.ts`.
- [ ] `pnpm beech db:reset && pnpm beech db:migrate` succeeds and `0038_oauth_authorization.sql` is still the newest migration.
- [ ] Every new file carries the `SPDX-License-Identifier: BUSL-1.1` header used across `apps/api`.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

**Deferred to a later roadmap sprint** (`stages/01_sprint_planning/output/backlog/ROADMAP.md`):

- **Accepting OAuth access tokens on protected API routes.** `authMiddleware()` must not be touched. Tokens issued here are not yet usable against `/api/*` — that is the entire content of **Sprint 3 `oauth-resource-server-scopes`**, together with `requireScope()` on the six MCP-backing routes and the documented `schema:read` classification of `beech_schema_plan`.
- **Any dashboard UI.** No consent screen, no "Connected apps" page, no file under `apps/dashboard/`. `GET /oauth/authorize` redirects to `/admin/oauth/consent`, a route that intentionally does not exist yet and resolves to the SPA fallback until **Sprint 4 `oauth-dashboard-consent-ui`** builds it on the existing shadcn/ui primitives. Do not scaffold it "just to test the redirect" — assert the `Location` header instead.
- **`IOAuthTokenRepository.listAuthorizedClientsForUser` and `revokeAllForClientAndUser`.** Shipped in Sprint 1, consumed by the connected-apps page in **Sprint 4**. They stay uncalled by this sprint's code; that is expected, not an omission.
- **Changes to `packages/mcp`.** The client keeps using `BEECH_EMAIL` / `BEECH_PASSWORD` until **Sprint 5 `mcp-pkce-client`** replaces it with the browser PKCE flow, the loopback listener, the token cache and transparent refresh. No `packages/mcp` file is edited here.
- **User-facing documentation.** `docs/reference/oauth-endpoints.md` and the `docs/start` updates land with **Sprint 5**, when the flow is actually reachable end to end by a real client. The existing `factory.docs-parity.test.ts` route map is static and does not require an entry for `/oauth`.

**Rejected outright during the VETO Audit — do not build in any sprint without a new brief:**

- Dynamic client registration (RFC 7591). `oauth_clients` is a static registry, seeded by migration.
- Client secrets and confidential-client authentication. `beech-mcp-cli` is `is_public=1`; PKCE is the only client proof, always required.
- `/.well-known/oauth-authorization-server` discovery metadata (RFC 8414). One known client, one known base URL.
- Token introspection (RFC 7662). Sprint 3 verifies tokens in-process by hash lookup; no introspection endpoint is needed.
- JWT-format access tokens. The `0038` schema stores opaque token hashes; issuing JWTs instead would make revocation unenforceable and contradict the migration's contract.
- A real role-based `IRoleGuard` adapter. `AllowAllRoleGuard` stays, and its permissiveness stays explicitly tested (feature brief §5).
- Scopes beyond `schema:read` / `schema:write`, and any per-table or per-operation granularity.
- A cron or queue job to prune expired `oauth_*` rows. Expiry is enforced at read time via `expires_at`.
- Any change to `/auth/login`, `/auth/refresh`, `/auth/logout` or the `refresh_token` cookie. The dashboard session flow is untouched (feature brief rule 1).
