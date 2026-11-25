# Execution Log — ViewInstancesDashboard

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `0034_drop_seed_layouts_view_config.sql` exists, applies on a clean DB and on an existing one, and `base-migration-upgrade.test.ts` passes unchanged.
- [x] `seedViewConfigSchema`, `SeedViewConfig`, `getViewConfig`, `setViewConfig`, `getViewConfigHandler`, `putViewConfigHandler`, `useKanbanViewConfig`, `fetchSeedViewConfig` and `updateSeedViewConfig` no longer exist (Validation step 7 prints nothing).
- [x] `permission.middleware.ts` lost exactly the two `/view-config` rows. Middleware registration order and every other row are byte-identical.
- [x] `packages/core/src/dashboard-layout/content-view.ts` and every other Sprint 1 file are unchanged.
- [x] `features/content-views` imports no other `@/features/*` module except `@/features/shared` (Validation step 8).
- [x] `use-content-table-config.ts` no longer imports from `@/features/content-toolbar`.
- [x] `buildFilterableColumns` exists once, in `@/lib/filter-dsl`. `content-toolbar` re-exports it, and its existing tests pass unmodified.
- [x] Every column reference written to `seed_views.config` by the dashboard is a `br_XX` id or one of `slug | status | created_at | updated_at` (`view-config-mapping.test.ts` cases 1, 2, 7).
- [x] `toContentViewConfig ∘ toViewToolbarState` is lossless for a fully populated config (test case 12).
- [x] Opening a view issues no PATCH. A change issues one PATCH per debounce window, and a change pending at view switch is flushed (autosave tests 1–2).
- [x] Users without `content:update` see no create/delete affordance, cannot edit the view name, and send no PATCH (settings-menu + autosave test 3).
- [x] The `?status=` prefilter is never persisted into a view (`STATUS_PREFILTER_CONDITION_ID` stripped into `persistableFilters`).
- [x] `activeViewId` is always an instance id; no component compares an instance id to a type string (`settings-menu.tsx`, `ContentListModals.tsx`, `content-list.tsx` read `activeViewType` / `view.type`).
- [x] The Kanban axis, sort, collapsed columns and card layout are owned per `ContentViewWorkspace` instance (keyed by `view.id`, state seeded from `view.config` at mount) — structurally two Kanban instances cannot share state. Not exercised against a running browser in this session (see note below).
- [x] `en.json` and `it.json` contain every key in Task 19 and `locales.test.ts` passes.
- [x] All new and edited tests follow `_config/testing_conventions.md`: unit tier, slice placement, SPDX header, four zones, one act, named act result, no `any`, no fake timers, no sleeping, canonical `posts` seed fixtures.
- [x] `npx tsc --noEmit` (api) has no new error. `pnpm run type-check` (dashboard), `pnpm lint`, `pnpm beech test --diff`, and the API unit + integration tiers pass.
- [ ] `git diff --stat` touches no file outside SECTION 3 — **one authorized exception**, see below.

**Deviation (explicitly authorized by the user, not in SECTION 3):** `packages/testing/package.json` and
`packages/testing/tsconfig.json`. Task 7/20 require the dashboard to depend on `@beechcms/testing` for
canonical seed fixtures, but that package shipped only raw `.ts` source with no build step. Importing it
pulled parameter-property syntax (e.g. `FakeTokenService`'s constructor) into the dashboard's
`tsconfig.app.json`, which has `erasableSyntaxOnly: true`, breaking `pnpm run type-check`. This was
rejected first (see history), then the user authorized fixing it directly: gave `packages/testing` the
same `tsc` build (`composite`, `declaration`, `outDir: dist`) and `dist`-pointing `exports`/`main`/`types`
that `@beechcms/core` already has, plus a `"build": "tsc"` script. No source file inside
`packages/testing` was touched. `turbo.json`'s existing `dependsOn: ["^build"]` wiring on `test`/
`type-check`/`lint` picks this up with no further orchestration changes. `pnpm-lock.yaml` updated as a
mechanical side effect of the resulting `pnpm install`.

## Validation command output

```
# 1. packages/core
$ pnpm run build          → tsc: no errors
$ pnpm test                → 54 files, 935 tests passed (full suite; seed-layout.test.ts and
                              content-view.test.ts both included and green)

# 2. apps/api typecheck
$ npx tsc --noEmit         → 8 errors, all pre-existing, all in files this sprint did not touch
                              (import-chunk.worker.test.ts, media-transform.test.ts,
                              display-name.test.ts, cloudflare-images.transformer.test.ts,
                              d1-test-database.ts) — same count as recorded before this sprint.

# 3. Migration
$ pnpm beech db:reset      → 6 migrations applied incl. 0034, local DB reset OK
$ pnpm beech db:migrate    → DB already initialized, migrations applied successfully

# 4. apps/api unit + integration
$ pnpm run test:unit        → 126 files, 1414 tests passed
$ pnpm run test:integration → 22 files, 152 tests passed (incl. content-views.integration.test.ts,
                               base-migration-upgrade.test.ts)

# 5. apps/dashboard typecheck, tests, lint
$ pnpm run type-check → tsc -b: no errors
$ pnpm test           → 148 files, 1043 tests passed
$ pnpm lint           → ESLint: No issues found

# 6. Workspace regression, scoped to changed packages
$ pnpm beech test --diff
  packages/core:    3 files, 64 tests passed, coverage thresholds met
  apps/dashboard:   40 files, 318 tests passed, coverage thresholds met
  apps/api:         20 unit files/120 tests + 22 integration files/152 tests passed, coverage met
  → PASS All 12 changed file(s) meet coverage thresholds.

# 7. Legacy chain gone
$ git grep -n "view-config\|getViewConfig\|setViewConfig\|SeedViewConfig\|seedViewConfigSchema\|
  useKanbanViewConfig\|fetchSeedViewConfig" -- apps/api/src apps/dashboard/src packages/core/src
  → (no output)

# 8. Slice isolation
$ git grep -n "@/features/" -- apps/dashboard/src/features/content-views | grep -v "@/features/shared"
  → (no output)

# 9. Graph sync
$ graphify update . --force → Rebuilt: 24598 nodes, 36305 edges, 2302 communities
```

**Runtime check** (Section 5's manual browser walkthrough) was not performed interactively in this
session — no running dev server / browser available here. Everything it exercises is covered structurally
by the automated suites above (autosave tests, round-trip mapping test, RBAC-gated affordance tests,
integration tests against real D1).
