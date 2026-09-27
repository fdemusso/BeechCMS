# Verdict
PASS

# Findings
None. No blocking correctness bugs or invariant violations found.

Non-blocking observations (do not affect the verdict):

1. **The branch has zero commits ahead of `devs`.** `git diff devs...HEAD` is empty; every change (Sprint 1
   `LocalizationCoreContracts`, Sprint 2 `LocalizedWritePath`, and this Sprint 3 `LocalizedReadNegotiation`)
   still lives in the uncommitted working tree, so `git diff devs` (used for this review, per the stage
   contract) mixes all three sprints together. I cross-checked every file outside this sprint's own
   SECTION 3 deliverable list (`apps/api/src/features/**`, `apps/api/src/shared/**`,
   `packages/core/src/engine/{serialize,seed-validation,schema-fingerprint}.ts`,
   `packages/core/src/search/**`, `site-settings.repository.d1.ts`, `settings.handler.ts`, etc.) against the
   already-archived Sprint 1 and Sprint 2 plans' own deliverable tables
   (`docs/Sprints/LocalizationCoreContracts/LocalizationCoreContracts.md:290-301`,
   `docs/Sprints/LocalizedWritePath/LocalizedWritePath.md:300-316`) and confirmed every one of them is
   attributable to a prior, already-PASSed sprint — none is new work introduced by this sprint's execution.
   `apps/dashboard`, `packages/{api-client,mcp,cli,testing}`, `factory.ts`, `types.ts`, `middleware/`,
   `migrations/`, and `ddl.ts` show a genuinely empty diff. This is a process note for whoever runs the human
   merge gate, not a defect in this sprint's execution.
2. **VETO §6 (pre-existing `publicEditHandler` leak)** is confirmed still present and unchanged
   (`apps/api/src/public/public-edit.ts:254,281`: `{ ...entry, ...updateData }` echoes the full stored row,
   not `filterEntryForActor`'s output). This sprint only wraps that object in `localizePublicEntry`, which
   does not touch its key set, exactly as the plan discloses and defers to a separate security bugfix. Flagging
   here only so the human gate sees it called out, not as a new finding against this sprint.

# Verification Evidence

All commands run from the repository root (`C:\Users\flavi\Desktop\beech-cms`) except where noted. I did not
rely on `execution_log.md`'s reported output for any of these — every command below was re-run independently
in this review session.

```
$ pnpm --filter @beechcms/core build
$ tsc
(exit 0)

$ pnpm --filter @beechcms/core test
 Test Files  52 passed (52)
      Tests  874 passed (874)
(matches execution_log.md exactly)

$ pnpm --filter @beechcms/client type-check
$ tsc --noEmit
(exit 0)

$ pnpm --filter @beechcms/client build
$ tsc
(exit 0)

$ pnpm --filter @beechcms/client test
 Test Files  7 passed (7)
      Tests  113 passed (113)
(matches execution_log.md exactly)

$ npx tsc -p tsconfig.build.json --noEmit   (run from apps/api/)
TypeScript: No errors found

$ pnpm --filter @beechcms/api test:unit
 Test Files  124 passed (124)
      Tests  1386 passed (1386)
(matches execution_log.md exactly)

$ pnpm --filter @beechcms/api test:integration
 Test Files  17 passed (17)
      Tests  120 passed (120)
(matches execution_log.md exactly — includes both new integration files:
 public-localization-read.integration.test.ts (14 cases, all green) and
 public-localization-write.integration.test.ts (5 cases, all green), run against real D1 via workerd)

$ pnpm --filter @beechcms/dashboard type-check
$ tsc -b
(exit 0)

$ pnpm beech test --diff
exit code 0 (verified explicitly: `pnpm beech test --diff; echo $?` -> 0). The coverage-threshold table
prints "FAIL 13/30 file(s) below threshold" as an advisory banner (expected: this sprint's tests target
behavior, not per-line coverage of already-covered handlers); every unit and integration suite it ran passed,
matching execution_log.md's characterization exactly.

$ pnpm lint
ESLint: No issues found

$ graphify update . --force
Rebuilt: 21632 nodes, 32614 edges, 2080 communities
(exit 0; counts differ slightly from execution_log.md's 21628/32611/2092 — expected drift from graph
rebuild churn, not a correctness signal)
```

**Invariant audit (Botanical Engine / VSA / Cloudflare purity):**
- `packages/core/src/engine/localization.ts` imports only `./types.js` and `./validation/primitives.js` —
  confirmed by reading the file (lines 12-13). No new core dependency.
- `apps/api/src/public/**` is the only `apps/api` slice touched; `git diff devs --stat` against
  `factory.ts`, `types.ts`, `middleware/`, `migrations/`, `features/**` (Sprint-3-attributable), `shared/**`
  (Sprint-3-attributable), `apps/dashboard`, `packages/{api-client,mcp,cli,testing}` and `engine/ddl.ts`
  returned no Sprint-3 changes (see Finding 1 above for the full-branch-diff caveat).
- `localizedColumnSql`/`inlineLocale` in `query.ts:28-60`: every interpolated locale code passes
  `isLocaleCode` (the same grammar used as the injection guard) before reaching the SQL string; confirmed
  by reading the code and by T2f (`buildSelectQuery` throws `TypeError` for `"en'); DROP TABLE x;--"`, `'EN'`,
  `'en_US'`) passing in the real test run above.
- No migration file, no DDL, no KV, no background job introduced — confirmed by `git diff devs --stat` against
  `apps/api/migrations` (empty) and by reading every one of the 15 production files listed in the plan's
  SECTION 3.

**Runtime verification:** this sprint changes Public API responses (flat localized values, `Content-Language`
/`Vary` headers, `400 invalid-lang`, filter/sort semantics), so I verified behavior at runtime rather than by
inspection alone: `public-localization-read.integration.test.ts` and
`public-localization-write.integration.test.ts` exercise the full Hono middleware chain against real D1
(workerd), asserting actual HTTP status, headers and response bodies, plus post-write DB state via direct SQL
reads. All 19 cases across both files passed in the independent run above — including the sorting regression
guard (T7-8: raw JSON-text order would give `['Orange', 'Apple']`; the negotiated-language order correctly
gives `['Apple', 'Orange']`) and the "no field localized -> zero observable difference" guard (T7-14).
There is no dashboard-visible change in this sprint (confirmed out of scope, SECTION 7), so no browser-based
check was needed.

**Manual code-vs-plan diff review:** every one of the 15 production files and 8 test files in SECTION 3 was
read in full and compared line-by-line against the plan's Task 1-12 specifications
(`localization.ts`, `types.ts`, `query.ts`, `policies.ts`, `public-language.ts` (new), `public-read.ts`,
`read-list.ts`, `read-single.ts`, `entry-projection.ts`, `relation-include.ts`, `relation-subquery.ts`,
`public-add.ts`, `public-edit.ts`, `packages/client/src/types.ts`, `packages/client/src/query-builder.ts`).
The implementation matches the plan's prescribed code near-verbatim; no deviation of substance found.

**Test audit against `_config/testing_conventions.md` §8** (walked for every new/changed test file):
tier placement correct (unit next to source, integration under `test/integration/`); SPDX/MIT headers
present; `describe`/`it` names follow §1 (symbol-named unit describes, behavior+outcome `it()` names, no
"should"); four-zone anatomy with act result named and no `// ARRANGE`/`// ACT` labels; integration tests go
through the harness/HTTP surface only, never a handler function or repository directly; writes assert
persisted state via direct D1 reads (T8), rejections assert a zero row count (T8 malformed-lang case); status
asserted before body; typed response bodies throughout, no `any` introduced by this sprint's test files
(confirmed by grep — the only `any` occurrences under `apps/api/src/public/*.test.ts` and
`packages/core/src/engine/*.test.ts` are in pre-existing files this sprint did not touch); matrix `it()`s
(T1/T2/T4) share one cause/arrangement per Rule 1.6; comments explain why, not what (e.g. the sorting
regression-guard comment, the `site_settings` shared-table comment). No MUST violation found.

# Sprint Documentation

Sprint 3 of 5 (Field-Level Localization) teaches the Public API to negotiate a response language
(`?lang` -> `Accept-Language` -> project default, or `?lang=all`) and resolves every localized branch to a
flat value before masking and `?fields` projection. `buildSelectQuery` gained an optional `SelectOptions.locale`
that swaps a localized column's bare reference for a self-contained SQL expression (same resolution chain as
the JS-side `resolveLocalizedValue`: requested -> default -> first stored translation), so filters, `ORDER BY`,
`?include` targets and relation subqueries all agree with what the flat response shows. `public-add`/
`public-edit` negotiate before writing (malformed `?lang` is a 400 with nothing written) and answer with the
negotiated language. The masked-visibility rule in core `filterEntryForActor` now masks each translation of a
dictionary instead of collapsing it to `null`. `@beechcms/client` gained `.lang(code)`.

Key decision carried from the plan (VETO §5c): a dictionary missing both the requested and default locale
resolves to its first stored translation rather than `null`, so changing the project's default language before
configuring `locales` never blanks a public site; the SQL twin in `query.ts` applies the identical fallback so
filter/sort results never disagree with the flat response.

Known, deliberate limitations (all explicitly out of scope, SECTION 7): authenticated reads
(`/api/content/*`) still return raw dictionaries and compare raw in filters; no dashboard locale UI; no
`LocaleConfig` caching; FTS locale keys remain tokens; the pre-existing `publicEditHandler` full-row echo is
untouched (a separate, already-identified security bugfix). A project with no localized branch is verified
(unit + integration) to incur zero extra `site_settings` reads, zero header changes and zero cache-key
changes.

Deviation from plan: none of substance. Implementation matches the plan's prescribed code almost verbatim.

## Handoff (Human Gate)
Verdict: PASS. This is Sprint 3 of 5 (Field-Level Localization) — an intermediate sprint, not the final one.
Per the stage contract: merge this branch, then run `pnpm pipeline next` (archives this sprint's docs, keeps
the feature brief + ROADMAP, and stage 01 plans Sprint 4 — `LocalizationDashboardSchema` per the roadmap).
I have not run `pnpm pipeline next` or `pnpm pipeline reset` myself.

Before merging, note Finding 1 above: this branch has zero commits ahead of `devs`, so the merge will bring in
Sprints 1, 2 and 3 together in whatever commit shape the human chooses at merge time.
