# Verdict
REWORK_CODE

# Findings

## 1. Debounce is non-functional — `client.ts:37-48`

**File:** `packages/search-client/src/client.ts`, lines 37–48  
**What is wrong:**  
`search()` calls `const key = Symbol()` on every invocation. `Symbol()` produces a **globally unique** value, so `this.debounceTimers.get(key)` at line 39 will **always** return `undefined`. The previous timer is never cancelled. Every rapid call to `search()` spawns its own independent 250 ms timer; all of them eventually fire, issuing `N` concurrent embed API requests.

**Symptoms:**
- Fast typists send `N` parallel embed calls instead of 1 coalesced one.
- The API rate-limiter (`429`) is hit far more easily than the design intended.
- Promise resolution order is non-deterministic: the response for "TypeScri" may resolve *after* "TypeScript", surfacing stale results.
- The plan's stated requirement ("debounced queries, 250–300 ms") is unmet.

**Expected behaviour:**  
A single stable key (e.g., a class-level `debounceTimer` field) must be used so that issuing a new `search()` call cancels the still-pending timer from the previous call.

**Minimal correct pattern:**
```typescript
private debounceTimer: ReturnType<typeof setTimeout> | null = null;

async search(query: string, limit = 10): Promise<SearchResult[]> {
  return new Promise((resolve, reject) => {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this._executeSearch(query, limit).then(resolve).catch(reject);
    }, 250);
  });
}
```

**Missing test:** There is no test verifying that two rapid successive `search()` calls result in only one `_executeSearch` invocation. A regression test must be added alongside the fix.

---

## 2. Pre-existing type error in `@beechcms/api` (non-blocking, not introduced by this sprint)

**File:** `apps/api/src/features/search/handlers/full-text-search.ts`, line 52  
**Error:** `pnpm type-check` fails workspace-wide because `searchOptions` passes `{ pageSize, … }` where `SearchQueryOptions` requires `{ limit, … }`. This file does not exist on `devs` — it was introduced by an earlier sprint (commit `af67e36`, Jul 2026) and is outside the scope of Sprint 3.

**Action:** Noted for the record only. Sprint 3's own package (`@beechcms/search-client`) type-checks cleanly in isolation (`pnpm --filter @beechcms/search-client type-check` exits 0). The workspace-level failure is **pre-existing and unrelated to this sprint's diff**.

---

# Verification Evidence

```bash
# 1. Build
$ pnpm run build --filter @beechcms/search-client
Tasks: 1 successful, 1 total (cache hit)
Exit code: 0  ✓

# 2. Test suite
$ pnpm vitest run --dir packages/search-client/src
 ✓ packages/search-client/src/utils/math.test.ts   (1 test)   1ms
 ✓ packages/search-client/src/utils/cache.test.ts  (3 tests)  25ms
 ✓ packages/search-client/src/client.test.ts       (10 tests) 2049ms
 Test Files  3 passed (3)
 Tests       14 passed (14)
Exit code: 0  ✓

# 3. Package-scoped typecheck
$ pnpm --filter @beechcms/search-client type-check
Exit code: 0  ✓

# 4. Workspace-wide typecheck
$ pnpm type-check
@beechcms/api:type-check: FAILED
  apps/api/src/features/search/handlers/full-text-search.ts(56,29):
  error TS2345: Property 'limit' is missing … (pageSize used instead)
Exit code: 2  ✗  (pre-existing; file absent from devs branch, introduced in af67e36)

# 5. Runtime dependency audit
$ grep -n "from " packages/search-client/src/client.ts \
    packages/search-client/src/index.ts \
    packages/search-client/src/utils/cache.ts \
    packages/search-client/src/utils/math.ts
All imports are relative (./…). Zero @beechcms/* or third-party packages imported.  ✓

# 6. Invariant audit
- No D1 / apiToDb / dbToApi usage in packages/search-client/  ✓
- No cross-feature or cross-slice imports                     ✓
- No hardcoded Branch IDs or field names                      ✓
- No touches to SECTION 7 (UI components / dashboard)         ✓

# 7. Debounce behaviour analysis (manual code inspection)
client.ts:37  → const key = Symbol()              // new unique symbol per call
client.ts:39  → this.debounceTimers.get(key)      // ALWAYS undefined; Symbol is unique
client.ts:40  → if (prev) clearTimeout(prev)      // dead code — prev is always undefined
Conclusion: debounce cancellation never executes.  ✗
```

---

# Sprint Documentation

**Sprint 3 — `@beechcms/search-client` (Hybrid Search Client SDK)**

Introduced a new zero-dependency isomorphic package `packages/search-client` (`@beechcms/search-client`). The package implements two-tier hybrid search: Tier 1 lexical matching against the R2-hosted JSON manifest and Tier 2 semantic search via the `GET /api/v1/public/search/embed` edge endpoint, fused with Reciprocal Rank Fusion (k=60). The Browser Cache API (with ETag / `If-None-Match`) is used to minimise `.bin` vector re-downloads; an IndexedDB fallback is provided for non-Service-Worker contexts.

A rework cycle (REWORK #1) correctly addressed zero-score semantic result filtering and delivered a 14-test suite across math, cache, and client behaviour.

**Defect requiring rework:** The per-call `Symbol()` debounce key pattern renders the debounce non-functional. Every `search()` call fires independently after 250 ms rather than cancelling its predecessor. This must be corrected before merge, along with a regression test verifying cancellation behaviour. The workspace-level `pnpm type-check` failure (`apps/api` `pageSize`/`limit` mismatch at `full-text-search.ts:56`) pre-dates this sprint and is unrelated to the diff.
