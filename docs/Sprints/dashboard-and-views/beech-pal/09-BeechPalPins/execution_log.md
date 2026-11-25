# Execution Log — BeechPalPins

Branch: `feature/beechpal-pins` (from sprint 8 commit `eb621aeb`). Nothing committed.

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `PalettePinsState`, `PalettePinsApi`, `usePalettePins`, `PIN_PROVIDER_ID`, `toPinRowId`, `pinSourceId`, `createPinsProvider`, `PIN_ACTION_ID`, `UNPIN_ACTION_ID`, `withPinActions` match their Section 4 signatures.
- [x] Pins read and written only through `rpc.api.settings["ui-preferences"]`. Query key carries the user id. No `features/settings` import (grep: 0 matches).
- [x] Cache changes only from a 200 PUT response (`onSuccess` → `setQueryData`). Failed write toasts `pins.saveFailed`, list untouched.
- [x] No PUT while not loaded, saving, at `PALETTE_PINS_MAX`, or for an already pinned / unpinned id.
- [x] *Pinned* only on idle root, after context actions, before Recent, stored order. Pinned ids excluded from Recent (`exclude`).
- [x] Pinned row ids are `pin:<sourceId>`. Disabled exactly when source is. Unresolved pin omitted until schema loaded, then enabled *Unavailable item* row whose Enter unpins.
- [x] Pin/Unpin appended to every row whose stable id resolves (source, recent copy, pinned copy), no other row.
- [x] Mod+Enter on a stable row with no other action pins it. Shift+Enter lists the pin action.
- [x] `exclude` optional; existing `recent-items-provider.test.ts` cases unedited and green.
- [x] No change in `apps/api`, `packages/*`, `types.ts`, `index.ts`, `_parts/*`, `pages/*`. No new component, token, permission.
- [x] All nine `commandPalette.pins.*` strings in `en.json` and `it.json`.
- [x] tsc, lint, design-token check, scoped vitest, dashboard build pass. Existing cases unedited (only shared rpc mock and `beforeEach` changed).
- [x] `docs/features/command-palette.md` describes Pinned.

## VALIDATION

- `npx tsc --noEmit -p apps/dashboard/tsconfig.app.json` → no errors.
- `npx vitest run src/features/command-palette src/pages src/test/cross-slice` (apps/dashboard) → 47 files passed, 432 tests passed.
- `pnpm beech lint` → 19/19 tasks successful.
- `node scripts/check-design-tokens.mjs --format agent .../command-palette.tsx` → no output (clean).
- `pnpm --filter @beechcms/dashboard build` → built.
- `pnpm beech test --diff` → PASS tests, PASS changed-line coverage (10 files).
- `graphify update . --force` → 19539 nodes, 46234 edges.
- `graphify affected "withPinActions()"` / `"createPinsProvider()"` → palette slice files, their tests, plus `pages/app-command-palette.tsx` (transitive consumer of `CommandPalette`) and the plan doc. No other slice.
- grep `@/features/` (non-test, excluding `shared`) in command-palette slice → 0 matches.

## NOT DONE (human)

- Manual gate (Section 5, dev stack).
