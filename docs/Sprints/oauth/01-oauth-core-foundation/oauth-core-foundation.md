# Sprint: `oauth-core-foundation`

Roadmap entry: `output/backlog/ROADMAP.md` → Sprint 1 of 5.

### Pre-Computation Analysis

**a) God Nodes identified via graphify CLI**

| Node | Evidence | Why it is a God Node |
|---|---|---|
| `authMiddleware()` | `graphify affected "authMiddleware" --depth 2` → 34 affected nodes (`createBeechApp()` at `apps/api/src/factory.ts:L217`, `search.ts:L18`, `api/src/index.ts:L5`, plus ~28 `test/flow-*.test.ts` importers) | Every protected route and nearly every integration test transits it. Any signature/behaviour change ripples across the whole API test suite. **Not touched this sprint.** |
| `repositoryMiddleware()` | `graphify explain "apps/api/src/shared/db/repositories/d1-session.repository.ts"` → `<-- repository.middleware.ts [imports_from] apps/api/src/middleware/repository.middleware.ts:L12`; file itself imports 24 D1 repositories | Single composition root for every D1 repository. It is the only sanctioned injection point, therefore the only place new OAuth repositories may be constructed. |
| `session.repository.ts` (`ISessionRepository`) | `graphify explain "packages/core/src/auth/session.repository.ts"` → Degree 5, community `ISessionRepository`, `<-- core/src/index.ts [re_exports] packages/core/src/index.ts:L33`, contains `NewRefreshToken`, `RefreshTokenRecord`, `ActiveSessionSummary` | The canonical hash-only token-persistence contract. The OAuth token repository must replicate its shape, not extend or modify it. |
| `Variables` / `AppEnv` (`apps/api/src/types.ts`) | Read: 39 context entries, `AppEnv` at L206; imported by every middleware and slice | The DI contract of the entire API. Adding entries is additive-only; renaming or reordering breaks every slice. |
| `createBeechApp()` (`apps/api/src/factory.ts`) | Read L99–L291: middleware registration order + all `app.route()` mounts | Composition root of the HTTP layer. **Not touched this sprint** (no endpoints shipped). |

**b) Architectural boundaries affected**

| Boundary | Affected this sprint | What lands there |
|---|---|---|
| `@beechcms/core` | **YES** — new directory `packages/core/src/oauth/` | Pure interfaces + two zero-dependency implementations (`AllowAllRoleGuard`, `verifyPkceChallenge`). Re-exported from `packages/core/src/index.ts` following the existing `export * from './auth/*.js'` pattern (L30–L34). No D1 import, no Hono import. |
| `apps/api` — `shared/db/` | **YES** | 4 D1 repository implementations, siblings of `d1-session.repository.ts`. `shared/` is the sanctioned cross-slice location; it is not a feature slice. |
| `apps/api` — `middleware/` + `types.ts` | **YES (additive only)** | 4 new `Variables` entries + 4 `context.set()` calls in `repositoryMiddleware`, with `RepositoryOverrides` fields for test injection, exactly mirroring `timeTrapTokenRepository`. |
| `apps/api` — `features/*` | **NO** | Zero feature slices touched. The `oauth` slice is Sprint 2. |
| `apps/api` — `factory.ts`, `auth/auth.app.ts`, `middleware/auth.middleware.ts` | **NO** | `/auth/login`, `/auth/refresh`, `/auth/logout` and the JWT middleware are unchanged. Business rule #1 of the brief is preserved structurally by not opening these files. |
| `apps/api/migrations/` | **YES** | One new forward migration `0038_oauth_authorization.sql`. `0037_time_trap_tokens.sql` is the current head; `_archive/` is untouched. |
| `apps/dashboard` | **NO** | Sprint 4. |
| `packages/mcp` | **NO** | Sprint 5. `client.ts` keeps its `BEECH_EMAIL`/`BEECH_PASSWORD` path until then. |

**c) `graphify affected` impact analysis — breaking-change proof**

```
$ graphify affected "ISessionRepository" --depth 2
Affected nodes for ISessionRepository
Depth: 2
No affected nodes found.

$ graphify affected "ITokenService" --depth 2
Affected nodes for ITokenService
Depth: 2
No affected nodes found.

$ graphify affected "authMiddleware" --depth 2
Affected nodes for authMiddleware()
- createBeechApp() [calls] apps/api/src/factory.ts:L217
- src/factory.ts [imports] apps/api/src/factory.ts:L16
- search.ts [imports] apps/api/src/features/search/search.ts:L18
- api/src/index.ts [imports] apps/api/src/index.ts:L5
- search/index.ts [re_exports] apps/api/src/features/search/index.ts:L21
  (+ 29 test-file importers under apps/api/test/ and apps/api/src/**)

$ graphify path "authApp" "D1SessionRepository"
No directed path found between 'authApp' and 'D1SessionRepository'.
```

Reading:
1. The two core auth interfaces have **zero reverse dependencies at depth 2** — they are consumed structurally (`implements`) and via context, not by direct symbol import chains. Adding a *new sibling* interface directory (`core/src/oauth/`) therefore cannot break any existing consumer: nothing is modified, only added.
2. `authMiddleware()` is the one blast-radius node in this feature's neighbourhood (34 dependents, 29 of them tests). This sprint does not open that file. Sprint 3 does, and that is precisely why it is a separate sprint with its own validation gate.
3. `authApp → D1SessionRepository` has **no directed path**: `auth.app.ts` reaches persistence only through `context.get('sessionRepository')` (`auth.app.ts:L168, L201, L221`), i.e. the injected interface. The new OAuth repositories must be reached the same way — never imported directly by a handler.

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

**Rule 2 — THE BOTANICAL INVARIANT (no bypass of `@beechcms/core`).**
The OAuth tables are **system tables**, not `content_{slug}` doctype tables. `apiToDb`/`dbToApi`
and Branch IDs (`br_XX`) govern *content* row shaping and are structurally inapplicable here —
`refresh_tokens`, `password_reset_tokens`, `public_time_trap_tokens`, `seeds` are all
precedents of system tables owned by hand-written D1 repositories. The invariant that *does*
bind is the one it protects: **no handler may hold a `D1Database` handle**. Verified respected —
every D1 statement in this sprint lives in a class implementing a `@beechcms/core` interface,
constructed exclusively in `repositoryMiddleware`, reached by handlers only via
`context.get(...)`. `graphify path "authApp" "D1SessionRepository"` returning *no directed path*
is the existing proof of that shape; the new repositories reproduce it exactly. No hardcoded
content field names are introduced. **PASS.**

**Rule 3 — VSA ENFORCEMENT (zero cross-feature imports).**
This sprint creates **no feature slice**, therefore zero cross-slice imports are possible.
The shared logic (scopes, PKCE, role guard, repository contracts) is placed in
`@beechcms/core` *up front*, which is exactly the remedy Rule 3 mandates when two consumers
need the same logic — here `apps/api` (Sprints 2–3) and `packages/mcp` (Sprint 5) both need
the scope vocabulary and PKCE verification. Putting it in `features/oauth/` and importing it
from `packages/mcp` later would be the violation; this sprint pre-empts it. **PASS.**

**Rule 4 — CLOUDFLARE PURITY.**
No ORM. Raw D1 `prepare().bind().run()`, identical to `D1SessionRepository`. No stateful
background jobs — expired-row pruning is `expires_at`-driven at read time, the same technique
as `public_time_trap_tokens`. Schema change is one deterministic forward migration file with
`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`, no `ALTER`, no data backfill.
PKCE verification uses WebCrypto `crypto.subtle.digest('SHA-256', …)`, edge-native, zero deps.
**PASS.**

**Rule 1 / 6 — RUTHLESS VETO & YAGNI.**
Three candidates were checked for over-engineering and the plan was adjusted:
- ~~Dynamic client registration (RFC 7591) endpoint~~ → **cut**. One client exists
  (`beech-mcp-cli`). It is seeded as a migration row. No registration API.
- ~~Generic `oauth_grants` polymorphic table covering device-code and client-credentials~~ →
  **cut**. Only authorization-code + PKCE is in the brief. Tables model that grant only.
- `IRoleGuard` + `AllowAllRoleGuard` → **kept**, against the YAGNI default. Justification is
  brief business rule #4 and secondary requirement "Role Guard non ancora vincolante": the
  seam must exist *before* `/oauth/authorize` is written in Sprint 2, or the role decision
  gets inlined into the handler and the future roles feature has to reopen it. One interface,
  one 5-line stub, one explicit test. **PASS.**

Boundaries from Step 1 are unchanged after this audit. Proceeding to the linear plan.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

The feature brief describes an authorization server spanning four boundaries: `@beechcms/core`
(contracts), `apps/api` (endpoints + resource-server enforcement), `apps/dashboard` (consent
UI) and `packages/mcp` (PKCE client). Those cannot land in one merge — the graph proves the
dependency is strictly sequential: an `/oauth/token` handler cannot be typed before the token
record interface exists, and the interface cannot be exercised before the `oauth_*` tables
exist. This sprint is the only layer with **no upstream dependency**.

It exists first for three architectural reasons:

1. **The Botanical invariant is decided here, not later.** The single hard constraint the
   feature can violate is a handler talking to D1 directly. By shipping the four repository
   interfaces + D1 implementations *before* any handler exists, Sprint 2 has no path to
   persistence except `context.get('oauthTokenRepository')`. `graphify path "authApp"
   "D1SessionRepository"` → *no directed path* is the shape being replicated; if the endpoints
   landed first, the shortest path for the executing agent would be a direct `env.DB` call.
2. **VSA is decided here too.** `packages/mcp` (Sprint 5) and `apps/api` (Sprints 2–3) both
   need the scope vocabulary and the PKCE verification rule. If that logic were born inside
   `apps/api/src/features/oauth/`, Sprint 5 would either cross-import a feature slice
   (Rule 3 violation) or duplicate the constants. Placing `OAuthScope`, `OAUTH_SCOPES` and
   `verifyPkceChallenge` in `@beechcms/core` now makes both later consumers legal by
   construction.
3. **The blast radius is zero.** `graphify affected "ISessionRepository" --depth 2` and
   `graphify affected "ITokenService" --depth 2` both return *no affected nodes*; this sprint
   only adds siblings next to them. `authMiddleware()` — the 34-dependent God Node — is not
   opened. So the entire existing test suite must stay green with no modification, which is a
   sharp, falsifiable acceptance gate that later sprints (which do touch `authMiddleware`)
   cannot offer.

This sprint ships **contracts, schema and persistence only**. Zero HTTP endpoints, zero UI,
zero MCP changes.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Auth contracts in `@beechcms/core`** (`packages/core/src/auth/`, all re-exported from
`packages/core/src/index.ts:L30–L34` with the `.js` extension convention):
- `hash-provider.ts` → `IHashProvider`
- `token-service.ts` → `ITokenService` (`issue(claims, {ttlSeconds})`, `verify(token)` returning
  `JwtClaims | null`, never throws), `JwtClaims` (`sub`, `email?`, `name?`, `surname?`, `role?`,
  index signature `[key: string]: unknown`), `IssueTokenOptions` (default TTL 900s)
- `user.repository.ts` → `IUserRepository`
- `session.repository.ts` → `ISessionRepository`, `NewRefreshToken`, `RefreshTokenRecord`,
  `ActiveSessionSummary`. Degree 5. Documented invariant on `saveRefreshToken`:
  *"Only the hash is persisted, never the plaintext."*
- `password-reset-token.repository.ts` → `IPasswordResetTokenRepository`

**Existing auth HTTP layer** (`apps/api/src/auth/auth.app.ts`, 264 lines, mounted in
`factory.ts:L211` as `app.route('/', authApp)`, i.e. *outside* `apiProtected`):
- `POST /auth/login` (L121): dual-key rate limit → `userRepository.findByEmail` →
  constant-time compare against `DUMMY_PASSWORD_HASH` → `tokenService.issue({sub, email, name,
  surname, role})` → `generateRefreshToken()` → `sha256hex()` → `sessionRepository
  .saveRefreshToken({id: SystemIdGenerator.uuid(), userId, tokenHash, expiresAt})` → sets
  `refresh_token` HttpOnly cookie (`SameSite=Strict`, `path=/auth`, 7 days) → returns
  `{ token, expiresIn: '15m' }`.
- `POST /auth/refresh` (L188): rate limit `tokenRefresh` → hash cookie → `findActiveByHash` →
  issue new pair **before** revoking the old one, with rollback revoke on failure (L228–L240).
- `POST /auth/logout` (L251): `revokeByHash` + `deleteCookie`.
- Helpers: `sha256hex`, `SystemClock`, `SystemIdGenerator` imported from `@beechcms/core`
  (L13); `checkDualKeyRateLimit` / `normalizeAccountKey` from
  `../shared/utils/dual-key-rate-limiter` (L24).

**Dual-key rate limiter** (`apps/api/src/shared/utils/dual-key-rate-limiter.ts`):
`checkDualKeyRateLimit({ipLimiter, accountLimiter, clientIp, accountKey})` evaluates both
buckets with `Promise.all`, returns `{isAllowed, retryAfterSeconds?, blockedBy?: 'ip' |
'account' | 'both'}`. Limiter names are a closed union `RateLimiterName` in
`apps/api/src/middleware/rate-limit.middleware.ts:L10–L18` (`login`, `loginAccount`,
`tokenRefresh`, `forgotPassword`, `forgotPasswordAccount`, `resetPassword`, `publicApiRead`,
`publicApiWrite`), instantiated as `TokenBucketRateLimiter` in `buildDefaultRegistry()` (L25).
*Extending this union is Sprint 2 work, not this sprint's.*

**Middleware registration order** (`apps/api/src/factory.ts:L111–L208`, exact):
1. `repositoryMiddleware(...)` on `'*'` — must be first, `seedRegistryMiddleware` depends on it
2. `seedRegistryMiddleware()` on `'*'`
3. `storageMiddleware({bucket})` on `'*'`
4. `queueMiddleware(config.jobs ?? {})` on `'*'`
5. `authProvidersMiddleware()` on `'*'`
6. `rateLimiterMiddleware(...)` on `'*'`
7. `observabilityMiddleware()` on `'*'`
8. inline CORS middleware on `'*'` (allowed headers: `Content-Type`, `Authorization`,
   `X-API-Key`, `Idempotency-Key`)
9. inline security-headers middleware on `'*'`
10. inline analytics middleware on `'/api/*'`

Route mounts, in order: `authApp`, `setupApp`, `passwordResetApp` at `'/'`; then `apiPublic`
at `/api/v1/public` (`publicRateLimitMiddleware` → `apiKeyMiddleware`); `webhooksApp` at
`/api/webhooks`; media GET; optional `customRoutes`; finally `apiProtected` at `/api`, which
applies `authMiddleware()` on `'*'` (L217) before its 13 sub-routes.

**Repository composition root** (`apps/api/src/middleware/repository.middleware.ts`, 136 lines):
`createMiddleware<{Bindings: Env; Variables: Variables}>` reads `const database = context.env.DB`
once, then performs 24 `context.set(name, overrides?.name ?? new D1Xxx(database, …))` calls.
`RepositoryOverrides` mirrors each entry as an optional field for test injection. Reference
pattern for this sprint (L28 import, L~L134 set): `timeTrapTokenRepository` /
`D1TimeTrapTokenRepository(database)`. `SystemClock` and `SystemIdGenerator` are resolved once
as `resolvedClock` / `resolvedIdGenerator` and passed to repositories that need them
(`D1SessionRepository(database, resolvedClock)`).

**Context contract** (`apps/api/src/types.ts`): `Env` (L21–L114, `DB: D1Database`,
`JWT_SECRET`, 6 optional `RateLimit` bindings, …), `Variables` (L120–L203, 39 entries, each
one documented and set by some middleware on the request path), `AppEnv = {Bindings: Env;
Variables: Variables}` (L206).

**Existing D1 token-table precedent** (`apps/api/migrations/0000_v040_base.sql:L46–L57`):
```sql
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          TEXT    NOT NULL PRIMARY KEY,
    user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT    NOT NULL,
    expires_at  INTEGER NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    revoked_at  INTEGER DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_refresh_user    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_hash    ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_expires ON refresh_tokens(expires_at);
```
Migration head is `0037_time_trap_tokens.sql`. **Next number is `0038`.**

**MCP package current state** (`packages/mcp/src/`, 6 files): `client.ts` (195 lines) holds a
module-level `let token: string | undefined`, `loadConfig()` reading `BEECH_API_URL` /
`BEECH_EMAIL` / `BEECH_PASSWORD` (with `.dev.vars` fallback), `login()` POSTing to
`/auth/login`, and `rawFetch()` attaching `Authorization: Bearer`. `index.ts` registers exactly
6 tools: `beech_list_seeds` (L91), `beech_get_seed` (L96), `beech_schema_export` (L106),
`beech_schema_validate` (L111), `beech_schema_plan` (L121), `beech_schema_apply` (L131).
**Unchanged this sprint.**

**Dashboard** (`apps/dashboard/src/`): 21 feature slices; routes declared in `App.tsx`
(`/login` L126, `/settings` L210, …); 57 shadcn/ui primitives in `src/components/ui/`
including `card`, `data-table`, `confirm-dialog`, `alert-dialog`, `sheet`, `tabs`, `field`.
**Unchanged this sprint.**

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Feature code is **excluded**: no HTTP endpoint, no UI, no MCP client change. This sprint is
contracts + schema + persistence + wiring only.

**NEW — `packages/core/src/oauth/`** (zero runtime dependencies; no D1, no Hono import):
1. `packages/core/src/oauth/scopes.ts`
2. `packages/core/src/oauth/pkce.ts`
3. `packages/core/src/oauth/role-guard.ts`
4. `packages/core/src/oauth/client.repository.ts`
5. `packages/core/src/oauth/authorization-code.repository.ts`
6. `packages/core/src/oauth/token.repository.ts`
7. `packages/core/src/oauth/consent.repository.ts`
8. `packages/core/src/oauth/pkce.test.ts`
9. `packages/core/src/oauth/role-guard.test.ts`
10. `packages/core/src/oauth/scopes.test.ts`

**MODIFIED — `packages/core/src/index.ts`**: 7 additive `export * from './oauth/*.js'` lines.

**NEW — `apps/api/migrations/0038_oauth_authorization.sql`**: 4 tables, 9 indexes, 1 seeded
client row.

**NEW — `apps/api/src/shared/db/repositories/`**:
11. `d1-oauth-client.repository.ts`
12. `d1-oauth-authorization-code.repository.ts`
13. `d1-oauth-token.repository.ts`
14. `d1-oauth-consent.repository.ts`
15. `d1-oauth-authorization-code.repository.test.ts`
16. `d1-oauth-token.repository.test.ts`

**MODIFIED — `apps/api/src/types.ts`**: 4 additive `Variables` entries + 4 type imports.

**MODIFIED — `apps/api/src/middleware/repository.middleware.ts`**: 4 imports, 4
`RepositoryOverrides` fields, 4 `context.set()` calls.

**NOT modified (assert by `git diff --stat` at review):** `apps/api/src/factory.ts`,
`apps/api/src/auth/**`, `apps/api/src/middleware/auth.middleware.ts`,
`apps/api/src/middleware/rate-limit.middleware.ts`, `apps/api/src/features/**`,
`apps/dashboard/**`, `packages/mcp/**`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

## Task 1 — D1 migration

Create `apps/api/migrations/0038_oauth_authorization.sql` verbatim:

```sql
-- =============================================================================
-- OAUTH 2.1 AUTHORIZATION SERVER
-- Authorization code + PKCE grant. Every credential (code, access token, refresh
-- token) is persisted as a SHA-256 hex hash only — never plaintext — replicating
-- the refresh_tokens contract in 0000_v040_base.sql.
-- Expired rows are filtered at read time via expires_at; no background pruning job.
-- =============================================================================

-- 1. CLIENTS -----------------------------------------------------------------
-- Static registry. No dynamic client registration (RFC 7591) is supported.
CREATE TABLE IF NOT EXISTS oauth_clients (
    client_id       TEXT    NOT NULL PRIMARY KEY,
    name            TEXT    NOT NULL,
    redirect_uris   TEXT    NOT NULL,                       -- JSON array of strings
    allowed_scopes  TEXT    NOT NULL,                       -- space-delimited, RFC 6749 §3.3
    is_public       INTEGER NOT NULL DEFAULT 1
                            CHECK (is_public IN (0, 1)),    -- 1 = public client, no secret
    created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    disabled_at     INTEGER DEFAULT NULL
);

-- 2. AUTHORIZATION CODES -----------------------------------------------------
-- Single use. consumed_at is set on first redemption; a second redemption of the
-- same code must cascade-revoke every token issued from it (OAuth 2.1 replay
-- mitigation) via oauth_tokens.authorization_code_hash.
CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
    code_hash               TEXT    NOT NULL PRIMARY KEY,
    client_id               TEXT    NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    user_id                 TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope                   TEXT    NOT NULL,               -- space-delimited granted scopes
    redirect_uri            TEXT    NOT NULL,
    code_challenge          TEXT    NOT NULL,
    code_challenge_method   TEXT    NOT NULL DEFAULT 'S256'
                                    CHECK (code_challenge_method = 'S256'),
    expires_at              INTEGER NOT NULL,
    created_at              INTEGER NOT NULL DEFAULT (unixepoch()),
    consumed_at             INTEGER DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_codes_user    ON oauth_authorization_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires ON oauth_authorization_codes(expires_at);

-- 3. TOKENS ------------------------------------------------------------------
-- Access and refresh tokens share one table: identical lifecycle, distinguished
-- by token_type. authorization_code_hash links a token back to its originating
-- code so replay of that code can revoke the whole family in one UPDATE.
CREATE TABLE IF NOT EXISTS oauth_tokens (
    id                      TEXT    NOT NULL PRIMARY KEY,
    token_hash              TEXT    NOT NULL,
    token_type              TEXT    NOT NULL
                                    CHECK (token_type IN ('access', 'refresh')),
    client_id               TEXT    NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    user_id                 TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope                   TEXT    NOT NULL,               -- space-delimited
    authorization_code_hash TEXT    NOT NULL,
    expires_at              INTEGER NOT NULL,
    created_at              INTEGER NOT NULL DEFAULT (unixepoch()),
    revoked_at              INTEGER DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_hash    ON oauth_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_code    ON oauth_tokens(authorization_code_hash);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_client  ON oauth_tokens(client_id, user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user    ON oauth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires ON oauth_tokens(expires_at);

-- 4. CONSENTS ---------------------------------------------------------------
-- One live row per (client, user). scopes holds the cumulative granted set, so a
-- repeat authorize request for an already-granted subset can skip the consent
-- screen, while a superset must re-prompt for the delta only.
CREATE TABLE IF NOT EXISTS oauth_consents (
    id          TEXT    NOT NULL PRIMARY KEY,
    client_id   TEXT    NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scopes      TEXT    NOT NULL,                           -- space-delimited
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    revoked_at  INTEGER DEFAULT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_consents_pair ON oauth_consents(client_id, user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_consents_user ON oauth_consents(user_id);

-- 5. SEEDED CLIENT -----------------------------------------------------------
-- The MCP server is the only client today. Loopback redirect per OAuth 2.1
-- §8.4.2: the port is assigned at runtime by the local listener, so Sprint 2
-- matches host+path and ignores the port. No client secret: public client.
INSERT OR IGNORE INTO oauth_clients (client_id, name, redirect_uris, allowed_scopes, is_public)
VALUES (
    'beech-mcp-cli',
    'BeechCMS MCP Server',
    '["http://127.0.0.1/callback"]',
    'schema:read schema:write',
    1
);
```

## Task 2 — `packages/core/src/oauth/scopes.ts`

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * OAuth scope vocabulary. Scopes map 1:1 onto the MCP tools exposed today; no
 * speculative scopes are defined.
 *
 * - `schema:read`  -> beech_list_seeds, beech_get_seed, beech_schema_export,
 *                     beech_schema_validate, beech_schema_plan
 * - `schema:write` -> beech_schema_apply
 *
 * `beech_schema_plan` is deliberately classified as READ: despite the imperative
 * name it is a dry-run that computes a migration plan and mutates nothing.
 */
export const OAUTH_SCOPES = ['schema:read', 'schema:write'] as const

export type OAuthScope = (typeof OAUTH_SCOPES)[number]

/** Narrows an arbitrary string to a known scope. */
export function isOAuthScope(value: string): value is OAuthScope {
  return (OAUTH_SCOPES as readonly string[]).includes(value)
}

/**
 * Parses an RFC 6749 §3.3 space-delimited scope string.
 * Returns null if the string is empty or contains any unknown scope — callers
 * must reject the request with `invalid_scope` rather than silently dropping it.
 * Duplicates are collapsed; order is not significant.
 */
export function parseScopeString(raw: string): OAuthScope[] | null {
  const parts = raw.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null
  const unique = [...new Set(parts)]
  if (!unique.every(isOAuthScope)) return null
  return unique as OAuthScope[]
}

/** Serializes scopes back to the space-delimited wire/storage format. */
export function formatScopes(scopes: readonly OAuthScope[]): string {
  return [...new Set(scopes)].join(' ')
}

/** True when every scope in `requested` is present in `granted`. */
export function isScopeSubset(
  requested: readonly OAuthScope[],
  granted: readonly OAuthScope[],
): boolean {
  return requested.every(scope => granted.includes(scope))
}
```

## Task 3 — `packages/core/src/oauth/pkce.ts`

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * PKCE (RFC 7636) verification. `S256` only — `plain` is rejected unconditionally,
 * per OAuth 2.1, so no weak fallback configuration can ever exist.
 */

/** The only accepted code challenge method. */
export const PKCE_CHALLENGE_METHOD = 'S256' as const

export type PkceChallengeMethod = typeof PKCE_CHALLENGE_METHOD

/** Minimum / maximum code_verifier length, RFC 7636 §4.1. */
export const PKCE_VERIFIER_MIN_LENGTH = 43
export const PKCE_VERIFIER_MAX_LENGTH = 128

const VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]+$/

/** Validates the code_verifier character set and length. */
export function isValidCodeVerifier(verifier: string): boolean {
  return (
    verifier.length >= PKCE_VERIFIER_MIN_LENGTH &&
    verifier.length <= PKCE_VERIFIER_MAX_LENGTH &&
    VERIFIER_PATTERN.test(verifier)
  )
}

/** Base64url-encodes bytes without padding, per RFC 7636 §A. */
function base64UrlEncode(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Computes BASE64URL(SHA256(ASCII(verifier))). */
export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64UrlEncode(digest)
}

/**
 * Verifies a code_verifier against a stored code_challenge.
 * Returns false — never throws — on any malformed input, unsupported method, or
 * mismatch, so callers cannot distinguish failure modes from the return value.
 */
export async function verifyPkceChallenge(
  verifier: string,
  challenge: string,
  method: string,
): Promise<boolean> {
  if (method !== PKCE_CHALLENGE_METHOD) return false
  if (!isValidCodeVerifier(verifier)) return false
  const derived = await deriveCodeChallenge(verifier)
  if (derived.length !== challenge.length) return false
  let mismatch = 0
  for (let index = 0; index < derived.length; index += 1) {
    mismatch |= derived.charCodeAt(index) ^ challenge.charCodeAt(index)
  }
  return mismatch === 0
}
```

## Task 4 — `packages/core/src/oauth/role-guard.ts`

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { OAuthScope } from './scopes.js'

/** Outcome of a role arbitration. `deniedScopes` is empty when fully granted. */
export interface ScopeGrantDecision {
  grantedScopes: OAuthScope[]
  deniedScopes: OAuthScope[]
}

/**
 * Arbitrates which of the requested scopes a given user role may grant.
 *
 * This is the ONLY place role-based authorization may live in the OAuth flow.
 * `/oauth/authorize` and `/oauth/token` must never branch on `role` themselves,
 * so introducing a real role system later requires swapping the implementation
 * bound in repositoryMiddleware and nothing else.
 */
export interface IRoleGuard {
  /**
   * @param role - The resource owner's role claim, or undefined when absent.
   * @param requestedScopes - Scopes the client asked for, already validated.
   */
  arbitrate(role: string | undefined, requestedScopes: readonly OAuthScope[]): Promise<ScopeGrantDecision>
}

/**
 * Stub guard for the pre-roles world: grants every requested scope to every role.
 *
 * This permissiveness is EXPLICIT and directly tested, not an accidental default.
 * When the roles feature lands, replace this binding with a real adapter; the
 * behaviour change will then be visible as a failing test here, by design.
 */
export class AllowAllRoleGuard implements IRoleGuard {
  async arbitrate(
    _role: string | undefined,
    requestedScopes: readonly OAuthScope[],
  ): Promise<ScopeGrantDecision> {
    return { grantedScopes: [...requestedScopes], deniedScopes: [] }
  }
}
```

## Task 5 — `packages/core/src/oauth/client.repository.ts`

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { OAuthScope } from './scopes.js'

export interface OAuthClientRecord {
  clientId: string
  name: string
  /** Registered redirect URIs. Loopback entries are matched ignoring the port. */
  redirectUris: string[]
  allowedScopes: OAuthScope[]
  /** True for clients that cannot hold a secret (native/CLI). PKCE is required regardless. */
  isPublic: boolean
  createdAt: number
  disabledAt: number | null
}

export interface IOAuthClientRepository {
  /** Returns the client, or null when unknown or disabled. */
  findActiveById(clientId: string): Promise<OAuthClientRecord | null>
}
```

## Task 6 — `packages/core/src/oauth/authorization-code.repository.ts`

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { OAuthScope } from './scopes.js'

export interface NewAuthorizationCode {
  /** SHA-256 hex hash of the code. The plaintext code is never persisted. */
  codeHash: string
  clientId: string
  userId: string
  scope: OAuthScope[]
  redirectUri: string
  codeChallenge: string
  /** Always 'S256'; the column CHECK constraint rejects anything else. */
  codeChallengeMethod: 'S256'
  expiresAt: number
}

export interface AuthorizationCodeRecord extends NewAuthorizationCode {
  createdAt: number
  consumedAt: number | null
}

export interface IOAuthAuthorizationCodeRepository {
  /** Persists a new single-use authorization code. Hash only, never plaintext. */
  save(record: NewAuthorizationCode): Promise<void>

  /**
   * Returns the code regardless of its consumed state, provided it is unexpired.
   * Callers MUST inspect `consumedAt`: a non-null value means replay, which
   * requires cascade revocation via IOAuthTokenRepository.revokeByAuthorizationCode.
   */
  findByHash(codeHash: string, nowTimestamp: number): Promise<AuthorizationCodeRecord | null>

  /**
   * Atomically marks the code consumed. Returns true only for the first caller;
   * every subsequent call returns false, which is the replay signal.
   */
  consumeByHash(codeHash: string, nowTimestamp: number): Promise<boolean>
}
```

## Task 7 — `packages/core/src/oauth/token.repository.ts`

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { OAuthScope } from './scopes.js'

export type OAuthTokenType = 'access' | 'refresh'

export interface NewOAuthToken {
  id: string
  /** SHA-256 hex hash of the token. The plaintext token is never persisted. */
  tokenHash: string
  tokenType: OAuthTokenType
  clientId: string
  userId: string
  scope: OAuthScope[]
  /** Hash of the authorization code this token descends from, for cascade revocation. */
  authorizationCodeHash: string
  expiresAt: number
}

export interface OAuthTokenRecord extends NewOAuthToken {
  createdAt: number
  revokedAt: number | null
}

export interface AuthorizedClientSummary {
  clientId: string
  clientName: string
  scope: OAuthScope[]
  /** Creation timestamp of the most recent live token for this client. */
  lastIssuedAt: number
}

export interface IOAuthTokenRepository {
  save(record: NewOAuthToken): Promise<void>

  /** Finds an unexpired, unrevoked token by hash and type. */
  findActiveByHash(
    tokenHash: string,
    tokenType: OAuthTokenType,
    nowTimestamp: number,
  ): Promise<OAuthTokenRecord | null>

  /** Revokes a single token. False when already revoked or absent. */
  revokeByHash(tokenHash: string, nowTimestamp: number): Promise<boolean>

  /**
   * Revokes EVERY token descending from one authorization code, both access and
   * refresh. Called on authorization-code replay (OAuth 2.1 §4.1.3).
   * Returns the number of tokens revoked.
   */
  revokeByAuthorizationCode(authorizationCodeHash: string, nowTimestamp: number): Promise<number>

  /**
   * Revokes every live token for one (client, user) pair — access AND refresh,
   * never one without the other. Backs "revoke this app" in the dashboard.
   */
  revokeAllForClientAndUser(clientId: string, userId: string, nowTimestamp: number): Promise<number>

  /** Lists the clients holding at least one live token for this user, newest first. */
  listAuthorizedClientsForUser(userId: string, nowTimestamp: number): Promise<AuthorizedClientSummary[]>
}
```

## Task 8 — `packages/core/src/oauth/consent.repository.ts`

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { OAuthScope } from './scopes.js'

export interface ConsentRecord {
  id: string
  clientId: string
  userId: string
  /** Cumulative set of scopes the user has approved for this client. */
  scopes: OAuthScope[]
  createdAt: number
  updatedAt: number
  revokedAt: number | null
}

export interface IOAuthConsentRepository {
  /** Returns the live consent for the pair, or null when absent or revoked. */
  findActive(clientId: string, userId: string): Promise<ConsentRecord | null>

  /**
   * Records consent for the pair, unioning `scopes` into any existing live grant
   * and reviving a previously revoked row. Idempotent for an unchanged scope set.
   */
  grant(
    id: string,
    clientId: string,
    userId: string,
    scopes: readonly OAuthScope[],
    nowTimestamp: number,
  ): Promise<void>

  /** Revokes the consent. False when there was nothing live to revoke. */
  revoke(clientId: string, userId: string, nowTimestamp: number): Promise<boolean>

  /** Lists all live consents for a user, newest first. */
  listForUser(userId: string): Promise<ConsentRecord[]>
}
```

## Task 9 — `packages/core/src/index.ts`

Append after L34 (`export * from './auth/password-reset-token.repository.js'`), preserving the
existing `.js`-extension convention:

```ts
export * from './oauth/scopes.js'
export * from './oauth/pkce.js'
export * from './oauth/role-guard.js'
export * from './oauth/client.repository.js'
export * from './oauth/authorization-code.repository.js'
export * from './oauth/token.repository.js'
export * from './oauth/consent.repository.js'
```

## Task 10 — D1 implementations

All four files carry the `BUSL-1.1` header used across `apps/api/src/**` (not the `MIT` header
used in `packages/core`), start with `/// <reference types="@cloudflare/workers-types" />`, and
follow `d1-session.repository.ts` exactly: a `Row` type per table, a `rowToRecord` mapper, a
class taking `(private readonly db: D1Database, …)`, and the
`(result as unknown as { meta?: { changes?: number } })?.meta?.changes ?? 0` idiom for write
counts. Scope columns are stored space-delimited and round-tripped through `parseScopeString` /
`formatScopes`; a row whose stored scope fails to parse is treated as corrupt and mapped to an
empty array by `rowToRecord`, never crashing the read.

**`d1-oauth-client.repository.ts`**
```ts
export class D1OAuthClientRepository implements IOAuthClientRepository {
  constructor(private readonly db: D1Database) {}

  async findActiveById(clientId: string): Promise<OAuthClientRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT client_id, name, redirect_uris, allowed_scopes, is_public, created_at, disabled_at
         FROM oauth_clients
         WHERE client_id = ? AND disabled_at IS NULL
         LIMIT 1`
      )
      .bind(clientId)
      .first<OAuthClientRow>()
    return row ? rowToRecord(row) : null
  }
}
```
`rowToRecord` parses `redirect_uris` with `JSON.parse` inside a `try/catch` defaulting to `[]`,
maps `allowed_scopes` via `parseScopeString(...) ?? []`, and coerces `is_public` with
`row.is_public === 1`.

**`d1-oauth-authorization-code.repository.ts`** — statements verbatim:
```sql
-- save
INSERT INTO oauth_authorization_codes
  (code_hash, client_id, user_id, scope, redirect_uri, code_challenge, code_challenge_method, expires_at, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)

-- findByHash  (NOTE: consumed rows ARE returned; caller inspects consumed_at)
SELECT code_hash, client_id, user_id, scope, redirect_uri, code_challenge,
       code_challenge_method, expires_at, created_at, consumed_at
FROM oauth_authorization_codes
WHERE code_hash = ? AND expires_at > ?
LIMIT 1

-- consumeByHash  (atomic single-use: the WHERE clause is the lock)
UPDATE oauth_authorization_codes
SET consumed_at = ?
WHERE code_hash = ? AND consumed_at IS NULL AND expires_at > ?
```
`consumeByHash` returns `changes > 0`. `save` binds `created_at` from the injected `IClock`
(`new D1OAuthAuthorizationCodeRepository(database, resolvedClock)`), matching how
`D1SessionRepository.saveRefreshToken` supplies `this.clock.nowSeconds()`.

**`d1-oauth-token.repository.ts`** — statements verbatim:
```sql
-- save
INSERT INTO oauth_tokens
  (id, token_hash, token_type, client_id, user_id, scope, authorization_code_hash, expires_at, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)

-- findActiveByHash
SELECT id, token_hash, token_type, client_id, user_id, scope,
       authorization_code_hash, expires_at, created_at, revoked_at
FROM oauth_tokens
WHERE token_hash = ? AND token_type = ? AND expires_at > ? AND revoked_at IS NULL
LIMIT 1

-- revokeByHash
UPDATE oauth_tokens SET revoked_at = ?
WHERE token_hash = ? AND revoked_at IS NULL

-- revokeByAuthorizationCode  (cascade on code replay; NO expires_at filter, so
-- already-expired-but-unrevoked rows are closed out too)
UPDATE oauth_tokens SET revoked_at = ?
WHERE authorization_code_hash = ? AND revoked_at IS NULL

-- revokeAllForClientAndUser  (access AND refresh together — never one alone)
UPDATE oauth_tokens SET revoked_at = ?
WHERE client_id = ? AND user_id = ? AND revoked_at IS NULL

-- listAuthorizedClientsForUser
SELECT t.client_id AS client_id,
       c.name      AS client_name,
       t.scope     AS scope,
       MAX(t.created_at) AS last_issued_at
FROM oauth_tokens t
JOIN oauth_clients c ON c.client_id = t.client_id
WHERE t.user_id = ? AND t.revoked_at IS NULL AND t.expires_at > ?
GROUP BY t.client_id
ORDER BY last_issued_at DESC
```
The two cascade methods return `changes` (number), not boolean.

**`d1-oauth-consent.repository.ts`** — `grant` is a read-union-write pair (D1 has no portable
upsert-with-union): `findActive` → if a live row exists, `UPDATE oauth_consents SET scopes = ?,
updated_at = ? WHERE client_id = ? AND user_id = ?` with the unioned set; else
`INSERT INTO oauth_consents (id, client_id, user_id, scopes, created_at, updated_at, revoked_at)
VALUES (?, ?, ?, ?, ?, ?, NULL)` using `INSERT OR REPLACE` so a previously revoked row on the
same unique `(client_id, user_id)` pair is revived rather than colliding on
`idx_oauth_consents_pair`.
```sql
-- findActive
SELECT id, client_id, user_id, scopes, created_at, updated_at, revoked_at
FROM oauth_consents
WHERE client_id = ? AND user_id = ? AND revoked_at IS NULL
LIMIT 1

-- revoke
UPDATE oauth_consents SET revoked_at = ?, updated_at = ?
WHERE client_id = ? AND user_id = ? AND revoked_at IS NULL

-- listForUser
SELECT id, client_id, user_id, scopes, created_at, updated_at, revoked_at
FROM oauth_consents
WHERE user_id = ? AND revoked_at IS NULL
ORDER BY updated_at DESC
```

## Task 11 — Context wiring

`apps/api/src/types.ts` — extend the existing `import type { … } from '@beechcms/core'` on L13
with `IOAuthClientRepository, IOAuthAuthorizationCodeRepository, IOAuthTokenRepository,
IOAuthConsentRepository`, then append to `Variables` (after `timeTrapTokenRepository`, L202):

```ts
  /** Registry of OAuth clients authorized to use the authorization-code flow. */
  oauthClientRepository: IOAuthClientRepository
  /** Repository for single-use OAuth authorization codes (hash-only). */
  oauthAuthorizationCodeRepository: IOAuthAuthorizationCodeRepository
  /** Repository for OAuth access/refresh tokens (hash-only). */
  oauthTokenRepository: IOAuthTokenRepository
  /** Repository for per-(client,user) OAuth scope consents. */
  oauthConsentRepository: IOAuthConsentRepository
```

`apps/api/src/middleware/repository.middleware.ts` — add the four imports next to the
`D1TimeTrapTokenRepository` import (L28), add the four optional fields to
`RepositoryOverrides`, and append four `context.set()` calls immediately after the
`timeTrapTokenRepository` line, before `await next()`:

```ts
    context.set('oauthClientRepository', overrides?.oauthClientRepository ?? new D1OAuthClientRepository(database))
    context.set('oauthAuthorizationCodeRepository', overrides?.oauthAuthorizationCodeRepository ?? new D1OAuthAuthorizationCodeRepository(database, resolvedClock))
    context.set('oauthTokenRepository', overrides?.oauthTokenRepository ?? new D1OAuthTokenRepository(database, resolvedClock))
    context.set('oauthConsentRepository', overrides?.oauthConsentRepository ?? new D1OAuthConsentRepository(database, resolvedIdGenerator))
```

`IRoleGuard` is **not** injected into `Variables` this sprint: nothing calls it until
`/oauth/authorize` exists, and an unused context entry is dead weight. Sprint 2 adds
`roleGuard: IRoleGuard` bound to `AllowAllRoleGuard` at the same time as its first call site.

## Task 12 — Tests

`packages/core/src/oauth/scopes.test.ts`
- `parseScopeString('schema:read schema:write')` → both scopes
- `parseScopeString('schema:read  schema:read')` → single entry (dedupe)
- `parseScopeString('schema:delete')` → `null`; `parseScopeString('')` → `null`
- `formatScopes` round-trips through `parseScopeString`
- `isScopeSubset(['schema:read'], ['schema:read','schema:write'])` → true; reverse → false

`packages/core/src/oauth/pkce.test.ts`
- RFC 7636 §B fixture: verifier `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` derives challenge
  `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`
- `verifyPkceChallenge(verifier, challenge, 'S256')` → true
- `verifyPkceChallenge(verifier, challenge, 'plain')` → **false** (no weak fallback)
- wrong verifier → false; 42-char verifier → false; verifier with `+` → false
- never throws on `''`, or on a challenge of a different length

`packages/core/src/oauth/role-guard.test.ts`
- explicit assertion that `AllowAllRoleGuard` grants every requested scope for
  `'admin'`, for an unknown role string, and for `undefined`, with `deniedScopes` empty —
  the permissive behaviour is pinned, so the future real adapter breaks this test loudly

`apps/api/src/shared/db/repositories/d1-oauth-authorization-code.repository.test.ts`
- `consumeByHash` returns true once and false on the second call (single-use)
- `findByHash` still returns the row after consumption, with `consumedAt` set (replay detection)
- an expired code returns null from `findByHash`

`apps/api/src/shared/db/repositories/d1-oauth-token.repository.test.ts`
- `revokeByAuthorizationCode` revokes both the access and the refresh token of a family and
  returns 2
- `revokeAllForClientAndUser` revokes both token types for that pair and leaves another
  client's tokens live
- `findActiveByHash` rejects expired and revoked rows, and rejects a hash matched with the
  wrong `tokenType`

Both D1 tests follow the existing harness in
`apps/api/src/shared/db/repositories/d1-session.repository.test.ts`.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# 1. Core builds and exports the new contracts
pnpm --filter @beechcms/core run build

# 2. Strict typecheck of the API against the rebuilt core
npx tsc --noEmit            # run inside apps/api/

# 3. Apply the new migration to the local D1 instance
pnpm beech db:migrate

# 4. Full-reset replay: proves 0038 applies cleanly from an empty database
pnpm beech db:reset

# 5. Verify the four tables and the seeded client exist.
#    `pnpm beech` exposes no query subcommand (bin/cli.mjs registers only db:migrate
#    and db:reset), so inspection goes through wrangler directly, from apps/api/:
npx wrangler d1 execute beech-db --local \
  --command "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'oauth_%'"
npx wrangler d1 execute beech-db --local \
  --command "SELECT client_id, allowed_scopes, is_public FROM oauth_clients"

# 6. Test suite — new tests plus proof that nothing existing regressed
pnpm beech test

# 7. Blast-radius proof: no God Node was touched
git diff --stat -- apps/api/src/factory.ts apps/api/src/auth apps/api/src/middleware/auth.middleware.ts apps/api/src/features apps/dashboard packages/mcp
# MUST print nothing.

# 8. Refresh the knowledge graph for the next sprint
graphify update . --force
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `apps/api/migrations/0038_oauth_authorization.sql` exists, is the migration head, and
      creates `oauth_clients`, `oauth_authorization_codes`, `oauth_tokens`, `oauth_consents`
      plus all 9 indexes with `IF NOT EXISTS`. No `ALTER TABLE`, no `DROP`, no `_archive/` edit.
- [ ] `pnpm beech db:reset` followed by `pnpm beech db:migrate` succeeds from an empty database.
- [ ] The `beech-mcp-cli` client row is seeded via `INSERT OR IGNORE`, is public
      (`is_public = 1`), and has `allowed_scopes = 'schema:read schema:write'`.
- [ ] No table stores a plaintext code or token: every credential column is named `*_hash`
      and is populated from `sha256hex`. Grep proof: no `INSERT INTO oauth_` statement binds a
      raw code/token value.
- [ ] `packages/core/src/oauth/` contains **only** types, interfaces, pure functions and
      `AllowAllRoleGuard`. Zero imports of `@cloudflare/workers-types`, `hono`, D1 or any
      `apps/*` path. Grep proof: `grep -rE "hono|D1Database|apps/" packages/core/src/oauth/`
      returns nothing.
- [ ] All 7 new core modules are re-exported from `packages/core/src/index.ts` using the
      existing `.js` extension convention, and `pnpm --filter @beechcms/core run build` passes.
- [ ] Every intra-`oauth/` import uses the `.js` extension (`from './scopes.js'`).
- [ ] `npx tsc --noEmit` in `apps/api/` passes with zero errors and zero new `any`. Every
      repository method signature matches its `@beechcms/core` interface exactly; the four
      classes carry an explicit `implements I…` clause.
- [ ] `Variables` gained exactly 4 entries, each documented with a one-line JSDoc matching the
      surrounding style. No entry renamed, reordered or removed.
- [ ] All four repositories are constructed **only** inside `repositoryMiddleware`, each with a
      matching `RepositoryOverrides` field for test injection. No `env.DB` / `D1Database`
      reference exists outside `apps/api/src/shared/db/`.
- [ ] `verifyPkceChallenge` returns `false` for `method === 'plain'` and never throws on
      malformed input; the RFC 7636 §B fixture passes.
- [ ] `AllowAllRoleGuard`'s grant-everything behaviour is asserted explicitly for `'admin'`,
      an unknown role, and `undefined`.
- [ ] `consumeByHash` is proven single-use by test (true then false), and `findByHash` still
      surfaces a consumed code so Sprint 2 can detect replay.
- [ ] `revokeByAuthorizationCode` and `revokeAllForClientAndUser` are proven by test to close
      access **and** refresh tokens together.
- [ ] `pnpm beech test` is fully green, with **zero modifications** to any pre-existing test
      file.
- [ ] `git diff --stat` shows no change to `factory.ts`, `auth/**`, `auth.middleware.ts`,
      `rate-limit.middleware.ts`, `features/**`, `apps/dashboard/**`, `packages/mcp/**`.
- [ ] `graphify update . --force` was run and committed, so Sprint 2 plans against a current graph.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT build or modify any of the following.

**Deferred to Sprint 2 (`oauth-authorization-server`, ROADMAP §2):**
- Any HTTP endpoint. No `/oauth/authorize`, `/oauth/token`, `/oauth/revoke`, no
  `apps/api/src/features/oauth/` directory, no route mounted in `factory.ts`.
- Any change to `RateLimiterName` or `buildDefaultRegistry` in `rate-limit.middleware.ts`. The
  mandatory `/oauth/token` rate limit is real and non-negotiable, but it belongs with the
  endpoint it protects.
- Injecting `roleGuard` into `Variables`, or calling `AllowAllRoleGuard` from anywhere. The
  class ships unused-but-tested this sprint, on purpose.
- Redirect-URI matching logic, including the loopback port-agnostic rule. Only the stored value
  lands here.
- Authorization-code and token *generation*, TTL policy, and refresh rotation.

**Deferred to Sprint 3 (`oauth-resource-server-scopes`, ROADMAP §3):**
- Any edit to `apps/api/src/middleware/auth.middleware.ts`. It is the 34-dependent God Node;
  touching it here would put the entire integration suite in this sprint's blast radius.
- Any `requireScope()` guard or scope claim added to `JwtClaims` / `ITokenService`.
- Any change to `apps/api/src/features/schema/**` or `apps/api/src/features/seeds/**`.

**Deferred to Sprint 4 (`oauth-dashboard-consent-ui`, ROADMAP §4):**
- Everything under `apps/dashboard/**`: no consent screen, no connected-apps page, no route in
  `App.tsx`, no new shadcn/ui primitive.

**Deferred to Sprint 5 (`mcp-pkce-client`, ROADMAP §5):**
- Everything under `packages/mcp/**`. `BEECH_EMAIL` / `BEECH_PASSWORD` and the `/auth/login`
  call in `client.ts` stay exactly as they are until the resource server accepts scoped tokens.

**Permanently out of scope (rejected in the VETO Audit and the feature brief §5):**
- Dynamic client registration (RFC 7591), client secrets, or any client-management API. The
  client registry is a seeded migration row.
- Grant types other than authorization-code + PKCE — no device code, no client credentials, no
  implicit, no password grant. The tables model one grant deliberately.
- `plain` PKCE support, or any configuration flag that could disable PKCE.
- Real role logic inside the guard, multi-tenant/organization consent, and any scope beyond
  `schema:read` / `schema:write`.
- A background pruning job for expired rows. Expiry is enforced at read time via `expires_at`,
  matching `public_time_trap_tokens`.
