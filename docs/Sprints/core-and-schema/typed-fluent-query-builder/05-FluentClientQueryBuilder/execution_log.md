==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [x] `packages/client/src/query-builder.ts` implements a fluent chain API (`where`, `include`, `select`, `list`, `first`).
- [x] `packages/client/src/types.ts` is strongly typed over a generic `TRegistry`.
- [x] A mismatch between `X-Schema-Revision` header and the client's expected fingerprint returns a 409 `BeechProblem` instead of throwing implicitly.
- [x] Client HTTP requests (in browser and server variants) are constructed accurately from the fluent chain state.
- [x] Unit tests for `query-builder.ts` pass and strictly mock only network/fetch layers. No `any` types.

==========================================================================
REWORK — findings from review_report.md addressed
==========================================================================
1. `include?: string[]` added natively to `ListQuery` (types.ts); `(this.query as any).include` cast removed from `query-builder.ts`.
2. `as any` removed from `query-builder.test.ts` (typed `vi.importActual<typeof import('./types.js')>`).
3. `as any` removed from `server-client.test.ts` (typed generic + `as unknown as Partial<...>`).
4. Coverage raised to threshold for all changed files by adding tests:
   - `query-builder.test.ts`: logic OR, operator-object filters, invalid-operator throw, sort (default dir / explicit dir), search, fields, latest, page, limit cap/pass-through, `FluentQueryBuilder.first()`.
   - `browser/browser-client.test.ts`: `first()` 404-on-empty, `validate` option passthrough.
   - `server/server-client.test.ts`: `first()` 404-on-empty, `validate` option passthrough, slug/status extraction in `create`.
   - `http.test.ts` (new, unit tier): non-JSON content-type, missing Content-Type on failure, string error payload, failed `json()` parse on success, custom header merge.

==========================================================================
POST-REWORK FIX — apps/api consumer e2e test broken by API rename
==========================================================================
`apps/api/test/client-sdk-e2e.test.ts` still called the old `.content(seed)` API removed by this
sprint. Migrated it to the new fluent surface, per the sprint's own migration note
(`.content(seed).list(params)` → `.collection(seed)...list()`; `.content(seed).get(...)` →
`.collection(seed).where(...).first()`). 7 previously failing e2e tests now pass; full `apps/api`
suite: 151/151 files, 1629/1629 tests pass.

==========================================================================
REWORK 2 — findings from review_report.md (verdict REWORK_CODE) addressed
==========================================================================
1. Rule 1.1 / 1.4 — `describe('Client Schema Drift Validation', ...)` in `query-builder.test.ts`
   moved to `browser/browser-client.test.ts` (it exercises `browser/client.ts` via dynamic import,
   not `query-builder.ts`). Renamed to `describe('createBeechBrowserClient — schema fingerprint
   drift', ...)` to name the exported symbol per Rule 1.4.
2. Missing coverage — added the mirrored drift test to `server/server-client.test.ts`
   (`returns a 409 BeechProblem when X-Schema-Revision header does not match expected fingerprint`),
   asserting `verifySchemaFingerprint`'s 409 path on `.create()`.
   Fix note: both drift tests re-import the client module after `vi.doMock('../types.js', ...)`;
   without `vi.resetModules()` first, the statically-imported client (via `./index.js` at file top)
   stays bound to the real, unmocked `SCHEMA_FINGERPRINT` and the test always sees `error: null`.
3. Rule 2.2 (unassigned ACT result) — fixed in:
   - `query-builder.test.ts`: `builder...list()` and `builder...first()` calls now assign to
     `const result = await ...`, with `expect(result.error).toBeNull()` added.
   - `server-client.test.ts`: the two uncaptured `.create(...)` calls now assign to
     `const res = await ...`, with `expect(res.error).toBeNull()` added.
   - `http.test.ts`: the custom-headers `request(...)` call now assigns to `const res = await ...`,
     with `expect(res.error).toBeNull()` added.

==========================================================================
VALIDATION OUTPUT (REWORK 2)
==========================================================================

tsc output:
$ npx tsc --noEmit
The command exited with code 0.

build output:
$ pnpm run build
The command exited with code 0.

test output:
$ node bin/cli.mjs test --diff
  beech test — run test suite

BeechCMS — Git Diff Coverage Runner
  Runs Vitest coverage only for files changed on this branch
Base: devs  (mode: related tests)
Changed files detected: 9
[packages/client]
  ────────────────────────────────────────────────────────────
   [unit] vitest (related) — 5 source file(s)…
    Test Files  4 passed (4)
         Tests  49 passed (49)
      Duration  200ms (transform 9ms, setup 0ms, import 40ms, tests 96ms, environment 0ms)

  [unit] coverage
┌───────────────────────────────────────┬────────┬────────┬────────┬────────┬────────┐
│ File                                   │ Stmts  │ Branch │ Funcs  │ Lines  │ Status │
├───────────────────────────────────────┼────────┼────────┼────────┼────────┼────────┤
│ packages/client/src/browser/client.ts │ 100.0% │ 100.0% │ 100.0% │ 100.0% │ PASS   │
│ packages/client/src/http.ts           │ 100.0% │ 80.3%  │ 100.0% │ 100.0% │ PASS   │
│ packages/client/src/query-builder.ts  │ 100.0% │ 91.2%  │ 100.0% │ 100.0% │ PASS   │
│ packages/client/src/server/client.ts  │ 93.0%  │ 91.4%  │ 100.0% │ 95.1%  │ PASS   │
│ packages/client/src/types.ts          │ 100.0% │ 100.0% │ 100.0% │ 100.0% │ PASS   │
└───────────────────────────────────────┴────────┴────────┴────────┴────────┴────────┘
PASS  All 5 changed file(s) meet coverage thresholds.
The command exited with code 0.

graph sync:
$ graphify update .
Code graph updated.
