# Execution Log — DraftPublishConflictGuard

## Deviation from plan (authorized)

Section 5's targeted-run comment on `test/draft-relation.test.ts` ("must stay green, no
edits permitted") contradicted Task 5's unconditional `saveDraft` write against that
suite's hand-rolled `content_dr_articles_drafts` fixture (missing `live_snapshot_at`).
Rejected via `stages/01_sprint_planning/output/rejections.md` (2026-09-14). Plan owner
resolved: authorized adding `live_snapshot_at INTEGER` to that one fixture's DDL literal;
Task 5 stays unconditional as designed. Fixture updated; full validation re-run below,
all green. Rejection entry marked RESOLVED.

## Section 6 — Acceptance Criteria

**Botanical Engine invariant**
- [x] `live_snapshot_at` DDL string literal appears in exactly two places outside tests:
      `generateDraftTable` and `generateAddDraftSnapshotColumn`, both in
      `packages/core/src/engine/ddl.ts`. `grep -rn "live_snapshot_at" apps/api/migrations`
      returns nothing.
- [x] No new `CREATE TABLE content_*` or `ALTER TABLE content_*` string literal added to
      `apps/api` or `packages/cli`. (One authorized exception: an existing test-file DDL
      literal in `test/draft-relation.test.ts` gained one column, per the resolved
      rejection above.)
- [x] Column is nullable, no `DEFAULT`, no index.
- [x] `getDraft`/`findPendingDrafts` response shapes unchanged — asserted in the new
      integration suite.
- [x] Retroactive `ALTER` runs only through `ISchemaMutator.execDdl`.

**VSA**
- [x] `apps/api/src/features/draft/` imports nothing from other `features/*` beyond the
      pre-existing `../content/constants`.
- [x] `apps/api/src/features/seeds/` gains no import from `features/draft`.
- [x] `graphify path "draftApp" "D1Database"` (post `graphify update .`): no directed path
      found.
- [x] Conflict predicate exists only in `D1ContentRepository.publishDraft`.

**Typing**
- [x] `DraftConflictError`: `snapshotAt: number | null`, `liveUpdatedAt: number`, single
      named-parameter constructor.
- [x] `planExtendSeed`'s third parameter optional, `Set<string> | null | undefined`.
- [x] `IContentRepository.publishDraft(seed, entryId): Promise<void>` unchanged.
- [x] No `any` introduced.
- [x] `npx tsc --noEmit` clean in `packages/core` and `apps/api` (one pre-existing,
      unrelated failure in `apps/api` — see validation output below).

**Correctness — TOCTOU**
- [x] Comparison is a `WHERE`-clause predicate on an `UPDATE`, evaluated by SQLite.
- [x] Claim runs as standalone `.run()` before `this.database.batch(...)`; zero
      `meta.changes` throws before the batch is prepared (unit test asserts `batchMock`
      not called).
- [x] Claim writes `MAX(unixepoch(), updated_at + 1)`; `updated_at = (unixepoch())`
      removed from the publish batch's `updateClauses`.
- [x] `DraftConflictError` rethrown unwrapped by `publishDraft`'s catch, never reaches
      `mapError`.

**Backward compatibility**
- [x] Draft row with `live_snapshot_at IS NULL` publishes 200 even if live row changed.
- [x] Draft table missing the `ALTER`: `draftRow['live_snapshot_at']` is `undefined`,
      legacy path runs.
- [x] No-mirror-draft-row branch unmodified.
- [x] `planExtendSeed` called with two arguments emits no `ALTER TABLE … _drafts`.

**API contract**
- [x] `POST /api/content/:slug/:id/draft/publish` answers 409,
      `Content-Type: application/problem+json`,
      `type: "https://beechcms.dev/problems/draft-publish-conflict"`.
- [x] 409 body carries no internal timestamp.
- [x] 404/422 branches unchanged.

**Tests**
- [x] New file at `apps/api/src/features/draft/test/integration/`, SPDX header,
      `*.integration.test.ts`, single tier.
- [x] `describe('draft slice — publish conflict integration (real D1)')`; no `it()` name
      contains "should".
- [x] `beforeEach` holds only baseline harness + canonical seeds/users.
- [x] Every `it()` passes in isolation.
- [x] No fake repository; real `IIdGenerator`; `UUID_V4_PATTERN` used for ids.
- [x] No fake timers, no patched `Date`, no sleep, no `.only`/`.skip`, no response
      snapshot.
- [x] Every write asserts persisted state; 409 test asserts both live and draft rows
      survived unchanged.
- [x] Each direct-SQL line against `harness.db` carries a `why` comment.
- [x] `'calls batch with UPDATE and DELETE statements when draft exists'` in
      `content.repository.d1.test.ts` stays green, unedited. (Authorized exception,
      distinct test: `test/draft-relation.test.ts`'s hand-rolled DDL fixture was edited
      per the resolved rejection above — see Deviation section.)

**Build & graph**
- [x] `pnpm --filter @beechcms/core run build` succeeds; `DraftConflictError` in
      `packages/core/dist`.
- [x] `pnpm beech lint` clean.
- [x] `pnpm beech test` green across the workspace.
- [x] `graphify update .` run after the change.

## Validation command output

```
$ pnpm --filter @beechcms/core run build
$ tsc
(no output — success)

$ npx tsc --noEmit --project packages/core
(no output — success)

$ npx tsc --noEmit --project apps/api
apps/api/src/features/content/jobs/import-chunk.worker.test.ts(65,9): error TS2740: ...
— pre-existing on `devs` prior to this change (verified via git stash), unrelated to this
  plan, out of scope per Caveman rule 9.

$ pnpm beech lint
 Tasks:    19 successful, 19 total

$ pnpm beech db:reset
  ✓ Local database reset completed.

$ pnpm beech db:migrate
  ✓ Migrations applied successfully.

$ pnpm beech test
@beechcms/api:test:
 Test Files  9 passed (9)
      Tests  69 passed (69)
 Tasks:    17 successful, 17 total
```

All targeted suites from Section 5, including the previously-failing
`test/draft-relation.test.ts`, now pass. New integration suite
(`draft-publish-conflict.integration.test.ts`) — 4/4 passing:
- publishing a draft whose live entry was edited in the meantime answers 409
  draft-publish-conflict
- publishing an untouched draft promotes it and removes the draft row
- a draft whose live_snapshot_at is null publishes without a conflict check
- an entry created directly in draft status publishes without a conflict check
