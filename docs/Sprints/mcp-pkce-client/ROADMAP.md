# ROADMAP — OAuth 2.1 Authorization Server for MCP (and future external consumers)

Multi-sprint feature. Each sprint must merge before the next is planned in detail:
the graph, the interfaces and the D1 schema change at every step, so only the sprint
currently in flight ever gets Task Details.

| # | Slug | Status |
|---|------|--------|
| 1 | `oauth-core-foundation` | **DONE** (commit `00e3315`; archived plan: `../../../../docs/Sprints/oauth-core-foundation/oauth-core-foundation.md`) |
| 2 | `oauth-authorization-server` | **DONE** (commit `07ff827`; archived plan: `../../../../docs/Sprints/oauth-authorization-server/oauth-authorization-server.md`) |
| 3 | `oauth-resource-server-scopes` | **DONE** (detailed plan: `../../../../docs/Sprints/oauth-resource-server-scopes/oauth-resource-server-scopes.md`) |
| 4 | `oauth-dashboard-consent-ui` | **DONE** (detailed plan: `../../../../docs/Sprints/oauth-dashboard-consent-ui/oauth-dashboard-consent-ui.md`) |
| 5 | `mcp-pkce-client` | **DONE** (detailed plan: `../mcp-pkce-client.md`) |

---

## Sprint 1 — `oauth-core-foundation`

**Goal:** Land the persistence layer and the zero-dependency contracts for OAuth in
`@beechcms/core` + D1, with no HTTP surface at all.

**Deliverables summary:** migration `0038_oauth_authorization.sql` (4 tables), OAuth
interfaces in `packages/core/src/oauth/` (client, authorization code, token, consent,
scopes, PKCE verifier, `IRoleGuard` + `AllowAllRoleGuard` stub), the four D1 repository
implementations in `apps/api/src/shared/db/repositories/`, and their injection into
`repositoryMiddleware` / `Variables`.

**Depends on:** nothing. This is the base sprint.

---

## Sprint 2 — `oauth-authorization-server`

**Goal:** Expose `/oauth/authorize`, `/oauth/token`, `/oauth/revoke` as a new
`apps/api/src/features/oauth/` slice, consuming only the Sprint 1 contracts.

**Deliverables summary:** the three endpoints, PKCE `S256` enforcement, single-use
authorization-code redemption with cascade revocation on replay, refresh-token rotation
reusing the `saveRefreshToken` hash pattern, `oauthToken` / `oauthTokenAccount` entries in
`RateLimiterName` + `buildDefaultRegistry`, and the `IRoleGuard` call site at consent time.

**Correction found during Sprint 2 planning:** Sprint 1 shipped `IRoleGuard` /
`AllowAllRoleGuard` in `@beechcms/core` but never bound them in `apps/api`
(`graphify explain "AllowAllRoleGuard"` shows its only importer is its own test).
Adding `roleGuard` to `Variables`, to `repositoryMiddleware` and to `BeechConfig` is
therefore part of Sprint 2, not a Sprint 1 leftover to assume present.

**Depends on:** Sprint 1 — the repositories and the `oauth_*` tables must exist and be
injected in context before any handler can be written.

---

## Sprint 3 — `oauth-resource-server-scopes`

**Goal:** Make the existing protected API accept OAuth access tokens alongside the current
admin JWT, and enforce `schema:read` / `schema:write` per route.

**Deliverables summary:** scope-aware verification in `authMiddleware()` (or a sibling
middleware registered before it on `apiProtected`), a `requireScope()` guard applied to the
6 MCP-backing routes, and the documented classification of `beech_schema_plan` as
`schema:read` (dry-run, no mutation).

**Correction found during Sprint 3 planning:** the deliverable is NOT a per-route
`requireScope()` decorator. Per-route guards are fail-open — a route where the decorator is
forgotten hands an OAuth token the full admin privileges that the in-slice `requireAdmin`
gate confers. Sprint 3 ships instead a single fail-closed gate,
`apps/api/src/middleware/oauth-scope.middleware.ts`, holding a closed allowlist
(`OAUTH_SCOPE_ROUTES`, 5 routes for the 6 tools): any `/api/*` path absent from the table is
refused `403 insufficient_scope`. This also keeps every file under
`apps/api/src/features/` unmodified, so no cross-slice import is created.

Two further facts, discovered while mapping and folded into the plan: (a) OAuth acceptance
must be OPT-IN (`authMiddleware({ acceptOAuth: true })`, default false), because the
consent APIs at `features/oauth/index.ts:L40-41` must stay JWT-only — an access token there
could mint fresh authorization codes; (b) `seeds.handler.ts:L38` runs `requireAdmin` on all
`/api/seeds/*`, so an OAuth request must arrive with `jwtPayload` hydrated from
`userRepository.findById(record.userId)` or every MCP route 403s.

**Depends on:** Sprint 2 — no token with a `scope` claim exists until the token endpoint
issues one, so this cannot be validated end-to-end before it.

---

## Sprint 4 — `oauth-dashboard-consent-ui`

**Goal:** Consent screen and "Connected apps" management page in the dashboard.

**Deliverables summary:** a `apps/dashboard/src/features/oauth-consent/` slice (consent
screen rendered by `/oauth/authorize`), a connected-apps tab under Settings listing
authorized clients with per-client revoke, built strictly on the existing shadcn/ui
primitives (`card`, `data-table`, `confirm-dialog`, `sheet`, `tabs`, `field`).

**Depends on:** Sprint 2 (the authorize endpoint that renders/redirects to the consent
screen) and Sprint 1 (`oauth_consents` rows to list and revoke).

**Corrections found during Sprint 4 planning:** (a) the "Connected apps" tab has **no API
behind it** — `apps/api/src/features/oauth/index.ts` exposes only authorize/token/revoke, so
Sprint 4 also ships `GET /oauth/consents` and `DELETE /oauth/consents/:clientId` inside the
existing oauth slice. They are mounted under `/oauth/*` (outside `apiProtected`) with plain
`authMiddleware()`, so an OAuth access token can never enumerate or revoke consents.
(b) No `packages/core` change is needed: `listForUser`, `revoke`,
`listAuthorizedClientsForUser` and `revokeAllForClientAndUser` already exist from Sprint 1.
(c) The flow is currently **broken for a logged-out user**: `ProtectedRoute` redirects to
`/login` discarding the location, and `use-login-form.ts:L94` hard-codes `navigate('/')`, so
every OAuth query parameter is lost. A `returnTo` round-trip (with an open-redirect guard)
is part of Sprint 4. (d) `vite.config.ts` proxies only `/api` and `/auth`; `/oauth` must be
added or the consent screen cannot be exercised in local dev.

---

## Sprint 5 — `mcp-pkce-client`

**Goal:** Replace `BEECH_EMAIL` / `BEECH_PASSWORD` in `packages/mcp` with the browser
authorization-code + PKCE flow.

**Deliverables summary:** loopback listener with explicit timeout, system-browser launch,
verifier/challenge generation, on-disk token cache, transparent refresh on 401 preserving
in-flight plan state, removal of the password code path from `client.ts`, and docs update.

**Depends on:** Sprint 3 — the MCP client is only usable once scoped tokens are actually
accepted by the resource server.

**Corrections found during Sprint 5 planning:** (a) **no OAuth client is registered
anywhere** — `grep -rn "INSERT INTO oauth_clients"` over the repo returns nothing, and
`0038_oauth_authorization.sql` declares the registry static, so `GET /oauth/authorize`
answers `400 invalid_client` today. Sprint 5 therefore also ships
`apps/api/migrations/0039_oauth_client_beech_mcp.sql`, a data-only `INSERT OR IGNORE`
registering `beech-mcp` with the port-less loopback redirect
`http://127.0.0.1/oauth/callback` (`matchesRegisteredRedirectUri` ignores the port for
loopback hosts, OAuth 2.1 §8.4.2). (b) `apps/api/wrangler.jsonc` declares only
`"migrations_dir"` with no file list, so the "register in wrangler.jsonc" step of
`_config/database_workflow.md` is stale and must NOT be performed. (c) The consent
redirect at `authorize.ts:L110` is **absolute**: in local dev the browser sits on the
Vite origin proxying `/oauth` to the Worker with `changeOrigin: true`, so the emitted
`Location` points at the Worker port, which serves no dashboard assets — a one-line
change to a relative `Location` (plus one line in `authorize.test.ts`) is part of
Sprint 5. (d) `POST /oauth/token` reads its body with `context.req.parseBody()`, so the
client MUST post `application/x-www-form-urlencoded`; a JSON body is a silent
`400 invalid_request`. (e) The browser entry origin and the token-endpoint origin differ
in local dev, hence a new `BEECH_AUTH_URL` (defaulting to `BEECH_API_URL`, identical in
production where the Worker serves the dashboard from `ASSETS`). (f) `plans.ts` keys
plans by `planId` with no token reference, so the "token expires mid-plan" requirement of
the brief needs no new code — only a regression test.
