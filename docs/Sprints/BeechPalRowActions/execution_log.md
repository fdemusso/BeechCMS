# Execution Log — BeechPalRowActions

## Acceptance Criteria

- [x] `PaletteRowAction`, `PaletteItem.actions`, `CommandPage` `"actions"`, the narrowed `PalettePerform` page member and the two `CommandPaletteState` members match Section 4 verbatim.
- [x] `paletteKeyBinding` and `toActionRows` match their signatures and are pure.
- [x] Every other provider, `src/pages/*`, the barrel and the existing test cases compile and pass unedited.
- [x] Mod+Enter on an enabled row with actions runs its first action through the same path as Enter (`runPerform`).
- [x] Mod+Enter and Shift+Enter never run the primary action (`preventDefault` on every chord; test on the calculator row).
- [x] Shift+Enter opens the actions page for the selected row; the page lists its actions under its label; target frozen at opening.
- [x] Leaving the actions page restores the root query (`popPage`); closing clears target and stored query.
- [x] No binding acts on a disabled row; a row without actions is a no-op for both chords.
- [x] Search rows expose Copy ID (value = entry id); computed rows expose no actions.
- [x] Root footer shows both hints only when the selected row has actions; sub-pages keep the back hint.
- [x] Row and footer key caps use `Kbd`/`KbdGroup`; modifier label from `MOD_KEY_LABEL`.
- [x] Cmd/Ctrl+K, Alt+N and Backspace-on-empty unchanged (existing cases pass).
- [x] Three locale keys in `en.json` and `it.json`; no string literal in JSX.
- [x] `features/command-palette` imports no feature slice besides `@/features/shared`.
- [x] Design-token check clean on the three `.tsx` files; tsc, lint, scoped vitest and dashboard build pass.
- [x] `docs/features/command-palette.md` lists both new bindings.

## Validation

- `npx tsc --noEmit -p apps/dashboard/tsconfig.app.json` → `TypeScript: No errors found`
- `npx vitest run src/features/command-palette src/pages/palette-providers.test.ts src/test/cross-slice/app.test.tsx` → `Test Files 16 passed (16)`, `Tests 126 passed (126)`
- `pnpm beech lint` → `Tasks: 19 successful, 19 total`
- `node scripts/check-design-tokens.mjs --format agent <3 tsx files>` → exit 0, no output
- `pnpm --filter @beechcms/dashboard build` → `built in 5.32s`
- `pnpm beech test --diff` → dashboard unit 109 passed, api unit 181 passed, api integration 748 passed. Exit 1 only from the known sprint-4 caveat: `packages/core` gate "no tests were run for the changed files" (no `packages/` file touched here).
- `graphify update . --force` → `Rebuilt: 30162 nodes, 44141 edges`

## Rework (review_report.md, REWORK_CODE)

- [x] Finding 1: removed vacuous `expect(input).toBeInTheDocument()` and the unused `input` binding in the Escape case.
- [x] Finding 2: footer case now asserts inside the footer element: `Copy ID`, the `Actions` label, `⇧` and two `↵` caps.
- [x] Finding 3: Alt+N handler in `use-command-palette.ts` also clears `actionsTarget` and `queryToRestore`.
- Re-validation: tsc → `No errors found`; scoped vitest → `Test Files 16 passed (16)`, `Tests 126 passed (126)`; `pnpm beech lint` → `Tasks: 19 successful, 19 total`; `graphify update . --force` → ok.

## Pending

- Manual gate (human, dev stack), Section 5.

## Notes

- Branch `feature/beechpal-row-actions` created from the working tree of `feature/beechpal-content-search`, not from `devs`: Section 2 precondition requires the uncommitted sprint 4 code. No commit made.
