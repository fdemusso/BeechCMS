# 1. Feature Definition and Core Value

Traditional semantic search architectures rely on expensive, hosted vector databases (e.g. Pinecone, Algolia, Qdrant) that impose recurring subscription costs, vendor lock-in, and unpredictable latency on external websites.

This feature delivers **zero-cost, edge-native, and client-side vector search** to the BeechCMS ecosystem:
- **Serverless & Incremental Edge Computation:** Embeddings are generated on content mutation via lightweight edge AI bindings (Cloudflare Workers AI) and stored alongside metadata without full-database re-indexing.
- **Decentralized Binary Distribution:** Vector indices are compiled into ultra-compact binary matrices (`.bin` `Float32Array` buffers + `.json` metadata manifests) hosted on global CDN/R2 storage with zero egress fees.
- **Two-Tier Hybrid Client Search:** The lightweight consumer SDK (`@beechcms/search-client`) executes instant 0 ms lexical matching in-memory during keystrokes, paired with debounced edge query vectorization and sub-millisecond local vector dot-products in the client browser, operating strictly within Cloudflare Free Tier quotas.

# 2. Domain Boundaries and Business Rules

### Logical Entities and Responsibilities
- **Embedding Provider (`Botanical Engine / Core Layer`):** Contract defining deterministic text extraction from published Seeds and vector generation.
- **Search Edge Pipeline (`API Layer`):** Asynchronous feature module responsible for computing vectors on mutation, executing Token Bucket rate-limited public query embedding, and compiling binary bundles to R2.
- **Vector Index Storage (`Storage Layer / R2 Bucket`):** Static CDN repository hosting public `.bin` buffers and `.json` metadata manifests isolated per Seed.
- **Search Client SDK (`@beechcms/search-client`):** Lightweight, zero-heavy-dependency client library providing caching, lexical matching, query embedding consumption, and local dot-product math for external frontend applications.

### Ironclad Business Rules
1. **Botanical Engine Privacy and Classification Strict Invariant:**
   - Text extraction for embeddings MUST strictly query `resolvePolicies`.
   - ONLY fields explicitly declared as `public` (and text/string-based) can be extracted, concatenated, or embedded.
   - Fields classified as `internal`, `confidential` (encrypted with ALE), or `restricted` (hashed) MUST NEVER be processed by the embedding engine or exposed in the public `.json` metadata manifest.
2. **Seed-Level Index Isolation:**
   - Every searchable Seed maintains its own isolated `.bin` vector matrix and `.json` metadata manifest. Cross-seed monolithic indices are prohibited to avoid memory bloat and domain bleeding.
3. **Publication-Gated R2 Compilation:**
   - The public `.bin` and `.json` files in R2 MUST be compiled and updated ONLY on `publish`, `unpublish`, and `delete` events. Intermediate drafts and autosaves must never alter public search assets.
4. **Cloudflare Free Tier Invariant:**
   - Total daily neuron usage on Cloudflare Workers AI must remain safely below the 10,000 Neurons/day free limit through aggressive Edge Caching of repeated queries and single-record incremental updates.
5. **Operational Capacity Threshold:**
   - Client-side static vector search is strictly bound to Seeds containing up to **5,000 public records**. Datasets exceeding this threshold must log an operational capacity warning and refuse compilation to prevent excessive client memory consumption.

# 3. Primary Requirements (User Stories)

* AS A public website visitor I WANT instant search results as I type SO THAT I can find content immediately with zero perceived latency.
* AS A public website visitor I WANT the search engine to understand synonyms and semantic concepts SO THAT I can discover relevant articles even when I do not type exact keyword matches.
* AS A developer integrating BeechCMS I WANT an isomorphic, lightweight SDK (`@beechcms/search-client`) SO THAT I can implement vector-powered search in my frontend without installing heavy ML runtimes or configuring third-party vector databases.
* AS A content editor I WANT published changes, unpublishing, or deletions to automatically reflect in the public search index SO THAT visitors always access accurate, up-to-date content without manual re-indexing.
* AS A platform administrator I WANT semantic search to run entirely within serverless free tier limits SO THAT my organization incurs zero recurring database and search infrastructure costs.

# 4. Secondary Requirements and Logical Constraints

### Two-Tier Hybrid Search Execution
- **Tier 1 (Instant Lexical):** Client SDK matches query tokens in-memory against local `.json` metadata at 0 ms latency with zero network calls and zero neuron consumption.
- **Tier 2 (Debounced Semantic):** On a 250–300 ms typing pause, the SDK requests the query vector from the public edge endpoint. The received vector is evaluated against the local `Float32Array` in `< 0.5 ms`, and semantic scores are blended with lexical scores using Reciprocal Rank Fusion.

### Edge Caching and Public Query Protection
- The public embedding endpoint (`GET /api/v1/public/search/embed?q=...`) must enforce a **Token Bucket rate limiter** per IP to prevent quota exhaustion attacks.
- Search queries must be sanitized and strictly capped to a maximum of 150 characters.
- Query vector responses must include Cloudflare Edge Cache headers (`s-maxage=604800, public`) so identical queries globally consume 0 AI Neurons.
- If the endpoint encounters a rate limit (`429`) or AI service unavailability (`503`), the client SDK MUST silently degrade to pure lexical search without throwing unhandled exceptions to the UI.

### Invalidation, Fingerprinting, and Client Caching
- Binary assets must be saved to client storage via the browser **Cache API** (with **IndexedDB** fallback). Cookies and LocalStorage are forbidden for storing binary index buffers.
- The index metadata must include a deterministic SHA-256 fingerprint/ETag based on the latest compilation timestamp and contents.
- The client SDK must perform conditional HTTP ETag validation before downloading binary buffers, ensuring 0 bytes transferred when the index is unchanged.

### Deletion and Lifecycle Edge Cases
- When an article is deleted or reverted to draft (`unpublish`), its embedding vector must be removed from the internal database and the R2 `.bin` + `.json` assets must be recompiled immediately in the background via asynchronous execution (`waitUntil` / Queue).
- If a Seed has 0 published records, the R2 assets must reflect an empty index manifest without generating runtime errors on the client.

### Model Compatibility and Local Development
- Index manifests must declare the embedding model identifier and dimensions (`model: "@cf/baai/bge-small-en-v1.5"`, `dimensions: 384`). The SDK must reject binary buffers that mismatch expected dimensions.
- Local development (`pnpm beech dev` / Docker) must support an offline fallback (local ONNX runtime via `@xenova/transformers` or mock provider / FTS5 degradation) when Cloudflare AI credentials are unavailable.

# 5. Out of Scope (Discarded during sparring)

- **Internal CMS Dashboard Integration (CMD+K / Admin List Views):** Discarded to maintain strict domain isolation. Admin search involves draft states, role-based access control, and internal fields, which must not share public static CDN assets.
- **Full In-Browser ONNX Model Downloads (Transformers.js / 30MB+ Wasm in client):** Discarded to prevent destroying Core Web Vitals, mobile data plans, and device memory on consumer sites.
- **Cross-Seed Monolithic Indices:** Discarded to enforce modularity and avoid forcing client applications to download vector data for unneeded content types.
- **Large Dataset Vector Indexing (> 5,000 records per Seed):** Discarded as an explicit architectural boundary; large-scale enterprise vector indexing requires dedicated server-side infrastructure and is out of scope for client-side binary matrix search.
