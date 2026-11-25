# Sprint Plan: Confidential Data Classification & Ingestion Lifecycle

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
Sensitive personal data (GDPR / privacy compliance) such as email addresses, phone numbers, and identifying records must be protected with Application-Level Encryption (ALE) at rest (AES-256-GCM) on Cloudflare D1 and shielded from unauthenticated public read access. However, transactional automation pipelines (such as sending immediate confirmation emails to `{{this.email}}` or firing operational webhooks) require direct access to cleartext values in memory upon creation/update, and authenticated operators need transparent decryption in the administrative dashboard.

This foundational sprint establishes the complete end-to-end lifecycle for `confidential` data classification:
1. **Botanical Engine Invariant:** Schema contracts in `@beechcms/core` (`BranchPolicies`, `resolveClassification`, `resolvePolicies`, `filterEntryForActor`) define the single source of truth for classification tiers (`public`, `internal`, `confidential`, `restricted`) and public write/edit permissions.
2. **Vertical Slice Architecture (VSA):** Public ingestion handlers (`public-add`, `public-edit`) and internal content handlers enforce access policies independently without cross-slice coupling.
3. **In-Memory Automation Execution:** Dispatches event payloads to `AutomationRunner` with cleartext in-memory data before/alongside cryptographic D1 persistence, ensuring transactional templates execute without manual decryption overhead.

Building this foundation first prevents security leaks in public ingestion endpoints, guarantees GDPR compliance for personal data, and avoids breaking automation execution pipelines.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
1. **Schema & Policy Definitions (`@beechcms/core`):**
   - `Seed` and `Branch` (`packages/core/src/engine/types.ts`): God Node (Degree: 89). `Branch.policies` currently supports `classification`, `privacy`, `visibility`, `search`, `filter`, `sort`, `public`. It lacks an explicit `publicEdit` flag for granular public update authorization.
   - `resolveClassification` & `resolvePolicies` (`packages/core/src/engine/policies.ts`): Maps `confidential` classification to `{ classification: 'confidential', storage: 'encrypt', publicVisibility: 'hidden', authVisibility: 'full' }`.
   - `filterEntryForActor` (`packages/core/src/engine/policies.ts`): Scrubs `confidential`, `internal`, and `restricted` fields for `actor.type === 'public'`, passes `confidential` and `internal` for `actor.type === 'authenticated'`, and grants all fields for `actor.type === 'system'`.

2. **Persistence & Cryptography (`@beechcms/core` & `apps/api`):**
   - `IPrivacyService` & `PrivacyService` (`packages/core/src/engine/privacy.service.ts`): Edge-native Web Crypto API implementation supplying AES-256-GCM (`v1:<iv_base64>:<ciphertext_base64>`) encryption/decryption and HMAC-SHA256 blind indexing (`hash`).
   - `D1ContentRepository` (`apps/api/src/shared/db/repositories/content.repository.d1.ts`): Handles transparent encryption on create/update via `serializeAndProtect()` and transparent decryption on read via `rowToData()`.

3. **Public Ingestion Endpoints (`apps/api/src/public/`):**
   - `publicAddHandler` (`apps/api/src/public/public-add.ts`): Validates incoming payload. Currently checks sensitive fields, but needs strict policy alignment to allow `confidential` fields on `add` (unless `public: false`) while rejecting `internal`/`restricted` with HTTP 422 Problem Details (`Cannot write internal/restricted fields: <aliases>`). Dispatches `automationRunner.run()` via `scheduler.waitUntil()`.
   - `publicEditHandler` (`apps/api/src/public/public-edit.ts`): Currently blocks all non-plain fields. Needs granular check: `internal`/`restricted` fields rejected with 422 (`Cannot write internal/restricted fields: <aliases>`); `confidential` fields blocked by default with 422 (`Cannot edit sensitive field '<alias>': edit permission not granted by seed declaration`) unless `branch.policies?.publicEdit === true`.
   - `publicReadHandler` (`apps/api/src/public/public-read.ts`): Projects entries via `toFlatPublicEntry()` -> `filterEntryForActor(..., { type: 'public' })`, properly omitting confidential/internal fields.

4. **Automation Engine (`apps/api/src/features/automations/`):**
   - `AutomationRunner` (`apps/api/src/features/automations/engine/automation-runner.ts`): Injected via `c.get('automationRunner')`. Operates in system context and evaluates template references (`{{this.email}}`, `{{this.title}}`) against the trigger entry payload.

5. **Context Variables (`AppEnv.Variables` in `apps/api`):**
   - `c.get('repository')`: `ContentRepository` (instance of `D1ContentRepository`).
   - `c.get('getSeed')`: Seed resolver function `(slug: string) => Seed | null`.
   - `c.get('automationRunner')`: `IAutomationRunner`.
   - `c.get('scheduler')`: `IScheduler`.
   - `c.get('activityLogger')`: `IActivityLogger`.
   - `c.get('idGenerator')`: `IIdGenerator`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
1. **`packages/core/src/engine/types.ts`**:
   - Add `publicEdit?: boolean` property to `BranchPolicies` in `Branch['policies']`.
2. **`packages/core/src/engine/policies.ts`**:
   - Update `resolvePolicies(branch: Branch)` to compute `publicEdit: boolean` (defaults to `true` for `public` classification if `public !== false`; defaults to `false` for `confidential`, `internal`, and `restricted` unless explicitly overridden via `branch.policies?.publicEdit === true`).
3. **`packages/core/src/engine/policies.test.ts`**:
   - Unit tests covering `resolvePolicies` resolution of `publicEdit` and `filterEntryForActor` behavior for `confidential` fields across public, authenticated, and system actor contexts.
4. **`packages/core/src/engine/seed-validation.ts` & `packages/core/src/engine/seed-validation.test.ts`**:
   - Validation rules ensuring `policies.publicEdit` is a boolean when defined on a branch.
5. **`apps/api/src/public/public-add.ts`**:
   - Enforce public write access rules: allow `confidential` fields on creation by default (unless `public: false`); reject `internal` and `restricted` fields with HTTP 422 Problem Details (`Cannot write internal/restricted fields: <aliases>`).
   - Ensure the dispatch to `automationRunner.run()` receives cleartext in-memory data alongside system identifiers (`id`, `slug`, `status`).
6. **`apps/api/src/public/public-edit.ts`**:
   - Enforce public edit access rules: reject `internal` and `restricted` fields with HTTP 422 (`Cannot write internal/restricted fields: <aliases>`); reject `confidential` fields when `publicEdit !== true` with HTTP 422 (`Cannot edit sensitive field '<alias>': edit permission not granted by seed declaration`); allow `confidential` fields when `publicEdit === true`.
   - Ensure automation dispatch carries the updated in-memory cleartext entry.
7. **`apps/api/src/public/public-add.test.ts` & `apps/api/test/public-edit.test.ts` (or `apps/api/src/public/public-edit.test.ts`)**:
   - Integration tests covering public creation and editing of confidential fields, rejection messages, and event dispatch.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1: Update `@beechcms/core` BranchPolicies & Policy Resolver

#### 1.1 Type Update (`packages/core/src/engine/types.ts`)
Add `publicEdit` to `Branch['policies']`:
```typescript
export interface Branch {
  id: string
  alias: string
  label: string
  hint?: string
  type: BranchType
  format?: 'plain' | 'markdown' | 'html' | 'date' | 'datetime' | 'asset-list'
  multiple?: boolean
  options?: string[]
  requiredOnCreate?: boolean
  requiredOnUpdate?: boolean
  policies?: {
    classification?: DataClassification | 'Public' | 'Internal' | 'Confidential' | 'Restricted'
    privacy?: 'plain' | 'hash' | 'encrypt' | DataClassification | 'Public' | 'Internal' | 'Confidential' | 'Restricted'
    visibility?: 'full' | 'masked' | 'hidden'
    search?: boolean
    filter?: boolean
    sort?: boolean
    public?: boolean
    /** Whether the field can be updated via public edit endpoints. Default: false for confidential/internal/restricted, true for public. */
    publicEdit?: boolean
  }
  // ... remaining fields unchanged
}
```

#### 1.2 Policy Resolution Update (`packages/core/src/engine/policies.ts`)
Update `resolvePolicies`:
```typescript
export function resolvePolicies(branch: Branch): Required<NonNullable<Branch['policies']>> {
  const resolved = resolveClassification(branch)
  const isRepeater = branch.type === 'repeater'
  const isEncryptedOrHashed = resolved.storage !== 'plain'

  const defaultVisibility = resolved.authVisibility
  const isPublicAllowed = branch.policies?.public ?? (resolved.publicVisibility === 'full')

  const defaultFilter = isRepeater || resolved.storage === 'hash' ? false : branch.policies?.filter ?? true
  const defaultSort = isRepeater || isEncryptedOrHashed ? false : branch.policies?.sort ?? true
  const defaultSearch = isRepeater || isEncryptedOrHashed ? false : branch.policies?.search ?? true

  // publicEdit default: true for public fields (unless public: false), false for confidential/internal/restricted
  const defaultPublicEdit = resolved.classification === 'public'
    ? (branch.policies?.publicEdit ?? isPublicAllowed)
    : (branch.policies?.publicEdit ?? false)

  return {
    classification: resolved.classification,
    privacy: resolved.storage,
    visibility: branch.policies?.visibility ?? defaultVisibility,
    search: defaultSearch,
    filter: defaultFilter,
    sort: defaultSort,
    public: isPublicAllowed,
    publicEdit: defaultPublicEdit,
  }
}
```

### Task 2: Seed Definition Validation (`packages/core/src/engine/seed-validation.ts`)
Add validation rule in `validateSeedDefinitions`:
```typescript
// Fatal/Warning checks for branch policies
for (const seed of seeds) {
  const messages: string[] = []
  for (const branch of seed.branches) {
    if (branch.policies?.publicEdit !== undefined && typeof branch.policies.publicEdit !== 'boolean') {
      messages.push(`branch '${branch.alias}': policies.publicEdit must be a boolean`)
    }
  }
  if (messages.length > 0) result.push({ slug: seed.slug, messages, fatal: true })
}
```

### Task 3: Public Ingestion Handlers Updates in `apps/api`

#### 3.1 Public Add (`apps/api/src/public/public-add.ts`)
Update sensitive field check in `publicAddHandler`:
```typescript
  // Reject internal and restricted fields on public add
  const disallowedAliases = Object.keys(rawData).filter((alias) => {
    const branch = seed.branches.find((b) => b.alias === alias)
    if (!branch) return false
    
    // Explicit public: false takes absolute precedence
    if (branch.policies?.public === false) return true
    // If explicitly marked public: true, allow write
    if (branch.policies?.public === true) return false
    
    const classification = resolveClassification(branch).classification
    // internal and restricted fields can never be written publicly
    return classification === 'internal' || classification === 'restricted'
  })

  if (disallowedAliases.length > 0) {
    return publicProblem(context, {
      type: 'sensitive-field-write',
      title: 'Unprocessable Entity',
      status: 422,
      detail: `Cannot write internal/restricted fields: ${disallowedAliases.join(', ')}`,
    })
  }
```

Ensure automation dispatch passes cleartext in-memory data:
```typescript
  context.get('scheduler').waitUntil(
    context.get('automationRunner').run({
      seedSlug,
      event: 'create',
      entry: { id, slug: finalSlug, status: statusValue, ...sanitized.data },
    })
  )
```

#### 3.2 Public Edit (`apps/api/src/public/public-edit.ts`)
Update `resolveData` in `publicEditHandler`:
```typescript
function resolveData(
  context: PublicCtx,
  seed: Seed,
  body: Record<string, unknown>
): ResolveResult<Record<string, unknown>> {
  if (!Object.hasOwn(body, 'data')) {
    return { ok: true, value: {} }
  }

  const rawData = asRecord(body.data)
  if (!rawData) {
    return {
      ok: false,
      response: publicProblem(context, {
        type: 'invalid-data-object',
        title: 'Bad Request',
        status: 400,
        detail: "Field 'data' must be an object when provided",
      }),
    }
  }

  // 1. Check for internal/restricted fields
  const internalOrRestricted = Object.keys(rawData).filter((alias) => {
    const branch = seed.branches.find((b) => b.alias === alias)
    if (!branch) return false
    const classification = resolveClassification(branch).classification
    return classification === 'internal' || classification === 'restricted'
  })

  if (internalOrRestricted.length > 0) {
    return {
      ok: false,
      response: publicProblem(context, {
        type: 'sensitive-field-edit',
        title: 'Unprocessable Entity',
        status: 422,
        detail: `Cannot write internal/restricted fields: ${internalOrRestricted.join(', ')}`,
      }),
    }
  }

  // 2. Check for confidential fields without explicit publicEdit permission
  const unauthorizedConfidential = Object.keys(rawData).filter((alias) => {
    const branch = seed.branches.find((b) => b.alias === alias)
    if (!branch) return false
    const classification = resolveClassification(branch).classification
    if (classification === 'confidential') {
      const policies = resolvePolicies(branch)
      return !policies.publicEdit
    }
    // Also block non-confidential branches where public === false
    const policies = resolvePolicies(branch)
    return policies.public === false && !policies.publicEdit
  })

  if (unauthorizedConfidential.length > 0) {
    const alias = unauthorizedConfidential[0]
    return {
      ok: false,
      response: publicProblem(context, {
        type: 'sensitive-field-edit',
        title: 'Unprocessable Entity',
        status: 422,
        detail: `Cannot edit sensitive field '${alias}': edit permission not granted by seed declaration`,
      }),
    }
  }

  const sanitized = sanitizePublicPayload(seed, rawData, {
    allowNull: true,
    operation: 'update',
    requireAtLeastOneValidField: true,
    enforceRequiredFields: true,
  })

  if (!sanitized.ok) {
    if (sanitized.status === 422) {
      return {
        ok: false,
        response: publicProblem(context, {
          type: sanitized.code,
          title: 'Unprocessable Entity',
          status: 422,
          detail: sanitized.message,
        }),
      }
    }
    return {
      ok: false,
      response: publicProblem(context, {
        type: sanitized.code,
        title: 'Bad Request',
        status: 400,
        detail: sanitized.message,
        errors: sanitized.details,
      }),
    }
  }

  return { ok: true, value: removeNullishFields(sanitized.data) }
}
```

Ensure automation dispatch carries cleartext unencrypted values in memory:
```typescript
  context.get('scheduler').waitUntil(
    context.get('automationRunner').run({
      seedSlug,
      event: 'update',
      entry: { ...entry, ...updateData, status: statusResult.value },
    })
  )
```

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
1. **Core Package Test Suite:**
   ```bash
   pnpm --filter @beechcms/core test
   ```
2. **API Package Test Suite:**
   ```bash
   pnpm --filter @beechcms/api test
   ```
3. **Workspace Full Typecheck & Test:**
   ```bash
   pnpm run typecheck
   pnpm beech test
   ```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] `BranchPolicies` interface in `packages/core/src/engine/types.ts` includes `publicEdit?: boolean`.
- [ ] `resolvePolicies()` in `packages/core/src/engine/policies.ts` defaults `publicEdit` to `false` for `confidential`, `internal`, and `restricted` fields, and `true` for `public` fields (unless `public: false`).
- [ ] `filterEntryForActor()` in `packages/core/src/engine/policies.ts` removes `confidential` fields for unauthenticated public callers while preserving them for authenticated operators and system automations.
- [ ] Public `add` endpoint accepts `confidential` fields on submission, encrypts them at rest in Cloudflare D1 via `D1ContentRepository`, and passes cleartext values to `AutomationRunner`.
- [ ] Public `add` endpoint rejects `internal` and `restricted` fields with HTTP 422 Problem Details (`Cannot write internal/restricted fields: <aliases>`).
- [ ] Public `edit` endpoint rejects `confidential` fields with HTTP 422 (`Cannot edit sensitive field '<alias>': edit permission not granted by seed declaration`) unless `publicEdit: true` is configured.
- [ ] Public `edit` endpoint permits modifying `confidential` fields when `publicEdit: true` is set in the seed definition.
- [ ] Public `edit` endpoint rejects `internal` and `restricted` fields with HTTP 422 (`Cannot write internal/restricted fields: <aliases>`).
- [ ] Public `read` endpoints (`/api/v1/public/:seed` and `/api/v1/public/:seed?id=...`) never return `confidential`, `internal`, or `restricted` field values.
- [ ] Authenticated content endpoints (`/api/content/:slug/:id`) return decrypted `confidential` fields to authorized dashboard operators.
- [ ] Automation action executors (e.g. `send_mail`, `webhook`) receive unmasked cleartext fields from in-memory event triggers without manual decryption steps.
- [ ] All unit and integration tests across `@beechcms/core` and `apps/api` pass cleanly with zero regressions.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- Dynamic/runtime cryptographic key rotation CLI scripts on Cloudflare D1.
- Dashboard UI component rewrites (dashboard consumes authenticated endpoints that return decrypted fields transparently).
- Custom masking or filtration logic inside `AutomationRunner` for system-level actions.
- Manual decryption helper abstractions added inside `AutomationRunner` (in-memory payload is already cleartext).
