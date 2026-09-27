# Execution Log — `LocalizationCoreContracts`

## SECTION 6 — ACCEPTANCE CRITERIA (completed)

- [x] `Branch.localized?: boolean` exists and is documented; no other `Branch` field changes —
      `git diff devs -- packages/core/src/engine/types.ts` shows only the one inserted block.
- [x] `localization.ts` exports exactly: `LOCALE_CODE_RE`, `LOCALIZABLE_BRANCH_TYPES`, `LocaleConfig`,
      `LocalizedDictionary`, `LocalizedPatch`, `isLocaleCode`, `isLocalizedBranch`, `isLocaleDictionary`,
      `isLocalizedWriteDictionary`, `toLocalizedPatch`, `compactLocalizedDictionary`; performs no I/O;
      imports only `./types.js` (type-only) and `./validation/primitives.js`. Re-exported from
      `@beechcms/core` via `packages/core/src/index.ts`.
- [x] `@beechcms/core` `package.json` `dependencies` unchanged — not touched.
- [x] Fatal 17 rejects `localized: true` on every non-`text|richtext|json` type, on repeater sub-fields,
      and on `encrypt`/`hash` storage (both `classification` and legacy `privacy` spellings), and rejects
      non-boolean values; accepts localized `text|richtext|json` with `public`/`internal` classification —
      `seed-validation.test.ts` "Fatal 17: localization" block (5 tests).
- [x] `POST /api/seeds` with an illegal localized combination → `422 validation-failed`, no
      `content_<slug>` table — integration test, matrix of 3 cases.
- [x] Toggling `localized` via `PUT /api/seeds/:slug` on a branch with rows → `200`, identical
      `PRAGMA table_info`, stored values unchanged — integration test.
- [x] `PATCH …/retype` on a localized branch → `422 retype-localized-not-supported`, definition and
      column unchanged — integration test.
- [x] With `localeConfig`: plain value → `{ [defaultLocale]: value }`; unregistered locale keys dropped;
      blank → `null`; per-locale errors at `<alias>.<locale>`; plain-value errors at `<alias>`; dangerous
      richtext translation reported as `<alias>.<locale>`; `requiredOnCreate` satisfied by the default
      locale alone — `validation/localized-schema.test.ts` (11 tests).
- [x] Without `localeConfig`: every existing validation test passes unchanged; a localized branch
      validates as its base type — full pre-existing suite green + dedicated regression test.
- [x] A json value such as `{"url": "…", "alt": "…"}` on a localized json branch is wrapped under the
      default locale, never emptied — `isLocalizedWriteDictionary` / `toLocalizedPatch` unit tests.
- [x] `serializeForDb` on a localized dictionary writes compact JSON with no `null`/blank entries, or SQL
      `NULL` when empty; non-localized branches serialize byte-identically to today — `serialize.test.ts`.
- [x] `deserializeFromDb` returns an object for a stored dictionary on a localized `text` branch and the
      raw string for a legacy value; non-localized `text` unchanged — `serialize.test.ts`.
- [x] `extractIndexableText` includes every language of a localized text dictionary —
      `vector-extractor.test.ts`.
- [x] `projectSchemaContract` output and `computeSchemaFingerprint` value are unchanged for any seed set
      with no `localized: true` branch; `SCHEMA_FINGERPRINT_VERSION === 1` — `schema-fingerprint.test.ts`.
- [x] Zero changes under `apps/api/src/{public,middleware,shared,factory.ts,types.ts}`,
      `apps/api/migrations`, `apps/dashboard`, `packages/{client,api-client,mcp,cli,testing}` — verified
      via `git status --short` scoped to those paths (empty).
- [x] All commands in SECTION 5 pass; every new test file conforms to `testing_conventions.md` (§8
      checklist).

## Validation output

```
$ pnpm --filter @beechcms/core build
$ tsc
(exit 0)

$ pnpm --filter @beechcms/core test
 Test Files  52 passed (52)
      Tests  846 passed (846)

$ npx tsc -p tsconfig.build.json --noEmit   (apps/api)
TypeScript: No errors found

$ pnpm --filter @beechcms/api test:unit
 Test Files  121 passed (121)
      Tests  1368 passed (1368)

$ pnpm --filter @beechcms/api test:integration
 Test Files  12 passed (12)
      Tests  83 passed (83)
(includes the 4 new seed-localization.integration.test.ts cases)

$ pnpm --filter @beechcms/dashboard type-check
$ tsc -b
(fails with 6 pre-existing errors in src/features/content-transfer/** and src/test/setup.ts,
 confirmed identical on a clean `devs` checkout via `git stash` — unrelated to this sprint;
 the additive Branch.localized field introduces zero new dashboard errors)

$ pnpm beech test --diff
[packages/core][unit] Test Files 15 passed (15) / Tests 384 passed (384)
  schema-fingerprint.ts   100.0% stmts / 78.6% branch — PASS
  seed-validation.ts       97.2% stmts / 94.1% branch — PASS
  serialize.ts             89.6% stmts / 84.0% branch — PASS
  types.ts                100.0% stmts / 100.0% branch — !! Untested (script defect: pure
                           interface file, zero executable statements — same known defect
                           documented in docs/Sprints/MediaPresetTransforms/execution_log.md §1)
  validation/cache.ts      92.7% stmts / 91.3% branch — PASS
  validation/schema-builders.ts  97.1% stmts / 95.3% branch — PASS
  search/vector-extractor.ts    100.0% stmts / 93.8% branch — PASS
[apps/api][unit] Test Files 14 passed (14) / Tests 164 passed (164)
  seeds.destructive.ts    95.5% stmts / 89.7% branch — PASS
[apps/api][integration] Test Files 12 passed (12) / Tests 83 passed (83) — PASS
FAIL 1 / 8 file(s) below threshold or untested (types.ts only, script defect, see above)

$ pnpm lint
ESLint: 333 errors, 16 warnings in 12 files
(identical count/files on a clean `devs` checkout via `git stash` — all in unrelated tooling
 scripts: vue.js, cli.mjs, check-docker.mjs, release.mjs, test_sqlite.js, react-doctor-loop.mjs,
 test-runner.mjs, docs-fact-check.mjs, test-coverage-diff.mjs, update-npm-to-pnpm.mjs;
 none of this sprint's files appear)

$ graphify update .
Rebuilt: 21200 nodes, 32098 edges, 2007 communities
```

## Note beyond the plan's explicit test list

`serialize.ts` initially showed `LOW: branch 70.8% < 75%` under `pnpm beech test --diff` — the file's
pre-existing switch branches (repeater, plain file, date-without-format, json/tags/richtext string
input, default-case number/null) had never been exercised before this sprint made the file part of the
diff. Added 5 test-only cases (no production code changed) to `serialize.test.ts` closing those
pre-existing gaps; not part of SECTION 4's explicit T5 list but required to satisfy SECTION 5's
`pnpm beech test --diff` gate.
