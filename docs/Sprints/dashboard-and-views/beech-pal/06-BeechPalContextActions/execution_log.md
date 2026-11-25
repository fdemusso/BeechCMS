# Execution Log — BeechPalContextActions

Branch: `feature/beechpal-context-actions` (from `1dcf32bc`, the committed sprint 5; `devs` lacks it). No commit made.

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `PageActionRequirement`, `PageActionConfirm`, `PageAction`, `PageActionDeclaration`, `useDeclarePageActions`, `usePageActionDeclarations` and `getPageActionDeclarations` match Section 4 verbatim and are exported by `@/features/shared`.
- [x] The store re-renders readers only when a declaration is added, replaced or removed; newest first; no React context or provider added.
- [x] `PendingPageAction` and `createContextActionsProvider` match their signatures; the provider is pure.
- [x] `EntryPageActionHandlers`, `EntryPageActionsInput`, `ENTRY_EDITOR_HOST_ID` and `buildEntryPageActions` match their signatures; the actions and conditions match the Task 4 table.
- [x] The editor publishes only while `open` and the form is on screen; unmount or close withdraws it.
- [x] Every mutating action calls the editor's existing handler; the submit button and the palette's save share `handleSave`. No new request, mutation or API call.
- [x] Publish draft asks for confirmation through `ConfirmDialog`; discard uses the editor's own confirmation; delete keeps its Undo toast and no confirm.
- [x] Cancelling a confirmation runs nothing and reopens the palette; confirming never reopens it.
- [x] A confirmation whose `hostId` + `targetId` is no longer published runs nothing and shows `commandPalette.context.targetGone`.
- [x] Missing permissions disable rows with the permission named; a busy editor disables its mutating rows with `content.editor.busy`.
- [x] Page actions come before navigation on the idle root and are silent under any prefix.
- [x] `SchemaFormViewModel`, `schema-form-shell.tsx` and every `EntryEditorDialog` mount site are unchanged.
- [x] `features/command-palette` and `features/entry-editor` do not import each other; both reach the contract through `@/features/shared`.
- [x] Every new string exists in `en.json` and `it.json`.
- [x] Existing test cases pass unedited; tsc, lint, design-token check, the scoped vitest run and the dashboard build pass.
  - Only the `react-i18next` mock factory in `use-entry-editor-dialog.test.tsx` changed: one stable `t` across renders, as i18next gives. Without it the "editing a field keeps the declaration" guard cannot hold.
- [x] `docs/features/command-palette.md` describes page actions.

## SECTION 5 — VALIDATION

- `npx tsc --noEmit -p apps/dashboard/tsconfig.app.json` → `TypeScript: No errors found`
- `npx vitest run src/features/command-palette src/features/shared src/features/entry-editor src/test/cross-slice src/pages/palette-providers.test.ts` → 128 suites, 415 tests, 415 passed, 0 failed
- `pnpm beech lint` → `Tasks: 19 successful, 19 total`
- `node scripts/check-design-tokens.mjs --format agent <command-palette.tsx> <use-entry-editor-dialog.tsx>` → no output (clean)
- `pnpm --filter @beechcms/dashboard build` → `✓ built in 5.41s`
- `pnpm beech test --diff` → dashboard unit 58 files passed, integration 99 files / 748 tests passed, coverage PASS. Exit 1 only from `packages/core`: "no tests were run for the changed files", the known stacked-sprint case (no `packages/` or `apps/api` file touched here).
- `graphify update . --force` → 30261 nodes, 44378 edges; `graphify path "CommandPalette()" "useEntryEditorDialog()"` → `CommandPalette() --calls--> usePermissions() <--calls-- useEntryEditorDialog()` (shared hop only)
- Manual gate (human, dev stack): not run.
