# Execution Log — InstantDeleteUndo

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] A single delete from the Table view (row menu, context menu, Del key on one row) and from the entry editor opens **no** dialog. It calls `DELETE /api/content/:slug/:id` with no purge flag immediately.
- [x] The deleted row disappears from every cached list page of its seed before the server answers. A failed delete puts it back and shows `content.undoDelete.deleteFailed`.
- [x] Each successful single delete raises its own sonner toast with `duration: UNDO_DELETE_TOAST_MS` (5000). No toast is created with an `id` option.
- [x] Undo calls `POST /api/content/:slug/:id/restore` for exactly that toast's entry, then invalidates content, Trash, activity and back-refs. Undo is offered only with `content:update`.
- [x] The undo toast is raised even when the calling component (the entry editor) has unmounted.
- [x] Bulk delete of two or more ids always requires the confirmation modal, has no undo, and on partial failure keeps the dialog open with a localized per-id error and only the failed ids queued for retry.
- [x] `TrashListResponse.retentionDays` exists. The Trash countdown uses it, shows `content.trash.neverPurged` for `0`, and no dashboard file reads `seed.retentionDays`.
- [x] Settings → Site has a Trash retention field. Values that fail `isValidRetentionDays` (from `@beechcms/core`) are refused client-side with nothing sent. Valid values (including `0`) are sent as numbers.
- [x] `SchemaFormViewModel` no longer has `showDeleteConfirm` / `setShowDeleteConfirm`, and both implementers compile.
- [x] `en.json` and `it.json` carry the same new keys (Task 7).
- [x] `docs/features/trash.md` Dashboard Experience describes instant delete + undo, the bulk modal, the effective countdown and the Settings field.
- [x] No file under `packages/**` or `apps/api/**` changed. No new cross-slice import. `lib/trash-cache.ts` is not re-exported from the barrel.
- [x] All SECTION 5 commands pass. `apps/dashboard` `tsc` stays at 0 errors.

## SECTION 5 — VALIDATION

```
npx tsc --noEmit (apps/dashboard)          TypeScript: No errors found
pnpm --filter ./apps/dashboard test        Test Files 185 passed (185) | Tests 1332 passed (1332)
pnpm lint                                  ESLint: No issues found
pnpm beech test --diff                     PASS Tests: every selected test run passed.
                                           PASS Coverage: all 19 changed file(s) meet the changed-line threshold.
node scripts/check-test-placement.mjs      test placement — OK
node scripts/docs-fact-check.mjs           DOCUMENTATION FACT-CHECK PASSED: Code and Docs in 100% parity.
rg -n "seed\.retentionDays|showDeleteConfirm|Partial deletion" apps/dashboard/src   (no output)
graphify update . --force                  Rebuilt: 27971 nodes, 40354 edges, 2754 communities
```

Manual smoke (`pnpm beech dev`) not run.
