### Pre-Computation Analysis

1. **God Nodes Identified:**
   - `D1ContentRepository` (`apps/api/src/shared/db/repositories/content.repository.d1.ts`): Drives all D1 database CRUD operations, serialization, and privacy encryption/decryption execution.
   - `buildSelectQuery` (`packages/core/src/engine/query.ts`): Central query builder translating seed definitions and filtering options into parameterized SQL queries.
   - `PrivacyService` (`packages/core/src/engine/privacy.service.ts`): Authority for AES-256-GCM symmetric encryption and HMAC SHA-256 deterministic hashing.
   - `generateCreateTable` / `generateIndexes` / `getExpectedColumns` (`packages/core/src/engine/ddl.ts`): Schema generator generating SQLite DDL and expected column mappings for D1.

2. **Architectural Boundaries Affected:**
   - `@beechcms/core`: `packages/core/src/engine/ddl.ts` (blind index column & index generation), `packages/core/src/engine/query.ts` (blind index filter translation), `packages/core/src/engine/types.ts` (extended select & query options).
   - `apps/api`: `apps/api/src/shared/db/repositories/content.repository.d1.ts` (payload diffing, double-encryption prevention, blind index writing), `apps/api/test/d1-repository-privacy.test.ts` (test coverage).
   - `apps/dashboard`: Unaffected (zero changes required).

3. **Graphify Impact Analysis (`graphify affected "D1ContentRepository"`):**
   - Affected nodes at depth 2:
     - `apps/api/src/index.ts`
     - `apps/api/src/middleware/repository.middleware.ts`
     - `apps/api/src/shared/db/repositories/content.repository.d1.test.ts`
     - `apps/api/src/shared/jobs/queue-consumer.ts`
     - `apps/api/test/d1-repository-bulk-and-drafts.test.ts`
     - `apps/api/test/d1-repository-privacy.test.ts`
     - `apps/api/test/draft-touched-fields.test.ts`
     - `apps/api/test/hooks-lifecycle.test.ts`
     - `apps/api/src/factory.ts`
     - `apps/api/test/flow-background-queues.test.ts`

---

### VETO Audit

- **Botanical Dialect Compliance:** Confirmed. All data protection and query modifications remain strictly inside `@beechcms/core` and `D1ContentRepository`. No custom D1 queries bypass the Botanical Engine or `buildSelectQuery`. Field aliases are resolved via branch definitions.
- **Vertical Slice Architecture (VSA):** Confirmed. No cross-slice imports are introduced. Privacy algorithms and query builder logic are encapsulated within `@beechcms/core` and shared infrastructure in `apps/api`.
- **Cloudflare Edge Purity:** Confirmed. Blind index hashing and payload diffing rely exclusively on Web Crypto API (`crypto.subtle`) and native SQLite D1 query parameters, preserving zero-dependency Workers compatibility.

---

# Sprint Output Template (Strictly Enforced)

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
This sprint enforces payload diffing during updates to eliminate double-encryption bugs and integrates Blind Index generation to allow exact matches (`eq`, `neq`, `in`, `not_in`) on `confidential` fields without compromising security or violating Edge constraints.

In Sprint 1, we introduced `PrivacyService` and the 4-tier data classification model (`public`, `internal`, `confidential`, `restricted`), implementing AES-256-GCM encryption for `confidential` fields. However, AES-256-GCM ciphertexts (`v1:<iv>:<ciphertext>`) use random IVs and are inherently non-deterministic. Without payload diffing, calling `update` with an existing ciphertext string or unmodified record re-encrypts the ciphertext (producing invalid double-encrypted payloads). Furthermore, standard SQL `WHERE field = ?` queries cannot search encrypted fields. 

By implementing:
1. Idempotent encryption protection and payload diffing in `ContentRepository.update` and `serializeAndProtect`
2. Automatic Blind Index column (`${alias}_bidx`) generation in DDL (`ddl.ts`) and automatic HMAC SHA-256 hashing during creation/updates
3. Query translation in `buildSelectQuery` (`query.ts`) to route exact filtering on `confidential` fields to `${alias}_bidx`

We fulfill the core privacy requirements while upholding the Botanical Engine invariants and Cloudflare Edge compatibility.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
- **God Nodes Identified:** `D1ContentRepository` (`apps/api/src/shared/db/repositories/content.repository.d1.ts`), `buildSelectQuery` (`packages/core/src/engine/query.ts`), `generateCreateTable`/`generateIndexes`/`getExpectedColumns` (`packages/core/src/engine/ddl.ts`), `PrivacyService` (`packages/core/src/engine/privacy.service.ts`).
- **Core Interfaces & Functions:**
  - `resolveClassification(branch)` in `packages/core/src/engine/policies.ts` maps branch policies to `{ storage, publicApi, authApi }`.
  - `IPrivacyService` in `packages/core/src/engine/privacy.service.ts` provides `encrypt(plaintext)`, `decrypt(ciphertext)`, `hash(plaintext)`.
  - `serializeAndProtect` in `D1ContentRepository` handles branch value serialization and encryption/hashing.
  - `buildSelectQuery` in `packages/core/src/engine/query.ts` generates SQL SELECT strings and parameter bindings.
  - `ddl.ts` in `packages/core/src/engine/ddl.ts` builds D1 DDL statements (`CREATE TABLE`, `CREATE INDEX`, `getExpectedColumns`).

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
- `@beechcms/core` (`packages/core/src/engine/ddl.ts`):
  - Helper `hasBlindIndex(branch: Branch): boolean`.
  - Updated `generateCreateTable`, `generateDraftTable`, `generateIndexes`, and `getExpectedColumns` to automatically produce `${branch.alias}_bidx TEXT` columns and B-tree indexes for `confidential` branches where filtering is enabled.
- `@beechcms/core` (`packages/core/src/engine/query.ts` & `packages/core/src/engine/types.ts`):
  - Updated `SelectOptions` interface or helper to support pre-computed/hashed filter values for blind index matching.
  - Updated `buildFilterCondition` in `buildSelectQuery` to route `eq`, `neq`, `in`, and `not_in` filter operations on `confidential` branches to `${col}_bidx` using hashed filter values.
  - Preserved synchronous purity of `buildSelectQuery`.
- `apps/api` (`apps/api/src/shared/db/repositories/content.repository.d1.ts`):
  - Idempotent Encryption & Payload Diffing in `serializeAndProtect` & `update`: check for `v1:` ciphertext prefix to avoid re-encrypting existing ciphertext; perform payload diffing against current record values.
  - Blind Index Persistence: populate `${alias}_bidx` with `privacyService.hash(plaintext)` whenever a `confidential` field is written/updated.
  - Async Filter Hash Pre-computation: in `findMany`, pre-compute blind index hashes asynchronously via helper (`prepareBlindIndexOptions`) before passing options to `buildSelectQuery`, maintaining synchronous execution in core.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================
1. **Blind Index DDL Generator (`packages/core/src/engine/ddl.ts`):**
   - Add helper function `hasBlindIndex(branch: Branch): boolean`:
     ```ts
     export function hasBlindIndex(branch: Branch): boolean {
       const resolved = resolveClassification(branch)
       return resolved.storage === 'encrypt' && branch.policies?.filter !== false
     }
     ```
   - In `generateCreateTable(seed: Seed)`:
     When iterating over `seed.branches`, if `hasBlindIndex(branch)` is `true`, append column definition:
     ```sql
     ${branch.alias}_bidx  TEXT,
     ```
   - In `generateIndexes(seed: Seed)`:
     If `hasBlindIndex(branch)` is `true`, append index definition:
     ```sql
     CREATE INDEX IF NOT EXISTS idx_${slug}_${branch.alias}_bidx ON ${table}(${branch.alias}_bidx);
     ```
   - In `getExpectedColumns(seed: Seed)`:
     If `hasBlindIndex(branch)` is `true`, include `{ name: `${branch.alias}_bidx`, sqlType: 'TEXT', notNull: false, isPk: false }`.

2. **Query Builder Blind Index Translation (`packages/core/src/engine/query.ts`):**
   - Keep `buildSelectQuery` 100% synchronous and pure.
   - In `buildSelectQuery(seed: Seed, options: SelectOptions)`:
     When constructing filter conditions in `buildFilterCondition`, check if the targeted branch has `resolveClassification(branch).storage === 'encrypt'`:
     - For exact operators (`eq`, `neq`, `in`, `not_in`):
       - Change target SQL column name to `${table}.${group.column}_bidx`.
     - For non-exact operators (`contains`, `starts_with`, `ends_with`, `gt`, `lt`):
       - Omit or ignore condition (as partial search and sorting on encrypted fields is explicitly discarded per architecture).

3. **Idempotent Encryption & Payload Diffing (`apps/api/src/shared/db/repositories/content.repository.d1.ts`):**
   - Add ciphertext detection helper:
     ```ts
     function isCiphertext(value: unknown): boolean {
       return typeof value === 'string' && /^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(value)
     }
     ```
   - In `serializeAndProtect(branch: Branch, value: unknown)`:
     - If `resolved.storage === 'encrypt'`:
       - If `isCiphertext(value)`: return `{ value: String(value), bidx: undefined }` (skip double-encryption).
       - Else: compute `ciphertext = await this.privacyService.encrypt(String(serialized))` and `bidx = await this.privacyService.hash(String(serialized))`.
   - In `buildCreateMainStmt` & `buildUpdateMainStmt`:
     - Bind `${branch.alias}` with `ciphertext` and `${branch.alias}_bidx` with `bidx`.
   - In `update`:
     - Perform payload diffing against the existing row (or cached row values) before running main update statement to avoid unnecessary encryption ops when fields remain unchanged.

4. **Integration with `findMany` in `D1ContentRepository` (Async Pre-computation):**
   - Pre-compute filter hashes asynchronously before calling `buildSelectQuery` using an async helper `prepareBlindIndexOptions(seed, options, privacyService)`:
     ```ts
     const processedOptions = this.privacyService
       ? await prepareBlindIndexOptions(seed, options, this.privacyService)
       : options
     const { sql, bindings } = buildSelectQuery(seed, processedOptions)
     ```
   - This isolates asynchronous HMAC SHA-256 computation to the repository tier while preserving synchronous purity in the core query builder.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
- `pnpm --filter @beechcms/core run build`
- `npx tsc --noEmit` in `apps/api/`
- `pnpm --filter @beechcms/core test`
- `pnpm --filter api test`

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] `hasBlindIndex(branch)` correctly identifies `confidential` branches with `filter !== false`.
- [ ] `generateCreateTable`, `generateIndexes`, and `getExpectedColumns` generate `${alias}_bidx` columns and B-tree indexes for `confidential` fields.
- [ ] `serializeAndProtect` is idempotent: passing existing `v1:...` ciphertext returns the string untouched without double-encryption.
- [ ] `D1ContentRepository.update` performs payload diffing, encrypting only updated/modified confidential fields.
- [ ] `D1ContentRepository` populates both `${alias}` (ciphertext) and `${alias}_bidx` (HMAC SHA-256 hash) on creation and updates.
- [ ] `buildSelectQuery` routes `eq`, `neq`, `in`, and `not_in` filters on confidential fields to `${alias}_bidx` using hashed values.
- [ ] Core and API unit/integration tests pass with 0 typecheck or build errors.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- **Context-Aware API Response Scrubbing:** Role-based filtering of `internal` / `confidential` / `restricted` fields on API endpoints (Deferred to Sprint 3).
- **Partial Search / LIKE / OPE on Confidential Data:** Discarded per feature brief.
- **Admin UI changes (`apps/dashboard`):** Deferred to Sprint 3.
