# Execution Log — AgentIntents (sprint 05)

Branch: `feature/agent-intents` (from `devs`, uncommitted sprint 03/04 work carried over). No commits made.

## Section 6 — Acceptance Criteria

- [x] `OAUTH_SCOPES` 16 entries ending `agent:read`, `agent:approve`; both `'authenticated'`; parity suite green.
- [x] `confirmation_required` gone (`grep -rn confirmation_required apps packages docs/reference` empty).
- [x] OAuth, after RBAC: destructive always / publish in production -> `202` `AgentIntentPendingResponse`, handler not run; read/write (and dev publish) unchanged.
- [x] Intent runs only via `POST /api/agent/intents/:id/approve`, once, as owner, stored method/path/body; expired / decided / foreign -> 409 / 409 / 404.
- [x] Replay re-enters full chain; RBAC refusal recorded `failed` (flow test).
- [x] Replay marker is a module-private Symbol on env copy; no header; `authMiddleware` honours it only with `acceptOAuth`.
- [x] `beech-mcp` may request `agent:approve`; `beech-mcp-cli` may not (0046 + flow tests).
- [x] JWT never creates intents; no pre-existing JWT test modified.
- [x] create / approve / reject each log one activity row, `entity_type = 'intent'`.
- [x] Catalog 146 rows / 110 agent; no `intents.*` publish/destructive; parity green.
- [x] `0046_agent_intents.sql` DDL equals Task 6; applied by flow tier (real migrations).
- [x] Consent templates carry agent scopes; 2 locale keys x 5 locales.
- [x] `mcp-server.md`, `rbac-api.md` describe intents.
- [x] No `any` in new/edited code and tests; TSDoc on new exports; headers per fact 13.
- [x] `packages/mcp|cli|api-client`, existing `features/` handlers, dashboard `.tsx` (beyond sprint-04 state): untouched.
- [x] Section 5 commands exit 0.

## Deviations from plan (plan omissions, user-approved for #1)

1. `packages/core/src/operations/catalog.test.ts`: "write-side scope on every mutating op" exception list now `['seeds.plan', 'intents.reject']` (`intents.reject` is POST on `agent:read` per Task 4).
2. `apps/api/src/middleware/oauth-scope.middleware.test.ts`: removed `['DELETE', '/api/seeds/articles']` from the 1.x default-deny list; it was only refused by the removed interim ceiling. Covered by the new "lets a destructive operation through" case.
3. `replay.ts` `readIntentReplay` tolerates an undefined env (test apps called without bindings).
4. Added internal helper `truncateUtf8` in `agent-intents.view.ts`.
5. `oauth-flow.ts`: `beech-mcp` registers `/oauth/callback`, so helpers map redirect URI per client.

## Validation

| Command | Result |
|---|---|
| core build / type-check / test | ok; 75 files, 1452 tests passed |
| api type-check | ok |
| api test:unit | 163 files, 2114 tests passed |
| api test:flow | ok; flow-agent-intents 12/12, flow-oauth-resource-server green |
| dashboard type-check | ok |
| dashboard test:unit | 282 files, 2413 tests passed |
| `pnpm beech db:migrate` | "Migrations applied successfully" (local DB already initialised; bootstrap skipped) |
| `pnpm beech lint` | 19/19 tasks successful |
| `pnpm beech test --diff` | 101 files, 761 tests passed |
| `graphify update .` | exit 0 |

## Rework (review_report.md — REWORK_CODE)

- [x] Finding 1: `flow-agent-intents.test.ts` — `FixedClock` starts from literal `FIXED_NOW_MS = 1_700_000_000_000` (no `Date.now()`); activity assertion order-independent (`arrayContaining(['create','authorize'])` + `toHaveLength(2)`).

| Command | Result |
|---|---|
| `vitest run --project flow flow-agent-intents.test.ts` x5 | 12/12 passed every run |
| `pnpm --filter @beechcms/api test:flow` | 45 files, 416 tests passed |
| `pnpm --filter @beechcms/api type-check` | ok |
| `pnpm beech lint` | ok |
| `graphify update .` | exit 0 |
