# Execution Log — TrashRetentionSweep

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `DEFAULT_TRASH_RETENTION_DAYS = 14`, `MAX_RETENTION_DAYS = 36500`, `isValidRetentionDays` and `resolveRetentionDays` are exported from `@beechcms/core`. The module is pure and imports only core types.
- [x] Seed validation accepts `retentionDays: 0` and rejects negative, non-integer and `> 36500` values.
- [x] `ContentRepository.findExpiredByRetention(seed, retentionDays, now, limit)` is the only signature. Effective `0` returns `[]` without a query. Both implementations match.
- [x] `SiteSettings.trashRetentionDays` is required. D1 reads an absent key as 14, a stored `'0'` as 0 and a malformed value as 14.
- [x] `GET /api/settings` returns `trashRetentionDays`. `PUT /api/settings` persists valid values and answers 400 `settings-invalid-trash-retention` with nothing stored for invalid ones, including `null`.
- [x] `GET /api/content/:slug/trash` returns `retentionDays` = the effective retention for that seed.
- [x] `runRetentionSweep`:
  - [x] purges only trashed entries past their effective retention, oldest first;
  - [x] attempts at most 25 per run;
  - [x] skips effective-`0` seeds without querying;
  - [x] isolates failures per seed and per id;
  - [x] treats `EntryNotFoundError` as a no-op.
- [x] Every sweep purge goes through `ContentRepository.purge` on a repository built **with** `R2DeletionLedger`, and the ledger event carries `actorId: null`.
- [x] R2 media of a swept entry is deleted through `deleteR2Objects`. A cleanup failure never marks the id failed.
- [x] A failed settings read purges nothing (no fallback to the default).
- [x] `scheduled()` runs the sweep only on ticks where `getUTCMinutes() % 5 === 0`, inside `ctx.waitUntil` with its own try/catch. Seed-media-purge and cron automations are unaffected.
- [x] Hand-written docs describe the sweep, the global setting, the seed override and `0`. No doc or JSDoc still says retention is unwired.
- [x] No file under `apps/dashboard`, `factory.ts`, `permission.middleware.ts` or `apps/api/migrations` changed.
- [x] No cross-slice import was added (`features/content` ↔ `features/settings`). The sweep issues no SQL of its own.
- [x] All SECTION 5 commands pass. `apps/api` `tsc` stays at the baseline error set.

## SECTION 5 — VALIDATION

| Command | Result |
|---|---|
| `pnpm --filter @beechcms/core run build` | OK (`tsc`, no errors) |
| `pnpm --filter @beechcms/core test` | 66 files, 1270 tests passed |
| `npx tsc --noEmit` (apps/api) | 69 errors, same count as baseline; none in files touched by this sprint |
| `pnpm --filter ./apps/api test` | unit+flow: 186 files, 2135 tests passed; integration: 85 files, 530 tests passed |
| `npx tsc --noEmit` (apps/dashboard) | 0 errors |
| `pnpm --filter ./apps/dashboard test` | 181 files, 1305 tests passed |
| `pnpm lint` | 19/19 tasks successful |
| `pnpm beech test --diff` | PASS; changed-line coverage 16 files meet threshold (`trash.ts`, `delete.ts` not measurable on the workerd tier; covered by `trash-retention.integration.test.ts`) |
| `node scripts/check-test-placement.mjs` | OK |
| `node scripts/docs-fact-check.mjs` | PASSED |
| `rg "No scheduler is wired\|NOT wired to any scheduler\|positive integer >= 1" …` | no output |
| `graphify update . --force` | 27869 nodes, 40242 edges, 2744 communities |

## Notes

- `site-settings.repository.d1.ts`: an empty or whitespace stored value reads as the default (`Number('')` would otherwise read as `0`, "never purge").
- Work stays on `feature/universal-soft-delete`, as the plan states it is not merged until sprint 3. Nothing is committed.
