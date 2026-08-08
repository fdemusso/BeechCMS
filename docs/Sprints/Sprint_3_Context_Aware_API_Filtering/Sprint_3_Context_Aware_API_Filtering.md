### Pre-Computation Analysis

1. **God Nodes Identified:**
   - `resolveClassification` / `resolvePolicies` (`packages/core/src/engine/policies.ts`): The central policy evaluation engine determining storage and API visibility for every schema branch.
   - `applyVisibility` (`apps/api/src/shared/policies/apply-policies.ts`): Outgoing response serialization helper used across authenticated content endpoints (`getByIdHandler`, `getBySlugHandler`, `listHandler`, `draftHandler`).
   - `toFlatPublicEntry` / `applyPublicPolicies` (`apps/api/src/public/entry-projection.ts`): Outgoing response projection helper for unauthenticated public API routes (`readSingleEntry`, `readListEntries`).
   - `readSingleEntry` / `readListEntries` (`apps/api/src/public/read-single.ts`, `apps/api/src/public/read-list.ts`): Core handlers serving public API requests.

2. **Architectural Boundaries Affected:**
   - `@beechcms/core`: `packages/core/src/engine/policies.ts` (adding `ActorContext` interface and `filterEntryForActor` domain function), `packages/core/src/engine/types.ts` (exporting `ActorContext` type).
   - `apps/api`: `apps/api/src/types.ts` (extending Hono `Variables` with `actor?: ActorContext`), `apps/api/src/shared/policies/apply-policies.ts` (updating `applyVisibility` to take `actor` context and apply context-aware filtering), `apps/api/src/public/entry-projection.ts` (updating `applyPublicPolicies` to strictly enforce public actor scrubbing for `internal`, `confidential`, and `restricted` tiers), `apps/api/src/features/content/handlers/` and `apps/api/src/features/draft/` (passing actor context from request/JWT to response serialization).
   - `apps/dashboard`: Unaffected (dashboard uses authenticated API endpoints, receiving `public`, `internal`, and `confidential` fields, with `restricted` fields scrubbed).

3. **Graphify Impact Analysis (`graphify affected "resolvePolicies"` & `graphify affected "applyVisibility"`):**
   - Affected nodes at depth 2 for `resolvePolicies`:
     - `packages/core/src/engine/ddl.ts` (`generateCreateTable`, `generateFtsTable`, `indexableSearchBranches`)
     - `packages/core/src/engine/query.ts` (`buildSelectQuery`)
     - `packages/core/src/engine/seed-ddl.ts` (`planFtsRebuild`)
     - `packages/core/src/engine/policies.test.ts`
   - Affected nodes at depth 2 for `applyVisibility`:
     - `apps/api/src/features/content/handlers/get.ts` (`getByIdHandler`, `getBySlugHandler`)
     - `apps/api/src/features/content/handlers/list.ts` (`listHandler`)
     - `apps/api/src/features/draft/draft.handler.ts` (`draftHandler`)
     - `apps/api/src/shared/policies/apply-policies.test.ts`

---

### VETO Audit

- **Botanical Dialect Compliance:** Confirmed. Response filtering operates strictly on domain data object representations produced by `ContentRepository.dbToApi` transformations using branch definitions. No raw SQLite queries or direct D1 column reads bypass `@beechcms/core`.
- **Vertical Slice Architecture (VSA):** Confirmed. Domain classification rules and `filterEntryForActor` logic are encapsulated within `@beechcms/core`. Slices in `apps/api` invoke shared response formatters without introducing cross-slice imports.
- **Cloudflare Edge Purity:** Confirmed. Context-aware filtering operates in-memory using pure, synchronous object projection functions with zero native dependencies or blocking I/O, maintaining Workers Edge compatibility.

---

# Sprint Output Template (Strictly Enforced)

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
This sprint implements Context-Aware API Filtering across all public and authenticated endpoints to fulfill the 4-tier Data Classification matrix (`Public`, `Internal`, `Confidential`, `Restricted`). 

In Sprint 1, we introduced `PrivacyService` and the 4-tier `DataClassification` model in `@beechcms/core`, establishing symmetric encryption (AES-256-GCM) at rest for `Confidential` data and hashing for `Restricted` data. In Sprint 2, we built payload diffing and Blind Index integration for exact SQL search on `Confidential` fields. However, database storage rules represent only half of the privacy model. Outgoing JSON responses served over API endpoints must be context-aware:

1. **`Public` fields:** Served in full on both Public and Authenticated API endpoints.
2. **`Internal` fields:** Omitted (`Hidden`) from Public API endpoints; served in full on Authenticated API endpoints.
3. **`Confidential` fields:** Decrypted at the repository layer and served in cleartext on Authenticated API endpoints (to logged-in Admins/Users), but strictly scrubbed (`Hidden`) from Public API endpoints.
4. **`Restricted` fields:** Hashed at rest and ALWAYS scrubbed (`Hidden`) from ALL API responses (Public and Authenticated alike), preventing leakage of hashes (e.g. bcrypt hashes).

By establishing a central `ActorContext` type and updating response serialization helpers (`applyVisibility` and `toFlatPublicEntry`), we guarantee "Security by Design" and zero sensitive data leakage across public and authenticated API boundaries.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
- **God Nodes Identified:** `resolveClassification` / `resolvePolicies` (`packages/core/src/engine/policies.ts`), `applyVisibility` (`apps/api/src/shared/policies/apply-policies.ts`), `toFlatPublicEntry` / `applyPublicPolicies` (`apps/api/src/public/entry-projection.ts`), `readSingleEntry` / `readListEntries` (`apps/api/src/public/read-single.ts`, `apps/api/src/public/read-list.ts`).
- **Core Interfaces & Functions:**
  - `resolveClassification(branch)` in `packages/core/src/engine/policies.ts` returns:
    - `public`: `{ storage: 'plain', publicVisibility: 'full', authVisibility: 'full' }`
    - `internal`: `{ storage: 'plain', publicVisibility: 'hidden', authVisibility: 'full' }`
    - `confidential`: `{ storage: 'encrypt', publicVisibility: 'hidden', authVisibility: 'full' }`
    - `restricted`: `{ storage: 'hash', publicVisibility: 'hidden', authVisibility: 'hidden' }`
  - `applyVisibility(data, seed)` in `apps/api/src/shared/policies/apply-policies.ts` currently applies basic visibility checks without receiving an explicit `ActorContext`.
  - `applyPublicPolicies(data, seed)` in `apps/api/src/public/entry-projection.ts` currently projects public entries based on `resolvePolicies(branch).public`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
- `@beechcms/core` (`packages/core/src/engine/types.ts` & `packages/core/src/engine/policies.ts`):
  - `ActorContext` interface (`type: 'public' | 'authenticated' | 'system'`, `userId?: string`, `role?: string`).
  - Pure function `filterEntryForActor(data: Record<string, unknown>, seed: Seed, actor?: ActorContext): Record<string, unknown>`.
  - Comprehensive unit test coverage in `packages/core/src/engine/policies.test.ts`.
- `apps/api` (`apps/api/src/types.ts` & `apps/api/src/shared/policies/apply-policies.ts`):
  - Added `actor?: ActorContext` to Hono `Variables` in `apps/api/src/types.ts`.
  - Updated `applyVisibility(data: Record<string, unknown>, seed: Seed, actor?: ActorContext)` to utilize `filterEntryForActor` and enforce masking where configured.
  - Updated `applyPublicPolicies` / `toFlatPublicEntry` in `apps/api/src/public/entry-projection.ts` to strictly apply `{ type: 'public' }` actor rules.
  - Updated authenticated content handlers (`get.ts`, `list.ts`, `draft.handler.ts`) to extract `jwtPayload` / `actor` context from Hono Context and pass it to `applyVisibility`.
  - Updated unit tests in `apps/api/src/shared/policies/apply-policies.test.ts` and `apps/api/src/public/entry-projection.test.ts`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================
1. **Define `ActorContext` & `filterEntryForActor` in `@beechcms/core` (`packages/core/src/engine/policies.ts`):**
   - Export interface `ActorContext` in `packages/core/src/engine/types.ts`:
     ```ts
     export interface ActorContext {
       type: 'public' | 'authenticated' | 'system'
       userId?: string
       role?: string
     }
     ```
   - Implement `filterEntryForActor` in `packages/core/src/engine/policies.ts`:
     ```ts
     const SYSTEM_FIELDS = new Set(['id', 'slug', 'status', 'created_at', 'updated_at', 'version', 'has_pending_draft'])

     export function filterEntryForActor(
       data: Record<string, unknown>,
       seed: Seed,
       actor: ActorContext = { type: 'authenticated' }
     ): Record<string, unknown> {
       const result: Record<string, unknown> = {}

       for (const [key, value] of Object.entries(data)) {
         if (SYSTEM_FIELDS.has(key)) {
           result[key] = value
           continue
         }

         const branch = seed.branches.find((b) => b.alias === key)
         if (!branch) {
           // Pass through unknown/extra fields unless actor is public
           if (actor.type !== 'public') {
             result[key] = value
           }
           continue
         }

         const resolved = resolveClassification(branch)
         const isPublicActor = actor.type === 'public'
         const isSystemActor = actor.type === 'system'

         // System actor sees all fields including restricted
         if (isSystemActor) {
           result[key] = value
           continue
         }

         // Public actor check
         if (isPublicActor) {
           if (resolved.publicVisibility === 'hidden') continue
         } else {
           // Authenticated actor check
           if (resolved.authVisibility === 'hidden') continue
         }

         // Masking rule check
         if (branch.policies?.visibility === 'masked') {
           result[key] = typeof value === 'string' && value.length > 0 ? '••••••••' : null
         } else {
           result[key] = value
         }
       }

       return result
     }
     ```

2. **Update API Context & Serialization Helper (`apps/api/src/shared/policies/apply-policies.ts`):**
   - Update `applyVisibility`:
     ```ts
     export function applyVisibility(
       data: Record<string, unknown>,
       seed: Seed,
       actor?: ActorContext
     ): Record<string, unknown> {
       const resolvedActor = actor ?? { type: 'authenticated' }
       return filterEntryForActor(data, seed, resolvedActor)
     }
     ```

3. **Harden Public API Projection (`apps/api/src/public/entry-projection.ts`):**
   - Refactor `applyPublicPolicies`:
     ```ts
     function applyPublicPolicies(data: Record<string, unknown>, seed: Seed): Record<string, unknown> {
       return filterEntryForActor(data, seed, { type: 'public' })
     }
     ```

4. **Update Content Route Handlers (`apps/api/src/features/content/handlers/` & `draft.handler.ts`):**
   - In `get.ts` (`getByIdHandler`, `getBySlugHandler`):
     Construct `actor: ActorContext = { type: 'authenticated', userId: context.get('jwtPayload')?.sub, role: context.get('jwtPayload')?.role }` and pass to `applyVisibility(item.data, seed, actor)`.
   - In `list.ts` (`listHandler`):
     Pass `actor` context to `applyVisibility(item.data, seed, actor)` when serializing each list item.
   - In `draft.handler.ts` (`getDraftHandler`):
     Pass `actor` context to `applyVisibility(draft, seed, actor)`.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
- `pnpm beech test` (or `pnpm beech test --diff` for targeted testing)
- `pnpm --filter @beechcms/core run build`
- `npx tsc --noEmit` in `apps/api/`
- `pnpm --filter @beechcms/core test`
- `pnpm --filter api test`

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] `ActorContext` interface defined in `@beechcms/core` with `'public' | 'authenticated' | 'system'` types.
- [ ] `filterEntryForActor` correctly omits `Internal` and `Confidential` fields when `actor.type === 'public'`.
- [ ] `filterEntryForActor` correctly includes `Internal` and `Confidential` fields when `actor.type === 'authenticated'`.
- [ ] `filterEntryForActor` ALWAYS omits `Restricted` fields for both `public` and `authenticated` actors (`Restricted` fields are scrubbed from all API endpoints).
- [ ] System actor (`actor.type === 'system'`) retains full access to all fields for internal orchestration.
- [ ] `applyPublicPolicies` in `apps/api/src/public/entry-projection.ts` delegates to `filterEntryForActor(data, seed, { type: 'public' })`.
- [ ] `applyVisibility` in `apps/api/src/shared/policies/apply-policies.ts` accepts an optional `ActorContext`.
- [ ] All unit and integration tests across `@beechcms/core` and `apps/api` pass with 0 typecheck or build errors.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- **Role-Based Access Control (RBAC) Fine-Grained Permissions:** Granular field-level permissions per custom role (Deferred to future RBAC sprint).
- **Admin UI Schema Form Masking:** Frontend visual form layout changes in `apps/dashboard` (Handled in dashboard UI sprint).
- **Audit Logging for Read Access:** Logging read access to confidential fields (Deferred to Audit Trail sprint).
