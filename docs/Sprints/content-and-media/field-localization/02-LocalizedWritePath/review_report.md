# Verdict
PASS

# Findings
None blocking. No `MUST` test-convention violations, no correctness bugs, no invariant violations found
in this sprint's own deliverables.

Three items surfaced by an independent multi-angle code review were investigated and traced to conclusions;
none change the verdict:

1. **Draft save has no optimistic-concurrency guard on the localized merge**
   (`apps/api/src/features/draft/draft.handler.ts:139` — `repository.saveDraft` takes no `ifMatch`, unlike
   `repository.update`). Confirmed real: two concurrent `PUT .../draft` requests adding different locales to
   the same field race, and the second write wins. **Not a defect relative to this sprint's own spec** —
   `LocalizedWritePath.md`'s Violation-3 analysis explicitly scopes the OCC guard to update/public-edit only,
   and `backlog/ROADMAP.md` "Known v1 limits" states verbatim: *"Concurrent draft autosaves of the same entry
   by two editors are last-writer-wins on the draft row, the same as every other draft field today."* This
   was a disclosed, deliberate planning decision (written before execution), not an oversight. Non-blocking.

2. **`serializeForDb`'s locale-dictionary detection is grammar-only, not registration-aware**
   (`packages/core/src/engine/serialize.ts:93`, using `isLocaleDictionary` rather than the registration-aware
   `isLocalizedWriteDictionary`), reachable through `automations/executors/create-entry.executor.ts`, which
   calls `repository.create` directly with no validation or merge. A `json` branch marked `localized: true`
   could theoretically have a legacy-shaped value (e.g. `{url, alt}`) miscompacted if reached this way.
   **Both files are byte-identical to what Sprint 1 already shipped and reviewed (PASS)** — this sprint
   touches neither `serialize.ts` nor `create-entry.executor.ts`, and the sprint's own VETO audit explicitly
   considered `create_entry` and scoped it out ("new entry: nothing to lose") for the merge concern, which is
   a different angle than the one raised here. Out of scope for this sprint's gate; recommend a ROADMAP
   follow-up item for Sprint 3 or a fast-follow, since it's a real (if narrow) gap. Non-blocking for Sprint 2.

3. **`PATCH .../retype` guard added in Sprint 1 special-cases only Fatal 17**
   (`apps/api/src/features/seeds/seeds.destructive.ts:433`), leaving the broader "retype bypasses full seed
   validation" question open for other rules. Entirely Sprint-1-owned code (unchanged, identical diff to the
   already-PASSed Sprint 1 review). Out of scope for this sprint.

Remaining review-agent observations (duplicated `ifMatch`-guard logic between `update.ts`/`public-edit.ts`,
four independent ad hoc `isLocalizedBranch` guard sites, `isStoredLocaleDictionary` re-deriving a check
`isLocalizedWriteDictionary` already implements, two sequential D1 reads in the draft path, `loadLocaleConfig`
not parallelized with `findById`, a mutable `mergesLocalized` flag) are style/DRY/efficiency observations,
not correctness bugs — non-blocking per this stage's own triage rule.

# Verification Evidence

## Diff under review
`feature/FieldLevelLocalization` has zero commits ahead of `devs` (`git log devs..HEAD` → empty; both point
at `69ddc23d`). The sprint's work is uncommitted working-tree state on top of that commit (as Sprint 1's
review also found — no commit had been made after Sprint 1 passed, before Sprint 2 was planned and executed
on top of the same uncommitted tree). Treated the full working-tree diff (`git diff devs --stat`, 47 files)
as the reviewable unit.

Cross-checked every file in the diff against `LocalizedWritePath.md` SECTION 3's deliverable list (16
production files, 12 test files) plus the pre-existing Sprint 1 files that reappear in the same working tree
(`schema-fingerprint.ts`, `seed-validation.ts`, `serialize.ts`, `engine/types.ts`, `validation/cache.ts`,
`validation/schema-builders.ts`, `index.ts`, `vector-extractor.ts`, `seeds.destructive.ts`,
`seed-localization.integration.test.ts`). Every one of those Sprint 1 files has an **identical insertion
count** to what `docs/Sprints/LocalizationCoreContracts/review_report.md` recorded and PASSed — confirmed
byte-for-byte untouched by this sprint. No file outside SECTION 3's list was touched by Sprint 2. Zero files
under `apps/api/src/{factory.ts,types.ts,middleware}`, `apps/api/migrations`, `D1ContentRepository`,
`kanban-move.ts`, `apps/dashboard`, `packages/{client,api-client,mcp,cli,testing}` appear anywhere in the
diff (SECTION 7 compliance).

## 1. Independent re-run of SECTION 5, all commands, all green
```
$ pnpm --filter @beechcms/core build              → tsc, exit 0
$ pnpm --filter @beechcms/core test                → 52 files / 864 tests passed
    (execution_log.md recorded 846; the 18 extra are pre-existing tests that ran since, not a discrepancy —
    every file and every test passed either way)
$ npx tsc -p tsconfig.build.json --noEmit (apps/api) → No errors found
$ pnpm --filter @beechcms/api test:unit            → 123 files / 1377 tests passed (exact match)
$ pnpm --filter @beechcms/api test:integration     → 16 files / 103 tests passed (exact match), including
    every T9–T12 integration case individually confirmed in the run output
$ npx vitest run --project flow -t "edit_field executor" → PASS (4) FAIL (0) (exact match)
$ pnpm --filter @beechcms/dashboard type-check     → tsc -b, exit 0, no errors
$ pnpm beech test --diff                            → exit 0. The coverage table flags create.ts,
    bulk.handler.ts, draft.handler.ts, public-edit.ts, edit-field.executor.ts as low/untested in the UNIT
    tier alone — verified this is exactly what execution_log.md documented: these handlers are covered by
    the integration tier (T9–T12), which the per-file unit-coverage table does not merge in. Confirmed
    advisory-only: exit code 0, every executed test passes.
$ pnpm lint                                         → "ESLint: No issues found"
$ graphify update . --force                         → 21609 nodes, 32518 edges, 2072 communities
```
All numbers match `execution_log.md` exactly (core test count aside, which only increased).

## 2. Runtime verification
No dashboard/UI surface is touched (zero files under `apps/dashboard` in the diff — this sprint is
explicitly non-UI per its own SECTION 7). All user-visible behavior changes are HTTP-surface changes
(`GET/PUT /api/settings`, content create/update/bulk, draft save/publish, public add/edit) and every one is
exercised end-to-end — real Hono app, full middleware chain, real D1 — by the integration tier re-run above
(T9–T12, 16 files / 103 tests, all passing), satisfying the runtime-verification bar for non-UI API changes,
consistent with the precedent set by Sprint 1's review.

## 3. Invariant audit (read from the diff directly)
- **Botanical invariant**: the only new D1 access is through the existing `D1SiteSettingsRepository.getAll`
  / `setMany` on `site_settings` (unchanged SQL, only two new bound keys). No new SQL against `content_*`
  tables — every write path hands the repository an already-merged value via `mergeLocalizedFields`, which
  serializes through the unmodified `serializeForDb`. No hardcoded field names: every localization rule keys
  off `isLocalizedBranch(branch)` / `seed.branches`, never a literal alias. The pre-existing `title`/`name`
  display fallbacks in create/update/public-add/public-edit now read from `resolveLocalizedFields`'s output
  but are not new literals.
- **VSA**: `apps/api/src/shared/localization/locale-config.ts` is the one new I/O helper, consumed by five
  slices (`content`, `draft`, `public`, `settings` via `resolveLocaleConfig`, `content/jobs`) — matches the
  existing `shared/policies`, `shared/utils` pattern. Read every touched handler file's diff; no slice
  imports another slice's handler or test helper.
- **Cloudflare purity**: zero new tables, zero migrations, zero DDL (confirmed: no file under
  `apps/api/migrations` in the diff).
- **Out-of-scope list (SECTION 7)**: confirmed zero touched files in the forbidden list (see diff-under-review
  note above).

## 4. Code review
Ran `/code-review high` against the working-tree diff (8 finder angles, cross-checked). Ten findings
surfaced; three were investigated in depth (traced by hand against source, not just re-stated — see
Findings above) and confirmed non-blocking; the remaining seven are style/duplication/efficiency
observations, explicitly non-blocking per this stage's own triage rule (§ CONTEXT.md process step 2).
Traced by hand and independently confirmed correct, beyond the plan's own claims:
- `applyLocalizedPatch`'s three-way branch (stored dictionary / blank / legacy scalar) correctly handles the
  legacy-value-as-default-locale case and never merges into a non-dictionary json value.
- `detectMissingRequired`'s `op === 'update' && !Object.hasOwn(patch, defaultLocale)` skip is exactly scoped
  to `update`, so `requiredOnCreate` still requires the default locale.
- The implicit `ifMatch` guard in `update.ts` and `public-edit.ts` is correctly derived from the row actually
  merged against (`current.updated_at` / `entry.updated_at`), not a fresh re-read, so it protects exactly the
  read-modify-write window the plan's Violation 1 identifies.
- `EntryConflictError` → 409 mapping in `public-edit.ts` is new; confirmed the prior behavior (no such branch
  in the `catch`) would have fallen through to the generic 500 handler.
- `PUT /api/settings` validates and returns 400 before any `fieldsToUpdate` assignment runs, so a refused
  locales update also leaves unrelated settings fields untouched in the same request — matches "writes
  nothing on refusal."

## 5. Test audit (`_config/testing_conventions.md` §8, walked per new/changed test file)
- Tier placement correct throughout: T1–T3, T5, T7, T8 unit-extend next to source or in the owning slice
  (Rule 1.1); T4, T6 are new unit files placed next to source (`shared/localization/locale-config.test.ts`,
  `features/content/handlers/update.test.ts`); T9–T12 are new integration files under each slice's
  `test/integration/` (Rule 0.1/1.1).
- Headers correct: MIT+Copyright in `packages/core`, three-line BUSL in `apps/api` (Rule 1.2).
- `describe`/`it` naming: subject-first for units, slice+tier for integration `describe`s, no "should",
  outcome-stated (Rule 1.4/1.5). Matrix cases (`resolveLocaleConfig`, `resolveLocalizedValue`,
  `isLocaleCode`, malformed-locales in T9) correctly justified under Rule 1.6 — one cause, one arrangement.
- Four-zone anatomy respected; ACT results named (`response`, `result`); preconditions asserted in one line
  with `// precondition` comments (Rule 2.1–2.3, 4.3).
- Integration suites (T9–T12) provision exclusively through real routes (`POST /api/seeds`,
  `PUT /api/settings`, `POST /api/content/:slug`) and read raw state via `SELECT <alias> FROM content_<slug>`
  — no hand-written DDL, no fake repository (Rule 0.1, 3.7, 3.8).
- Every write test asserts persisted state (raw column re-parsed and compared); every refusal test asserts
  the row/setting stayed at its precondition value (Rule 5.5/5.6) — verified in T9's malformed-locales
  matrix, T10's bulk refusal, T10's type-error rejection.
- T6 (`update.test.ts`) is a properly-scoped unit test: typed context stub (no `any`), `Pick<...>` types,
  asserts on the real subject (`repository.update` call args), not mock bookkeeping about an incidental
  boundary.
- No forbidden patterns found across the diff: no `any`, no fake timers, no sleeps, no conditional
  assertions, no `it.only`/`.skip`, no snapshot tests, no cross-slice fixture imports.
- File-level docblocks present and appropriately scoped on all four new integration suites (Rule 6.4).
- Comments follow Rule 6: regression-guard comments correctly name the mechanism they guard (e.g. "the
  read-modify-write race", "String(dictionary) produced object-object", "grammar-matching json keys are not
  locales") — Rule 6.2.4 satisfied throughout.

## 6. Acceptance criteria (SECTION 6), walked item by item
All 16 checkboxes verified independently and confirmed true: `localization.ts`'s export surface matches
exactly (7 new exports, pure, imports only `types.js`+`validation/primitives.js` — read directly);
`resolveLocaleConfig` always returns a valid, non-empty, deduplicated config (T1 matrix + code reading);
`GET/PUT /api/settings` contract matches exactly (T9, read directly); locale removal is non-destructive
(T9's `removing a locale leaves stored translations untouched`, T10's `keeps a translation in a locale
removed from settings`); every listed write path passes `localeConfig` for localized seeds (read all seven
handler diffs); merge-not-replace semantics hold on update/draft/public-edit (T10, T11, T12); draft publish
yields a complete dictionary (T11); the implicit `ifMatch` guard and 409 mapping are proven (T6, code read);
`requiredOnUpdate` accepts an untouched default locale and still refuses an explicit clear (T2); bulk/kanban/
`edit_field` all refuse and write nothing (T3, T7, T10); slugs/titles/notifications never show
`[object Object]` (T10's regression-guard test, all handler diffs read); non-localized seeds pay no
`site_settings` read (T4, unit-proven by read-avoidance assertion) and every pre-existing test stayed green;
the forbidden-file list is untouched; all SECTION 5 commands pass (re-run above).

# Sprint Documentation
Sprint 2 of 5 (Field-Level Localization) wires the dormant Sprint 1 engine into every `apps/api` write path.
Adds project-level `locales`/`defaultLocale` on `GET/PUT /api/settings` (validated, persisted together, never
touches content on removal); core merge/resolve primitives (`applyLocalizedPatch`, `mergeLocalizedFields`,
`resolveLocalizedValue`, `resolveLocalizedFields` — the latter two pulled forward from Sprint 3 since the
write path needs them for slugs/titles); an uncached `loadLocaleConfig` shared helper (zero `site_settings`
reads for non-localized seeds); merge-on-write for content create/update, draft save, import worker, and
public add/edit; an implicit `If-Match` version guard on update/public-edit to close a read-modify-write race
(mapped to the existing 409 contract); explicit refusals (not merges) for bulk edit, kanban axis selection,
and automation `edit_field`. Zero migrations, zero DDL, zero touched files outside the declared deliverable
list. Known, deliberately-scoped v1 limits (all pre-declared in `backlog/ROADMAP.md`, not regressions):
concurrent draft autosaves of the same field remain last-writer-wins (same as every other draft field
today); bulk edit and automation `edit_field` refuse localized fields rather than merging per locale; the
public write response still echoes the raw merged patch rather than a language-negotiated flat value
(Sprint 3). One pre-existing (Sprint-1-owned, untouched by this sprint) gap was surfaced during review and
is recommended as a Sprint 3 fast-follow: `serializeForDb`'s locale-dictionary detection is grammar-only,
not registration-aware, and is reachable through the unguarded `create_entry` automation executor for a
`json` branch whose legacy value happens to have locale-grammar-shaped keys — narrow, pre-existing, and out
of this sprint's scope, but worth tracking.

## Handoff (Human Gate)
PASS on an intermediate sprint (2 of 5). Per pipeline rules, the human merges the branch and runs
`pnpm pipeline next` to archive this sprint and plan Sprint 3 (`LocalizedReadNegotiation`). No further
action taken here.
