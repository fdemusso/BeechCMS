# Verdict
PASS

# Findings
No blocking findings. Non-blocking notes (no rework needed):

1. `apps/api/src/features/settings/settings.handler.test.ts` (`tooLargePins`) and `settings-ui-preferences.integration.test.ts` (`refusals`, over-size row): `'é'.repeat(199)` is a magic value with no comment (`testing_conventions.md` §6.2(2)). The core test comments the same construction; these two copies do not. Nit only, the plan's required comments are all present.
2. Review scope note: the sprint's work is uncommitted (staged/modified in the working tree on `feature/ui-preferences-api`), so `git diff devs...HEAD` does not contain it (it holds only older, already-archived commits). Reviewed `git diff HEAD` + the four new files instead. The human must commit before merging.

# Verification Evidence

Commands re-run by me (not trusting `execution_log.md`):

| # | Command | Observed |
|---|---------|----------|
| 1 | `cd packages/core && pnpm run build` | `tsc` clean |
| 2 | `cd packages/core && npx vitest run src/settings/ui-preferences.test.ts` | 1 file, 20 passed |
| 3 | `cd apps/api && npx tsc --noEmit` | no errors (incl. `invitations.public.test.ts` double) |
| 4 | `npx tsc --noEmit -p apps/dashboard/tsconfig.app.json` | no errors |
| 5 | `pnpm beech lint` | 19/19 tasks successful |
| 6 | `cd apps/api && npx vitest run src/features/settings src/shared/db/repositories/d1-user.repository.test.ts src/middleware/permission.middleware.test.ts src/features/rbac/invitations.public.test.ts` | 5 files, 164 passed |
| 7 | `cd apps/api && npx vitest run --config vitest.workers.config.ts src/features/settings` | 9 files, 59 passed |
| 7b | same config, `settings-ui-preferences.integration.test.ts -t "invisible"` | passes alone (isolation / no ordering dependency) |
| 8 | `pnpm beech db:reset` then `pnpm beech db:migrate`; `pragma_table_info('users')` for `ui_prefs` | migrations applied; `type TEXT`, `notnull 1`, `dflt_value '{}'` |
| 9 | `pnpm beech test --diff` | "every selected test run passed"; changed-line coverage PASS (`d1-user.repository.ts` 100%) |
| 10 | `grep -rln ui_prefs apps/api/src --include='*.ts'` | only `d1-user.repository.ts`, `d1-user.repository.test.ts`, `settings-ui-preferences.integration.test.ts` |
| 11 | `graphify affected` NOT re-run (it rewrites the tracked graph); replaced by `grep -rln parseStoredUiPreferences apps packages` | only `settings.handler.ts`, core module + its test, and the `user.repository.ts` doc comment. Matches the expected consumer set. |

Runtime verification: the sprint adds API routes only (no dashboard change). The real-D1 integration tier (`createBeechApp` + full middleware chain + migrated D1, no fake repositories) exercises both routes end to end: viewer PUT 200 and column holds exact JSON, replace semantics, admin→editor isolation, 400 refusals with unchanged column, corrupt stored value reads empty. I did not start `pnpm beech dev` or issue manual HTTP calls; the integration tier is the runtime evidence.

Invariant audit:
- No D1 access outside `d1-user.repository.ts`; handler uses `context.get('userRepository')` only. No content data touched, no hardcoded field names.
- No cross-slice imports (settings handler imports only core + shared utils).
- Nothing from SECTION 7: `git status` shows no change under `apps/dashboard`, no `wrangler.jsonc`, `UserRecord`, `settings.schema.ts`, or `notification_prefs` edit. No `logActivity` on PUT (comment present).
- Both routes read the user id from `jwtPayload.sub` only; no path/query/body user id.

Plan conformance:
- Building blocks verbatim: SQL DDL matches; constants (8 / 200 / 2048), `UiPreferences`, `UiPreferencesInput`, `uiPreferencesSchema: z.ZodType<UiPreferences, UiPreferencesInput>`, `EMPTY_UI_PREFERENCES` (frozen incl. array), `uiPreferencesByteLength`, `parseStoredUiPreferences`, `IUserRepository` signatures + JSDoc, two `AUTHED` rows (position after `PUT /notifications`), three error codes and mapper order (`malformed`/root `invalid_type` first, then `unrecognized_keys`, root `custom`, else `invalid`) all match.
- Decisions: PUT replaces whole container and answers 200 with stored value; 404 on null / false; no activity log; barrel export placed after `site-settings.repository.js`; core gains no dependency; SQL statements exactly as specified; `0044` has banner + one ALTER only.
- Deliverables list matches SECTION 3 exactly, nothing beyond.

Test audit (§8): single tier per file and correct placement; SPDX headers present (core test uses BUSL like its neighbour `account-email.test.ts`); four zones, one ACT, named results; status asserted first; bodies typed (no `any` in new code; existing `buildApp(mocks: any)` helper reused as the plan allowed); every write asserts persisted column, every rejection asserts column unchanged (asserting the value of the arranged PUT, not just `'{}'`); integration uses harness + real D1 with canonical users, no fake repos; required §6.2 comments present (regression guards, corrupt-value simulation, deliberate omission, viewer-no-RBAC coupling, INSERT OR IGNORE coupling). Only nit: finding 1.

Acceptance criteria SECTION 6: all 11 items verified above and pass.

# Sprint Documentation
- Shipped (BeechPal sprint 8, `UiPreferencesApi`): per-user UI preferences container. Migration `0044` adds `users.ui_prefs TEXT NOT NULL DEFAULT '{}'`, deliberately separate from `notification_prefs`; existing rows read the default, no backfill.
- `@beechcms/core` owns the contract: `uiPreferencesSchema` (strict, one key `palettePins`: ≤8 distinct non-empty ids, ≤200 chars each, container ≤2048 UTF-8 bytes), `EMPTY_UI_PREFERENCES`, `parseStoredUiPreferences` (tolerant reader, never throws). `IUserRepository` gains `findUiPreferences` / `updateUiPreferences` (raw JSON string in/out; no parsing in the adapter).
- API: `GET`/`PUT /api/settings/ui-preferences`, `AUTHED`, keyed on the JWT subject only. PUT replaces the whole container (omitted key resets to default) and answers 200 with what was stored. Refusals are 400 with `ui-preferences-unknown-key` (`keys`), `ui-preferences-too-large` (`maxBytes`), `ui-preferences-invalid` (`field`), or the slice-wide `Invalid JSON body`.
- Decisions: no activity-log entry on PUT (cosmetic, frequent, would crowd the 30-row activity tab); a stored value that is invalid reads as empty, so GET never 500s on column contents; duplicates are refused rather than deduplicated.
- No deviations from the plan. No dashboard change; sprint 9 (`BeechPalPins`) is the consumer.
- Known limitations: the container is intentionally not a generic store (one key, no PATCH/merge, no per-key routes); pin ids are opaque to the server (not validated against palette ids); the stale `users` DDL in `packages/cli/src/commands/init.ts` is untouched (separate issue).
