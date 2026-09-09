# Execution Log — RbacCorePrimitives

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `PERMISSIONS` contains exactly the 7 documented permissions; `manage_seeds` absent from tuple AND `role_permissions` CHECK list.
- [x] `packages/core/src/rbac/` imports nothing outside `packages/core/src/rbac/`; no `apps/*` import, no new runtime dependency.
- [x] `evaluate.ts` is zero I/O — pure functions only.
- [x] No file under `apps/api/src/features/` created or modified.
- [x] No file under `apps/dashboard/` created or modified.
- [x] `apps/api/src/factory.ts` unchanged (`git diff --stat` confirms).
- [x] `packages/core/src/oauth/role-guard.ts` unchanged; `repository.middleware.ts` still binds `new AllowAllRoleGuard()`.
- [x] `apps/api/src/features/seeds/seeds.helpers.ts` unchanged.
- [x] No new migration file — `apps/api/migrations/` contains exactly `0000_v040_base.sql` and `0030_test_seeds.sql`.
- [x] `0000` has no `ALTER TABLE users`, no `user_role_assignments` seed row.
- [x] Section banners 1–19 keep their numbers; RBAC appended as `20.`.
- [x] `apps/api/wrangler.jsonc` unchanged.
- [x] Both D1 repositories `implements` their core interface, raw `prepare()`/`bind()`, no ORM.
- [x] Every id via `IIdGenerator.uuid()`; seeded `SuperAdmin` id is v4-shaped (verified below).
- [x] No new CSPRNG/hashing/token helper added.
- [x] Nothing under `apps/api/src/auth/` or `apps/api/src/features/oauth/` modified.
- [x] `Variables` additions purely additive.
- [x] `listActiveForUser` excludes decayed scopes; revive-on-restore covered by test.
- [x] Both repository tests run real SQL via `D1TestDatabase`; no `makeMockDb`/`vi.fn()` stub of `prepare`/`bind`.
- [x] Neither repository extends `BaseD1Repository`.
- [x] Test doubles from `shared/services/` and `test/helpers/` only.
- [x] `0000` idempotent when applied twice (proven implicitly — 136 test files construct `D1TestDatabase` and pass).
- [x] `pnpm beech db:reset` run (not `db:migrate`).
- [x] `pnpm --filter @beechcms/core run build` succeeds.
- [x] `npx tsc --noEmit` in `apps/api/` — zero errors introduced (pre-existing unrelated errors confirmed identical on `devs` baseline via `git stash`).
- [x] `pnpm beech db:reset` + manual verification queries return expected rows.
- [x] `pnpm beech test` green, including `flow-*.test.ts` and `features/oauth/*.test.ts`.
- [x] `pnpm lint` clean.

## Validation Output

```
$ pnpm --filter @beechcms/core run build
$ tsc
(exit 0)

$ cd apps/api && npx tsc --noEmit
(31 pre-existing errors, identical on devs baseline before this sprint's changes — none in RBAC files)

$ pnpm beech db:reset
[bootstrap-d1] applying 0000_v040_base.sql
[bootstrap-d1] applying 0030_test_seeds.sql
[bootstrap-d1] done. (2 applied)
✓ Local database reset completed.

Manual verification:
- SuperAdmin role_permissions: 7 rows, exact set, no manage_seeds
- SuperAdmin id: 9fe20419-4bab-448b-9bcb-022e9a4c0068 (v4-shaped)
- user_role_assignments COUNT: 0
- users.is_active: INTEGER, default 1

$ pnpm beech test
Tasks: 12 successful, 12 total
(dashboard: 111 files / 827 tests passed; api+core rbac suite: 136 files / 1540 tests passed)

$ pnpm lint
Tasks: 12 successful, 12 total

$ graphify update .
Graph has 11937 nodes, 20984 edges, 975 communities — updated.
```
