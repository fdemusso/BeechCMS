# Verdict
PASS

# Findings
None. No `MUST` violations, no correctness bugs, no invariant violations found.

# Verification Evidence

## Diff under review
`feature/localization-core-contracts` has zero commits ahead of `devs` (`git log devs..feature/localization-core-contracts` → empty; both branches point at `2c299b3e`). The sprint's work is present as uncommitted working-tree changes on top of that same commit. Treated the working-tree diff as the reviewable unit, since it is byte-for-byte what would land on the feature branch:

```
$ git diff --stat  (tracked)
apps/api/src/features/seeds/seeds.destructive.ts   |  12 +
packages/core/src/engine/schema-fingerprint.test.ts|  17 +
packages/core/src/engine/schema-fingerprint.ts     |   4 +
packages/core/src/engine/seed-validation.test.ts   | 111 ++
packages/core/src/engine/seed-validation.ts        |  39 +
packages/core/src/engine/serialize.test.ts         |  82 ++
packages/core/src/engine/serialize.ts              |  21 +-
packages/core/src/engine/types.ts                  |   9 +
packages/core/src/engine/validation/cache.test.ts  |  40 +-
packages/core/src/engine/validation/cache.ts       |  13 +-
packages/core/src/engine/validation/index.ts       |  16 +-
.../src/engine/validation/schema-builders.ts       |  50 +
packages/core/src/index.ts                         |   1 +
packages/core/src/search/vector-extractor.test.ts  |  30 +
packages/core/src/search/vector-extractor.ts       |   6 +
(+ pipeline stage docs, unrelated to code review)

?? apps/api/.../test/integration/seed-localization.integration.test.ts
?? packages/core/src/engine/localization.test.ts
?? packages/core/src/engine/localization.ts
?? packages/core/src/engine/validation/localized-schema.test.ts
```
This matches SECTION 3's deliverable list exactly (11 production files, 8 test files) — no undeclared files touched. `docs/Sprints/MediaPresetTransforms/` and the two `stages/01_sprint_planning` additions are prior/pipeline artifacts, not sprint code.

Note: a stale `.git/index.lock` (no live git process; timestamp coincided with an unrelated concurrent cleanup — see lint note below) blocked a planned `git stash` cross-check on the dashboard type-check baseline. Left untouched rather than force-removed. Substituted a direct proof instead (below).

## 1. Independent re-run of SECTION 5, all commands, all green
```
$ pnpm --filter @beechcms/core build            → tsc, exit 0
$ pnpm --filter @beechcms/core test             → 52 files / 846 tests passed
$ npx tsc -p tsconfig.build.json --noEmit (apps/api) → No errors found
$ pnpm --filter @beechcms/api test:unit         → 121 files / 1368 tests passed
$ pnpm --filter @beechcms/api test:integration  → 12 files / 83 tests passed
    including all 4 seed-localization.integration.test.ts cases, individually confirmed:
    ✓ POST /api/seeds > refuses localized on number, a repeater sub-field and confidential text with 422...
    ✓ POST /api/seeds > accepts localized text, richtext and json branches and persists the flag
    ✓ PUT /api/seeds/:slug > toggles localized on a text branch with existing rows without touching columns...
    ✓ PATCH .../retype > refuses to retype a localized branch with 422 and leaves its type and column intact
$ pnpm --filter @beechcms/dashboard type-check   → 6 pre-existing errors, all in
    src/features/content-transfer/** and src/test/setup.ts — files this diff never touches (confirmed via
    the file list above), so these predate the sprint regardless of branch state.
$ pnpm beech test --diff                         → 1/8 FAIL: types.ts untested (0 executable statements,
    documented pre-existing script defect, same as MediaPresetTransforms). All 7 other touched files PASS
    (schema-fingerprint.ts, seed-validation.ts, serialize.ts, validation/cache.ts,
    validation/schema-builders.ts, search/vector-extractor.ts, seeds.destructive.ts).
$ pnpm lint                                      → "ESLint: No issues found" (stronger than the execution
    log's snapshot of 333 pre-existing errors in unrelated tooling scripts — those were fixed out-of-band
    between execution and this review, evidenced by bin/cli.mjs, eslint.config.js and two scripts/*.mjs
    showing as modified in the working tree independent of this sprint's file list).
```
All numbers match execution_log.md exactly except lint, which is now clean (an improvement, unrelated to this sprint).

## 2. Runtime verification
No dashboard/UI surface is touched (verified: zero files under `apps/dashboard` in the diff). The two
user-visible behavior changes — `POST/PUT /api/seeds` validation and the new `PATCH .../retype` guard — are
both HTTP-surface changes, and both are exercised end-to-end (Hono, full middleware chain, real D1) by the
integration tier re-run above, satisfying the runtime-verification bar for non-UI API changes without a
manual `pnpm beech dev` session.

## 3. Invariant audit (read from the diff directly, not from the plan's own claims)
- **Botanical invariant**: the only new read/write path into storage is the `serializeForDb` /
  `deserializeFromDb` codec addition (`packages/core/src/engine/serialize.ts:88-95,151-158`) — no new SQL,
  no repository edit. Every rule keys off `branch.type` / `branch.localized`, never a hardcoded alias.
- **VSA**: only `apps/api/src/features/seeds/seeds.destructive.ts` is touched in `apps/api`; no cross-slice
  import introduced (confirmed by reading its diff — the guard uses `branch`, already in scope).
- **Cloudflare purity**: zero new tables, zero migrations, zero DDL statements added.
- **Out-of-scope list** (SECTION 7): confirmed zero touched files under
  `apps/api/src/{public,middleware,shared,factory.ts,types.ts}`, `apps/api/migrations`, `apps/dashboard`,
  `packages/{client,api-client,mcp,cli,testing}` — none appear in the diff stat above.

## 4. Code review (traced by hand, not just re-stated from the plan)
- `serializeForDb`/`deserializeFromDb` ordering is correct: the dictionary codec runs before the
  type-switch, so a localized `text` branch never falls into the `default` case that nulls objects.
- `toLocalizedPatch` is genuinely idempotent (re-verified by tracing `detectMissingRequired`, which calls
  it on an already-validated patch on the happy path — `toLocalizedPatch({it:'x'}, cfg)` reproduces `{it:'x'}`).
- Required-field detection for an **absent** localized value: `localizedSchema`'s `z.any().transform` runs
  even for `undefined` (Zod does not short-circuit `any()` on `undefined`), producing `{it: null}` rather
  than a Zod `invalid_type` issue — but `detectMissingRequired` independently computes the same
  `toLocalizedPatch(...)[defaultLocale]` and correctly flags it missing, so there is no double-report and
  no silent pass-through. Confirmed by reading `processZodIssues`' skip condition
  (`validation/index.ts:377-384`), which only suppresses `invalid_type` issues — never fires here since our
  transform raises a `custom` issue only when `!allowNull`.
- Dangerous-richtext path prefixing (`schema-builders.ts` `localizedSchema`): `ctx.addIssue({ path: [locale,
  ...innerPath], params })` correctly bubbles to `body.en` through Zod's path-prefixing and preserves
  `params.dangerous`, which `processZodIssues` (`validation/index.ts:387-390`) reads unconditionally —
  verified end-to-end by the passing `flags dangerous richtext in one translation as alias.locale` test.
- Retype guard (`seeds.destructive.ts:247-254`) is placed after the repeater guard and before
  `requireConfirm`, matching the plan — rejects before spending a confirm token on a request that would be
  refused anyway.
- Fatal 17 correctly special-cases repeater sub-fields (checked independent of parent type) and both
  `classification` and legacy `privacy` storage spellings via the existing `resolveClassification`.

## 5. Test audit (`_config/testing_conventions.md` §8, walked per new/changed test file)
- Tier placement correct throughout: unit suites stay next to source in `packages/core`, the one
  integration suite lives in `apps/api/src/features/seeds/test/integration/`.
- Headers: `packages/core` tests use the two-line MIT+Copyright header with a blank line before imports —
  matches the existing precedent in the same package (e.g. `common/canonical-json.test.ts`), not a
  deviation. The new integration test uses the BUSL header per `apps/api` convention.
- `describe`/`it` naming: subject-first, no "should", matrix cases correctly justified under Rule 1.6
  (Fatal 17 type/classification matrices, the three-case `POST /api/seeds` refusal matrix).
- Four-zone anatomy respected in the integration suite; ACT results are named; preconditions inside ARRANGE
  are asserted in one line each (`expect(created.status).toBe(201) // precondition`), consistent with
  Rule 4.3.
- Integration suite provisions exclusively through the real Seeds API (`planCreateSeed`/`planExtendSeed`
  under the hood) and reads physical state only via `PRAGMA table_info` / `SELECT` — no hand-written DDL
  (Rule 3.7). Branch ids are read back dynamically (`subtitleBranch.id`), never hardcoded (Rule 3.6 spirit).
- Every write in the integration suite asserts persisted state; the negative cases assert the table was
  never created (Rule 5.5/5.6).
- Message-substring assertions in `seed-validation.test.ts` (`m.includes('localized is only supported')`)
  match the file's pre-existing idiom for all 16 other Fatal rules (`SeedValidationIssue` has no structured
  code field) — not a new deviation from Rule 5.4, which governs HTTP error-path tests.
- No forbidden patterns found: no `any`, no fake timers, no sleeps, no conditional assertions, no
  cross-slice/cross-test-file fixture imports (the dangerous-richtext literal is duplicated locally rather
  than imported from `richtext-sanitizer.test.ts`, per the plan's explicit instruction).

## 6. Acceptance criteria (SECTION 6), walked item by item
All 16 checkboxes verified independently and confirmed true: `Branch.localized` is additive-only; the
`localization.ts` export surface matches exactly (11 named exports, zero I/O, imports only
`types.js`+`primitives.js` — confirmed by reading the file); Fatal 17 covers every required case; the two
integration behaviors (illegal-combination refusal, metadata-only toggle, retype refusal) are proven at
runtime; validation with/without `localeConfig` behaves as specified; the json short-key false-positive is
guarded (`isLocalizedWriteDictionary` registration requirement); the codec and vector extractor changes are
byte-scoped to localized branches only; the schema-fingerprint stays version 1 and unchanged for non-localized
schemas; the out-of-scope file list is untouched; all SECTION 5 commands pass.

# Sprint Documentation
Sprint 1 of 5 (Field-Level Localization) teaches the Botanical Engine what a localized branch is: adds
`Branch.localized?: boolean`, a new pure `engine/localization.ts` module (locale-code grammar, dictionary
detection/patch normalization/compaction), Fatal 17 seed-validation rule, an optional `localeConfig` on
payload validation (dormant until a caller opts in — none do yet), a storage codec in `serialize.ts`, vector
extractor locale-flattening, and a schema-fingerprint field for the public contract. Also closes a real hole:
`PATCH .../retype` previously bypassed `validateSeedDefinitions` entirely and could retype a localized branch
out from under its stored dictionaries — now refused with `422 retype-localized-not-supported`. Every change
is additive and metadata-only; zero migrations, zero DDL, zero touched files outside `packages/core` and one
guard in the seeds slice. No deviations from the sprint plan were found. Known limitation carried forward
from the plan: no API handler passes `localeConfig` yet (Sprint 2), so the feature is fully wired but dormant
until the next sprint provisions project-level locale configuration.

## Handoff (Human Gate)
PASS on an intermediate sprint (1 of 5). Per pipeline rules, the human merges the branch and runs
`pnpm pipeline next` to archive this sprint and plan Sprint 2. No further action taken here.
