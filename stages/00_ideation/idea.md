# Feature Idea: Edge-Native & Client-Side Vector Search SDK (@beechcms/search-client)

## 1. Executive Summary & Core Value Proposition

The goal is to introduce **zero-cost, edge-native, and client-side semantic vector search** to the BeechCMS ecosystem. 

Modern websites and web applications demand fast, intelligent search that understands user intent, synonyms, and natural language concepts (e.g. searching for "machine learning tutorial" finds articles titled "Deep Neural Networks Guide"). Traditional vector search architectures rely on expensive, hosted vector databases (Pinecone, Algolia, Qdrant) that impose recurring monthly fees, cold-start latencies, and vendor lock-in.

This feature introduces a decentralized, binary-matrix architecture:
- **Serverless & Incremental on the Edge:** Embeddings are generated per-record when content is created or updated, avoiding full re-indexing operations and keeping compute costs near zero.
- **Client-Side Vector Math:** Search indices are packaged into ultra-compact binary files (`.bin` as `Float32Array` + `.json` metadata) stored on Cloudflare R2 / CDN and downloaded in the background. The consumer's browser computes vector dot-products locally in **< 0.5 ms**.
- **Universal Application:** The search capability is delivered as an isomorphic SDK (`@beechcms/search-client` / `useBeechSearch`) for external web projects, while simultaneously powering the internal BeechCMS Dashboard (Command Palette `CMD+K` and content list views).

---

## 2. Where It Needs to Be Implemented

The feature spans across the existing monorepo layers following the project's strict architecture:

1. **`packages/core` (Shared Contracts & Botanical Engine Extension)**
   - Define contracts for embedding providers (`IEmbeddingProvider`) and vector index storage (`IVectorIndexRepository`).
   - Provide deterministic text extraction utilities from Seed definitions, strictly adhering to Branch policies (extracting clean text only from indexable, public `text` and `richtext` fields).
   - Provide binary packing and serialization utilities to build compact `Float32Array` buffers and metadata manifests.

2. **`apps/api` (Asynchronous Edge Pipeline & Cloudflare Bindings)**
   - New Vertical Slice / Feature module under `apps/api/src/features/search/` with thin handlers.
   - Incremental vector calculation triggered asynchronously on content mutations (`create`, `update`, `delete`, `publishDraft`) using `c.get('scheduler').waitUntil(...)` or Cloudflare Queues (`IQueueService`).
   - Integration with **Cloudflare Workers AI** (`c.env.AI`) using lightweight 384-dimensional models (e.g. `@cf/baai/bge-small-en-v1.5`), with local ONNX Runtime (`@xenova/transformers`) fallback for Docker / Node.js development.
   - Storage of compiled `.bin` and `.json` index assets in Cloudflare R2 via the `BeechBucket` abstraction.
   - Public lightweight query embedding endpoint (`GET /api/v1/public/search/embed?q=...`) cached with Cloudflare Edge Cache API.

3. **`packages/search-client` (New Consumer SDK Package)**
   - Lightweight, dependency-minimal client package exportable to vanilla TypeScript and modern React applications.
   - Provides the `useBeechSearch({ seed, mode, ... })` React hook and vanilla search client.
   - Built-in background index prefetching, ETag-aware caching (Cache API / IndexedDB), and SIMD-friendly vector similarity execution.

4. **`apps/dashboard` (CMS Admin Interface Integration)**
   - **Command Palette (`CMD + K`):** Hybrid search combining SQLite FTS5 lexical matching with local semantic vector similarity.
   - **Content List Views (Table, Gallery, Kanban):** Instant, live semantic filtering in `ContentToolbar` without firing redundant SQL queries to D1.

---

## 3. Mandatory Obligations & Constraints

The implementation must strictly satisfy the following invariants:

1. **Zero-Cost & Cloudflare Free Tier Invariant (Absolute Requirement)**
   - Must operate 100% within Cloudflare Free Tier quotas:
     - **Workers AI:** Maximum 10,000 Neurons/day free. Incremental single-record updates use ~0.8 Neurons per edit (e.g. 200 edits/day = ~160 Neurons, < 2% of quota).
     - **D1 Database:** Minimal writes (1 vector write per content update) and sub-5% daily read allocation.
     - **R2 Storage & Bandwidth:** < 2 MB total index storage for 1,000 records; zero egress fees.
     - **Workers Compute Time:** Binary index compilation must execute in < 2 ms CPU time per update.

2. **Botanical Engine, Privacy & Data Classification Compliance**
   - Must strictly respect Branch policies (`resolvePolicies`).
   - Sensitive fields marked as `confidential` (encrypted with ALE) or `restricted` (`hash`) must **never** be extracted, embedded, or exposed in public search indices.

3. **Vertical Slice Architecture & Thin Handler Rules**
   - API route handlers must remain thin: parse request -> delegate to injected repository/service -> return response.
   - Handlers must **never** execute heavy embedding generation or R2 uploads synchronously in the request-response lifecycle. All side-effects must run asynchronously via `IScheduler` or `IQueueService`.

4. **Speed & Lightweight Footprint**
   - Client index payload must remain small (~400 KB gzipped for 1,000 records).
   - In-browser vector dot-product / cosine similarity must complete in **< 0.5 milliseconds** for 1,000 items, enabling 60 FPS search-as-you-type UX.

5. **Graceful Fallback & Resilience**
   - If AI bindings or embeddings are temporarily unavailable or disabled, the system must seamlessly fall back to SQLite FTS5 full-text search without breaking content mutation or search operations.
