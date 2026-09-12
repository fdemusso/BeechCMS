# Verdict
PASS

# Findings


# Verification Evidence

1. `pnpm run build` in `apps/api/`:
   ```
   $ esbuild src/factory.ts --bundle --packages=external --platform=neutral --format=esm --outfile=dist/index.js && tsc -p tsconfig.build.json
   dist/index.js  533.3kb
   Done in 23ms
   ```
   *Result:* Passed (Exit code 0).

2. `npx tsc --noEmit` in `apps/api/`:
   *Result:* Passed (Exit code 0, no diagnostic errors).

3. `pnpm beech test --diff`:
   ```
   $ node bin/cli.mjs test --diff
     beech test — run test suite

   BeechCMS — Git Diff Coverage Runner
     Runs Vitest coverage only for files changed on this branch

   Base: devs  (mode: related tests)
   Changed files detected: 18

   [apps/api]
      [unit] vitest (related) — 5 source file(s)…
       Test Files  16 passed (16)
            Tests  103 passed (103)
         Duration  3.89s

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
         Duration  3.31s

      [integration] PASS

   PASS  All 5 changed file(s) meet coverage thresholds.
   ```
   *Result:* Passed (Exit code 0).

4. `npx vitest run src/public/test/integration/public-relation-expansion.integration.test.ts -c vitest.workers.config.ts` in `apps/api/`:
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
   ```
   *Result:* Passed (Exit code 0).

5. `graphify update .`:
   *Result:* Passed (Exit code 0, 13470 nodes, 24010 edges, 1160 communities synchronized).

# Sprint Documentation

Sprint 4 (`PublicApiRelationExpansion`) of the Typed Fluent Query Builder chain delivers server-side relation expansion for the Public API and the `X-Schema-Revision` header across all public endpoints.
Key features shipped:
- `schemaRevisionMiddleware` mounted at the entry of the public route group, attaching the deterministic schema revision digest (`v<version>:<sha256_hex_32>`) memoized via a WeakMap against the SeedRegistry.
- `expandRelations` supporting single (`multiple: false`) and multi (`multiple: true`) relations at depth 1, enforcing public read policy resolution, deduplicating aliases, bounding requests to max 3 includes and clamping target IDs at 200.
- Field projection independence: relation values are extracted from raw repository rows before public projection, ensuring `_includes` is populated even when `?fields=` excludes the foreign key alias.
- Full unit test coverage (>80% thresholds) across `public-read.ts`, `read-list.ts`, `read-single.ts`, `relation-include.ts`, and `schema-revision.ts`.
- Public relation expansion integration test suite running on real D1 Workerd test pool, asserting responses and headers across 200, 400, and 401 statuses.
- Complete documentation in `docs/reference/public-api.md`.
