# Sprint — `mcp-pkce-client`

> Sprint 5 of 5 of the OAuth 2.1 roadmap (`output/backlog/ROADMAP.md`).
> Sprints 1–4 are merged. This is the last sprint of the feature.

### Pre-Computation Analysis

**a) God Nodes identified via the Graphify CLI**

| Node | Degree | Role |
|---|---|---|
| `mcp/src/index.ts` (`packages_mcp_src_index`) | 18 | MCP stdio server: `TOOLS`, `handleTool()`, `main()`. Highest-degree node of the `mcp` community; every tool call funnels through it. |
| `mcp/src/client.ts` (`packages_mcp_src_client`) | 13 | The single HTTP/auth chokepoint. Contains `loadConfig()`, `login()`, `rawFetch()`, `request()`, `BeechClientError`. **This sprint's primary mutation target.** |
| `apps/api/src/features/oauth/index.ts` | — | Authorization-server router (Sprint 2/4). Consumed only over the wire by this sprint. |
| `packages/core/src/oauth/pkce.ts` | — | `deriveCodeChallenge()` / `isValidCodeVerifier()` / `PKCE_CHALLENGE_METHOD`. MIT-licensed, already re-exported from `packages/core/src/index.ts:L36`. |

**b) Architectural boundaries affected**

- `@beechcms/core` — **read-only**. `deriveCodeChallenge` is consumed, nothing is added. `graphify affected "deriveCodeChallenge" --depth 2` returns only `verifyPkceChallenge()` and `pkce.test.ts`, so no core signature is touched and no downstream breakage is possible.
- `apps/api` — **two surgical touches only**: (1) a new data migration `0039_oauth_client_beech_mcp.sql` registering the `beech-mcp` client row, and (2) a one-line relative-`Location` fix in `features/oauth/authorize.ts` (justified in §4.6). No new endpoint, no repository change, no middleware change.
- `apps/dashboard` — **untouched**. The consent screen and connected-apps tab shipped in Sprint 4 and are consumed as-is through the browser.
- `packages/mcp` — the whole delivery. Two new modules plus a rewrite of the `client.ts` auth path.
- Docs — `packages/mcp/README.md` and `docs/start/mcp.md` still document `BEECH_EMAIL` / `BEECH_PASSWORD`.

**c) `graphify affected "packages/mcp/src/client.ts" --depth 2` (breaking-change proof)**

```
- freshClient()        [imports_from]  packages/mcp/src/client.test.ts:L8
- mcp/src/index.ts     [imports_from]  packages/mcp/src/index.ts:L25
- mcp/src/client.test.ts [dynamic_import] packages/mcp/src/client.test.ts:L1
- handleTool()         [calls]         packages/mcp/src/index.ts:L207
```

The blast radius is **four nodes, all inside `packages/mcp`**. `index.ts` imports exactly `request`, `BeechClientError` (`index.ts:L25`). Keeping both signatures identical means `index.ts` and `plans.ts` require **zero changes** — the plan/apply state machine survives a token refresh for free, satisfying the "token expires mid-plan" constraint of the feature brief by construction, not by new code.

`graphify path "packages/mcp/src/client.ts" "apps/api/src/features/oauth/index.ts"` → **`No directed path found`**. The MCP package reaches the authorization server only over HTTP; there is no import edge to break.

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

1. **Botanical Invariant (no D1 bypass).** `packages/mcp` performs **zero** database access — it is a Node stdio process that speaks HTTP. Every persistence effect (code issuance, token issuance, rotation, revocation) happens inside `apps/api/src/features/oauth/*`, which already goes through the `oauth*Repository` contracts declared in `@beechcms/core`. The one SQL artifact added here (`0039`) is a static `INSERT OR IGNORE` into `oauth_clients` inside the numbered-migration workflow of `_config/database_workflow.md` — no runtime query, no hardcoded content field, no `br_XX` involvement. **PASS.**
2. **VSA (zero cross-slice imports).** `apps/api/src/features/oauth/` is the only slice touched, and only in its own file. No file under `apps/api/src/features/*` or `apps/dashboard/src/features/*` imports anything new. `packages/mcp` gains no import from `apps/*` — proven by the empty `graphify path` above. Shared logic (`deriveCodeChallenge`) is taken from `@beechcms/core`, which is exactly where rule 3 mandates it live. **PASS.**
3. **Cloudflare purity.** Nothing new runs on the edge. The loopback HTTP listener and the browser launch live in the Node CLI process, where they belong; the Worker keeps its existing stateless request/response shape. The migration is deterministic and idempotent (`INSERT OR IGNORE`). **PASS.**
4. **YAGNI.** Rejected during this audit and pushed to §7: dynamic client registration (RFC 7591) — the schema comment in `0038` explicitly declares it unsupported; a `pnpm beech oauth:client` CLI command — one static client exists, a migration row is cheaper; a keychain/`libsecret` integration — a `0600` file matches the existing trust model of `.dev.vars`; an OAuth discovery document (`/.well-known/oauth-authorization-server`) — the sole client is first-party and knows its endpoints.
5. **New runtime dependencies.** Zero. `node:http`, `node:crypto`, `node:child_process`, `node:fs`, `node:os` only. No `open`, no `openid-client`. **PASS.**

**Adjustment made during this audit:** the first draft placed the loopback listener and the token cache inside `client.ts`. That would have made the sprint's single God Node carry four responsibilities at once. Split into `oauth.ts` + `token-store.ts`, leaving `client.ts` as a thin transport with an injected token provider.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

This sprint exists **last**, not first, and that ordering is the point: it is the only
consumer-side sprint of the roadmap and it can only be validated end-to-end once
Sprints 1–4 have landed. `POST /oauth/token` (Sprint 2) must exist before a client can
exchange a code; `authMiddleware({ acceptOAuth: true })` + `oauthScopeMiddleware()`
(Sprint 3, wired at `apps/api/src/factory.ts:L227` and `:L230`) must accept an opaque
64-hex token before a scoped token is worth anything; the consent screen at
`/admin/oauth/consent` (Sprint 4) must render before a browser round-trip can complete.

It closes the loop that motivated the whole feature: after this sprint no BeechCMS
password exists in any MCP client configuration, and revoking the MCP client from the
"Connected apps" tab is sufficient to cut its access.

**VSA adherence.** `packages/mcp` is not a slice — it is a standalone published Node
package (`@beechcms/mcp`, MIT) that talks HTTP. The sprint adds no import edge between
`packages/mcp` and `apps/api`, and no import edge between any two feature slices. The
single shared primitive it needs, `deriveCodeChallenge`, is imported from
`@beechcms/core`, which is exactly the escape hatch VSA prescribes for shared logic.

**Botanical invariant adherence.** No D1 statement is executed by the MCP process. The
only SQL added is a static client-registry row inside the numbered migration workflow.

**Internal structure.** `client.ts` remains the sole HTTP chokepoint and keeps its
exported surface (`request`, `BeechClientError`, `ApiResponse`, `ProblemDetails`)
byte-identical, so `index.ts:L25` and every tool handler stay untouched. The new
concerns land in two dedicated modules behind that boundary.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**2.1 — `packages/mcp` today** (`graphify explain "packages/mcp/src/client.ts"`, degree 13)

```
mcp/src/index.ts  --imports_from-->  mcp/src/client.ts   (index.ts:L25 — request, BeechClientError)
mcp/src/index.ts  --imports_from-->  plans.ts            (index.ts:L26 — savePlan, takePlan)
client.ts contains: readDevVarsApiUrl() L42, loadConfig() L67, login() L87,
                    rawFetch() L125, request() L170, BeechClientError L35
```

- `loadConfig()` (`client.ts:L67`) reads `BEECH_API_URL` (env → `.dev.vars` → `http://localhost:8787`), `BEECH_EMAIL`, `BEECH_PASSWORD`.
- `login()` (`client.ts:L87`) `POST`s JSON to `/auth/login` and caches `data.token` in the module-level `let token`.
- `request()` (`client.ts:L170`) logs in lazily, retries **once** on `401`, and rethrows non-2xx bodies as `BeechClientError(JSON.stringify(problemDetails))`.
- `plans.ts` holds the plan cache **in memory, keyed by `planId`, with no reference to the token**. A refresh therefore cannot invalidate an in-flight plan.
- `packages/mcp/package.json` already depends on `@beechcms/core: workspace:^0.7.0` and builds with `esbuild --packages=external --platform=node --format=esm`.

**2.2 — Authorization server surface (Sprints 2 & 4), `apps/api/src/features/oauth/index.ts`**

| Route | Auth gate | Notes |
|---|---|---|
| `GET /oauth/authorize` | none (browser entry) | validates client + `redirect_uri`, 302s to `CONSENT_SCREEN_PATH` |
| `GET /oauth/authorize/request` | `authMiddleware()` admin JWT | consent metadata |
| `POST /oauth/authorize/consent` | `authMiddleware()` admin JWT | issues the code, redirects to `redirect_uri` |
| `POST /oauth/token` | grant material only | **`context.req.parseBody()` → the body MUST be `application/x-www-form-urlencoded`, not JSON** |
| `POST /oauth/revoke` | grant material only | RFC 7009 |
| `GET`/`DELETE /oauth/consents[/:clientId]` | `authMiddleware()` admin JWT | never `acceptOAuth` |

**2.3 — Wire contracts already fixed by merged code**

- `TokenResponseBody` (`features/oauth/token.ts`): `{ access_token, token_type: 'Bearer', expires_in, refresh_token, scope }`, always with `Cache-Control: no-store`.
- Token error body (RFC 6749 §5.2): `{ error, error_description }`; `401` for `invalid_client`, `400` otherwise, `429` with `Retry-After` when the dual-key rate limiter trips.
- Authorization request validation (`features/oauth/authorization-request.ts`) requires **all** of `response_type=code`, `client_id`, `redirect_uri`, `state` (non-empty), `code_challenge`, `code_challenge_method=S256`, `scope`.
- `matchesRegisteredRedirectUri()` compares loopback URIs on **protocol + hostname + pathname only**, ignoring the port (OAuth 2.1 §8.4.2). A registered `http://127.0.0.1/oauth/callback` therefore matches a runtime `http://127.0.0.1:54321/oauth/callback`. A `#fragment` is rejected outright.
- `AUTHORIZATION_CODE_TTL_SECONDS = 60`, `ACCESS_TOKEN_TTL_SECONDS = 900`, `REFRESH_TOKEN_TTL_SECONDS = 2592000` (`features/oauth/constants.ts`).
- Access tokens are 64-char lowercase hex (`shared/utils/opaque-token.ts`), which is exactly what `authMiddleware`'s `OPAQUE_TOKEN_RE` discriminates on at `auth.middleware.ts:L94`.

**2.4 — Resource-server enforcement (Sprint 3), `apps/api/src/middleware/oauth-scope.middleware.ts`**

`OAUTH_SCOPE_ROUTES` is a closed, fail-closed allowlist. The five entries cover exactly the
paths `handleTool()` calls:

| MCP tool | Request issued by `handleTool()` | Required scope |
|---|---|---|
| `beech_list_seeds` | `GET /api/seeds` | `schema:read` |
| `beech_get_seed` | `GET /api/seeds/:slug` | `schema:read` |
| `beech_schema_export` / `beech_schema_validate` | `GET /api/schema` | `schema:read` |
| `beech_schema_plan` | `POST /api/seeds/:slug/mcp-plan` | `schema:read` (dry-run) |
| `beech_schema_apply` | `POST /api/seeds/:slug/mcp-apply` | `schema:write` |

Registration order at `apps/api/src/factory.ts`: `L227 authMiddleware({ acceptOAuth: true })`
→ `L230 oauthScopeMiddleware()` → `L232+ apiProtected.route(...)`. Unchanged by this sprint.
A scope violation returns **403 `insufficient_scope`**, deliberately distinct from the **401**
that means "token expired" — the client must react differently to each.

**2.5 — Two gaps found while mapping (both closed by this sprint)**

- **No OAuth client is registered anywhere.** `grep -rn "INSERT INTO oauth_clients"` over the repo returns nothing; `oauth_clients` appears only in `0038_oauth_authorization.sql`, the two D1 repositories, and `consents.test.ts`. The `0038` header states *"Static registry. No dynamic client registration (RFC 7591) is supported."* Without a row, `findActiveById('beech-mcp')` returns `null` and `GET /oauth/authorize` answers `400 invalid_client`. Registering the client is part of **this** sprint.
- **The consent redirect is absolute, which breaks local dev.** `authorize.ts:L110` builds `new URL(CONSENT_SCREEN_PATH + '?' + url.search.slice(1), context.req.url)`. In production the Worker serves the dashboard from `ASSETS` on the same origin, so this is correct. In dev the dashboard is Vite on `:5173` with `base: '/admin/'` proxying `/oauth` to the Worker on `:8789` with `changeOrigin: true` — the Worker sees itself as the origin and emits `Location: http://127.0.0.1:8789/admin/oauth/consent`, an origin that serves no dashboard assets. A relative `Location` resolves against the browser's origin in both cases.

**2.6 — Ports (dev)**

`apps/api/package.json` runs `wrangler dev --port 8789`, while `client.ts:L68` defaults to
`http://localhost:8787`. This pre-existing mismatch is why `BEECH_API_URL` must be set
explicitly in local dev; the sprint documents it rather than changing either port.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**Created**

| File | Purpose |
|---|---|
| `packages/mcp/src/token-store.ts` | `0600` on-disk grant cache, keyed by API URL + client id. Never throws. |
| `packages/mcp/src/token-store.test.ts` | Round-trip, corrupt-file tolerance, file mode, key isolation. |
| `packages/mcp/src/oauth.ts` | PKCE generation, loopback listener, browser launch, code exchange, refresh. |
| `packages/mcp/src/oauth.test.ts` | PKCE shape, state mismatch, `error=` callback, timeout, form encoding, refresh. |
| `apps/api/migrations/0039_oauth_client_beech_mcp.sql` | Registers the `beech-mcp` public client. Data only, no DDL. |

**Modified**

| File | Change |
|---|---|
| `packages/mcp/src/client.ts` | `login()` deleted; auth delegated to `oauth.ts` + `token-store.ts`. Exported surface unchanged. |
| `packages/mcp/src/client.test.ts` | Credential-based cases replaced with token-cache / refresh / `403` cases. |
| `apps/api/src/features/oauth/authorize.ts` | `authorizeHandler` emits a **relative** `Location` (one line). |
| `apps/api/src/features/oauth/authorize.test.ts` | `new URL(location)` → `new URL(location, 'http://localhost')` (one line). |
| `packages/mcp/README.md` | Env table, config sample, troubleshooting rows. |
| `docs/start/mcp.md` | Same, plus the local-dev `BEECH_AUTH_URL` note. |

**Explicitly NOT produced:** no change to `packages/core`, `apps/dashboard`, `packages/mcp/src/index.ts`, `packages/mcp/src/plans.ts`, `apps/api/src/factory.ts`, `apps/api/src/middleware/*`, or any repository. No new npm dependency.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### 4.1 — `apps/api/migrations/0039_oauth_client_beech_mcp.sql`

`apps/api/wrangler.jsonc` declares `"migrations_dir": "migrations"` with **no explicit file
list**, so dropping the file in is sufficient — do not edit `wrangler.jsonc`. (The
"register in wrangler.jsonc" step of `_config/database_workflow.md` is stale for this repo.)

```sql
-- =============================================================================
-- OAUTH CLIENT REGISTRY — @beechcms/mcp
-- Static registration of the first-party MCP client. 0038 declares the registry
-- static (no RFC 7591 dynamic registration), so the row is seeded by migration.
-- Public client (is_public = 1): a stdio CLI cannot hold a secret, PKCE S256 is
-- the proof of possession instead.
-- The redirect URI is registered WITHOUT a port: matchesRegisteredRedirectUri()
-- compares loopback URIs on protocol + hostname + pathname only (OAuth 2.1
-- §8.4.2), because the CLI binds an ephemeral port at runtime.
-- Idempotent: INSERT OR IGNORE keeps `beech db:reset` and re-runs safe.
-- =============================================================================

INSERT OR IGNORE INTO oauth_clients (client_id, name, redirect_uris, allowed_scopes, is_public)
VALUES (
    'beech-mcp',
    'BeechCMS MCP Server',
    '["http://127.0.0.1/oauth/callback"]',
    'schema:read schema:write',
    1
);
```

### 4.2 — `packages/mcp/src/token-store.ts` (new)

Header: `// SPDX-License-Identifier: MIT` + `// Copyright (c) 2024–2026 Flavio De Musso` (match the other files in the package).

```ts
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** A grant persisted between MCP server restarts. Plaintext by necessity: the
 *  client must replay the refresh token. Protected by file mode 0600, the same
 *  trust model as `.dev.vars`. */
export interface CachedGrant {
  /** Opaque 64-hex access token issued by `POST /oauth/token`. */
  accessToken: string
  /** Opaque 64-hex refresh token. Rotated on every refresh. */
  refreshToken: string
  /** Space-delimited scopes actually granted (may be narrower than requested). */
  scope: string
  /** Absolute expiry of `accessToken`, epoch milliseconds. */
  expiresAt: number
}

/** File shape: one entry per `${apiUrl}|${clientId}` pair. */
type TokenCacheFile = Record<string, CachedGrant>

/** Cache location. Overridable so tests never touch the real home directory. */
export function cachePath(): string {
  return process.env.BEECH_TOKEN_CACHE ?? join(homedir(), '.beechcms', 'mcp-tokens.json')
}

/** Cache key. Distinct API instances (local vs remote `BEECH_API_URL`) never
 *  share a grant — a token minted by one is invalid at the other. */
export function cacheKey(apiUrl: string, clientId: string): string {
  return `${apiUrl}|${clientId}`
}

/** Reads the cached grant. Returns undefined on a missing, unreadable, or
 *  malformed file: a corrupt cache must degrade to "re-authorize", never throw
 *  and take the stdio server down. */
export function readGrant(apiUrl: string, clientId: string): CachedGrant | undefined

/** Writes the grant atomically (tmp file -> chmod 0600 -> rename), creating
 *  `~/.beechcms` with mode 0700 if absent. Silently gives up on write failure:
 *  a read-only home means "authorize every session", not "crash". */
export function writeGrant(apiUrl: string, clientId: string, grant: CachedGrant): void

/** Removes the entry for one key. Used when a refresh token is rejected. */
export function clearGrant(apiUrl: string, clientId: string): void
```

Implementation constraints, non-negotiable:
- `mkdirSync(dirname(path), { recursive: true, mode: 0o700 })`.
- Write to `${path}.tmp`, `chmodSync(tmp, 0o600)`, then `renameSync(tmp, path)`. Never leave a world-readable window.
- Every exported function wraps its I/O in `try { … } catch { … }`; `readGrant` returns `undefined`, `writeGrant`/`clearGrant` return `void`.
- Validate the parsed entry before returning it: all of `accessToken`, `refreshToken`, `scope` must be non-empty strings and `expiresAt` a finite number, otherwise treat as absent.

### 4.3 — `packages/mcp/src/oauth.ts` (new)

```ts
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { deriveCodeChallenge } from '@beechcms/core'

/** Resolved OAuth configuration for one authorization attempt. */
export interface OAuthConfig {
  /** Origin of the token endpoint (`BEECH_API_URL`). */
  apiUrl: string
  /** Origin the *browser* opens for `/oauth/authorize` (`BEECH_AUTH_URL`, default `apiUrl`). */
  authUrl: string
  /** Registered client id (`BEECH_OAUTH_CLIENT_ID`, default `'beech-mcp'`). */
  clientId: string
  /** Space-delimited scopes requested (`BEECH_OAUTH_SCOPE`, default `'schema:read schema:write'`). */
  scope: string
  /** Milliseconds to wait for the browser round-trip (`BEECH_OAUTH_TIMEOUT_MS`, default 180000). */
  timeoutMs: number
}

/** The credential pair returned by `POST /oauth/token`, plus the derived absolute expiry. */
export interface TokenGrant {
  accessToken: string
  refreshToken: string
  scope: string
  expiresAt: number
}

/** PKCE material for a single authorization request (RFC 7636). */
export interface PkcePair {
  /** 43-char base64url verifier — satisfies `isValidCodeVerifier` from @beechcms/core. */
  verifier: string
  /** BASE64URL(SHA256(ASCII(verifier))). */
  challenge: string
}

/** base64url, unpadded (RFC 7636 §A). */
export function base64Url(bytes: Buffer): string

/** 32 random bytes -> 43-char verifier, plus its S256 challenge. */
export async function createPkcePair(): Promise<PkcePair>

/** Runs the full browser authorization-code flow and returns a fresh grant. */
export async function authorize(config: OAuthConfig): Promise<TokenGrant>

/** Exchanges a refresh token for a rotated pair. Throws BeechClientError on
 *  `invalid_grant` so the caller can fall back to `authorize()`. */
export async function refresh(config: OAuthConfig, refreshToken: string): Promise<TokenGrant>
```

**`authorize()` — exact sequence.**

1. `const { verifier, challenge } = await createPkcePair()`; `const state = base64Url(randomBytes(16))`.
2. Start the loopback listener **before** opening the browser:
   - `createServer(handler).listen(0, '127.0.0.1')`; read the bound port from `server.address()`.
   - `redirectUri = \`http://127.0.0.1:${port}/oauth/callback\`` — the pathname must be exactly `/oauth/callback` to match the registered URI in §4.1.
   - The handler resolves only for `new URL(req.url, 'http://127.0.0.1').pathname === '/oauth/callback'`; anything else gets `404` and is ignored (a stray browser `GET /favicon.ico` must not resolve the promise).
   - `state` mismatch → respond `400` with a plain "state mismatch" page and **reject**; this is the CSRF gate, it must not fall through to success.
   - `?error=` present → respond `400` and reject with `error_description ?? error`.
   - `?code=` present with matching `state` → respond `200 text/html` with a self-contained "You can close this tab" page (no external asset — the CSP-free loopback page must render offline), then resolve with the code.
   - Always `server.close()` in a `finally`, and `clearTimeout` the timer, so the MCP process can exit.
3. Build the authorization URL against `config.authUrl`:
   ```
   ${authUrl}/oauth/authorize
     ?response_type=code
     &client_id=${clientId}
     &redirect_uri=${encoded redirectUri}
     &scope=${encoded scope}
     &state=${state}
     &code_challenge=${challenge}
     &code_challenge_method=S256
   ```
   Every one of these seven parameters is mandatory — `validateAuthorizationRequest()` rejects the request if any is missing, and an empty `state` is a `redirectable` `invalid_request`.
4. Launch the system browser, detached: `darwin` → `spawn('open', [url])`; `win32` → `spawn('cmd', ['/c', 'start', '', url])`; otherwise → `spawn('xdg-open', [url])`, each with `{ detached: true, stdio: 'ignore' }` followed by `.unref()`. **On `error`, and always in addition, write the URL to `process.stderr`, never `process.stdout`** — stdout carries the MCP JSON-RPC frames and any stray byte corrupts the transport.
5. Timeout: `setTimeout(config.timeoutMs)` → close the server and reject with
   `Authorization timed out after ${timeoutMs / 1000}s. Re-run the tool and complete the consent in the browser.`
6. Exchange the code (see §4.4) and return the `TokenGrant`.

**`refresh()`** posts `grant_type=refresh_token`, `refresh_token`, `client_id` to the same
endpoint. On any non-2xx it throws — the caller in `client.ts` catches and falls back to
`authorize()`. Note the server rotates the refresh token on every call, so the returned
`refreshToken` **must** overwrite the cached one; reusing the old one is an `invalid_grant`.

### 4.4 — Token endpoint call shape (shared by `authorize` and `refresh`)

`tokenHandler` reads the body with `context.req.parseBody()`. A JSON body yields
`undefined` for every field and a `400 invalid_request`. Post form-encoded:

```ts
const body = new URLSearchParams({
  grant_type: 'authorization_code',
  code,
  redirect_uri: redirectUri,   // byte-identical to the one sent to /oauth/authorize
  client_id: config.clientId,
  code_verifier: verifier,
})

const response = await fetch(`${config.apiUrl}/oauth/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body,
})
```

Response handling:
- `200` → `{ access_token, token_type, expires_in, refresh_token, scope }`; build
  `expiresAt = Date.now() + expires_in * 1000`.
- `429` → throw `BeechClientError` quoting `Retry-After` when present.
- other non-2xx → parse `{ error, error_description }` and throw
  `BeechClientError(\`OAuth token request failed (${error}): ${error_description}\`)`.
  This body is **not** RFC 7807, so it must not be routed through `safeParseProblem`.

### 4.5 — `packages/mcp/src/client.ts` (modified)

Deleted: `login()` (`L87`), the `email` / `password` fields of `Config`, and their reads in
`loadConfig()`. Kept byte-identical: `ProblemDetails`, `BeechClientError`, `ApiResponse`,
`readDevVarsApiUrl()`, and the exported signature of `request()`.

```ts
/** Resolved connection configuration. Credentials are gone: the only secrets
 *  this process ever holds are OAuth tokens, in `~/.beechcms/mcp-tokens.json`. */
interface Config {
  baseUrl: string
  oauth: OAuthConfig
}

/** Seconds of clock skew treated as "already expired", so a token that dies
 *  in flight is refreshed before the request rather than after a 401. */
const EXPIRY_SKEW_MS = 30_000

/** In-memory copy of the active grant. */
let grant: CachedGrant | undefined

/** Guards against two concurrent MCP tool calls opening two browser windows. */
let inFlightAuth: Promise<CachedGrant> | undefined
```

`getAccessToken(forceRefresh = false)`:
1. Populate `grant` from `readGrant(baseUrl, clientId)` on first call.
2. If `grant` exists, `!forceRefresh`, and `grant.expiresAt - Date.now() > EXPIRY_SKEW_MS` → return `grant.accessToken`.
3. If an `inFlightAuth` promise exists → `await` it and return its access token. Set `inFlightAuth` before any `await` and clear it in `finally`.
4. If `grant?.refreshToken` exists → `refresh()`. On success `writeGrant` + return. On failure `clearGrant`, drop `grant`, fall through.
5. `authorize()` → `writeGrant` → return.

`request<T>()` keeps its exact signature and error contract, with three changes:
- the lazy `if (!token) await login()` becomes `const accessToken = await getAccessToken()`;
- on `401`: `getAccessToken(true)` then **one** retry; a second `401` throws
  `Authorization failed. Run any Beech tool again to re-authorize in the browser, or revoke and re-grant the client from Settings → Connected apps.`;
- on `403` with an `insufficient_scope` body: throw
  `Token lacks the '<scope>' scope. Revoke 'BeechCMS MCP Server' under Settings → Connected apps and re-authorize.`
  — a `403` must **not** trigger a refresh, because a new token carries the same scopes.

`index.ts` and `plans.ts` are not edited. `plans.ts` keys plans by `planId` with no token
reference, so a refresh between `beech_schema_plan` and `beech_schema_apply` is invisible to
the plan cache — this is asserted by a test, not assumed.

### 4.6 — `apps/api/src/features/oauth/authorize.ts` (one line)

```ts
// before (authorizeHandler, ~L110)
const consentUrl = new URL(CONSENT_SCREEN_PATH + '?' + url.search.slice(1), context.req.url)
return context.redirect(consentUrl.toString(), 302)

// after
// Relative Location: resolves against the origin the *browser* used. In production
// the Worker serves the dashboard from ASSETS on its own origin; in local dev the
// browser is on the Vite origin proxying /oauth to the Worker, and an absolute
// Location would bounce it to the Worker port, which serves no dashboard assets.
return context.redirect(`${CONSENT_SCREEN_PATH}?${url.search.slice(1)}`, 302)
```

`authorize.test.ts:L59-61` currently does `new URL(location)`, which throws on a relative
value. Change that single line to `new URL(location, 'http://localhost')`; the
`expect(url.pathname).toBe('/admin/oauth/consent')` assertion and the byte-identical
query-string assertion below it stay as they are.

### 4.7 — Environment variables (final contract)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `BEECH_API_URL` | No | `.dev.vars` → `http://localhost:8787` | Token endpoint + REST API origin. |
| `BEECH_AUTH_URL` | No | `BEECH_API_URL` | Origin the browser opens for `/oauth/authorize`. Must be the **dashboard** origin in local dev (Vite, `:5173`). |
| `BEECH_OAUTH_CLIENT_ID` | No | `beech-mcp` | Must match the row from §4.1. |
| `BEECH_OAUTH_SCOPE` | No | `schema:read schema:write` | Set to `schema:read` for a read-only agent. |
| `BEECH_OAUTH_TIMEOUT_MS` | No | `180000` | Browser round-trip budget. |
| `BEECH_TOKEN_CACHE` | No | `~/.beechcms/mcp-tokens.json` | Cache override (tests, containers). |
| ~~`BEECH_EMAIL`~~ / ~~`BEECH_PASSWORD`~~ | — | — | **Removed.** No longer read anywhere. |

### 4.8 — Documentation

`packages/mcp/README.md` (`L23`, `L34`, `L61`) and `docs/start/mcp.md` (`L68`, `L88`, `L101`):
drop `BEECH_EMAIL` / `BEECH_PASSWORD` from the sample `env` blocks and the variable table,
replace them with §4.7, describe the first-run browser consent, state where the token cache
lives and that deleting it forces re-authorization, and add the revoke path
(Settings → Connected apps). Add a local-dev note covering `BEECH_AUTH_URL=http://localhost:5173`
against `BEECH_API_URL=http://127.0.0.1:8789` (`wrangler dev --port 8789`, per
`apps/api/package.json`). Troubleshooting table gains: `400 invalid_client` → migration `0039`
not applied; `403 insufficient_scope` → token narrower than the tool needs;
authorization timeout → consent not completed.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# 1. Apply the new client-registry migration and confirm the row exists.
pnpm beech db:migrate
pnpm beech db:reset          # also proves 0039 is idempotent on a clean boot

# 2. Types and build.
pnpm --filter @beechcms/mcp exec tsc --noEmit
pnpm --filter @beechcms/api exec tsc --noEmit
pnpm --filter @beechcms/mcp build

# 3. Tests (scoped, then whole workspace).
pnpm --filter @beechcms/mcp test
pnpm --filter @beechcms/api test
pnpm beech test

# 4. Lint.
pnpm lint

# 5. Manual end-to-end (the only way to exercise the browser round-trip).
pnpm beech dev
#   BEECH_API_URL=http://127.0.0.1:8789 \
#   BEECH_AUTH_URL=http://localhost:5173 \
#   node packages/mcp/dist/index.js
#   -> call beech_list_seeds from the MCP client
#   -> browser opens, login if needed, consent screen lists schema:read + schema:write
#   -> "You can close this tab", tool returns the seed list
#   -> ~/.beechcms/mcp-tokens.json exists with mode 0600
#   -> Settings -> Connected apps lists "BeechCMS MCP Server"; revoke it
#   -> next tool call opens the browser again instead of failing
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `grep -rn "BEECH_EMAIL\|BEECH_PASSWORD" packages/mcp docs/start/mcp.md` returns **zero** matches.
- [ ] `packages/mcp/src/client.ts` no longer references `/auth/login`.
- [ ] `packages/mcp/src/index.ts` and `packages/mcp/src/plans.ts` are byte-identical to `master`.
- [ ] `packages/mcp/package.json` `dependencies` are unchanged — no new runtime dependency.
- [ ] `apps/api/migrations/0039_oauth_client_beech_mcp.sql` exists, is `INSERT OR IGNORE`, contains no DDL, and `wrangler.jsonc` is unmodified.
- [ ] Every request to `POST /oauth/token` is `application/x-www-form-urlencoded`.
- [ ] `code_challenge_method=S256`; no `plain` code path exists anywhere in `packages/mcp`.
- [ ] The generated verifier satisfies `isValidCodeVerifier()` from `@beechcms/core` (asserted in a test).
- [ ] A callback whose `state` does not match rejects and never reaches the token endpoint (test).
- [ ] A callback carrying `?error=` rejects with the server's `error_description` (test).
- [ ] The loopback server is closed on success, on error, and on timeout (test asserts the port is free afterwards).
- [ ] Nothing is ever written to `process.stdout` by `oauth.ts`, `token-store.ts`, or `client.ts` (test spies on `process.stdout.write`).
- [ ] The token cache file is created with mode `0600` and its directory with `0700` (test).
- [ ] A corrupt / truncated cache file yields a fresh authorization instead of a throw (test).
- [ ] Two concurrent `request()` calls with an empty cache trigger exactly **one** `authorize()` (test on `inFlightAuth`).
- [ ] A rotated refresh token overwrites the cached one; the previous one is never replayed (test).
- [ ] A `401` triggers exactly one refresh-and-retry; a second `401` throws the re-authorize message (test).
- [ ] A `403 insufficient_scope` throws the scope message and triggers **no** refresh (test).
- [ ] A refresh occurring between `beech_schema_plan` and `beech_schema_apply` leaves the stored plan retrievable (test).
- [ ] `pnpm --filter @beechcms/mcp exec tsc --noEmit` and `pnpm --filter @beechcms/api exec tsc --noEmit` pass with zero errors; no `any` in new code, no `@ts-expect-error`.
- [ ] `pnpm beech test` and `pnpm lint` pass.
- [ ] Every new exported symbol carries a TSDoc block, matching the existing density of `client.ts` / `plans.ts`.
- [ ] New files in `packages/mcp` carry the `MIT` SPDX header; the migration and `authorize.ts` keep `BUSL-1.1`.
- [ ] The manual end-to-end run of §5 step 5 completes, including revoke-then-reauthorize.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

This sprint is the final entry of `output/backlog/ROADMAP.md`; nothing below is deferred to a
later sprint of this feature — each item is rejected outright under YAGNI.

- **Dynamic client registration (RFC 7591)** — `0038_oauth_authorization.sql` declares the registry static. One first-party client exists; a migration row is the correct registration mechanism.
- **An OAuth discovery document** (`/.well-known/oauth-authorization-server`) — the only client is first-party and hard-codes its endpoints.
- **A `pnpm beech oauth:client` CLI command** for registering clients — no second client to register.
- **OS keychain / `libsecret` / DPAPI token storage** — a `0600` file matches the existing trust model for `.dev.vars` and adds no dependency.
- **Calling `POST /oauth/revoke` from the MCP client** — revocation is a user action from the Sprint 4 "Connected apps" tab. No MCP tool is added for it.
- **New MCP tools, or any change to `TOOLS`, `handleTool()`, or `plans.ts`** — the tool surface is unchanged by design; the `graphify affected` result in the Pre-Computation Analysis is the proof that it need not move.
- **New OAuth scopes or changes to `OAUTH_SCOPE_ROUTES`** — the 5 allowlist entries already cover the 6 tools. Do not touch `apps/api/src/middleware/oauth-scope.middleware.ts`.
- **Changes to `authMiddleware`, `factory.ts` registration order, or any repository** — Sprints 1–3 wired these; they are consumed, not modified.
- **Any change under `apps/dashboard/`** — the consent screen and Connected-apps tab shipped in Sprint 4 and are exercised through the browser as-is.
- **Device authorization grant (RFC 8628) for headless environments** — no headless requirement exists today; the stderr URL fallback covers a browser that fails to launch.
- **Reconciling the `8787` / `8789` dev-port mismatch** (§2.6) — pre-existing, documented in §4.8, not repaired here.
