# Sprint Output Template (Strictly Enforced)

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
This sprint establishes the first-class 4-tier Data Classification model (`public` | `internal` | `confidential` | `restricted`) and cryptographic primitives in `@beechcms/core` required for Application-Level Encryption (ALE) and secure hashing. Replacing raw technical fields (`privacy: 'plain' | 'hash' | 'encrypt'`) with the explicit 4-tier classification enum ensures that every field definition strictly bundles both its storage mechanism (at rest) and its API serving rules (public vs authenticated context).

Introducing encryption mandates asynchronous operations due to Edge-compatible `crypto.subtle` requirements. By tackling this structural shift first, we respect the Botanical Engine invariant: all data transformations remain centralized, preserving the purity of our existing synchronous `serializeForDb` / `deserializeFromDb` functions while enabling `ContentRepository` (the D1 gateway) to orchestrate async encryption, hashing, and decryption seamlessly.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
- **God Nodes Identified:** `ContentRepository` (drives all DB ops), `serializeForDb` / `deserializeFromDb` (drives serialization), `resolvePolicies` (resolves branch policies).
- **Core Interfaces:** `Branch.policies` in `packages/core/src/engine/types.ts` previously held fragmented policy options. We introduce `DataClassification` enum (`public` | `internal` | `confidential` | `restricted`) as the single source of truth.
- **Dependencies:** `serializeForDb` and `deserializeFromDb` are pure, synchronous functions in `packages/core/src/engine/serialize.ts`. They are consumed directly by `apps/api/src/shared/db/repositories/content.repository.d1.ts`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
- `@beechcms/core`: `DataClassification` type (`'public' | 'internal' | 'confidential' | 'restricted'`) and `resolveClassification(branch: Branch)` policy helper bundling storage mechanism and API visibility.
- `@beechcms/core`: `IPrivacyService` interface and `PrivacyService` concrete class handling AES-256-GCM encryption for `confidential` fields and HMAC SHA-256 hashing for `restricted` fields using Web Crypto (`crypto.subtle`).
- `@beechcms/core`: Synchronous purity maintained for `serializeForDb` and `deserializeFromDb`.
- `apps/api`: Update `AppEnv` (in `types.ts`) to include `PRIVACY_MASTER_KEY` in `Env` and `privacyService: IPrivacyService` in `Variables`.
- `apps/api`: Update `repositoryMiddleware` and `D1ContentRepository` to receive `IPrivacyService`. `D1ContentRepository` applies async encryption/hashing for `confidential`/`restricted` fields *after* calling `serializeForDb`, and decryption for `confidential` fields *before* calling `deserializeFromDb`, using `Promise.all` for concurrency.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================
1. **Define `DataClassification` & `resolveClassification` in `@beechcms/core`:**
   - In `packages/core/src/engine/types.ts`:
     ```ts
     export type DataClassification = 'public' | 'internal' | 'confidential' | 'restricted'
     ```
   - Update `Branch.policies` interface:
     ```ts
     export interface BranchPolicies {
       classification?: DataClassification
       /** Backward-compatible alias for classification. */
       privacy?: 'plain' | 'hash' | 'encrypt' | DataClassification
       visibility?: 'full' | 'masked' | 'hidden'
       search?: boolean
       filter?: boolean
       sort?: boolean
       public?: boolean
     }
     ```
   - In `packages/core/src/engine/policies.ts`:
     Implement `resolveClassification(branch: Branch)`:
     - Normalizes classification (accepting `'Public'`, `'Internal'`, `'Confidential'`, `'Restricted'` or lowercase).
     - Returns resolved classification rules:
       - `public`: storage = `'plain'`, publicApi = `'full'`, authApi = `'full'`
       - `internal`: storage = `'plain'`, publicApi = `'hidden'`, authApi = `'full'`
       - `confidential`: storage = `'encrypt'`, publicApi = `'hidden'`, authApi = `'full'`
       - `restricted`: storage = `'hash'`, publicApi = `'hidden'`, authApi = `'hidden'`

2. **Create `PrivacyService` in `@beechcms/core/src/engine/privacy.service.ts`:**
   - Define interface `IPrivacyService`:
     ```ts
     export interface IPrivacyService {
       encrypt(plaintext: string): Promise<string>
       decrypt(ciphertext: string): Promise<string>
       hash(plaintext: string): Promise<string>
     }
     ```
   - Implement `PrivacyService` constructor receiving `masterKey: string`.
   - Implement `encrypt` using `crypto.subtle` for AES-256-GCM. Prepend version and IV (`v1:base64(iv):base64(ciphertext)`).
   - Implement `decrypt` logic for structured ciphertext (`v1:<iv>:<ciphertext>`).
   - Implement `hash` using deterministic HMAC SHA-256 (64 hex characters) for `restricted` fields.

3. **Protect `serializeForDb` and `deserializeFromDb` in `packages/core/src/engine/serialize.ts`:**
   - Leave these functions completely untouched. They remain synchronous, pure, and agnostic of the privacy layer.

4. **Update API consumers (`apps/api`):**
   - In `apps/api/src/types.ts`: Add `PRIVACY_MASTER_KEY?: string` to `Env`. Add `privacyService: IPrivacyService` to `Variables`.
   - In `apps/api/src/middleware/repository.middleware.ts`: Instantiate `PrivacyService` using `env.PRIVACY_MASTER_KEY` (with dev fallback). Inject it into `context.set('privacyService', ...)` and pass it into `D1ContentRepository`.
   - In `apps/api/src/shared/db/repositories/content.repository.d1.ts`:
     Inject `privacyService` into constructor.
     When writing (`create`, `update`, `saveDraft`, `bulkUpdate`, `runBatch`), call `serializeForDb` first, then if resolved storage is `'encrypt'` (`confidential`) or `'hash'` (`restricted`), `await` the respective `privacyService` method.
     When reading (`findById`, `findBySlug`, `findMany`, `getDraft`, `delete`), `await privacyService.decrypt` before passing `confidential` values to `deserializeFromDb`. Leverage `Promise.all` for concurrency.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
- `pnpm run build` in `packages/core/`
- `npx tsc --noEmit` in `apps/api/`
- `pnpm --filter @beechcms/core test`

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] `DataClassification` type (`'public' | 'internal' | 'confidential' | 'restricted'`) is defined and resolved via `resolveClassification()`.
- [ ] `PrivacyService` uses `crypto.subtle` for AES-256-GCM and deterministic HMAC SHA-256 for hashing.
- [ ] Encrypted data format strictly includes version and IV (`v1:<iv>:<ciphertext>`).
- [ ] `serializeForDb` and `deserializeFromDb` remain synchronous, pure, and untouched.
- [ ] `ContentRepository` correctly orchestrates `serializeForDb` followed by async encryption (`confidential`) or hashing (`restricted`), and async decryption followed by `deserializeFromDb` (using concurrent promises).
- [ ] `AppEnv` properly exposes `PRIVACY_MASTER_KEY` and `privacyService`.
- [ ] Botanical invariant maintained: encryption happens gracefully in coordination with the Botanical Engine via `ContentRepository`.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- **Payload Diffing on PATCH/UPDATE:** Do not implement logic to prevent double-encryption during updates (Deferred to Sprint 2).
- **Blind Indexes in SQL:** Do not implement DB schema changes for blind index columns or adjust `buildSelectQuery` for exact match (Deferred to Sprint 2).
- **Context-Aware API Filtering:** Response JSON filtering based on `public` vs `auth` context (Deferred to Sprint 3).
- **Admin UI changes:** Do not modify `apps/dashboard`.
