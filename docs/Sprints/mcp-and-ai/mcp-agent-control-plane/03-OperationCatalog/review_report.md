# Verdict
PASS

# Findings

No blocking findings. Non-blocking observations, for the record and for later sprints:

1. **(note, sprint 04)** `packages/core/src/operations/match.ts:44` — the left-most-literal precedence (as the plan specifies) disagrees with Hono's registration-order routing on 3 of 2812 probed concrete paths. All three are ghost collisions where an entry slug or view id is literally a route word:
   - `GET /api/content/x/by-slug/draft`: Hono → `drafts.get`, matcher → `content.getBySlug`
   - `DELETE /api/content/x/views/draft`: Hono → `drafts.discard`, matcher → `views.delete`
   - `GET /api/content/x/by-slug/backrefs`: Hono → `content.backrefs`, matcher → `content.getBySlug`

   Both sides of every pair have the **same scope and the same risk**, so no authorization outcome changes. The plan's claim that Hono resolves "every real collision" by specificity still holds for every collision that matters. Sprint 04, which wires the catalog into the middleware, should add a guard that fails if a future pair like this ever differs in scope or risk.
2. **(nit, tests)** `packages/core/src/operations/match.test.ts:41` (`ignores one trailing slash`) and `:53` (custom route → `null`) carry no why-comment. Suggested comments: "keeps the 1.x allowlist's `/?` tolerance (`oauth-scope.middleware.ts:L42`) so the sprint 04 swap preserves behaviour" and "custom routes are fail-closed by design (ROADMAP §3.11)". Not ranked as a Rule 6.2 MUST: the plan's Task 5 lists the required comments and these two are not among them.
3. **(nit, tests)** `toConcretePath` is duplicated in `match.test.ts:10` and `factory.operations-parity.test.ts:21` (Rule 3.12 is a SHOULD). Move it to `@beechcms/testing` if a third file needs it.
4. **(convention gap, not a finding)** Two points where `_config/testing_conventions.md` and the plan diverge. The plan is followed in both, with repo precedent:
   - `factory.operations-parity.test.ts:86-93` reads the filesystem (`existsSync`) inside a unit-tier test, which strictly conflicts with Rule 0.2. The plan prescribes it, `factory.docs-parity.test.ts:L12-28` already does the same, and it is a deterministic read-only check of a repo file.
   - The core test files use the MIT header instead of Rule 1.2's BUSL header. This follows plan fact 11 and 64 existing core test files.

   Suggest adding both exceptions to the conventions doc.

# Verification Evidence

**Diff scope:** `git rev-parse HEAD devs` gives the same commit for both (`e3f13cff`). The work is uncommitted: 6 files added with intent-to-add, plus 1 modified file. `git diff devs --name-status` shows exactly these 7 files:
- `apps/api/src/factory.operations-parity.test.ts`
- `packages/core/src/index.ts`
- `packages/core/src/operations/{types,catalog,match}.ts`
- `packages/core/src/operations/{catalog,match}.test.ts`

No other untracked files outside `stages/`. `git diff devs --stat` is empty for `packages/core/src/oauth`, `apps/api/src/middleware`, `factory.ts`, `routes.ts`, every `package.json` and `pnpm-lock.yaml`.

**SECTION 5, re-run independently (each via `bash -c`):**

| Command | Result |
|---|---|
| `pnpm --filter @beechcms/core build` | exit 0 |
| `pnpm --filter @beechcms/core type-check` | exit 0 |
| `pnpm --filter @beechcms/core test` | exit 0; 74 files, 1443 tests passed |
| `pnpm --filter @beechcms/api type-check` | exit 0 |
| `pnpm --filter @beechcms/api test:unit` | exit 0; 160 files, 2078 tests passed, including the 5 `factory.operations-parity.test.ts` cases (confirmed by name in the output) |
| `pnpm beech lint` | exit 0; 19/19 tasks successful |
| `pnpm beech test --diff` | exit 0; unit PASS, integration 101 files PASS; changed-line coverage 100% on `catalog.ts`, `match.ts`, `types.ts` |

**Row-by-row conformance (AC1):** a script parsed the plan's Task 3 tables and the `agent(...)`/`excluded(...)` calls in `catalog.ts`.
- Result: 142 vs 142 rows, 106/36 split on both sides, **0 mismatches** across id, method, path, exposure, scope, risk, reason key and docs file. The docs check applied each section's rule, including the per-row exceptions (storage rows, `stats.mediaLibrary`/`unusedMedia`/`storageSync`, qstash and search without docs).
- Catalog order matches the plan order.
- All 12 exclusion-reason strings are byte-identical to the plan.
- No summary is empty or ends with a period.
- The built `dist` reports `142 106 36`.

**Parity suite works in both directions (AC2):** `catalog.ts` was backed up to the scratchpad, mutated, core rebuilt, and the parity suite re-run each time.
- With the `search.query` row removed, `catalogues every route the factory mounts` fails with `expected [ 'GET /api/search' ] to deeply equal []`.
- With a ghost row `GET /api/ghost` added, `mounts every catalogued operation` fails with `expected [ 'GET /api/ghost' ] to deeply equal []`, and the RBAC test also fails with `[ 'ghost.op' ]`.
- Restored: `cmp` shows the file is identical to the backup; core rebuilt with exit 0.

**Hono vs matcher probe:** a temporary unit test (deleted afterwards; `git status` is clean of it) generated 2812 concrete `method path` pairs. These were each operation's path with params set to `x`, plus every literal that occurs at that position anywhere in the catalog. For each pair it compared the first route returned by `app.router.match()` against `matchOperation()`. Result: 3 diffs, all scope- and risk-equivalent (Finding 1).

**Edge probes on `dist`:**
- `matchOperation` returns `null` and does not throw for all of these: `get` in lower case, `OPTIONS`, `''`, `'/'`, `'//'`, `/api/seeds//` (two slashes), a query string, `/api/media/` and a path of 5000 slashes.
- One trailing slash is ignored on parameterised routes: `DELETE /api/content/posts/e1/` → `content.delete`.
- `resolveOperationRisk(content.update)` gives:
  - `publish` for a null-prototype `{status:'published'}` and for `'\tpublished\n'`. This matches `cleanStr`'s `trim()` (`query-utils.ts:53`) and `normalizeBody` (`handlers/helpers.ts:14`).
  - `write` for a status in an array, a status with `toString`, `42`, `true` and a `Date`.
- `content.delete` gives `write` for `purge` values `'TRUE'` and `' true'` (`handlers/delete.ts:38` uses exact `=== 'true'`).
- Not exported from `dist`: `EXCLUSION_REASONS`, `publishWhenStatusPublished`, `destructiveWhenPurge`, the `agent`/`excluded` constructors, `OperationBase`. No `agent:*` scope exists.

**Invariant audit:**
- `operations/*` imports only `./types.js`, `./catalog.js` and, in tests, `vitest` and `../oauth/scopes.js`.
- No zod, no D1, no Branch IDs or field names, no `apps/*` import from core.
- The only `apps/api` file is a factory-level test that imports `factory`, `middleware/*` and `shared/db/*`, with no `features/*` import.
- `any` appears only as an English word in two TSDoc comments.
- No `.skip`, `.only`, timers, `Date.now` or TODOs.
- TSDoc is present on every exported symbol.
- Headers: MIT on core files, BUSL on the api test (fact 11).

**Plan conformance:**
- Building blocks are verbatim: `OPERATION_SCOPES`, the operation types, both signatures, the `OPERATION_CATALOG` declaration, the 3 `export *` lines placed after `consent.repository.js`.
- Decisions honoured: local constructors, per-file docs constants, named risk functions, a lazily compiled matcher sorted by specificity and independent of catalog order (ties broken by path, then method), and no runtime consumer.
- Task 4 and the Task 5 test list are fully present, with names matching the plan.
- The handler facts (5, 6) were re-checked in source: `create.ts:47`, `update.ts` (`cleanStr(body.status) ?? current.status`), `delete.ts:38`.

**Testing conventions §8:** walked for all 3 test files.
- Single unit tier, colocated with the code; `describe` uses symbol names; one action per test with its result named.
- No mocks; fixtures come from the real constants and the real factory.
- Assertions are specific (`toEqual([])` on lists of offenders, with `> 0` used only as a guard against an empty set).
- Required why-comments are present (regression guard on notifications vs content delete, the trim parity, the purge parity, the `seeds.plan` dry-run, the 1.x scope swap).
- Deviations are listed under Findings 2-4.

**Runtime verification:** not applicable. The sprint adds metadata with no runtime consumer, and `factory.ts`, the middleware and the routers are unchanged (stat above), so API responses cannot change. The full api unit suite and the `--diff` integration suite are green. No dashboard UI was touched, so the design-system and token checks do not apply.

**Code review:** done inline over the full diff: the matcher's comparator is transitive and gives a total order, the regexes are anchored and literals escaped, and the risk rules hold for any body. It was backed by the mutation tests and the Hono probe above. The `/code-review` skill was not invoked.

# Sprint Documentation

- **Shipped:** `@beechcms/core` now exports the Operation Catalog (`packages/core/src/operations/`).
  - `OPERATION_CATALOG` classifies all 142 HTTP operations mounted by `createBeechApp()`: 106 `agent`, 36 `excluded`, each with a required reason.
  - `OPERATION_SCOPES` is the v2 scope vocabulary: 14 scopes, a superset of the 1.x `OAUTH_SCOPES`.
  - `matchOperation(method, path)` is precedence-by-specificity, fail-closed and returns `null` on any miss.
  - `resolveOperationRisk()` derives request-dependent risk: `publish` when the trimmed `status` is `published` on content create/update; `destructive` when `purge=true` exactly on content delete.
- **Guard:** `apps/api/src/factory.operations-parity.test.ts` fails CI when the router and the catalog disagree in either direction. It also checks RBAC coverage of agent operations, that the 5 legacy OAuth routes keep their scopes, and that every docs file exists.
- **Key decisions:**
  - The v2 scopes live in a separate constant (`OAUTH_SCOPES` is unchanged; sprint 04 merges them).
  - `exposure: 'agent'` holds exactly for routes under `apiProtected`, so `/auth/features`, `/api/v1/public/*` and `/api/media/*` are `excluded`.
  - There are no `agent:*` scopes and no bulk-size threshold (both belong to sprint 05).
  - `content.import` is statically `publish`; `content.bulkUpdate` is statically `write`.
- **Deviations from plan:** none.
- **Known limitations:**
  - Nothing reads the catalog at runtime yet.
  - The matcher accepts one trailing slash where Hono (strict) would not.
  - 3 ghost path collisions (slug literally `draft`/`backrefs`) resolve differently from Hono, with equal scope and risk.
  - Per ROADMAP §4.4, editing an already-published entry without sending `status` (and `bulkUpdate` on published rows) classifies as `write`, not `publish`. Sprint 05's gate policy should decide whether that is acceptable.
  - `/api/custom/*` routes are uncatalogued by design (fail-closed).
