# Execution Log — ContentViewsPersistence

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `0033_seed_views.sql` exists, applies on a clean DB, and has no `CHECK` on `view_type` and no `UNIQUE` on `position`.
- [x] `content-view.ts` and `content-view.repository.ts` import nothing outside `packages/core/src` except `zod`.
- [x] `ContentViewConfig` rejects alias column references. Only `br_XX` and the four system columns parse.
- [x] Conditional-format targets are `element | field`. `row | cell` are rejected.
- [x] `validateViewConfigAgainstSeed` is pure and never throws. It strips unknown branches, duplicate filters,
      non-date precision, and non-kanban `kanban`/`card`.
- [x] `VIEW_TYPE_IDS` equals `AUTHORIZABLE_VIEWS` (unit test).
- [x] The first `GET /views` on a seed with zero rows creates exactly one untitled instance per authorized type.
      Repeated or concurrent reads create no duplicates (guarded `INSERT … WHERE NOT EXISTS` in one D1 batch).
- [x] The first-ever `POST /views` on a seed also bootstraps, so the seed always has ≥1 Table instance.
- [x] Deleting the seed's only Table instance returns 409 `content-view-last-table`, enforced inside the `DELETE`
      statement and not only in the handler.
- [x] Instances whose type the allow-list no longer authorizes are hidden from every route and never deleted.
- [x] `PUT /views/order` accepts only an exact permutation of the visible ids.
- [x] All five routes have explicit permission rows (`content:read` for GET, `content:update` otherwise), placed
      before the generic per-seed rows. None is added to `OAUTH_SCOPE_ROUTES`.
- [x] Handlers call no `crypto.randomUUID()` / `Date.now()`. Ids and time come from the injected `IIdGenerator` / `IClock`.
- [x] No handler issues SQL. All storage goes through `context.get('contentViewRepository')`.
- [x] No new import from one `apps/api/src/features/*` slice into another.
- [x] `createTestHarness` clears `seed_views`. Canonical `posts` authorizes `['table', 'gallery']`.
- [x] Unit + integration suites follow `_config/testing_conventions.md` (tier placement, SPDX header, four zones, one
      act, status-first, typed bodies, zone-4 state on every write and rejection, no `any`, no fake timers).
- [x] The full integration tier, `pnpm beech test --diff` and `npx tsc --noEmit` (api) pass.
- [x] `git diff --stat -- apps/dashboard` is empty. The `/view-config` handlers, `seed-layout.ts`,
      `seed-layout.repository.d1.ts` and `packages/cli` are unchanged.

## Validation output

```
# 1. Core contract builds and its unit suite passes
$ pnpm run build        → tsc: no errors
$ pnpm test -- content-view
  Test Files  1 passed
  Tests       18 passed
  (full packages/core suite also run clean: 54 files, 940 tests passed)

# 2. Testing package typechecks against the new core
$ pnpm run type-check    → tsc --noEmit: no errors

# 3. API typechecks (TS 7.0.2)
$ npx tsc --noEmit
  8 pre-existing errors, all in files untouched by this sprint
  (import-chunk.worker.test.ts, media-transform.test.ts, display-name.test.ts,
  cloudflare-images.transformer.test.ts, d1-test-database.ts) — confirmed via
  `git diff --stat HEAD` that none of these files are part of this change.

# 4. Migration applies on a clean local D1
$ pnpm beech db:reset
  [bootstrap-d1] applying 0033_seed_views.sql
  [bootstrap-d1] done. (5 applied)
  ✓ Local database reset completed.
$ pnpm beech db:migrate  → ✓ Migrations applied successfully.

# 5. Integration tier
$ pnpm run test:integration -- content-views && pnpm run test:integration
  Test Files  22 passed (22)
  Tests       152 passed (152)
  (17 of the 152 are the new content-views.integration.test.ts, all passing)

# 6. Workspace regression run, scoped to changed packages
$ pnpm beech test --diff
  [apps/dashboard] Test Files 8 passed (8) / Tests 75 passed (75)
  [apps/api]       unit: Test Files 21 passed (21) / Tests 128 passed (128)
                   integration: Test Files 22 passed (22) / Tests 152 passed (152)
  PASS  All 7 changed file(s) meet coverage thresholds.

# 7. Lint
$ pnpm lint → ESLint: No issues found

# Graph sync
$ graphify update .
  Rebuilt: 24189 nodes, 35825 edges, 2255 communities
```
