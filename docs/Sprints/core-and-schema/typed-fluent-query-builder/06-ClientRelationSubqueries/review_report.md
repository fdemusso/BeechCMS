# Verdict
PASS

# Findings
None.

# Verification Evidence

**Independent re-run of SECTION 5 — VALIDATION (all commands re-executed fresh, not trusted from execution_log.md):**

```
$ cd packages/core && npx tsc --noEmit && pnpm run build   → clean
$ cd packages/client && npx tsc --noEmit                    → clean
$ cd apps/api && npx tsc --noEmit                            → clean

$ cd apps/api && npx vitest run -c vitest.workers.config.ts \
    src/public/test/integration/public-relation-subquery.integration.test.ts \
    src/public/test/integration/public-relation-expansion.integration.test.ts
  → 2 files, 16 tests passed (7 new + 9 unchanged sprint-4 tests)

$ cd apps/api && npx vitest run \
    src/public/relation-include.test.ts src/public/relation-access.test.ts \
    src/public/relation-subquery.test.ts src/public/query-builder.test.ts \
    src/shared/db/repositories/content.repository.d1.test.ts
  → 5 files, 167 tests passed

$ cd packages/client && npx vitest run src/query-builder.test.ts
  → 22 tests passed, including 5 new whereRelation() cases

$ pnpm beech test --diff
  → packages/client: 3 files/48 tests PASS, coverage 100/94.7/100/100 on query-builder.ts
  → apps/api unit: 18 files/248 tests PASS
    - public-read.ts, query-builder.ts, read-list.ts, relation-include.ts: PASS
    - content.repository.d1.ts: LOW branch 64.2%<70% — confirmed pre-existing
      (execution_log.md's git-stash claim re-verified: this file's branch coverage
       is a legacy gap in untouched methods (updateWithKanbanPosition, findPendingDrafts
       edges); the sprint's own addition findParentIdsByRelation carries 3 dedicated unit
       cases + is exercised by all 7 new integration tests)
  → apps/api integration: 4 files/28 tests PASS
  → Overall: FAIL 1/7 (the pre-existing debt above) — matches execution_log.md's report exactly

$ graphify path "publicReadHandler" "D1ContentRepository"  → No directed path found.
$ graphify path "publicReadHandler" "queryD1"               → No directed path found.
$ graphify path "readListEntries" "D1BackrefRepository"     → No directed path found.

$ grep -rn "prepare(\|jTable(\|rel_" apps/api/src/public/ --include="*.ts" | grep -v "\.test\.ts"
  → no matches (Botanical Invariant holds: public slice issues zero SQL)
```

**Code review:** Read every changed/new production file in full
(`relation-access.ts`, `relation-subquery.ts`, `query-builder.ts`, `read-list.ts`,
`relation-include.ts`, `public-read.ts`, `content.repository.d1.ts`,
`static-content.repository.ts`, `content.repository.ts`, client `types.ts`/`query-builder.ts`/`index.ts`)
against the plan's SECTION 4 code listings — diffs match the approved blueprint almost verbatim.
Traced the one edge case worth checking by hand: a single-relation `not_in` with a plain array value
bypasses the "relation only supports `in`" guard in `resolveRelationSubqueries` (it takes the
early "single relation is a plain column" branch before the op check). Verified this is intentional,
not a regression: single-relation columns supported `not_in` before this sprint via ordinary
`toEngineFilters`, and the plan/brief's `not_in`-refusal rule targets subquery/multi-relation
resolution specifically (confirmed against relation-subquery.test.ts:151-158, which tests exactly
the multi-relation case). Not a finding.

**Invariant audit:** No `apps/api/src/features/**` import; `relation-subquery.ts`/`relation-access.ts`
import only `@beechcms/core` and sibling `./query-builder`. `findParentIdsByRelation`'s junction
`SELECT` lives solely in `D1ContentRepository`, table name from `jTable()`, all values parameterized.
No hardcoded field names — every lookup by `branch.alias`. SECTION 7 out-of-scope list respected:
no migration, no `apps/dashboard`, no `packages/cli`, no `packages/core/src/engine/*` touched.

**Test audit (§8 checklist, all 6 test files in the diff):** Each is single-tier (unit:
`relation-access.test.ts`, `relation-subquery.test.ts`, `query-builder.test.ts` ×2,
`content.repository.d1.test.ts` addition; integration: the new subquery suite). SPDX headers present,
four-zone anatomy observed, ACT results named, no `any`, status asserted first, error-path tests assert
`type`/error code not message text, fixtures are canonical (`categories`/`posts`/`author_id` negative
case), writes assert persisted D1 state (regression-guard comments included per Rule 6.2.4). No MUST
violations found.

**Acceptance criteria (SECTION 6):** Walked all 13 items against the runtime evidence above — all
verified independently, all pass, matching execution_log.md's self-report line for line.

# Sprint Documentation
Closes the #381→#385 chain (`ClientRelationSubqueries`, sprint 6/6). Adds relation subquery filtering:
`?filter=` now accepts a nested `{where, logic}` object as an `in` condition's value, resolved
server-side against a declared-reachable relation's target seed (reusing the `?include=` admission
gate, extracted into `relation-access.ts`). Multi-relations resolve through one new core-interface
method, `findParentIdsByRelation`, implemented against the junction table in `D1ContentRepository`
(and in-memory in `StaticContentRepository`) — no new SQL surface in the public slice. Client gains
`.whereRelation(alias, subquery)` on the fluent chain, encoding into the existing `filter` parameter.
Fixes two latent defects along the way: a multi-relation `in` filter previously 500'd, and an
`in` filter with a non-array value was previously silently dropped (returning the whole unfiltered
collection) instead of erroring. Known limitation, deliberately deferred: inner subquery field names
are validated server-side only, not typed — needs a relation→target-seed map in the type generator,
scoped as a future RFC. One pre-existing coverage gap on `content.repository.d1.ts` (legacy methods,
unrelated to this sprint) remains below the 70% branch threshold; not introduced or worsened here.

## Handoff (Human Gate)
PASS on the final sprint of the chain. Per CONTEXT.md: human merges the branch, then runs
`pnpm pipeline reset` (archives everything to `docs/Sprints/` and closes the feature). Not run here.
