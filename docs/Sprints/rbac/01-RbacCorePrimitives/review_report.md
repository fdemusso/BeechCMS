# Verdict
PASS

# Findings
1. (Non-blocking, informational) `apps/api/src/shared/db/repositories/d1-role.repository.ts:86-97` — `update()` guards the `UPDATE roles ... WHERE id = ? AND is_system = 0` statement, but the `DELETE FROM role_permissions` + reinsert in the same `db.batch()` carries no `is_system` guard. Calling `update()` against a system role (e.g. `SuperAdmin`) silently leaves name/description untouched but replaces its permission set. This is present verbatim in the approved plan (SECTION 4.6) — not introduced by the executor. No caller exists in this sprint (`update()` is storage-only, unwired), so there is no live behavior to regress and no acceptance criterion covers it. Flagging so `RbacUserRoleAdminApi` (roadmap entry 3) either adds the same `is_system` guard to the permission statements or documents the asymmetry deliberately before wiring a route to `update()`.

# Verification Evidence

Commands re-run independently (not trusted from execution_log.md):

```
$ pnpm --filter @beechcms/core run build
$ tsc
(exit 0)

$ cd apps/api && npx tsc --noEmit
32 errors — identical set on devs baseline (git stash verified): all in full-text-search.test.ts,
semantic-search.*.test.ts, public-search.router.test.ts, rate-limit.middleware.test.ts,
api-key-middleware.test.ts, d1-vector.repository.test.ts, packages/client/src/types.ts.
Zero errors in any RBAC file. (execution_log claimed 31; actual count both branches is 32 —
same pre-existing set, discrepancy is a stale count in the log, not a new error.)

$ pnpm beech db:reset
[bootstrap-d1] applying 0000_v040_base.sql
[bootstrap-d1] applying 0030_test_seeds.sql
✓ Local database reset completed.

$ npx wrangler d1 execute beech-db --local --command "SELECT rp.permission FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.name = 'SuperAdmin' ORDER BY rp.permission;"
-> 7 rows: content:create, content:delete, content:read, content:update, manage_roles, manage_users, view_analytics. No manage_seeds.

$ npx wrangler d1 execute beech-db --local --command "SELECT id FROM roles WHERE name = 'SuperAdmin';"
-> 194cf0f3-37b7-458e-b8b6-3e51ace9c1b5 (v4-shaped)

$ npx wrangler d1 execute beech-db --local --command "SELECT COUNT(*) AS n FROM user_role_assignments;"
-> 0

$ npx wrangler d1 execute beech-db --local --command "SELECT name, type, dflt_value FROM pragma_table_info('users') WHERE name = 'is_active';"
-> is_active | INTEGER | 1

$ cd apps/api && npx vitest run src/shared/db/repositories/d1-role.repository.test.ts src/shared/db/repositories/d1-role-assignment.repository.test.ts
-> Test Files 2 passed (2), Tests 11 passed (11) — real D1TestDatabase, no mocked prepare/bind.

$ cd apps/api && npx vitest run
-> Test Files 136 passed (136), Tests 1540 passed (1540). Matches execution_log claim exactly.

$ cd apps/dashboard && npx vitest run
-> Test Files 111 passed (111), Tests 827 passed (827). Matches execution_log claim exactly.

$ pnpm beech test   (full monorepo run)
-> @beechcms/mcp#test fails: src/auto-restart.test.ts, "McpSupervisor detects rebuild and
   restarts child server" (1 of 47 tests). This is what triggered the log's "[ELIFECYCLE]"
   cascade for api/dashboard, NOT a real regression there (confirmed above by running api/
   dashboard suites standalone — both fully green). packages/mcp has zero diff on this branch
   (`git diff devs -- packages/mcp` empty) and the failing test passes in isolation
   (`npx vitest run src/auto-restart.test.ts` -> 3 passed) — a pre-existing flaky/racy test,
   unrelated to this sprint's changes.

$ pnpm lint
Tasks: 12 successful, 12 total (cache hit on all packages touched by this diff — core, api)
```

Invariant / acceptance-criteria checks re-run directly against the working tree:

```
$ git diff devs -- apps/api/src/factory.ts | wc -l          -> 0 (unchanged)
$ git diff devs -- apps/api/wrangler.jsonc | wc -l           -> 0 (unchanged)
$ git diff devs -- packages/core/src/oauth/role-guard.ts | wc -l -> 0 (unchanged)
$ git diff devs -- apps/api/src/features/seeds/seeds.helpers.ts | wc -l -> 0 (unchanged)
$ git diff devs --stat | grep -i "features/\|dashboard/"     -> no matches
$ ls apps/api/migrations/                                     -> 0000_v040_base.sql, 0030_test_seeds.sql, _archive (no new file)
$ grep -n "ALTER TABLE users" apps/api/migrations/0000_v040_base.sql -> no matches
$ grep -n "^-- [0-9]" apps/api/migrations/0000_v040_base.sql  -> banners 1-19 unchanged, RBAC appended as "20."
$ grep -n "extends BaseD1Repository" d1-role*.ts              -> no matches (both take plain `db: D1Database`)
```

Full diff (`git diff devs -- <4 modified files>` plus direct read of all 9 new files) reviewed
line-by-line against SECTION 4 of the plan: `packages/core/src/rbac/{permissions,types,evaluate}.ts`,
`packages/core/src/index.ts`, `apps/api/src/types.ts`, `apps/api/src/middleware/repository.middleware.ts`,
and both D1 repositories are byte-identical to the plan's specified code. No scope creep, no
undocumented deviation.

# Sprint Documentation
`RbacCorePrimitives` (roadmap 1/5) ships the RBAC vocabulary, storage and pure evaluator with
zero enforcement. New: `packages/core/src/rbac/{permissions,types,evaluate}.ts` (closed
7-permission vocabulary, `IRoleRepository`/`IRoleAssignmentRepository`, additive evaluator with
`hasPermission`/`canGrant`); `D1RoleRepository` and `D1RoleAssignmentRepository` as system-table
adapters (no Branch, no `apiToDb`/`dbToApi`); `roles`/`role_permissions`/`user_role_assignments`
tables plus `users.is_active`, all folded into `0000_v040_base.sql` in place per the project's beta
reset policy (no new migration file). Scope decay (assignments on a deleted/missing seed grant
nothing) is resolved with a `LEFT JOIN seeds` predicate at read time, covered by a dedicated
revive-on-restore test. `AllowAllRoleGuard`, `requireAdmin()`, `factory.ts` and every
`features/`/dashboard file are deliberately untouched — this sprint is additive-only, verified
by a clean `apps/api` typecheck (32 pre-existing errors, none new) and a full green test suite
(1540 + 827 tests). One non-blocking design gap found: `D1RoleRepository.update()`'s system-role
guard doesn't extend to the permission-replacement statements in the same batch — harmless now
(no caller), but must be addressed before `RbacUserRoleAdminApi` wires a route to it. Known,
documented lockout risk for the next sprint: `user_role_assignments` ships empty, so
`RbacRequestEnforcement` must grant `SuperAdmin` to the `POST /auth/setup` account in the same
transaction that creates it, or the dashboard becomes unreachable the moment enforcement goes live.

## Handoff (Human Gate)
STOP here per stage contract — human decides next step (merge + `pnpm pipeline next`, since this
is sprint 1/5 of a multi-sprint feature, not the final sprint).
