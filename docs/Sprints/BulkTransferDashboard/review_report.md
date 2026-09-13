# Verdict
REWORK_CODE

# Findings

1. **Blocking — the 501 "no S3 credentials" case is never distinguished, contrary to the plan's own contract.** `apps/dashboard/src/features/content-transfer/api/transfer.api.ts:81-93` (`readProblem`) only recognizes an RFC 7807 body (`typeof data === "object" && "type" in data`). But `POST /upload/presign` on a deployment using the native `R2Bucket` binding (no S3 credentials configured) throws `HTTPException(501, …)` with body `{ error: "presigned_urls_require_s3_credentials", message: "…" }` — see `apps/api/src/shared/storage/r2-bucket.ts:181-194`. That body has no `type` field, so `readProblem` returns `null` for every such failure. `import-wizard-dialog.tsx:82-86`'s catch then falls back to `t("transfer.import.errors.unknown")` = "Import failed", with no branch for a 501 status at all — even though SECTION 4.5 of the plan explicitly requires "a `501` [maps] to the not-configured string," and `en.json`/`it.json` contain no such string (only `transfer.import.errors.unknown`).
   **Failure scenario:** any BeechCMS deployment that has not configured `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_ENDPOINT`/`R2_BUCKET_NAME` (the native-binding path, which the docs call out as a supported configuration) makes the entire import feature silently non-functional: every import attempt ends in a generic "Import failed" toast with zero indication that direct upload isn't configured on this deployment, contradicting the acceptance criterion "A `413`/`400`/`403` renders the server's `detail`, not a generic failure string" (the 501 case is the same class of requirement, spelled out separately in SECTION 4.5).
   **Fix:** `readProblem` needs to also parse the `{error, message}` shape (or the wizard's catch needs a `problem === null` + inspect `error.response.status === 501` fallback) and map it to the "not configured on this deployment" string the plan already specifies.

2. **Minor — stale archive path in ROADMAP.md.** `stages/01_sprint_planning/output/backlog/ROADMAP.md`, S3 line: marks S3 "SHIPPED — archived at `docs/Sprints/output/ContentImportJobs.md`". That path does not exist; the actual archive is `docs/Sprints/ContentImportJobs/ContentImportJobs.md`. Non-blocking (doc typo, not code), but should be fixed before this ROADMAP is read again in S5 planning.
3. **Minor — missing `// @vitest-environment node` pragma.** `apps/dashboard/src/features/content-transfer/test/unit/transfer-api.test.ts` and `use-import-job.test.ts` do the same non-DOM-only work described in `testing_conventions.md` Rule 1.2 ("when needed") and the plan's own SECTION 6 acceptance line ("each with … the pragma where no DOM is needed"), but neither file has it — `use-import-job.test.ts` in particular renders through `renderHook`/`QueryClientProvider`, so it does need jsdom (fine as-is), but `transfer-api.test.ts` does no rendering at all and would be faster/more correct under `node`. Not a `MUST` violation per the testing_conventions wording ("when needed" is judgment-based) and does not affect correctness — noted, not blocking.
4. **Not independently verified — Manual runtime checklist (SECTION 5, items a–h).** Docker is not running in this review environment (`docker ps` fails to connect), so `pnpm beech dev` and the seeded-browser checklist could not be exercised here, mirroring the same infrastructure gap the execution log hit for `apps/api`/`apps/api-client`. Every item was instead verified by static/logical inspection (see Verification Evidence) and is consistent with the code, but the human merging this PR should still spot-check at least items (f) and (g) — the permission-gating UX for a per-seed-only writer and a read-only viewer — since those are the two paths no automated test in this diff exercises end-to-end.

Finding 1 is a real implementation defect (blocking, per the plan's own SECTION 4.5 requirement); findings 2-4 are non-blocking notes for the record.

# Verification Evidence

Boundary / scope commands (run from repo root, `feature/bulk-transfer-dashboard`, diffed against `devs` — this branch has no commits ahead of `devs`; all S4 work is in the working tree):

```
$ git diff devs --name-only | grep -E "^packages/core/|^apps/api/"
(no output — zero files touched, exit 1)

$ git diff devs --name-only | grep package.json
(no output — no dependency changes)

$ git diff devs -- apps/dashboard/src/lib/upload.ts
(empty diff — unmodified)

$ git diff devs -- apps/dashboard/src/pages/drafts-list.tsx
(empty diff — unmodified)

$ grep -rn ": any\|<any>\|as any" apps/dashboard/src/features/content-transfer \
    apps/dashboard/src/features/content-toolbar/toolbar-components/transfer-menu.tsx \
    apps/dashboard/src/pages/import-job-detail.tsx
(no output — no `any`)

$ graphify update . --force && graphify path "ContentToolbar" "ImportWizardDialog"
No directed path found between 'ContentToolbar' and 'ImportWizardDialog'.
```

Type/lint/test commands, re-run independently (not trusting execution_log.md):

```
$ cd apps/dashboard && npx tsc --noEmit
(exit 0, no output)

$ pnpm lint            # from repo root
Tasks: 19 successful, 19 total

$ pnpm beech test --diff
[unit] vitest (related) — 2 source file(s)
Test Files  21 passed (21) / Tests  141 passed (141)
content-toolbar.tsx: 68.8% stmts / view-registry.bootstrap.ts: 100% — both PASS coverage gate

$ cd apps/dashboard && npx vitest run
Test Files  130 passed (130)
Tests  912 passed (912)
```

(An initial `npx vitest run` from the repo root instead of `apps/dashboard` produced 58 failures — `document is not defined` — because it picked up the wrong Vitest config/environment. That was a review-tooling mistake on my part, not a code defect; re-running scoped to `apps/dashboard` per the plan's own SECTION 5 command reproduced the executor's 912/912 green result exactly.)

Code inspection performed against every file in the diff (all 21 modified + 11 new files), cross-checked line-by-line against SECTION 4 of the plan:
- `features/shared/view-registry.ts`, `content-toolbar/shared.ts`, `view-registry.bootstrap.ts`, `content-gallery/index.ts`, `content-kanban/index.ts` — each adds exactly the one `'transfer'` entry the plan specifies, nothing else.
- `content-toolbar/types.ts`, `content-toolbar.tsx` — the two new props are optional; `TransferFormat` imported from `@beechcms/core`, not re-exported.
- `content-transfer/api/transfer.api.ts` — matches the plan's contract byte-for-byte: `timeout: 0` on export, `PRESIGN_MIME_TYPES` derived from `format` not `file.type`, no `try/catch` swallowing, `presignImportObject`/`createImportJob` not in the slice's `index.ts` barrel (confirmed).
- `content-transfer/hooks/use-import-job.ts` — `refetchInterval` returns `false` on terminal state, `retry: false`.
- `content-transfer/components/import-wizard-dialog.tsx` — dialog is non-closable during `uploading` (`handleOpenChange` early-returns before calling `onOpenChange`, which also blocks Radix's ESC/overlay-click paths, not just the visible close button); `canGlobally("content:create")` gates the upload button and shows the deferred-permission string; CSV radio disabled via `isFlatSeed`/`nonFlatBranches` from `@beechcms/core`.
- `content-transfer/components/import-job-panel.tsx` — capped-report line (`unlistedFailures = failedRows - errors.length`) matches the regression-guard comment and its own test; indeterminate `<Progress value={undefined}>` while `processing`; `onCompleted` fires once via a ref guard.
- `content-toolbar/toolbar-components/transfer-menu.tsx` — `showExportGroup`/`showImportRow` gated on `can("content:read"/"content:create", seed.slug)` **and** handler presence; returns `null` when neither group renders (confirmed no empty dropdown); CSV row disabled + offending aliases shown.
- `pages/import-job-detail.tsx`, `App.tsx` — route row placed in the literal-prefix block before `/content/:slug/create`; React Router v6's static-over-dynamic ranking (documented behaviour, not something a test can meaningfully add beyond what the plan already argues) means `/content/import-jobs/:jobId` cannot be swallowed by `/content/:slug/:id` regardless of array position.
- `content-management/hooks/use-content-list-modals.ts`, `ContentListModals.tsx`, `pages/content-list.tsx` — wiring matches the plan; cache invalidation (`CONTENT_QUERY_KEYS.lists()`, `FACET_QUERY_KEYS.bySlug(slug)`) lives in `ContentListModals.tsx`, not in the `content-transfer` slice — confirmed no reverse import.
- `src/locales/en.json` / `it.json` — every `t("transfer.*")` key referenced in code exists in both locale files.
- Three new unit suites — walked against `testing_conventions.md` §8: SPDX headers present, `describe()` names the exported symbol, no `it()` contains "should", one act per test with the act's result named where non-void (`jobId`, `key`, `problem`, `result`), no fake timers/sleep/snapshot/`.only`, the four required regression-guard comments (§6.2) are present verbatim (timeout-truncation, NDJSON MIME, capped-report, e2e-omission — the last one lives in the wizard's file-level docblock, not a test file, as the plan specifies).
- `test/cross-slice/barrels.test.ts` — new assertion for `ContentTransferIndex.ImportWizardDialog`.
- Two pre-existing test files touched (`content-toolbar/test/unit/shared.test.ts`, `test/cross-slice/content-list.test.tsx`) — both are minimal, mechanical updates (append `"transfer"` to an expected array; add `canGlobally` to a permissions mock) forced by this sprint's own changes, not scope creep.

Automated code-review pass (medium effort) run against the full branch diff: no correctness bugs or invariant violations surfaced beyond the three non-blocking items listed above.

# Sprint Documentation

**BulkTransferDashboard (S4 of 4, feature: Bulk Data Transfer)** shipped the dashboard UI for the export/import endpoints merged in S2/S3: a toolbar `TransferMenu` (export CSV/NDJSON with the CSV option disabled for non-flat seeds, permission-gated per seed) and an `ImportWizardDialog` (presign → PUT → create-job → poll-to-completion, permission-gated at both the per-seed and the global-presign-scope level) live in a new `content-transfer` slice with zero sibling-slice imports. A standalone `/content/import-jobs/:jobId` page reuses the same `ImportJobPanel` for a shareable job URL. Zero backend/core files touched — this sprint only consumes the two endpoint contracts S2 and S3 already shipped.

Key decisions: `presignImportObject` is a slice-local ~15-line helper rather than reusing `lib/upload.ts`'s `uploadFile()`, because that helper also registers a permanent media-library row via `POST /upload/confirm` — wrong for a transport file the chunk worker deletes on completion. The presign endpoint's existing `GLOBAL_SCOPE` requirement for `content:create` (a gap deferred out of S3) is surfaced explicitly in the UI as a named, actionable warning rather than hidden or silently worked around.

Known limitation carried forward from S3, not addressed here: a user with `content:create` on a single seed (not globally) cannot actually upload an import file — they see the Import entry and an explicit warning, but the presign call still 403s. This is intentionally out of scope for S4 (SECTION 7, item 2) and remains a roadmap item.

Not yet merge-ready: `readProblem` (`content-transfer/api/transfer.api.ts`) doesn't parse the `{error, message}` body the presign endpoint's 501 (no-S3-credentials) response actually uses, so the wizard shows a generic "Import failed" instead of the not-configured message the plan calls for (Finding 1) — this needs a fix pass before merge.

Deviation from execution_log.md's own claim: the manual browser checklist (SECTION 5) was not run by either the execution or review stage — Docker was unavailable in both environments. All acceptance criteria were instead verified through static code inspection, the automated test suites (912/912 dashboard unit tests green), and `graphify path` confirming the VSA boundary. Recommend a human spot-check of the two permission-gating paths (checklist items f/g) before or shortly after merge.

## Handoff (Human Gate)
REWORK_CODE. Per the stage contract: human re-launches stage 02 in rework mode against Finding 1 (and, optionally, findings 2-3 as cleanup). I have not merged or archived anything.
