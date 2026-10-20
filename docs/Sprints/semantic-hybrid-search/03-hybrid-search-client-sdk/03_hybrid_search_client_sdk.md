### Pre-Computation Analysis
a) "God Nodes": None directly affected. The `publicSearchRouter` in `apps/api` handles the `/embed` endpoint, but it is purely consumed via HTTP. The new package `@beechcms/search-client` is completely isolated and introduces no modifications to `AppEnv` or the `BotanicalEngine`.
b) Architectural boundaries affected:
   - `@beechcms/core`: Untouched (0 affected files).
   - `apps/api`: Untouched (0 affected files).
   - `apps/dashboard`: Untouched (0 affected files).
   - `packages/search-client`: New boundary established for isomorphic frontend consumption.
c) `graphify affected` output for `publicSearchRouter`:
```text
Relations: calls, indirect_call, references, imports, imports_from, dynamic_import, re_exports, inherits, extends, implements, uses, mixes_in, embeds, requires
Depth: 2
- public-search.router.test.ts [imports] apps/api/src/features/search/public-search.router.test.ts:L6
- public-routes.ts [imports] apps/api/src/public/public-routes.ts:L12
- public/index.ts [re_exports] apps/api/src/public/index.ts:L7
- src/factory.ts [imports_from] apps/api/src/factory.ts:L42
```
This confirms no breaking changes will occur to existing packages, as the API remains fully decoupled from the client.

### VETO Audit
- **Botanical Dialect Check:** The client SDK does not communicate directly with D1 or `@beechcms/core`. It purely consumes static `.bin` arrays and `.json` manifests from the R2 bucket, and sends text queries to the rate-limited `GET /api/v1/public/search/embed` edge endpoint. No D1 query is bypassed.
- **VSA Check:** The `@beechcms/search-client` package is a standalone SDK. It does not cross-import from `apps/api` or `apps/dashboard`, enforcing strict isolation for external frontend consumption. It will be built as a zero-dependency package.
- **Verdict:** Approved. Proceeding with Sprint Plan 3. HANDOFF -> caveman_coder

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
The core vector storage and the edge API pipeline (Sprints 1 and 2) are fully implemented. To deliver the final "Zero-Cost Serverless Edge Vector Search" capability, we must provide the isomorphic client SDK (`@beechcms/search-client`). This SDK allows external frontend applications to seamlessly consume the compiled `.json` and `.bin` indices from R2 and execute Tier 1 (Lexical) and Tier 2 (Semantic) searches. This SDK must be built in an isolated workspace to respect Vertical Slice Architecture (VSA) and prevent bloating internal CMS logic.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
The API layer exposes `GET /api/v1/public/search/embed?q=...` via `publicSearchRouter` (with Token Bucket rate limiting). The R2 pipeline computes and stores `<seed>.json` (manifest) and `<seed>.bin` (Float32Array). Currently, there is no package within `packages/` that abstracts the consumption of these endpoints.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
- `packages/search-client/package.json` (Workspace configuration)
- `packages/search-client/tsconfig.json` (TypeScript setup)
- `packages/search-client/src/index.ts` (Public API exports)
- `packages/search-client/src/types.ts` (Contracts for manifests and vectors)
- `packages/search-client/src/client.ts` (Main `SearchClient` class for hybrid search)
- `packages/search-client/src/utils/math.ts` (Dot-product and vector normalization)
- `packages/search-client/src/utils/cache.ts` (ETag validation and Browser Cache API integration)

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================
Create the `@beechcms/search-client` package with zero heavy dependencies (no ML runtimes).

1. `types.ts`: Define the index manifest structure.
```typescript
export interface IndexManifest {
  model: string;
  dimensions: number; // MUST be 384 for bge-small-en-v1.5
  fingerprint: string;
  records: Array<{
    id: string;
    title: string;
    // other text fields
  }>;
}
```

2. `cache.ts`: Implement download logic using conditional `ETag`. 
- Use the standard `caches.open('beechcms-vector-cache')` to store the `.bin` array buffers. Fallback to `indexedDB` if `caches` API is unavailable (though `caches` is broadly supported).

3. `math.ts`: Implement optimized local dot-product between query vector and index matrix.
```typescript
export function dotProduct(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}
```

4. `client.ts`: The main `SearchClient`.
- Implement debounced queries (250–300 ms).
- First perform Tier 1 (Lexical search against `records`).
- If Semantic is triggered, fetch from `GET <api-origin>/api/v1/public/search/embed?q=<query>`.
- Fail gracefully: If `429` (Rate Limited) or `503` (Unavailable) is returned, silence the error and return only Tier 1 Lexical results.
- Implement Reciprocal Rank Fusion to combine lexical and semantic scores.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
- Run `pnpm run build --filter @beechcms/search-client` from the project root.
- Add test suites for math utilities and the cache fallback logic. Run `vitest run --dir packages/search-client/src` to ensure tests pass.
- Run `pnpm type-check` for the entire workspace to verify correct exports.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] `packages/search-client` contains 0 external runtime dependencies.
- [ ] Client SDK correctly utilizes the Browser `Cache API` with ETag validation to minimize download overhead.
- [ ] Vector dimensionality logic actively rejects `.bin` buffers that do not match the expected 384 dimensions.
- [ ] Search gracefully degrades to pure lexical search on `429` or `503` responses from the API without throwing unhandled UI exceptions.
- [ ] Successful typecheck and build inside `packages/search-client`.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- Any UI components (React, Vue, Web Components) — the SDK must remain strictly isomorphic/headless.
- Internal CMS Dashboard Integration (CMD+K or Admin List Views) — this search client is strictly for public CDN assets.
- Large Dataset Indexing features (pagination on vector matrices) — bounded by the 5,000 public records limit defined in the brief.
