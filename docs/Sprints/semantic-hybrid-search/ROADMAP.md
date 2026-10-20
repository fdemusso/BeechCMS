# Sprint Roadmap: Zero-Cost Serverless Edge Vector Search

This feature spans multiple architectural boundaries (Core Botanical Engine, Edge API, R2 Compilation, Client SDK) and cannot be safely delivered in a single sprint without violating validation boundaries.

## 1. Core Vector Storage & Botanical Extraction (Completed)
- **Goal:** Establish the internal D1 vector storage schema and the deterministic text extraction module in `@beechcms/core`, strictly adhering to `resolvePolicies`.
- **Deliverables:** D1 migrations for `search_vectors` table, `VectorEngine` text extraction contracts, and unit tests ensuring confidential/internal fields are never extracted.
- **Dependency:** None.

## 2. API Search Edge Pipeline & R2 Compilation (Completed)
- **Goal:** Implement the mutation-triggered asynchronous worker for Cloudflare Workers AI embeddings, R2 manifest/binary compilation, and the public rate-limited embedding endpoint.
- **Deliverables:** Cloudflare AI bindings, Queue/waitUntil workers on `ContentRepository` publish/delete events, R2 compilation logic, public query embedding endpoint.
- **Dependency:** Sprint 1 (Core Vector Storage & Botanical Extraction).

## 3. Hybrid Search Client SDK (Current Sprint)
- **Goal:** Build the zero-dependency `@beechcms/search-client` for in-browser Tier 1 (Lexical) and Tier 2 (Semantic) search.
- **Deliverables:** ETag-based binary buffer caching, in-memory lexical matcher, debounced API calls for query vectors, local dot-product calculation.
- **Dependency:** Sprint 2 (API Search Edge Pipeline & R2 Compilation).
