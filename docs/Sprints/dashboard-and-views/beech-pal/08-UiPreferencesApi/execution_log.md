# Execution Log — UiPreferencesApi

## SECTION 6 — Acceptance Criteria

- [x] `PALETTE_PINS_MAX`, `PALETTE_PIN_ID_MAX_LENGTH`, `UI_PREFERENCES_MAX_BYTES`, `uiPreferencesSchema`, `UiPreferences`, `UiPreferencesInput`, `EMPTY_UI_PREFERENCES`, `uiPreferencesByteLength`, `parseStoredUiPreferences`, `IUserRepository.findUiPreferences` / `updateUiPreferences`, the route rows and the three error codes match SECTION 4 verbatim.
- [x] Core gains no dependency; the new core module is exported from the barrel.
- [x] `0044_users_ui_prefs.sql` holds exactly the one `ALTER TABLE … ADD COLUMN` (plus its banner). No `wrangler.jsonc` edit, no applied migration edited, no backfill.
- [x] `GET /api/settings/ui-preferences` returns the caller's container; empty or invalid stored value reads `{ palettePins: [] }`; never 500.
- [x] `PUT /api/settings/ui-preferences` replaces the container, answers 200 with what was stored, writes no activity log row.
- [x] Unknown key, pin cap, id length, duplicate id and byte cap refused with 400 and the SECTION 4 codes; refused write changes nothing.
- [x] Both routes `AUTHED`, keyed on `jwtPayload.sub` only; integration test proves isolation.
- [x] `notification_prefs`, its routes, `UserRecord`, `GET /settings/me` unchanged.
- [x] No SQL outside `apps/api/src/shared/db/repositories/`. No cross-slice import.
- [x] No file under `apps/dashboard` modified. Dashboard `tsc` passes.
- [x] SECTION 5 commands pass (see below; item 9 note).

## SECTION 5 — Validation

1. `packages/core` `pnpm run build` → OK.
2. `vitest run src/settings/ui-preferences.test.ts` → 20 passed.
3. `apps/api` `npx tsc --noEmit` → clean.
4. `npx tsc --noEmit -p apps/dashboard/tsconfig.app.json` → clean (after `apps/api` `pnpm run build` refreshed the gitignored `dist` types the dashboard reads).
5. `pnpm beech lint` → 19/19 tasks successful.
6. `apps/api` unit run (settings, d1-user repo, permission middleware, invitations.public) → 5 files, 164 passed.
7. `apps/api` `vitest.workers.config.ts src/features/settings` → 9 files, 59 passed.
8. `pnpm beech db:reset` + `db:migrate` → applied; `PRAGMA table_info(users)`: `ui_prefs TEXT notnull=1 dflt_value='{}'`.
9. `pnpm beech test --diff` (new files marked `git add -N` so the diff sees them) → core 1 file / 20 passed, dashboard 72 / 652, api unit 24 / 295, api integration 100 / 759; changed-line coverage PASS (`ui-preferences.ts` 100%). "every selected test run passed".
10. Boundary grep `ui_prefs` in `apps/api/src` → only `d1-user.repository.ts`, `d1-user.repository.test.ts`, `settings-ui-preferences.integration.test.ts`.
11. `graphify update . --force` done; `graphify affected "parseStoredUiPreferences()"` → core test file (handler consumers not resolved by graph; plan docs only).
