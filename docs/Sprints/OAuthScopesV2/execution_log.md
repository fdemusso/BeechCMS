# Execution Log — OAuthScopesV2

## Section 6 — Acceptance Criteria

- [x] `OAUTH_SCOPES` is the 14-scope list and the only vocabulary; `OPERATION_SCOPES` / `OperationScope` gone (grep empty).
- [x] `OAUTH_SCOPE_ROUTES` gone; `oauthScopeMiddleware` follows Task 2 rules 1-6; JWT passes first.
- [x] `content:read` token reads content, `403 insufficient_scope` (`scope="content:write"`) on writes (unit + flow).
- [x] Token wider than owner RBAC refused by `permissionMiddleware` (`403 forbidden`), flow suite.
- [x] 1.x `schema:*` tokens unchanged on the five routes. Default-deny flow case renamed per plan; see deviations.
- [x] Publish/destructive with OAuth token → `403 confirmation_required`; bodies stay readable downstream.
- [x] Uncatalogued and `excluded` → `403 insufficient_scope`, no `scope=` challenge.
- [x] `SCOPE_GRANT_REQUIREMENTS` equals parity derivation; `PermissionRoleGuard` partitions per scope, never adds.
- [x] `GET /oauth/authorize/request` returns `deniedScopes`; denied scopes excluded from `newScopes`.
- [x] `0045_oauth_scopes_v2.sql` data-only; flow test proves only `beech-mcp` / `beech-mcp-cli` rows carry the string.
- [x] `PROTECTED_ROUTES` matches `kanban-move` only.
- [x] Ghost-collision guard exists; verified it detects the 3 known pairs (all equivalent) and passes.
- [x] Consent screen: template picker, one filled button, design-token check prints nothing, 5 locales updated (`locales.test.ts` green).
- [x] `mcp-server.md` / `rbac-api.md` no longer mention `OAUTH_SCOPE_ROUTES` or the all-or-nothing guard.
- [x] No `any` in new/edited code; TSDoc on new exports; headers per fact 13.
- [x] `packages/mcp`, `cli`, `api-client`, `routes.ts` untouched; only `authorize.ts` edited among handlers.
- [x] All Section 5 commands exit 0.

## Validation

```
core build / type-check ........ ok
core test ...................... 74 files, 1449 tests passed
api type-check ................. ok
api test:unit .................. 160 files, 2097 tests passed
api test:flow .................. 44 files, 403 tests passed
dashboard type-check ........... ok
dashboard test:unit ............ 282 files, 2412 tests passed
check-design-tokens (consent-screen.tsx) ... no output
pnpm beech db:migrate .......... Migrations applied successfully
pnpm beech lint ................ 19/19 tasks successful
pnpm beech test --diff ......... PASS tests, PASS changed-line coverage (9 files)
graphify update . .............. done
```

## Deviations from the plan text

- Plan prose says "7 authenticated scopes". `SCOPE_GRANT_REQUIREMENTS` (verbatim) has 6 (`schema:read`, `content:read`, `content:write`, `settings:read`, `settings:write`, `analytics:read`), 8 gated. Tests assert the real partition; the flow RBAC test expects 6 + `media:read` + `automations:read` = 8 scopes.
- `oauth-scope.middleware.test.ts` default-deny list (1.x grant): dropped `PUT /api/schema/articles/layout`, `GET /api/seeds/articles/orphans`, `POST /api/seeds/articles/fts/rebuild`. The catalog now classifies them as `agent` operations reachable with `schema:*`, so they are no longer refused by design. `POST .../branches` is `excluded` and stays in the list. The list was renamed `1.x grant refused on ...`.
- `consent-page.test.tsx` (not in plan list): two mock responses gained `deniedScopes: []`; required by the new response field.
- `apps/api` was rebuilt (`pnpm --filter @beechcms/api build`) so the dashboard RPC types see `deniedScopes`.
- Stale `OAUTH_SCOPE_ROUTES` comments in `factory.ts:228` and `features/rbac/index.ts` fixed in rework.
- Work stays on `feature/operation-catalog` (sprint 03 files exist only in its working tree). Nothing committed.

## Rework — review_report.md (REWORK_CODE)

- [x] F1 (blocking): `oauth-scope.middleware.ts` reads body for risk whenever `operation.risk` is a function, any `Content-Type`; `.catch(() => undefined)` kept.
- [x] F1 tests: middleware matrix (`text/plain`, `APPLICATION/JSON`, form-urlencoded, absent) → 403 `confirmation_required`; flow case `text/plain` publish → 403, 0 entries.
- [x] F2: `features/rbac/index.ts` comment rewritten (OAuth-reachable via `OPERATION_CATALOG`). `factory.ts:228` comment updated (human approved comment-only edit).
- [x] F3: note only, no action.

Validation:
- `pnpm --filter @beechcms/api type-check` exit 0
- `pnpm --filter @beechcms/api test:unit` 160 files, 2102 tests passed
- `pnpm --filter @beechcms/api test:flow` 44 files, 404 tests passed
- `pnpm beech lint` exit 0
- `graphify update .` done
