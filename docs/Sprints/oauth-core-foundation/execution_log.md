# Execution Log — `oauth-core-foundation` (REWORK)

Branch: `feature/oauth-core-foundation` (from `devs`).

REWORK MODE against `../03_review/output/review_report.md` (verdict `REWORK_CODE`). Fixed finding #1 (blocking) and finding #2 (non-blocking, done per Handoff note).

## SECTION 6 — ACCEPTANCE CRITERIA (rework)

- [x] Finding #1 fixed: `D1OAuthConsentRepository.grant()` no longer does read-then-write. Single `INSERT ... ON CONFLICT(client_id, user_id) DO UPDATE` statement; scope union computed in-SQL via nested `CASE` referencing the pre-update row (`oauth_consents.scopes`), so two concurrent grants for the same `(client_id, user_id)` can no longer clobber each other.
- [x] Finding #2 fixed: unit tests added for `D1OAuthClientRepository` (4 tests) and `D1OAuthConsentRepository` (9 tests) — covers `findActiveById` mapping/nulls/malformed JSON, `grant()` atomicity (single `prepare()` call, no `first()` read, correct bind order, scope dedup), `revoke()` true/false, `listForUser()` mapping/empty.
- [x] No pre-existing test file modified.
- [x] `pnpm --filter @beechcms/core run build` passes.
- [x] `npx tsc --noEmit` in `apps/api/` — zero new errors; new/changed oauth files clean; remaining errors are the same pre-existing baseline confirmed unrelated in `review_report.md`.
- [x] `pnpm beech test` fully green across all workspaces.
- [x] `pnpm beech db:reset` — 11 migrations applied cleanly, `0038_oauth_authorization.sql` unchanged (no schema change needed for this fix).
- [x] `graphify update . --force` run and graph refreshed.

## Files changed (rework only)

- `apps/api/src/shared/db/repositories/d1-oauth-consent.repository.ts` — `grant()` rewritten as atomic upsert.
- `apps/api/src/shared/db/repositories/d1-oauth-consent.repository.test.ts` (new)
- `apps/api/src/shared/db/repositories/d1-oauth-client.repository.test.ts` (new)

## Validation output

```
$ pnpm --filter @beechcms/core run build
$ tsc
(no errors)

$ cd apps/api && npx tsc --noEmit
(only pre-existing baseline errors — full-text-search.test.ts, semantic-search.*.test.ts,
public-search.router.test.ts, rate-limit.middleware.test.ts, d1-vector.repository.test.ts,
packages/client/src/types.ts — none in oauth files, none new)

$ pnpm beech test
@beechcms/core:   Test Files 35 passed (35) | Tests 633 passed (633)
@beechcms/api:    Test Files 124 passed (124) | Tests 1409 passed (1409)   [+2 files, +13 tests]
@beechcms/dashboard: Test Files 106 passed (106) | Tests 795 passed (795)
Tasks: 11 successful, 11 total

$ pnpm beech db:reset
[bootstrap-d1] applying 0038_oauth_authorization.sql
[bootstrap-d1] done. (11 applied)
  ✓ Local database reset completed.

$ graphify update . --force
Graph has 11179 nodes, 19664 edges, 938 communities. graph.json/graph.html/GRAPH_REPORT.md updated.
```
