# Execution Log: PublicApiRelationExpansion (Rework)

## Acceptance Criteria Checklist

- [x] `X-Schema-Revision` header appears on all `/api/v1/public/*` responses (including 400s/401s).
- [x] `include=branch_alias` fetches depth=1 relations securely.
- [x] `include=unauthorized_branch` returns 400 Bad Request.
- [x] `include=nested.branch` (depth > 1) returns 400 Bad Request.
- [x] No raw D1 queries are used; all queries go through `ContentRepository`.
- [x] New canonical seeds correctly allow integration testing for single and multiple public relations.

## Validation Output

### 1. `pnpm run build` (apps/api)
```
$ esbuild src/factory.ts --bundle --packages=external --platform=neutral --format=esm --outfile=dist/index.js && tsc -p tsconfig.build.json

  dist/index.js  533.3kb

⚡ Done in 23ms
```

### 2. `npx tsc --noEmit` (apps/api)
```
Exit code: 0 (no diagnostic errors)
```

### 3. `pnpm beech test --diff`
```
$ node bin/cli.mjs test --diff

  beech test — run test suite


BeechCMS — Git Diff Coverage Runner
  Runs Vitest coverage only for files changed on this branch

Base: devs  (mode: related tests)

Changed files detected: 18

[apps/api]
  ────────────────────────────────────────────────────────────
   [unit] vitest (related) — 5 source file(s)…
    Test Files  16 passed (16)
         Tests  103 passed (103)
      Duration  3.89s (transform 974ms, setup 0ms, import 10.29s, tests 10.39s, environment 1ms)

   [unit]
┌─────────────────────────────────────────┬────────┬────────┬────────┬────────┬────────┐
│ File                                    │ Stmts  │ Branch │ Funcs  │ Lines  │ Status │
├─────────────────────────────────────────┼────────┼────────┼────────┼────────┼────────┤
│ apps/api/src/public/public-read.ts      │ 91.2%  │ 83.3%  │ 100.0% │ 93.8%  │ PASS   │
│ apps/api/src/public/read-list.ts        │ 100.0% │ 85.7%  │ 100.0% │ 100.0% │ PASS   │
│ apps/api/src/public/read-single.ts      │ 91.7%  │ 90.0%  │ 100.0% │ 91.7%  │ PASS   │
│ apps/api/src/public/relation-include.ts │ 96.6%  │ 83.7%  │ 100.0% │ 100.0% │ PASS   │
│ apps/api/src/public/schema-revision.ts  │ 100.0% │ 100.0% │ 100.0% │ 100.0% │ PASS   │
└─────────────────────────────────────────┴────────┴────────┴────────┴────────┴────────┘

   [integration] vitest (full) — 5 source file(s)…
    Test Files  3 passed (3)
         Tests  21 passed (21)
      Duration  3.31s (transform 3.63s, setup 91ms, import 7.70s, tests 487ms, environment 2ms)

   [integration] PASS

──────────────────────────────────────────────────────────────────────
PASS  All 5 changed file(s) meet coverage thresholds.
```

### 4. `npx vitest run src/public/test/integration/public-relation-expansion.integration.test.ts -c vitest.workers.config.ts` (apps/api)
```
 RUN  v4.1.11 /Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/api

 ✓  integration  src/public/test/integration/public-relation-expansion.integration.test.ts > public slice — integration (real D1) relation expansion > include=category_id expands single relation securely on a single post 49ms
 ✓  integration  src/public/test/integration/public-relation-expansion.integration.test.ts > public slice — integration (real D1) relation expansion > populates _includes even when fields parameter excludes the relation foreign key alias 16ms
 ✓  integration  src/public/test/integration/public-relation-expansion.integration.test.ts > public slice — integration (real D1) relation expansion > include=related_posts expands multiple relations as an array of public entries 16ms
 ✓  integration  src/public/test/integration/public-relation-expansion.integration.test.ts > public slice — integration (real D1) relation expansion > rejects include pointing to an unauthorized branch with 400 Problem Details 19ms
 ✓  integration  src/public/test/integration/public-relation-expansion.integration.test.ts > public slice — integration (real D1) relation expansion > rejects include pointing to a non-existent branch with 400 Problem Details 13ms
 ✓  integration  src/public/test/integration/public-relation-expansion.integration.test.ts > public slice — integration (real D1) relation expansion > rejects nested dotted include paths with 400 Problem Details enforcing depth 1 limit 13ms
 ✓  integration  src/public/test/integration/public-relation-expansion.integration.test.ts > public slice — integration (real D1) relation expansion > attaches X-Schema-Revision header matching versioned digest pattern on 200 responses 14ms
 ✓  integration  src/public/test/integration/public-relation-expansion.integration.test.ts > public slice — integration (real D1) relation expansion > attaches X-Schema-Revision header on 400 Bad Request error responses 9ms
 ✓  integration  src/public/test/integration/public-relation-expansion.integration.test.ts > public slice — integration (real D1) relation expansion > attaches X-Schema-Revision header on 401 Unauthorized error responses 8ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  12:43:11
   Duration  3.14s (transform 1.12s, setup 30ms, import 2.54s, tests 160ms, environment 0ms)
```

### 5. `graphify update .`
```
Graph updated: 13470 nodes, 24010 edges, 1160 communities. AST synchronized.
```
