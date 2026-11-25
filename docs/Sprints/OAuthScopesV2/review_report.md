# Verdict
PASS

# Findings
None blocking. Second review pass, after the REWORK_CODE of the first pass (2026-11-20).

- Previous finding 1 (blocking, `Content-Type` bypass of the `confirmation_required` gate): fixed. `oauth-scope.middleware.ts` now reads the body for the risk rule whenever `operation.risk` is a function, with `.catch(() => undefined)` kept.
- Previous finding 2 (stale `OAUTH_SCOPE_ROUTES` comments): fixed in `features/rbac/index.ts` and `factory.ts:228`. The `factory.ts` change is comment-only (human approved).
- Previous note 3 (plan prose says 7 `authenticated` scopes, the verbatim table has 6): unchanged, no action. Stage 01 may fix the prose in future plans.

# Verification Evidence

Commands re-run by me in this pass (not copied from `execution_log.md`), from the repo root:

| Command | Result |
|---|---|
| `pnpm --filter @beechcms/core build` | exit 0 |
| `pnpm --filter @beechcms/core type-check` | exit 0 |
| `pnpm --filter @beechcms/core test` | exit 0, 74 files, 1449 tests passed |
| `pnpm --filter @beechcms/api type-check` | exit 0 |
| `pnpm --filter @beechcms/api test:unit` | exit 0, 160 files, 2102 tests passed |
| `pnpm --filter @beechcms/api test:flow` | exit 0, 44 files, 404 tests passed |
| `pnpm --filter @beechcms/dashboard type-check` | exit 0 |
| `pnpm --filter @beechcms/dashboard test:unit` | exit 0, 282 files, 2412 tests passed |
| `node scripts/check-design-tokens.mjs --format agent .../consent-screen.tsx` | exit 0, no output |
| `pnpm beech db:migrate` | exit 0, "Migrations applied successfully" |
| `pnpm beech lint` | exit 0, 19/19 tasks successful |
| `pnpm beech test --diff` | exit 0, PASS changed-line coverage, 9 files |

Not re-run: `graphify update .` (index refresh, not a verification step).

Rework verification:
- Read `oauth-scope.middleware.ts:90-91`: the body is read with no `Content-Type` condition.
- Mutation check: I temporarily reintroduced the `Content-Type` condition and ran `oauth-scope.middleware.test.ts`. The 4 new matrix cases (`text/plain`, `APPLICATION/JSON`, `application/x-www-form-urlencoded`, absent header) all failed. I then restored the file (`cmp` against the backup is identical). The new tests therefore pin the bug.
- The new flow case `a publish sent as text/plain is refused with confirmation_required and persists nothing` is present in `flow-oauth-resource-server.test.ts` and green. The first-pass runtime probe showed `text/plain` gave 201 and persisted an entry. The flow case now asserts 403 and zero entries.
- A malformed-JSON body case was added: the gate answers 200 and does not 500, and the handler's validator owns the 400.
- `grep -rnE "OPERATION_SCOPES|OperationScope\b|OAUTH_SCOPE_ROUTES"` over `packages apps docs/reference` is empty.
- The comment claim in `rbac/index.ts` checked against the catalog: `users.list` is `agent`, `users.create` (`POST /api/rbac/users`) is `excluded`.

Static audit (carried from pass 1, diff unchanged outside the rework files):
- Invariants: no D1 access outside repositories; no hardcoded field names; no cross-slice imports (dashboard changes confined to `features/oauth-consent/`).
- Out of scope respected: `routes.ts`, `packages/mcp`, `packages/cli`, `packages/api-client` untouched; the `factory.ts` diff is a single comment line; no `agent:*` scope, no `agent_intents`.
- Test audit (§8): four-zone anatomy, `it.each` matrices, regression comments present; no `any` in new or edited files.
- Acceptance criteria: all items hold, including "every publish/destructive request with an OAuth token answers `confirmation_required` and changes nothing", which failed in pass 1.

Not performed: browser run of the consent screen. UI behaviour is covered by the passing component and page tests and the design-token check only.

Executor deviations checked and accepted: the three routes removed from the 1.x default-deny list are `agent` operations reachable with `schema:*` per the plan; `consent-page.test.tsx` gained `deniedScopes: []`; `apps/api` was rebuilt for RPC types.

# Sprint Documentation
- Shipped: OAuth scopes widened from 2 to 14 (`schema:*`, `content:read|write|delete`, `media:*`, `automations:*`, `users:*`, `settings:*`, `analytics:read`) as the single vocabulary; `OPERATION_SCOPES` removed.
- The OAuth scope gate classifies requests with `OPERATION_CATALOG` instead of a 5-row allowlist: uncatalogued and `excluded` operations answer `403 insufficient_scope` with no `scope=` challenge; JWT requests pass untouched.
- Interim safety rule: publish and destructive requests with an OAuth token answer `403 confirmation_required` until the agent intent gate (ROADMAP sprint 05) replaces it. Request-dependent risk (`status: published`, `?purge=true`) is read from the JSON body/query. The body is read whatever the `Content-Type`, because the validator parses it without checking the header (fixed in review rework).
- The consent guard grants per scope through `SCOPE_GRANT_REQUIREMENTS` (kept equal to the RBAC route table by a parity test); `GET /oauth/authorize/request` returns `deniedScopes`, which never force a prompt.
- Consent screen gained four cumulative templates (Read, Editor, Admin, Developer); templates only narrow the request. Migration `0045` widens the seeded `beech-mcp` and `beech-mcp-cli` clients; `agent_intents` moves to `0046`.
- Deviations: the plan prose counts 7 `authenticated` scopes but its verbatim table has 6, and the code follows the table. Three routes left the 1.x default-deny test list because the catalog classifies them as `agent` operations.
- Known limitations: the consent scope is not checked server-side against the original request (bounded by `client.allowedScopes`); no browser-level check of the consent screen was done.
