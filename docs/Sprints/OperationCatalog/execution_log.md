# Execution Log — OperationCatalog (sprint 03)

Branch: `feature/operation-catalog` (from `devs`). Not committed. New files marked intent-to-add (`git add -N`) so `pnpm beech test --diff` sees them.

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `OPERATION_CATALOG` has exactly 142 entries: 106 `agent`, 36 `excluded`, matching Task 3 row by row
      (id, method, path, scope, risk, docs, exclusion reason). — `node` count on `dist`: `142 106 36`.
- [x] `factory.operations-parity.test.ts` passes, and fails when a route is added to any router without a
      catalog entry, or a catalog entry is left for a removed route. — Checked: `search.query` row commented out →
      `expected [ 'GET /api/search' ] to deeply equal []`; row restored, suite green.
- [x] Every `excluded` entry has a non-empty `excludedReason`; the type makes it required.
- [x] `matchOperation` is precedence-by-specificity, never throws, returns `null` on any miss; every operation
      self-matches from a concrete path.
- [x] `resolveOperationRisk` mirrors the handlers: trimmed `status === 'published'`, exact `purge === 'true'`.
- [x] `OPERATION_SCOPES` ⊇ `OAUTH_SCOPES`; every v2 scope is used; no `agent:*` scope.
- [x] `packages/core/src/operations/*` imports nothing outside `packages/core/src` and no new dependency is
      added to any `package.json`; no zod in the operations module.
- [x] `OAUTH_SCOPES`, `oauth-scope.middleware.ts`, `permission.middleware.ts`, `factory.ts`, `routes.ts` are
      unchanged (`git diff --stat` shows only the 6 new files and `packages/core/src/index.ts`).
- [x] No `any` in new code or tests; TSDoc on every exported symbol; headers per fact 11.
- [x] All Section 5 commands exit 0.

## SECTION 5 — VALIDATION OUTPUT

```
$ pnpm --filter @beechcms/core build        → exit 0 ($ tsc)
$ pnpm --filter @beechcms/core type-check   → exit 0 ($ tsc -p tsconfig.typecheck.json)
$ pnpm --filter @beechcms/core test         → exit 0
   Test Files  74 passed (74)
        Tests  1443 passed (1443)
$ pnpm --filter @beechcms/api type-check    → exit 0
$ pnpm --filter @beechcms/api test:unit     → exit 0
   Test Files  160 passed (160)
        Tests  2078 passed (2078)
$ pnpm beech lint                           → exit 0
   Tasks:    19 successful, 19 total
$ pnpm beech test --diff                    → exit 0
   Test Files  101 passed (101)
   Tests  761 passed (761)
   [integration] PASS
   PASS  Tests: every selected test run passed.
   PASS  Coverage: all 3 changed file(s) meet the changed-line threshold.
$ graphify update .                         → Rebuilt: 19759 nodes, 46803 edges, 1056 communities
```

```
$ git diff --stat (incl. intent-to-add)
 apps/api/src/factory.operations-parity.test.ts |  95 ++++++++++
 packages/core/src/index.ts                     |   3 +
 packages/core/src/operations/catalog.test.ts   | 117 ++++++++++++
 packages/core/src/operations/catalog.ts        | 252 +++++++++++++++++++++++++
 packages/core/src/operations/match.test.ts     | 126 +++++++++++++
 packages/core/src/operations/match.ts          |  89 +++++++++
 packages/core/src/operations/types.ts          |  70 +++++++
 7 files changed, 752 insertions(+)
```
