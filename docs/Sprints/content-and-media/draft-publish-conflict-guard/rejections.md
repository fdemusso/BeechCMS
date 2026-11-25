# Rejections

## 2026-09-14 — DraftPublishConflictGuard.md — RESOLVED 2026-09-14

Resolution: plan owner authorized editing `apps/api/test/draft-relation.test.ts`'s
hand-rolled `DDL_ARTICLES_DRAFT` fixture to add `live_snapshot_at INTEGER`, lifting the
"no edits" constraint specifically for aligning outdated manual DDL fixtures with the new
draft schema. `saveDraft`'s unconditional write stays as Task 5 specified — no runtime
guard needed. Fixture updated; re-running Section 5 validation below.



Task 5 (`saveDraft` unconditionally writes `live_snapshot_at` on every INSERT into
`content_{slug}_drafts`) contradicts Section 5's own validation requirement that
`apps/api/test/draft-relation.test.ts` stays green with **no edits permitted**. That suite
provisions `content_dr_articles_drafts` via a hand-written `CREATE TABLE` (its own fixture, not
`generateDraftTable`) that does not carry the new column. Running the exact validation command
the plan specifies (`pnpm --filter @beechcms/api exec vitest run test/draft-relation.test.ts`)
after implementing Task 5 exactly as written produces 5/5 failures, all `saveDraft` returning 500
(`no such column: live_snapshot_at`) instead of 200 — the INSERT's column list names a column the
table doesn't have.

The plan's backward-compatibility section (SECTION 1) only accounts for a draft table missing the
column on the **read** path (`publishDraft`/`getDraft`: `undefined` key, legacy path runs). It
never accounts for the **write** path (`saveDraft`) hitting a draft table that predates the
column — which is exactly the case this specific must-stay-green fixture exercises. Task 5 as
specified is unconditional and has no guard against this.

This cannot be resolved by the execution agent without either (a) editing a test the plan
explicitly forbids editing, or (b) unilaterally redesigning Task 5 to introspect/guard the write,
which is an architectural decision (e.g. how `saveDraft` would know the column exists — no
`existingDraftColumns`-equivalent is threaded into the repository layer, only into the DDL
planners) outside the execution agent's authority.

**Reason:** Task 5's saveDraft write is unconditional and breaks the plan's own required-green
`test/draft-relation.test.ts` (hand-rolled draft DDL predates the column).
