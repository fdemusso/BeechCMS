# Execution Log — BulkTransferDashboard (S4)

## SECTION 6 — ACCEPTANCE CRITERIA

**Boundaries**
- [x] `git diff --name-only` lists zero files under `packages/core/` and zero under `apps/api/`.
- [x] No new entry in any `package.json`.
- [x] `apps/dashboard/src/lib/upload.ts` is unmodified.
- [x] `apps/dashboard/src/pages/drafts-list.tsx` is unmodified and still compiles.
- [x] No file under `features/content-transfer/` imports from any other `features/*` slice.
      `graphify path "ContentToolbar" "ImportWizardDialog"` → no directed path.
- [x] `TransferFormat` is imported from `@beechcms/core` in both `content-toolbar` and
      `content-transfer`; neither re-exports it for the other.
- [x] `features/content-transfer/index.ts` does not export `presignImportObject` or `createImportJob`.

**Botanical / engine adherence**
- [x] CSV-vs-NDJSON decision calls `isFlatSeed` / `nonFlatBranches` from `@beechcms/core`.
- [x] No `br_XX` id and no `content_import_jobs` column name appears in `apps/dashboard`.
- [x] No byte-size or row-count limit constant duplicated client-side.

**Typing**
- [x] `npx tsc --noEmit` in `apps/dashboard` passes.
- [x] No `any` in any new or modified file, tests included.
- [x] `ImportJobResponse` has no `objectKey` and no `createdBy` field.
- [x] The two new `ContentToolbarProps` members are optional.

**Behaviour — export / import**
- [x] Transfer menu / CSV-disable / export download / import wizard / permission gating / job
      panel / polling stop-on-terminal / capped-report line / job-detail route — implemented
      per SECTION 4 (4.1–4.16).

**Tests**
- [x] Three new unit suites under `features/content-transfer/test/unit/`.
- [x] Filenames `<subject>.test.ts(x)`; `describe()` names the exported symbol; no "should".
- [x] Four zones, one act per `it()`, act result named.
- [x] No fake timers, no sleep, no snapshot, no `.only`.
- [x] `barrels.test.ts` asserts the new barrel.
- [x] `pnpm beech test` passes for `@beechcms/dashboard` (914/914).

**Rework (review_report.md, verdict REWORK_CODE)**
- [x] Finding 1 (blocking) — `readProblem` still only parses RFC 7807; added a separate
      `isStorageNotConfiguredError()` (checked first in the wizard's catch) that recognizes the
      `{error: "presigned_urls_require_s3_credentials", message}` body the native-`R2Bucket`
      501 actually sends, and maps it to a new `transfer.import.errors.storageNotConfigured`
      string (en/it) instead of the generic "Import failed".
- [x] Finding 2 (minor) — fixed stale archive path in `ROADMAP.md` S3 line.
- [ ] Finding 3 (minor) — `transfer-api.test.ts` also exercises `downloadExport`, which calls
      `document.createElement` — adding `// @vitest-environment node` breaks it (`ReferenceError:
      document is not defined`), confirmed by re-running. File genuinely needs jsdom; pragma
      correctly omitted per the convention's own "when needed" wording. No change made.
- [x] Added `isStorageNotConfiguredError` unit coverage (recognizes the 501 body; confirms
      `readProblem` returns null for it; rejects an unrelated 501).

## Validation output

```
$ cd apps/dashboard && npx tsc --noEmit
(exit 0, no output)

$ pnpm lint
Tasks: 19 successful, 19 total

$ pnpm beech test --diff
PASS  All 2 changed file(s) meet coverage thresholds.
Test Files  21 passed (21) / Tests  141 passed (141)

$ cd apps/dashboard && npx vitest run
Test Files  130 passed (130)
     Tests  914 passed (914)

$ graphify update .
Graph has 14044 nodes, 25261 edges, 1184 communities. Updated.
```

## Notes

- `pnpm beech test` (full monorepo) also runs `apps/api` and `apps/api-client`, which require
  the local Docker stack (MinIO/Mailpit/webhook-tester) and an OAuth browser flow respectively —
  both unreachable in this environment and unrelated to this sprint (S4 touches zero files under
  `apps/api/`). Dashboard's own full suite (`apps/dashboard`: `npx vitest run`) was run directly
  instead and is green.
- Fixed two pre-existing test files that hardcoded the pre-S4 toolbar tool list / permissions
  mock, now stale given the new `transfer` tool and the wizard's `canGlobally` dependency:
  `content-toolbar/test/unit/shared.test.ts`, `test/cross-slice/content-list.test.tsx`.
- Added `features/content-toolbar/test/unit/view-registry.bootstrap.test.ts` and excluded
  `features/shared/view-registry.ts` (type/interface-only, zero executable statements) from
  coverage in `vitest.config.ts`, to satisfy `pnpm beech test --diff`'s coverage gate on the two
  registry files this sprint's one-line changes touched.
- Manual checklist (§5, items a–h against `pnpm beech dev`) not run — requires an interactive
  browser session against a live seed set; not part of the automated validation commands.
