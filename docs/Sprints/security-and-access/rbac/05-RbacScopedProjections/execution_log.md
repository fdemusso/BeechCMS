# Execution Log — `RbacScopedProjections`

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `apps/api/src/shared/rbac/scoped-projection.ts` exists, exports exactly `filterSeedsByPermission`, `serializeEffectivePermissions`, `EffectivePermissionsPayload`, imports nothing from `apps/api/src/features/**`.
- [x] `packages/core/**` has zero diff. No new core export.
- [x] `apps/api/migrations/**` has zero diff.
- [x] `apps/dashboard/**` has zero diff.
- [x] `GET /api/settings/me` returns every pre-existing key unchanged, plus `permissions` and `isDeveloper`. Arrays sorted deterministically.
- [x] A zero-trust account gets `200` from `/api/settings/me`, `/api/schema`, `/api/content/drafts`, `/api/search` — empty payloads, never 500/403.
- [x] `GET /api/schema` returns a bare array containing only seeds the caller holds `content:read` on; global holder gets every seed.
- [x] `GET /api/content/drafts` and `GET /api/search` are `{ kind: 'authenticated' }` in `PROTECTED_ROUTES`; no row added/removed/reordered.
- [x] `GET /api/search?schema_slug=<unreadable>` returns `200 { items: [], total: 0 }`, repository not called.
- [x] `isDeveloper` derives only from `users.role === 'admin'`; `manage_seeds` still absent (grep matches only comments/tests).
- [x] `apps/api` typecheck: 0 errors (see note below). `apps/dashboard` typecheck: 0.
- [x] `pnpm --filter @beechcms/api test` and `pnpm --filter @beechcms/core test` fully green; `pnpm lint` green.
- [x] `test/flow-rbac-projections.test.ts` covers all 8 T7 steps, seeds users only through `seedTestUsers()`.
- [x] No production code weakened to keep a pre-existing test green. Adapted tests listed below.

**Deviation from plan, approved mid-execution by the user:** the plan's SECTION 5 baselined `apps/api` typecheck at 32 pre-existing errors and required the count "not grow." The user instructed fixing all pre-existing errors instead of preserving the baseline. Result: **0 errors**, not 32. Fixes were type-only (test fixtures, casts) — no production code changed:
- Added missing `label` / `displayNameAlias` fields and removed an invalid `id` field on `Seed`/`Branch` literals in `full-text-search.test.ts`, `semantic-search.hooks.test.ts`, `semantic-search.worker.test.ts`, `d1-vector.repository.test.ts`.
- Cast `res.json()` results in `full-text-search.test.ts`, `public-search.router.test.ts`, `api-key-middleware.test.ts` (previously untyped `unknown`).
- Non-null-asserted two mock-array lookups in `semantic-search.worker.test.ts`.
- Fixed a mismatched mock signature and an untyped `c.get()` in `rate-limit.middleware.test.ts`.
- Replaced a DOM-only `RequestCache` reference in `packages/client/src/types.ts` with a local `FetchCacheMode` union (that package's own `tsconfig.json` already includes `lib: ["DOM"]`, but its source is also type-checked in-place as part of `apps/api`'s `tsc --noEmit`, whose `lib` is `["ESNext"]` only).

**Other test adaptation:** `src/middleware/permission.middleware.test.ts` — `resolveRouteRule('GET', '/api/content/drafts')` assertion updated from `{ kind: 'permission', permission: 'content:read' }` to `{ kind: 'authenticated' }`, per T6.

## Validation — success output

```
$ pnpm --filter @beechcms/core run build
$ tsc
(clean)

$ cd apps/api && npx tsc --noEmit | grep -c "error TS"
0
$ cd apps/dashboard && npx tsc --noEmit
(clean, 0 errors)

$ grep -rn "features/" apps/api/src/shared/rbac/
(only a pre-existing comment in effective-permissions.ts; no import)
$ grep -rn "from '\.\./\(oauth\|seeds\|rbac\|content\|settings\)" apps/api/src/features/{schema,draft,search,settings}
(only pre-existing, unrelated to this sprint: draft.{handler,middleware}.ts -> '../content/constants'; settings test self-import)

$ git diff devs -- apps/api/src/features apps/api/src/shared | grep -iE "SELECT |INSERT |UPDATE |DELETE FROM"
(empty)

$ git diff devs --stat -- apps/api/migrations apps/dashboard
(empty)

$ npx vitest run src/shared/rbac/scoped-projection.test.ts src/features/search/handlers/full-text-search.test.ts src/middleware/permission.middleware.test.ts test/flow-rbac-projections.test.ts test/flow-rbac-enforcement.test.ts test/flow-rbac-admin.test.ts test/flow-rbac-invitations.test.ts test/flow-draft-management.test.ts test/flow-content-management.test.ts test/flow-system-schema.test.ts
Test Files  10 passed (10)
     Tests  70 passed (70)

$ pnpm --filter @beechcms/core test
Test Files  37 passed (37)
     Tests  659 passed (659)

$ pnpm --filter @beechcms/api test
Test Files  148 passed (148)
     Tests  1607 passed (1607)

$ pnpm lint
Tasks:    12 successful, 12 total

$ graphify update .
Code graph updated. 12355 nodes, 21819 edges, 945 communities.
```

`pnpm beech dev` runtime smoke (item 8) was not executed in this session — no Docker/D1 dev stack was started. Everything else in SECTION 5 was run and is green.
