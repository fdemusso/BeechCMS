## REWORK — Sprint 03: `@beechcms/search-client`

### Acceptance Criteria

- [x] `packages/search-client` contains 0 external runtime dependencies.
- [x] Client SDK correctly utilizes the Browser `Cache API` with ETag validation to minimize download overhead.
- [x] Vector dimensionality logic actively rejects `.bin` buffers that do not match the expected 384 dimensions.
- [x] Search gracefully degrades to pure lexical search on `429` or `503` responses from the API without throwing unhandled UI exceptions.
- [x] Successful typecheck and build inside `packages/search-client`.

### Rework Findings Addressed

1. **Unfiltered semantic results corrupting RRF scores** — Added `.filter(r => r.score > 0)` to `semanticResults` before passing to `addRankings`. Zero/negative dot-product records no longer receive RRF points.
2. **Debounce promise batching clobbers query arguments** — Replaced shared `pendingSearches` queue with a per-call `Symbol`-keyed `debounceTimers` Map. Each caller captures its own `query`/`limit` at call time and resolves only its own promise.
3. **Missing unit test suite for SearchClient** — Added `packages/search-client/src/client.test.ts` with 10 tests covering: `loadIndex` (happy path, dimension rejection, buffer-length mismatch), lexical matching, semantic embedding requests, 429/503/network-error graceful fallback, zero-score semantic filtering, and RRF rank fusion ordering.

### Validation Output

```bash
$ pnpm run build --filter @beechcms/search-client
• turbo 2.9.16

   • Packages in scope: @beechcms/search-client
   • Running build in 1 packages
   • Remote caching disabled

@beechcms/search-client:build: cache miss, executing 6bba2dd0af823a09
@beechcms/search-client:build: $ tsc

 Tasks:    1 successful, 1 total
Cached:    0 cached, 1 total
  Time:    802ms

$ pnpm vitest run --dir packages/search-client/src

 RUN  v4.1.8 /Users/flaviodemusso/Documents/Progetti/BeechCMS

 ✓ packages/search-client/src/utils/math.test.ts (1 test) 2ms
 ✓ packages/search-client/src/utils/cache.test.ts (3 tests) 25ms
 ✓ packages/search-client/src/client.test.ts (10 tests) 2050ms

 Test Files  3 passed (3)
      Tests  14 passed (14)
   Start at  13:43:21
   Duration  2.21s (transform 88ms, setup 0ms, import 113ms, tests 2.08s, environment 0ms)

$ pnpm type-check
• turbo 2.9.16

   • Packages in scope: @beechcms/api, @beechcms/cli, @beechcms/client, @beechcms/core, @beechcms/dashboard, @beechcms/forms-react, @beechcms/search-client, @beechcms/widget-sdk, beech-widget-hello-world
   • Running type-check in 9 packages
   • Remote caching disabled

 Tasks:    10 successful, 10 total
Cached:    9 cached, 10 total
  Time:    679ms
```
