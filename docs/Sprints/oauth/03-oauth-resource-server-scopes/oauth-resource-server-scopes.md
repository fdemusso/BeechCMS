# Sprint Plan — `oauth-resource-server-scopes`

Sprint 3 of 5 of the **OAuth 2.1 Authorization Server for MCP** feature.
Roadmap entry: `output/backlog/ROADMAP.md` → Sprint 3.
Depends on: Sprint 1 (`00e3315`) and Sprint 2 (`07ff827`), both merged on `feature/mcp-server`.

---

### Pre-Computation Analysis

#### a) God Nodes identified via the CLI

| Node | Degree / blast radius | Why it is a God Node here |
|---|---|---|
| `authMiddleware()` — `apps/api/src/middleware/auth.middleware.ts:L24` | degree **10** direct, **40** nodes at `--depth 2` | Single authentication gate of the whole API. Imported by `src/factory.ts:L16`, `features/oauth/index.ts:L8`, `features/search/search.ts:L18`, `src/index.ts:L5`, plus **28 test files** (`test/flow-*.test.ts`, `factory.*.test.ts`, `public-*.test.ts`). Any signature change here is a workspace-wide event. |
| `createBeechApp()` — `apps/api/src/factory.ts:L225` | calls `authMiddleware()`; owns the entire middleware chain | The only place where the `apiProtected` router and its middleware order exist. The one production call site this sprint edits. |
| `seedsApp` — `apps/api/src/features/seeds/seeds.handler.ts:L33` | `graphify affected "seedsApp" --depth 2` → 3 nodes only (`seeds.test.ts`, `seeds/index.ts` re-export, `factory.ts:L26` import) | Owner of 4 of the 5 MCP-backing routes, and holder of the `requireAdmin` blanket gate at `seeds.handler.ts:L38-42`. Narrow blast radius — it is a God Node by *responsibility*, not by fan-in. |
| `IOAuthTokenRepository` — `packages/core/src/oauth/token.repository.ts:L34` | degree 7 (6 methods + container) | Contract this sprint consumes read-only (`findActiveByHash`). **No method is added.** |

`graphify affected "authMiddleware" --depth 2` (impact analysis, verbatim node set, abridged to the production nodes — the remaining 33 are `*.test.ts` importers):

```
- createBeechApp()            [calls]      apps/api/src/factory.ts:L225
- src/factory.ts              [imports]    apps/api/src/factory.ts:L16
- oauth/index.ts              [imports]    apps/api/src/features/oauth/index.ts:L8
- search.ts                   [imports]    apps/api/src/features/search/search.ts:L18
- api/src/index.ts            [imports]    apps/api/src/index.ts:L5
- search/index.ts             [re_exports] apps/api/src/features/search/index.ts:L21
```

**Breaking-change conclusion drawn from that output:** `authMiddleware()` has **4 production call sites** —
`factory.ts:L225` (`apiProtected`), `factory.ts:L262` (custom protected routes), `oauth/index.ts:L40-41`
(consent APIs), `search.ts:L24`. Three of them must keep **JWT-only** behaviour: an OAuth access token must
never reach `/oauth/authorize/consent` (it could mint fresh authorization codes — privilege escalation) nor
the developer custom routes. Therefore the new capability is added as an **optional parameter defaulting to
the current behaviour** (`authMiddleware({ acceptOAuth: true })`), so 3 of the 4 call sites and all 33 test
importers stay byte-identical and semantically unchanged. This is the single most important design
constraint of the sprint and it was derived from the `affected` output, not assumed.

#### b) Architectural boundaries affected

| Boundary | Touched? | Detail |
|---|---|---|
| `packages/core` | **NO** | `OAUTH_SCOPES`, `OAuthScope`, `isOAuthScope`, `IOAuthTokenRepository.findActiveByHash`, `sha256hex`, `IUserRepository.findById` all already exist and suffice. Zero files changed. |
| `apps/api` — `src/middleware/` (shared infra) | **YES** | `auth.middleware.ts` gains an options object; new sibling `oauth-scope.middleware.ts`. |
| `apps/api` — `src/types.ts` | **YES** | `Variables.oauthGrant` added. |
| `apps/api` — `src/factory.ts` | **YES** | One call site changes to `authMiddleware({ acceptOAuth: true })`; one new `apiProtected.use('*', …)` line. |
| `apps/api/src/features/**` | **NO** | Zero slice files modified. Enforcement is centralized, so `seeds`, `schema`, `search`, `content`, `oauth` are untouched. |
| `apps/api/migrations/` | **NO** | No schema change. `0038_oauth_authorization.sql` already carries `oauth_tokens.scope`. |
| `apps/dashboard` | **NO** | Consent UI is Sprint 4. |
| `packages/mcp` | **NO** | The client still sends the admin JWT this sprint; it switches to PKCE in Sprint 5. |

#### c) MCP tool → HTTP route → scope mapping (verified against source, not assumed)

`packages/mcp/src/index.ts` issues exactly these requests; the 6 tools collapse onto **5 distinct routes**
(`beech_schema_export` and `beech_schema_validate` both read `GET /api/schema`):

| MCP tool | Call site | HTTP route | Mounted by | Scope |
|---|---|---|---|---|
| `beech_list_seeds` | `index.ts:L168` | `GET /api/seeds` | `seeds.handler.ts:L61` | `schema:read` |
| `beech_get_seed` | `index.ts:L195` | `GET /api/seeds/:slug` | `seeds.handler.ts:L78` | `schema:read` |
| `beech_schema_export` | `index.ts:L207` | `GET /api/schema` | `schema.handler.ts:L51` | `schema:read` |
| `beech_schema_validate` | `index.ts:L213` | `GET /api/schema` | `schema.handler.ts:L51` | `schema:read` |
| `beech_schema_plan` | `index.ts:L255` | `POST /api/seeds/:slug/mcp-plan` | `seeds.mcp.ts:L122` | `schema:read` (dry-run) |
| `beech_schema_apply` | `index.ts:L283` | `POST /api/seeds/:slug/mcp-apply` | `seeds.mcp.ts:L200` | `schema:write` |

#### d) Facts that constrain the implementation

1. **Access tokens are opaque, not JWTs.** `issueTokenPair` (`features/oauth/token-issuance.ts:L59`) calls
   `generateOpaqueToken()` (`shared/utils/opaque-token.ts`) → **64 lowercase hex chars**, stored only as
   `sha256hex`. A JWT always contains `.`; hex never does. The scheme discriminator is therefore exact
   (`/^[0-9a-f]{64}$/`), not a heuristic.
2. **`/api/seeds/*` is admin-gated inside the slice.** `seeds.handler.ts:L38-42` runs `requireAdmin(context)`
   which reads `context.get('jwtPayload')?.role`. `schema.handler.ts:L16` and `seeds.helpers.ts:L34,L53` do the
   same for role and audit actor. **Consequence:** an OAuth-authenticated request must arrive with a fully
   hydrated `jwtPayload` (`sub`, `email`, `name`, `surname`, `role`) or every MCP route returns 403. The
   middleware must therefore load the resource owner via `userRepository.findById(record.userId)`.
3. **`clock` and `userRepository` are already in `Variables`** (`types.ts:L170`, and `IUserRepository` bound in
   `repositoryMiddleware`), as are the four `oauth*Repository` entries and `roleGuard` (`types.ts:L204-212`).
   No new context wiring is needed beyond `oauthGrant`.
4. **Sprint 2 exposed the token endpoint but no resource-server acceptance.** `graphify path "mcpApp"
   "D1Database"` → `No directed path found`, confirming the seeds MCP slice already reaches D1 only through
   injected repositories.

---

### VETO Audit

Proposed boundaries evaluated against `_config/ponytail_arch.md`.

**1. RUTHLESS VETO / YAGNI.**
The sprint adds **one** new production file (`oauth-scope.middleware.ts`) and modifies **three**
(`auth.middleware.ts`, `types.ts`, `factory.ts`). No new core interface, no new table, no new endpoint, no
abstraction for "future auth schemes", no scope registry beyond the two scopes Sprint 1 already froze.
*Rejected during this audit:* (a) a `ScopeResolver` service injected in context — one exported const table is
enough; (b) introspection endpoint RFC 7662 — nothing consumes it, deferred, not roadmapped; (c) caching
token lookups in KV — premature, one indexed D1 read per request matches what `authMiddleware` already costs.
**Verdict: PASS.**

**2. THE BOTANICAL INVARIANT.**
The new middleware performs **zero** direct database access. It reads `context.get('oauthTokenRepository')`
and `context.get('userRepository')` — both `@beechcms/core` interfaces bound by `repositoryMiddleware`. It
never references `context.env.DB`, `D1Database`, `apps/api/src/shared/db/**`, and issues no SQL. No content
is read or written, so `apiToDb`/`dbToApi` and Branch IDs (`br_XX`) are not in play; no field name is
hardcoded. **Verdict: PASS.**

**3. VSA ENFORCEMENT.**
The enforcement point lives in `apps/api/src/middleware/` — shared infrastructure, the same directory that
already hosts `auth.middleware.ts` and `rate-limit.middleware.ts` — and **not** inside
`apps/api/src/features/oauth/`. This is deliberate: the guard must gate routes owned by the `seeds` and
`schema` slices, so placing it in the `oauth` slice would force `seeds` → `oauth` cross-slice imports, an
instant VETO under rule 3. Zero files under `apps/api/src/features/**` are modified, therefore **zero
cross-feature imports are created**. Slices importing shared `middleware/` is the pre-existing, sanctioned
pattern (`features/search/search.ts:L18`, `features/oauth/index.ts:L8`).

*Adjustment made during this audit (deviation from the ROADMAP wording, recorded deliberately):* the roadmap
entry said "a `requireScope()` guard applied to the 6 MCP-backing routes". Per-route guards are **fail-open**:
any route where the decorator is forgotten grants an OAuth token the full admin privileges that
`requireAdmin` confers — a direct violation of business rule 2 of the feature brief ("never emit privileges
above the resource owner's" — here, never *exercise* them beyond the granted scope). The plan is therefore
changed to a single **fail-closed** gate holding an explicit route table: any `/api/*` path reached with an
OAuth access token that is **not** in the table is rejected `403 insufficient_scope`. This also keeps the
feature slices untouched, which is what makes rule 3 trivially satisfied.

**4. CLOUDFLARE PURITY.**
Edge-native: one additional indexed D1 read (`findActiveByHash`, already implemented and indexed by
`0038_oauth_authorization.sql`) plus one `findById`, inside the existing Workers request path. No ORM, no
background job, no migration, no non-deterministic schema change. **Verdict: PASS.**

**5. MINIMALIST BLUEPRINT.**
core (0 files) → api (1 new + 3 modified + 3 test files) → dashboard (0 files). This is the minimum node
count that can accept a scoped token without opening a privilege hole.

**6.** HANDOFF -> caveman_coder.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 2 shipped an authorization server that **issues** scoped tokens which nothing **accepts**. Today
`POST /oauth/token` returns an access token with a `scope` claim, and every protected route rejects it with
401 because `authMiddleware()` hands it to `tokenService.verify()`, which cannot parse an opaque 64-hex
string. The feature is unusable end-to-end until the resource server learns the second scheme. This sprint is
that step, and it must come before Sprint 4 (consent UI) and Sprint 5 (PKCE client) because both of those are
only demonstrable once a scoped token actually opens a door.

**Why it must precede Sprint 5 specifically:** the brief requires the MCP client to perform a *transparent
refresh on 401*. That contract is defined here — this sprint fixes which failure is `401 invalid_token`
(expired/revoked/unknown, retry after refresh) and which is `403 insufficient_scope` (never retryable, the
grant is simply too small). Building the client first would mean guessing that boundary.

**VSA adherence.** The rule that decides the whole design: the guard must gate routes belonging to the
`seeds` and `schema` slices, so it cannot live in the `oauth` slice without creating cross-feature imports
(VETO rule 3). It lives in `apps/api/src/middleware/`, shared infrastructure, exactly where the JWT gate it
extends already lives. No file under `apps/api/src/features/**` is modified in this sprint.

**Botanical Engine adherence.** Authentication and authorization are content-free. The new middleware reads
two `@beechcms/core` interfaces off the Hono context (`oauthTokenRepository`, `userRepository`) and touches no
`content_{slug}` table, no Branch ID, no alias. It contains no SQL and no `env.DB` reference, so the Botanical
invariant holds by construction rather than by review.

**Role logic containment.** Business rule 4 of the brief confines every role decision to `IRoleGuard`. That
guard arbitrates at *consent* time (`authorize.ts:158`, Sprint 2) — deciding which scopes may be granted. This
sprint arbitrates at *request* time, and does so purely on the scopes already frozen into the token record. It
therefore reads `role` in exactly one place and for exactly one reason: to hydrate `jwtPayload` so the
**pre-existing** `requireAdmin` gates behave identically for both schemes. It adds no new role branch.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Middleware registration order in `createBeechApp()` (`apps/api/src/factory.ts`), verbatim line numbers:**

```
L117  app.use('*', repositoryMiddleware({ … }))      // binds userRepository, clock, idGenerator,
                                                     //   oauthClientRepository, oauthAuthorizationCodeRepository,
                                                     //   oauthTokenRepository, oauthConsentRepository, roleGuard
L131  app.use('*', seedRegistryMiddleware())
L134  app.use('*', storageMiddleware({ … }))
L138  app.use('*', queueMiddleware(config.jobs ?? {}))
L140  app.use('*', authProvidersMiddleware())
L141  app.use('*', rateLimiterMiddleware(…))
L142  app.use('*', observabilityMiddleware())
L144  app.use('*', …)                                 // CORS / misc
L185  app.use('*', …)                                 // security headers
L196  app.use('/api/*', …)                            // analytics (post-response)

L218  app.route('/', authApp)
L219  app.route('/', setupApp)
L220  app.route('/', passwordResetApp)
L221  app.route('/', oauthApp)                        // Sprint 2

L224  const apiProtected = new Hono<{ Bindings: Env; Variables: Variables }>()
L225  apiProtected.use('*', authMiddleware())         // <-- THE ONE PRODUCTION LINE THIS SPRINT CHANGES
L227  apiProtected.route('/settings', settingsApp)
L228  apiProtected.route('/schema', schemaApp)        // -> GET /api/schema
L229  apiProtected.route('/dashboard-layout', dashboardLayoutApp)
L230  apiProtected.route('/seeds', seedsApp)          // -> /api/seeds, /api/seeds/:slug, …/mcp-plan, …/mcp-apply
L231-236 apiProtected.route('/content', …)            // notifications, stats, rotateField, draft, backrefs, content
L237  apiProtected.route('/widget', widgetApp)
L238  apiProtected.route('/automations', automationsApp)
L239  apiProtected.route('/search', searchRouter)
L240  apiProtected.route('/', uploadRoutes)

L244  apiPublic.use('*', publicRateLimitMiddleware())
L245  apiPublic.use('*', apiKeyMiddleware())
L250  app.route('/api/v1/public', apiPublic)          // registered BEFORE apiProtected, by design
L253  app.route('/api/webhooks', webhooksApp)
L262  protectedRouter.use('*', authMiddleware())      // developer custom routes — MUST STAY JWT-ONLY
L267  app.route('/api/custom', protectedRouter)
L270  app.route('/api', apiProtected)
```

**`authMiddleware()` today — `apps/api/src/middleware/auth.middleware.ts:L24-45`:** requires
`Authorization: Bearer <token>`, calls `c.get('tokenService').verify(token)`, sets `c.set('jwtPayload', claims)`,
and throws `HTTPException(401)` with the fixed body `{"error":"Unauthorized"}` on any failure. It carries **no
`WWW-Authenticate` header** and exposes no failure detail — deliberate, and preserved verbatim for the JWT path.

**Its 4 production call sites** (from `graphify affected "authMiddleware" --depth 2`):

| Site | Router | Required behaviour after this sprint |
|---|---|---|
| `factory.ts:L225` | `apiProtected` | **JWT + OAuth** (the only site that changes) |
| `factory.ts:L262` | `/api/custom` protected | JWT only — unchanged |
| `oauth/index.ts:L40-41` | `/oauth/authorize/request`, `/oauth/authorize/consent` | JWT only — unchanged. An OAuth token here could mint new codes. |
| `search.ts:L24` | `searchRouter` (nested under `apiProtected`) | JWT only — unchanged |

**Sprint 1 + 2 assets consumed read-only (no modification):**

- `packages/core/src/oauth/scopes.ts` — `OAUTH_SCOPES = ['schema:read','schema:write']`, `OAuthScope`,
  `isOAuthScope`, `parseScopeString`, `formatScopes`, `isScopeSubset`. The header comment already documents
  the `beech_schema_plan` = READ classification.
- `packages/core/src/oauth/token.repository.ts:L38` — `findActiveByHash(tokenHash, tokenType, nowTimestamp)`,
  returning `OAuthTokenRecord | null`; already filters expired **and** revoked rows.
- `OAuthTokenRecord` fields available: `id, tokenHash, tokenType, clientId, userId, scope: OAuthScope[],
  authorizationCodeHash, expiresAt, createdAt, revokedAt`.
- `apps/api/src/shared/utils/opaque-token.ts` — `generateOpaqueToken()`, 32 CSPRNG bytes hex-encoded → 64 chars.
- `sha256hex` exported from `@beechcms/core` (used by `token.ts:L108,L177`).

**`Variables` entries already bound and needed here** (`apps/api/src/types.ts`): `jwtPayload: JwtClaims`
(L124), `clock: IClock` (L170, `.nowSeconds()`), `userRepository: IUserRepository` (`.findById(id) →
UserRecord | null`, fields `id, email, name, surname, passwordHash, role, avatarUrl,
notificationPreferences`), `oauthTokenRepository: IOAuthTokenRepository` (L208), `roleGuard: IRoleGuard`
(L212).

**In-slice admin gates that OAuth requests must satisfy (do not modify):**

- `seeds.handler.ts:L38-42` — blanket `seedsApp.use('*', …)` running `requireAdmin`.
- `seeds.helpers.ts:L33-44` — `requireAdmin` reads `context.get('jwtPayload')?.role !== 'admin'` → 403.
- `seeds.helpers.ts:L51-59` — `actorFromContext` reads `sub`, `email`, `name`, `surname` for the audit log.
- `schema.handler.ts:L15-26` — `requireLayoutEditPermission` reads `jwtPayload?.role` (layout writes only;
  `GET /api/schema` is not gated by it).

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**New files (1 production, 2 test):**

1. `apps/api/src/middleware/oauth-scope.middleware.ts` — the fail-closed scope gate and its route table.
2. `apps/api/src/middleware/oauth-scope.middleware.test.ts` — unit tests for the gate and the table.
3. `apps/api/test/flow-oauth-resource-server.test.ts` — end-to-end flow test (consent → token → protected call).

**Modified files (3 production, 0 slice files):**

4. `apps/api/src/middleware/auth.middleware.ts` — adds the opt-in `{ acceptOAuth }` option and the opaque-token
   branch. The JWT branch is behaviourally unchanged.
5. `apps/api/src/types.ts` — adds `OAuthGrantContext` and `Variables.oauthGrant`.
6. `apps/api/src/factory.ts` — `L225` becomes `authMiddleware({ acceptOAuth: true })`; one new line registers
   `oauthScopeMiddleware()` immediately after it.

**Explicitly NOT produced (see SECTION 7):** no migration, no `packages/core` change, no `apps/dashboard`
change, no `packages/mcp` change, no new HTTP endpoint, no change to any file under `apps/api/src/features/`.

**New test file for the auth middleware:** the OAuth branch is covered by (2) and (3). Do **not** edit
`apps/api/src/middleware/auth.middleware.test.ts`; its existing assertions are the regression proof that the
JWT path is untouched.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 4.1 — `apps/api/src/types.ts`

Add `OAuthScope` to the existing `@beechcms/core` type import on L13 (it is not currently imported), then add
the grant type and the `Variables` entry.

```ts
/**
 * Authentication material carried by a request that authenticated with an OAuth 2.1
 * access token instead of the dashboard admin JWT.
 *
 * `null` means the request authenticated with the admin JWT (or, on routers where
 * `authMiddleware` is not registered, did not authenticate at all). The scope gate
 * treats `null` as "not an OAuth request" and lets it through unchanged, so admin
 * dashboard behaviour is never affected by scope enforcement.
 */
export interface OAuthGrantContext {
  /** Client that presented the access token (`oauth_tokens.client_id`). */
  clientId: string
  /** Resource owner the token acts for (`oauth_tokens.user_id`). */
  userId: string
  /** Scopes frozen into the token record at issuance time. Never re-derived per request. */
  scope: OAuthScope[]
}
```

Inside `export interface Variables { … }`, next to `jwtPayload` (L124):

```ts
  /**
   * Set by `authMiddleware({ acceptOAuth: true })`. Non-null only when the request
   * presented an OAuth access token. Read by `oauthScopeMiddleware()`.
   */
  oauthGrant: OAuthGrantContext | null
```

### Task 4.2 — `apps/api/src/middleware/auth.middleware.ts`

Keep the file's existing header, `UNAUTHORIZED_JSON` and `unauthorizedResponse()` **exactly as they are**.
Add the imports and the new logic below.

```ts
import { sha256hex, type JwtClaims } from '@beechcms/core'
import type { Env, Variables } from '../types'

/** 64 lowercase hex chars: the exact shape of `generateOpaqueToken()` output. A JWT always contains dots. */
const OPAQUE_TOKEN_RE = /^[0-9a-f]{64}$/

/** RFC 6750 §3 challenge for a token that is unknown, expired or revoked. Signals "refresh and retry". */
const INVALID_TOKEN_CHALLENGE = 'Bearer error="invalid_token", error_description="The access token is invalid or expired"'

function invalidTokenResponse(): Response {
  return new Response(UNAUTHORIZED_JSON, {
    status: 401,
    headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': INVALID_TOKEN_CHALLENGE },
  })
}

/** Options for {@link authMiddleware}. */
export interface AuthMiddlewareOptions {
  /**
   * When true, an opaque OAuth 2.1 access token is accepted in addition to the admin JWT.
   *
   * Defaults to **false** so that every pre-existing call site — the developer custom
   * routes (`factory.ts`), the OAuth consent APIs (`features/oauth/index.ts`) and the
   * search router (`features/search/search.ts`) — stays JWT-only. Accepting an OAuth
   * token on the consent APIs would let a token mint fresh authorization codes.
   *
   * Only `apiProtected` sets it, and only in combination with `oauthScopeMiddleware()`,
   * which is what makes OAuth acceptance fail-closed per route.
   */
  acceptOAuth?: boolean
}
```

Replace the body of `authMiddleware()` with the two-scheme version. The JWT branch is copied verbatim from the
current implementation:

```ts
export function authMiddleware(options: AuthMiddlewareOptions = {}) {
  const acceptOAuth = options.acceptOAuth === true

  return async (c: Context<{ Bindings: Env; Variables: Variables }>, next: Next): Promise<Response | void> => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      throw new HTTPException(401, { res: unauthorizedResponse() })
    }

    const token = authHeader.slice(7)
    if (!token) {
      throw new HTTPException(401, { res: unauthorizedResponse() })
    }

    if (acceptOAuth && OPAQUE_TOKEN_RE.test(token)) {
      const nowSeconds = c.get('clock').nowSeconds()
      const record = await c.get('oauthTokenRepository').findActiveByHash(await sha256hex(token), 'access', nowSeconds)
      if (!record) {
        throw new HTTPException(401, { res: invalidTokenResponse() })
      }

      // The in-slice gates (`requireAdmin`, `actorFromContext`) read `jwtPayload`. An OAuth
      // request must therefore present the SAME shape as a JWT request: the resource owner's
      // own claims, never elevated ones. If the account is gone, the grant is dead with it.
      const user = await c.get('userRepository').findById(record.userId)
      if (!user) {
        throw new HTTPException(401, { res: invalidTokenResponse() })
      }

      const claims: JwtClaims = {
        sub: user.id,
        email: user.email,
        name: user.name ?? undefined,
        surname: user.surname ?? undefined,
        role: user.role,
      }

      c.set('jwtPayload', claims)
      c.set('oauthGrant', { clientId: record.clientId, userId: record.userId, scope: record.scope })
      await next()
      return
    }

    const claims = await c.get('tokenService').verify(token)

    if (!claims) {
      throw new HTTPException(401, { res: unauthorizedResponse() })
    }

    c.set('jwtPayload', claims)
    c.set('oauthGrant', null)
    await next()
  }
}
```

**Invariants for this task:**
- A malformed/expired **JWT** still returns the original bare 401 with **no** `WWW-Authenticate` header. Only
  the OAuth branch adds the header. `auth.middleware.test.ts` and `test/flow-admin-auth.test.ts` must stay green
  with zero edits.
- When `acceptOAuth` is false, a 64-hex token falls through to `tokenService.verify()` and fails → 401. That is
  the intended JWT-only rejection.
- `c.set('oauthGrant', null)` on the JWT path is mandatory: the gate must never read `undefined`.

### Task 4.3 — `apps/api/src/middleware/oauth-scope.middleware.ts` (NEW)

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Context, Next } from 'hono'
import type { OAuthScope } from '@beechcms/core'
import type { Env, Variables } from '../types'

/**
 * The complete list of API routes an OAuth access token may reach, and the scope
 * each one demands.
 *
 * This table is a CLOSED allowlist: any `/api/*` path absent from it is refused for
 * OAuth-authenticated requests. Enforcement is therefore fail-closed — forgetting to
 * register a route denies access, it never grants it. That property is the reason
 * enforcement is centralized here instead of being a per-route decorator inside the
 * feature slices.
 *
 * The entries map 1:1 onto the six MCP tools in `packages/mcp/src/index.ts`
 * (`beech_schema_export` and `beech_schema_validate` share `GET /api/schema`).
 *
 * `POST /api/seeds/:slug/mcp-plan` is `schema:read` ON PURPOSE. The imperative name
 * suggests otherwise, but the handler is a dry run: it computes DDL and a safety
 * classification and mutates nothing. Only `mcp-apply` writes. The same classification
 * is documented at the source of truth, `packages/core/src/oauth/scopes.ts`.
 *
 * Paths are matched against `c.req.path`, which is the FULL path including the `/api`
 * prefix, because this middleware runs on the `apiProtected` router mounted at `/api`.
 */
export interface OAuthScopeRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  pattern: RegExp
  scope: OAuthScope
  /** The MCP tool(s) this route backs. Documentation only. */
  tools: string
}

export const OAUTH_SCOPE_ROUTES: readonly OAuthScopeRoute[] = [
  { method: 'GET',  pattern: /^\/api\/seeds\/?$/,                    scope: 'schema:read',  tools: 'beech_list_seeds' },
  { method: 'GET',  pattern: /^\/api\/seeds\/[^/]+$/,                scope: 'schema:read',  tools: 'beech_get_seed' },
  { method: 'GET',  pattern: /^\/api\/schema\/?$/,                   scope: 'schema:read',  tools: 'beech_schema_export, beech_schema_validate' },
  { method: 'POST', pattern: /^\/api\/seeds\/[^/]+\/mcp-plan$/,      scope: 'schema:read',  tools: 'beech_schema_plan (dry-run)' },
  { method: 'POST', pattern: /^\/api\/seeds\/[^/]+\/mcp-apply$/,     scope: 'schema:write', tools: 'beech_schema_apply' },
]

/** Resolves the scope a route demands, or null when the route is not OAuth-reachable. */
export function resolveRequiredScope(method: string, path: string): OAuthScope | null {
  const match = OAUTH_SCOPE_ROUTES.find(route => route.method === method && route.pattern.test(path))
  return match ? match.scope : null
}

function insufficientScopeResponse(required: OAuthScope | null): Response {
  const challenge = required
    ? `Bearer error="insufficient_scope", scope="${required}"`
    : 'Bearer error="insufficient_scope"'
  return new Response(
    JSON.stringify({
      error: 'insufficient_scope',
      error_description: required
        ? `This endpoint requires the '${required}' scope.`
        : 'This endpoint is not reachable with an OAuth access token.',
    }),
    { status: 403, headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': challenge } },
  )
}

/**
 * Fail-closed OAuth scope gate for `apiProtected`.
 *
 * MUST be registered immediately after `authMiddleware({ acceptOAuth: true })`, which is
 * what populates `oauthGrant`. Requests that authenticated with the admin JWT carry
 * `oauthGrant === null` and pass through untouched: dashboard behaviour is unchanged.
 *
 * 403 (never 401) is returned on a scope failure, so an MCP client can distinguish a
 * refreshable condition (401 `invalid_token`) from a permanently insufficient grant.
 */
export function oauthScopeMiddleware() {
  return async (c: Context<{ Bindings: Env; Variables: Variables }>, next: Next): Promise<Response | void> => {
    const grant = c.get('oauthGrant')
    if (!grant) {
      await next()
      return
    }

    const required = resolveRequiredScope(c.req.method, c.req.path)
    if (required === null || !grant.scope.includes(required)) {
      return insufficientScopeResponse(required)
    }

    await next()
  }
}
```

### Task 4.4 — `apps/api/src/factory.ts`

Add the import next to the existing `authMiddleware` import (L16):

```ts
import { oauthScopeMiddleware } from './middleware/oauth-scope.middleware'
```

Replace L225 and insert the gate directly after it. **No other line in the file changes** — in particular
`L262` (`protectedRouter.use('*', authMiddleware())`) keeps its no-argument form:

```ts
  const apiProtected = new Hono<{ Bindings: Env; Variables: Variables }>()
  // Accepts the dashboard admin JWT and, additionally, OAuth 2.1 access tokens.
  apiProtected.use('*', authMiddleware({ acceptOAuth: true }))
  // Fail-closed: an OAuth token reaches only the routes listed in OAUTH_SCOPE_ROUTES.
  // Must stay immediately after authMiddleware — it consumes the `oauthGrant` it sets.
  apiProtected.use('*', oauthScopeMiddleware())
  apiProtected.route('/settings', settingsApp)
```

### Task 4.5 — `apps/api/src/middleware/oauth-scope.middleware.test.ts` (NEW)

Build a minimal Hono app (follow the `buildApp` pattern in `apps/api/src/middleware/auth.middleware.test.ts`)
that presets `oauthGrant` via a stub middleware, mounts `oauthScopeMiddleware()`, and registers catch-all
handlers. Required cases:

1. `oauthGrant === null` → handler runs, whatever the path (JWT passthrough).
2. Each of the 5 table rows, with the exact scope → 200.
3. `GET /api/seeds/articles` with `scope: ['schema:write']` → 403, body `error: 'insufficient_scope'`,
   `WWW-Authenticate` contains `scope="schema:read"`.
4. `POST /api/seeds/articles/mcp-apply` with `scope: ['schema:read']` → 403 (read grant cannot write).
5. `POST /api/seeds/articles/mcp-apply` with `scope: ['schema:read','schema:write']` → 200.
6. **Default-deny sweep** — with `scope: ['schema:read','schema:write']` (maximal grant), every one of these
   returns 403: `GET /api/content/articles`, `POST /api/content/articles`, `GET /api/settings`,
   `GET /api/search?q=x`, `PUT /api/schema/articles/layout`, `DELETE /api/seeds/articles`,
   `GET /api/seeds/articles/orphans`, `POST /api/seeds/articles/branches`,
   `POST /api/seeds/articles/fts/rebuild`, `GET /api/dashboard-layout`, `GET /api/automations`,
   `GET /api/widget`. This is the test that proves the gate is fail-closed.
7. Method discrimination: `POST /api/seeds` → 403 (only `GET /api/seeds` is listed).
8. `resolveRequiredScope` unit table: returns the right scope for the 5 rows, `null` for
   `GET /api/seeds/articles/orphans` and for `PUT /api/schema`.

### Task 4.6 — `apps/api/test/flow-oauth-resource-server.test.ts` (NEW)

Model it on `apps/api/test/flow-oauth-authorization.test.ts` (Sprint 2). Drive the **real** flow — do not
hand-insert token rows: authenticate as admin, `POST /oauth/authorize/consent`, exchange the code at
`POST /oauth/token`, then use the returned `access_token` as `Authorization: Bearer`.

Required assertions:

1. **Happy path, read:** `schema:read` token → `GET /api/seeds` 200, `GET /api/seeds/:slug` 200,
   `GET /api/schema` 200, `POST /api/seeds/:slug/mcp-plan` 200 (a plan is returned).
2. **Happy path, write:** `schema:read schema:write` token → `POST /api/seeds/:slug/mcp-apply` succeeds for the
   plan produced in (1).
3. **Admin gate satisfied through hydration:** assert (1) returns 200 and **not** 403 — this is the regression
   test for `requireAdmin` reading the hydrated `jwtPayload.role`.
4. **Audit actor:** after `mcp-apply`, the activity log entry records the resource owner's `sub`/`email`, not
   `'unknown'` — proving `actorFromContext` sees real claims.
5. **Scope escalation refused:** the `schema:read`-only token on `mcp-apply` → 403 `insufficient_scope`.
6. **Default deny:** the maximal token on `GET /api/content/:slug` and `GET /api/settings` → 403.
7. **Revocation is immediate:** `POST /oauth/revoke` the access token, then `GET /api/seeds` → **401** with
   `WWW-Authenticate: …error="invalid_token"…` (not 403 — the client must be told to refresh).
8. **Expiry is 401:** advance the injected clock past `ACCESS_TOKEN_TTL_SECONDS`, then `GET /api/seeds` → 401
   `invalid_token`.
9. **JWT unchanged:** the same admin JWT still gets 200 on `GET /api/content/:slug` and `GET /api/settings`,
   i.e. the gate never touches JWT requests.
10. **Refresh token is not an access token:** presenting the `refresh_token` value as a Bearer on
    `GET /api/seeds` → 401 (`findActiveByHash` is queried with `'access'`).
11. **Consent API is not OAuth-reachable:** the maximal access token on `GET /oauth/authorize/request` → 401
    (that route's `authMiddleware()` has `acceptOAuth` false). This is the privilege-escalation regression test.
12. **Custom protected routes stay JWT-only:** if the existing custom-routes fixture is reusable, the maximal
    access token on a `/api/custom/*` protected route → 401.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repository root, in this order. Stop at the first failure.

```bash
# 1. Core is untouched — this must report zero changed files.
git status --porcelain packages/core/ apps/dashboard/ packages/mcp/ apps/api/migrations/

# 2. No slice file was modified (VSA proof).
git status --porcelain apps/api/src/features/

# 3. Core still builds (it should not have changed, but prove the contracts resolve).
pnpm --filter @beechcms/core run build

# 4. API typecheck. Compare against the pre-existing baseline: no NEW error in
#    auth.middleware.ts, oauth-scope.middleware.ts, types.ts or factory.ts.
pnpm --filter @beechcms/api exec tsc --noEmit

# 5. Lint.
pnpm beech lint

# 6. Full workspace test suite. The 33 pre-existing importers of authMiddleware are the
#    regression net for the JWT path; none of their assertions may be edited.
pnpm beech test

# 7. Migrations unchanged: 0038_oauth_authorization.sql must still be the newest.
pnpm beech db:reset && pnpm beech db:migrate
```

Targeted greps that must hold (each prints nothing unless stated):

```bash
# 8. Botanical invariant: the new middleware never reaches D1 directly.
grep -nE "env\.DB|D1Database|shared/db|prepare\(|SELECT |INSERT |UPDATE " \
  apps/api/src/middleware/oauth-scope.middleware.ts

# 8b. And the OAuth branch of the auth middleware does not either.
grep -nE "env\.DB|D1Database|shared/db" apps/api/src/middleware/auth.middleware.ts

# 9. VSA: no middleware imports a feature slice.
grep -n "features/" apps/api/src/middleware/oauth-scope.middleware.ts \
                    apps/api/src/middleware/auth.middleware.ts

# 10. acceptOAuth is enabled at exactly ONE call site.
grep -rn "acceptOAuth" apps/api/src --include=*.ts | grep -v "\.test\.ts"
#    Expected: the definition + JSDoc in auth.middleware.ts, and factory.ts:L225 only.

# 11. The gate is registered exactly once, and on apiProtected.
grep -n "oauthScopeMiddleware" apps/api/src/factory.ts

# 12. Scope literals are never re-declared outside core.
grep -rn "'schema:read'\|'schema:write'" apps/api/src --include=*.ts | grep -v "\.test\.ts"
#    Expected: only OAUTH_SCOPE_ROUTES in oauth-scope.middleware.ts.

# 13. The token-type argument is 'access', never 'refresh'.
grep -n "findActiveByHash" apps/api/src/middleware/auth.middleware.ts
```

Graph refresh and boundary proof, after the code is green:

```bash
graphify update . --force
graphify path "oauthScopeMiddleware" "D1Database"     # expect: No directed path found
graphify affected "authMiddleware" --depth 2          # expect: oauth-scope.middleware.test.ts and
                                                      #   flow-oauth-resource-server.test.ts appear;
                                                      #   no NEW production importer beyond factory.ts
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

**Architecture**
- [ ] Zero files changed under `packages/core/`, `packages/mcp/`, `apps/dashboard/`, `apps/api/migrations/`.
- [ ] Zero files changed under `apps/api/src/features/` — enforcement is centralized in `src/middleware/`.
- [ ] `apps/api/src/middleware/oauth-scope.middleware.ts` contains no `env.DB`, no `D1Database`, no SQL, and no
      import from `apps/api/src/shared/db/**` or from any feature slice.
- [ ] The OAuth branch of `authMiddleware` reads persistence only through `oauthTokenRepository` and
      `userRepository`, both `@beechcms/core` interfaces taken off the Hono context.
- [ ] `graphify path "oauthScopeMiddleware" "D1Database"` reports `No directed path found`.
- [ ] No new HTTP route is registered; `factory.docs-parity.test.ts` passes unchanged.

**Non-regression of the JWT path**
- [ ] `acceptOAuth` defaults to `false`; `factory.ts:L225` is its only production call site with `true`.
- [ ] `factory.ts:L262` (custom protected routes), `features/oauth/index.ts:L40-41` (consent APIs) and
      `features/search/search.ts:L24` still call `authMiddleware()` with no argument.
- [ ] `apps/api/src/middleware/auth.middleware.test.ts` and `apps/api/test/flow-admin-auth.test.ts` pass with
      **zero edited assertions**.
- [ ] A failed JWT verification still returns the original bare 401 body with **no** `WWW-Authenticate` header.
- [ ] Every request authenticating with the admin JWT carries `oauthGrant === null` and is passed through by
      the gate untouched.

**Scope enforcement (fail-closed)**
- [ ] `OAUTH_SCOPE_ROUTES` has exactly 5 entries, covering the 6 MCP tools.
- [ ] An OAuth access token on **any** `/api/*` path absent from that table returns `403 insufficient_scope` —
      asserted by the default-deny sweep in Task 4.5 case 6 over at least 12 paths.
- [ ] `POST /api/seeds/:slug/mcp-plan` requires `schema:read`, and the "dry-run, mutates nothing" rationale is
      documented in `OAUTH_SCOPE_ROUTES` at that entry.
- [ ] `POST /api/seeds/:slug/mcp-apply` is the only entry requiring `schema:write`.
- [ ] Method is part of the match: `POST /api/seeds` is denied while `GET /api/seeds` is allowed.
- [ ] Scope literals appear nowhere in `apps/api/src` outside `OAUTH_SCOPE_ROUTES` (typed as `OAuthScope`, so a
      typo is a compile error).

**Status-code contract for the Sprint 5 client**
- [ ] Unknown, expired or revoked access token → **401** with `WWW-Authenticate: Bearer error="invalid_token"…`.
- [ ] Deleted resource owner (`findById` → null) → **401 invalid_token**, not 500.
- [ ] A refresh token presented as a Bearer → **401** (lookup is `'access'`-typed).
- [ ] Granted-but-insufficient scope, and any unlisted route → **403 insufficient_scope**, never 401.

**Privilege containment**
- [ ] An access token with the maximal grant is refused (401) on `GET /oauth/authorize/request` and
      `POST /oauth/authorize/consent` — it can never mint a new authorization code.
- [ ] `jwtPayload` on an OAuth request is hydrated from `userRepository.findById(record.userId)` and carries the
      resource owner's own `role`, never a hardcoded or elevated one.
- [ ] The in-slice `requireAdmin` gate is satisfied by that hydration, with `seeds.helpers.ts` unmodified.
- [ ] The activity-log actor for an OAuth-driven `mcp-apply` is the resource owner, not `'unknown'`.
- [ ] `roleGuard` is not called in the request path; role arbitration remains a consent-time concern.

**Typing & quality gates**
- [ ] `OAuthGrantContext.scope` is `OAuthScope[]`; no `string[]`, no `any`, no non-null assertion in the new code.
- [ ] `pnpm --filter @beechcms/core run build` passes.
- [ ] `pnpm --filter @beechcms/api exec tsc --noEmit` introduces zero new errors versus the baseline.
- [ ] `pnpm beech lint` passes.
- [ ] `pnpm beech test` passes across the whole workspace.
- [ ] `pnpm beech db:reset && pnpm beech db:migrate` succeeds, `0038_oauth_authorization.sql` still newest.
- [ ] Both new files carry the `SPDX-License-Identifier: BUSL-1.1` header.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT build or modify the following.

**Deferred to Sprint 4 — `oauth-dashboard-consent-ui`** (ROADMAP §Sprint 4):
- Any file under `apps/dashboard/`. No consent screen, no "Connected apps" tab, no
  `apps/dashboard/src/features/oauth-consent/` slice.
- Any endpoint listing or revoking authorized clients from the UI.
  `IOAuthTokenRepository.listAuthorizedClientsForUser` and `revokeAllForClientAndUser` already exist (Sprint 1)
  and stay unused this sprint — **do not** add a route for them.

**Deferred to Sprint 5 — `mcp-pkce-client`** (ROADMAP §Sprint 5):
- Any file under `packages/mcp/`. The MCP client keeps using `BEECH_EMAIL`/`BEECH_PASSWORD` and the admin JWT
  for the duration of this sprint; that removal is Sprint 5's deliverable.
- The loopback listener, browser launch, verifier/challenge generation, on-disk token cache and transparent
  401-refresh logic. This sprint only *defines* the 401-vs-403 contract those depend on.

**Not roadmapped — do not introduce:**
- Any new scope beyond `schema:read` / `schema:write` (feature brief §5). `OAUTH_SCOPES` in
  `packages/core/src/oauth/scopes.ts` is frozen; do not edit it.
- Real role logic. `AllowAllRoleGuard` stays the bound implementation, and `roleGuard` is not called from the
  request path.
- RFC 7662 token introspection, RFC 8414 authorization-server metadata, RFC 9728 protected-resource metadata,
  JWT access tokens, or opaque-token caching in KV.
- Rate limiting on the protected API routes. `oauthToken` / `oauthTokenAccount` cover `/oauth/token` and are
  sufficient; do not add `RateLimiterName` entries.
- Any change to `/auth/login`, `/auth/refresh`, `authApp`, `apiKeyMiddleware` or the public API. Business rule 1
  of the brief keeps `/auth/login` untouched.
- Any D1 migration. If a column appears to be missing, stop and report — do not write `0039_*.sql`.
- Editing existing assertions in `auth.middleware.test.ts`, `flow-admin-auth.test.ts` or any other pre-existing
  test to make new behaviour pass. Those files are the non-regression proof; a failure there means the
  implementation is wrong, not the test.
