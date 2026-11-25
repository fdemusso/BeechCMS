# Execution Log — DashboardDataScopeClosure

Branch: `feature/dashboard-data-scope-closure` (from `devs`). No commit made.

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `ActivityLogVisibility` exported from `@beechcms/core` with the T1 shape; `visibility` optional on `ActivityLogListOptions` and `CountSinceOptions`. No runtime code, no new dependency.
- [x] `D1ActivityLogRepository` implements all seven T2 cases via `json_each(?)`. No `IN ()`. Filter sits before `LIMIT`.
- [x] `stats/total`, `stats/breakdown`, `stats/recent-activity` are `authenticated` rows; handlers derive readable seeds only via `resolveEffectivePermissions` + `filterSeedsByPermission` / `hasPermission`.
- [x] `media-library` / `unused-media` require `content:read@*`. `setup-checklist` requires `manage_users@*`. `health` / `cloudflare` / `storage/sync` require `view_analytics@*`. No catch-all stats row remains.
- [x] Null `entity_slug` rows reach a caller only with `manage_users@*`.
- [x] Out-of-perimeter `?slug=` gets 200 `[]`, never 403.
- [x] `stats/total` reads time from `context.get('clock')`; no `SystemClock` left in that handler (`health` / `cloudflare` keep it, out of scope).
- [x] Isolation `viewer` never receives slug, label, count, activity row, email or detail of `authors` / `categories` (covered by `stats-scope-isolation.integration.test.ts`).
- [x] All nine stats response shapes unchanged; dashboard typechecks with only the T5 comment edit.
- [x] `stats.handler.ts` imports nothing from another `features/*` slice; the test file imports nothing from another slice or test file.
- [x] New tests follow `testing_conventions.md` (SPDX header, four zones, status first, typed bodies, no `any`, no `Date.now()`, no `it.only`/`skip`).
- [x] `pnpm run build` (core), `npx tsc --noEmit` (dashboard), `pnpm beech test`, `pnpm beech lint` pass. `npx tsc --noEmit` (api): see note.

## Validation

```
cd packages/core && pnpm run build            -> tsc, 0 errors
cd apps/dashboard && npx tsc --noEmit         -> No errors found
cd apps/api && npx tsc --noEmit               -> 51 errors in 12 files, none in touched files (see note)
pnpm beech test --diff                        -> api integration 95 files / 680 tests passed; changed-line coverage 100% (d1-activity-log.repository.ts)
pnpm beech test                               -> exit 0; dashboard 206 files / 1515 tests passed; api integration 95 files / 680 tests passed
  stats-scope-isolation.integration.test.ts   -> 15 passed
  d1-activity-log.repository.test.ts + permission.middleware.test.ts -> 29 passed
pnpm beech lint                               -> 19/19 tasks successful
graphify update . --force                     -> graph.json updated
```

Note: the 51 api `tsc` errors sit in other files (`Env.MEDIA_BUCKET` missing, tag/option typings in `settings-storage`, `seed-media-purge`, `public-search-index`, ...). None touch the stats, activity-log or permission files.
