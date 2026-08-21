# Secure Forms & Data Privacy Roadmap

1. **Sprint 1: Core Crypto & PrivacyService Primitives** (Status: Complete)
   - Goal: Build the Edge-compatible `PrivacyService` in `@beechcms/core` and orchestrate async encryption within the `ContentRepository` without polluting pure utilities.
   - Deliverables: `PrivacyService` class (AES-256-GCM, deterministic SHA-256 for blind indexing), preserving `serializeForDb`/`deserializeFromDb` as synchronous pure functions, and adapting `ContentRepository` to handle async encryption/decryption wrappers.
   - Dependency: None.

2. **Sprint 2: Payload Diffing & Blind Index Integration** (Status: Complete)
   - Goal: Enforce strict payload diffing on PATCH/UPDATE to prevent double-encryption, and integrate blind index generation for exact search on Confidential fields.
   - Deliverables: Update `ContentRepository.update` to diff payloads; update `buildSelectQuery` to use blind indexes for exact matches.
   - Dependency: Sprint 1.

3. **Sprint 3: Context-Aware API Filtering** (Status: Complete)
   - Goal: Filter outgoing API responses based on the tier (Public, Internal, Confidential, Restricted) and the actor's context.
   - Deliverables: Update `dbToApi` / response serialization helper; add Actor context injection; implement strict scrubbing for public endpoints.
   - Dependency: Sprint 2.

4. **Sprint 4: Public Form Security, Anti-Bot & Quarantine Pipeline** (Status: Complete)
   - Goal: Harden the public ingestion layer with multi-level anti-bot defenses (Honeypot camouflage rejection, signed Time Trap tokens, edge rate limiting, strict origin check), synchronous Magic Bytes file validation, and async background quarantine scanning with VirusTotal.
   - Deliverables: Core `retentionDays` schema property, `verifyMagicBytes` validator, `generateTimeTrapToken` / `verifyTimeTrapToken` HMAC primitives, `IAntivirusProvider` interface with `VirusTotalAntivirusProvider` adapter, public token endpoint `GET /api/v1/public/timetrap/token`, hardened `POST /api/v1/public/:seed/add`, and async quarantine scan worker orchestration.
   - Dependency: Sprint 3.

5. **Sprint 5: Secure Form Toolkit React SDK (@beechcms/forms-react)** (Status: Active - Current)
   - Goal: Build the `@beechcms/forms-react` client package for zero-boilerplate, accessible, schema-driven React forms with automatic honeypot injection, time trap verification, draft recovery in `localStorage`, conditional branch logic, and native bilingual i18n.
   - Deliverables: New package `packages/forms-react` exporting `<BeechForm />`, form hook helpers, draft recovery store, conditional rule evaluator, client magic bytes checker, and comprehensive React testing library test suite.
   - Dependency: Sprint 4.
