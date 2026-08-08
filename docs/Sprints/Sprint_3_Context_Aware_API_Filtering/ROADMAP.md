# Privacy System Roadmap

1. **Sprint 1: Core Crypto & PrivacyService Primitives**
   - Goal: Build the Edge-compatible `PrivacyService` in `@beechcms/core` and orchestrate async encryption within the `ContentRepository` without polluting pure utilities.
   - Deliverables: `PrivacyService` class (AES-256-GCM, deterministic SHA-256 for blind indexing), preserving `serializeForDb`/`deserializeFromDb` as synchronous pure functions, and adapting `ContentRepository` to handle async encryption/decryption wrappers.
   - Dependency: None.

2. **Sprint 2: Payload Diffing & Blind Index Integration**
   - Goal: Enforce strict payload diffing on PATCH/UPDATE to prevent double-encryption, and integrate blind index generation for exact search on Confidential fields.
   - Deliverables: Update `ContentRepository.update` to diff payloads; update `buildSelectQuery` to use blind indexes for exact matches.
   - Dependency: Sprint 1.

3. **Sprint 3: Context-Aware API Filtering**
   - Goal: Filter outgoing API responses based on the tier (Public, Internal, Confidential, Restricted) and the actor's context.
   - Deliverables: Update `dbToApi` / response serialization helper; add Actor context injection; implement strict scrubbing for public endpoints.
   - Dependency: Sprint 2.
