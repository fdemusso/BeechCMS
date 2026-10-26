# Verdict
PASS

Conditions the human should know before merging:
- The runtime check (Process step 3) was **not performed**: the Claude-in-Chrome extension was not connected, so the dashboard could not be driven. The code and test evidence below is complete; the manual smoke at the end of this report is still open.
- Sprint 3 is uncommitted in the working tree of `feature/universal-soft-delete`. `git diff devs...HEAD` therefore shows only sprints 1 and 2. I reviewed `git diff HEAD` plus the untracked files instead.

# Findings
No blocking findings. Non-blocking observations:

1. `apps/dashboard/src/features/content-management/hooks/use-delete-with-undo.ts:82`: `deleteWithUndo` is a fresh closure on every render. `handleDelete` and `handleBulkDelete` in `use-content-list-modals.ts` depend on it, so both change identity on every render of the list page. This can invalidate memoised table columns. Wrap it in `useCallback` over `mutateAsync` if the list shows re-render churn.
2. `trash-cache.ts:47` `restoreCachedLists`: when two deletes are in flight and the first fails, restoring its snapshot briefly brings back the second row. It self-heals, because `onSettled` invalidates and refetches. Acceptable.
3. The `pnpm beech test --diff` coverage gate does not measure the uncommitted sprint-3 dashboard files. Its dashboard table lists only `use-content-delete-dialog.ts` and `use-seed-editor-dialog.tsx`. "All 19 changed files meet the threshold" in the execution log is therefore not evidence for this sprint. I could not obtain a direct coverage number: `vitest --coverage` with `--coverage.include` overrides reported 0 files. Coverage by reading: every new module and branch has a dedicated test.
4. `en.json` and `it.json` drop the key `content.deletionPartial`, which the plan did not ask for. No source file references it; only built bundles do. It is harmless dead-key cleanup.
5. Test ids in the new unit tests are UUIDv4 literals, not `CANONICAL_ENTRIES` as the plan said. This is justified: `CanonicalEntry` has no `id`, because the server mints it (`packages/testing/src/seeds/canonical.data.ts:55-63`), and the test comments say so. Rule 3.5/3.6 is satisfied in spirit.
6. Dashboard tests assert i18n copy ("Could not delete the entry", ...) rather than error codes (Rule 5.4). UI toasts have no machine code, and the plan prescribes these assertions, so I do not count it as a violation.
7. `use-delete-with-undo.test.ts:105-121`: the first test resolves the pending DELETE after its assertions, which interleaves zones slightly. It is cleanup only.
8. The plan's validation command `pnpm --filter ./apps/dashboard test` matches no project on this machine ("No projects matched the filters"). I ran `pnpm test` inside `apps/dashboard` instead. This is not a code defect.

# Verification Evidence

SECTION 5 commands, re-run by me:
- `npx tsc --noEmit` (in `apps/dashboard`): "TypeScript: No errors found", exit 0.
- `pnpm test` (in `apps/dashboard`; the plan's `--filter ./apps/dashboard` form matched nothing): Test Files 185 passed (185), Tests 1332 passed (1332). The output contains `ECONNREFUSED 127.0.0.1:3000` noise from a connection attempt. The suite still exits 0. I did not trace the source of that noise.
- `pnpm lint`: "ESLint: No issues found", exit 0.
- `pnpm beech test --diff`: exit 0. "PASS Tests: every selected test run passed" (85 files / 530 tests in the integration tier). "PASS Coverage: all 19 changed file(s)". See Finding 3 for what that covers.
- `node scripts/check-test-placement.mjs`: "test placement — OK".
- `node scripts/docs-fact-check.mjs`: "DOCUMENTATION FACT-CHECK PASSED".
- `rg -n "seed\.retentionDays|showDeleteConfirm|Partial deletion" apps/dashboard/src`: 0 matches.
- `git diff HEAD --stat -- packages apps/api` and `git status --short -- packages apps/api`: empty. No `packages/**` or `apps/api/**` file changed.
- `graphify update . --force`: not re-run. It writes the graph and is not a pass/fail gate.

Other checks:
- Locale key sets: a node script flattened `en.json` and `it.json`. "only en: []", "only it: []". All Task 7 keys are present in both with the plan's text.
- Code read against SECTION 4:
  - Task 1: `trash-cache.ts` has the verbatim signatures, is not exported from `index.ts`, and `use-content-trash.ts` imports `invalidateTrashSurfaces` from it.
  - Task 2: `useDeleteWithUndo` has the verbatim exports. Cache removal runs in mutation-level `onMutate`, and `contentApi.delete(slug, id)` is called with no purge flag. `onError` restores the cache and raises the `deleteFailed` toast. The success toast has `duration: UNDO_DELETE_TOAST_MS`, no `id` option, and an Undo action only when `can("content:update", slug)`. The action calls `trashApi.restore` with its own slug and id, and `onSettled` calls `invalidateTrashSurfaces`. `deleteWithUndo` never rejects.
  - Task 3: `handleDelete` is instant and drops the id from `rowSelection`. `handleBulkDelete` delegates a single deduped id to `handleDelete`. `handleConfirmDelete` reports per id, narrows `entryIdsToDelete` to the failed ids, and throws the localized `bulkPartialFailure`.
  - Task 4: the editor's `handleDelete` awaits `deleteWithUndo` and calls `onClose()` only on `true`. The confirm `AlertDialog` is removed, and `showDeleteConfirm`/`setShowDeleteConfirm` are gone from the view model, the editor and the seed-builder stub.
  - Task 5: `TrashListResponse.retentionDays` and the `ContentTrashView` prop exist. `0` renders `neverPurged`, and `retentionDays` is in the `useMemo` deps. `content-trash.tsx` passes `trash.data?.retentionDays`.
  - Task 6: the Settings field uses the verbatim input attributes. `handleSave` trims, validates with core `isValidRetentionDays` and returns before `mutateAsync`. A valid value is sent as a number.
  - Task 8: `docs/features/trash.md` is updated.
- Invariant audit:
  - No D1 access and no hardcoded field names; optimistic removal filters by `id`.
  - No new cross-slice import. `entry-editor → content-management` already existed.
  - `trash-cache.ts` is private to the slice.
  - Nothing from SECTION 7 was touched: no Seed Builder field, no `ContentDeleteDialog` change, no `Toaster` change, no sonner `id`, no undo for bulk.
- Test audit (§8) on 4 new and 3 edited files:
  - Tier and placement are correct, and every file has the SPDX header.
  - Names are behaviour plus outcome, with no "should".
  - `vi.mock` factories sit at the top of each file, with `beforeEach(vi.clearAllMocks)`.
  - There are no fake timers, no `any`, and no conditional assertions. Negative paths assert that nothing was sent or changed.
  - Mocks are boundary-only (`@/lib/api`, `sonner`, `use-permissions`). The one slice-internal mock (`use-delete-with-undo`, `use-content-facets` in `use-content-list-modals.test.ts`) carries the plan's required exception comment.
  - Regression-guard comments name the mechanism (unmount vs `mutate`-level callbacks; `act` discarding rejected updates).
  - No MUST violation.
- Acceptance criteria: all 13 items hold by code reading and passing tests. Items that need a live UI (instant row vanish in a real table, Del key on one row, Undo toast behaviour in sonner) are covered only by unit/cross-slice tests, not by runtime observation.

Runtime verification: NOT PERFORMED. `pnpm beech dev` started (API on :8789, dashboard on :5173) and was stopped afterwards, but `mcp__claude-in-chrome__tabs_context_mcp` returned "Browser extension is not connected". I did not log in or touch the API directly.

# Sprint Documentation
- Shipped (dashboard only): single delete is instant from the Table view (row menu, context menu, Del key on one row) and from the entry editor. The row leaves every cached list page of its seed at once, the server soft-deletes immediately, and each deletion raises its own 5-second sonner toast with "Undo" (a `restore` call, offered only with `content:update`).
- Bulk delete (2+ ids) keeps the confirmation modal, has no undo, and on partial failure keeps the dialog open with a localized message and only the failed ids queued for retry.
- The Trash countdown now reads the effective `retentionDays` from the trash payload; `0` shows "Kept indefinitely"; `seed.retentionDays` is no longer read anywhere in the dashboard.
- Settings → General has a global `trashRetentionDays` field, validated client-side with core `isValidRetentionDays`; nothing is sent for an invalid value.
- Key decisions: one hook (`useDeleteWithUndo`) serves both entry points, with toast logic in mutation-level options so it survives the editor unmounting. Cache helpers live in the slice-private `lib/trash-cache.ts`. `showDeleteConfirm` was removed from `SchemaFormViewModel`. The Seed Builder does not expose the per-seed retention override.
- Deviations: new unit tests use UUIDv4 literals because canonical entries carry no id. The unused locale key `content.deletionPartial` was also removed.
- Known limitations: sonner pauses the toast countdown while hovered, which the plan accepts. Restore auto-rename is not surfaced in the undo toast. No runtime/UI verification was done in review.
- Completes Universal Soft Delete & Trash Retention (sprints 1, 2, 3).

Manual smoke still open (`pnpm beech dev`, as admin):
- Delete one row: it vanishes, the toast shows Undo, and Undo brings it back.
- Delete two rows quickly: two toasts, each restoring only its own row.
- Bulk-delete three rows: the modal appears, then the success toast.
- Set Trash retention to `0` in Settings: the Trash shows "Kept indefinitely" for seeds without an override.
