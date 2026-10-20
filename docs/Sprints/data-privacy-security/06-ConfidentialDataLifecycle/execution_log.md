# Execution Log: Confidential Data Classification & Ingestion Lifecycle

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `BranchPolicies` interface in `packages/core/src/engine/types.ts` includes `publicEdit?: boolean`.
- [x] `resolvePolicies()` in `packages/core/src/engine/policies.ts` defaults `publicEdit` to `false` for `confidential`, `internal`, and `restricted` fields, and `true` for `public` fields (unless `public: false`).
- [x] `filterEntryForActor()` in `packages/core/src/engine/policies.ts` removes `confidential` fields for unauthenticated public callers while preserving them for authenticated operators and system automations.
- [x] Public `add` endpoint accepts `confidential` fields on submission, encrypts them at rest in Cloudflare D1 via `D1ContentRepository`, and passes cleartext values to `AutomationRunner`.
- [x] Public `add` endpoint rejects `internal` and `restricted` fields with HTTP 422 Problem Details (`Cannot write internal/restricted fields: <aliases>`).
- [x] Public `edit` endpoint rejects `confidential` fields with HTTP 422 (`Cannot edit sensitive field '<alias>': edit permission not granted by seed declaration`) unless `publicEdit: true` is configured.
- [x] Public `edit` endpoint permits modifying `confidential` fields when `publicEdit: true` is set in the seed definition.
- [x] Public `edit` endpoint rejects `internal` and `restricted` fields with HTTP 422 (`Cannot write internal/restricted fields: <aliases>`).
- [x] Public `read` endpoints (`/api/v1/public/:seed` and `/api/v1/public/:seed?id=...`) never return `confidential`, `internal`, or `restricted` field values.
- [x] Authenticated content endpoints (`/api/content/:slug/:id`) return decrypted `confidential` fields to authorized dashboard operators.
- [x] Automation action executors (e.g. `send_mail`, `webhook`) receive unmasked cleartext fields from in-memory event triggers without manual decryption steps.
- [x] All unit and integration tests across `@beechcms/core` and `apps/api` pass cleanly with zero regressions.

## Validation Output

### 1. Core Package Tests
```bash
pnpm --filter @beechcms/core test
```
```
 Test Files  31 passed (31)
      Tests  597 passed (597)
```

### 2. API Package Tests
```bash
pnpm --filter @beechcms/api test
```
```
 Test Files  107 passed (107)
      Tests  1225 passed (1225)
```

### 3. Workspace Full Test Suite
```bash
pnpm beech test
```
```
 Tasks:    10 successful, 10 total
 Cached:    3 cached, 10 total
 Time:      1m9.631s
```

### 4. Graph Synchronization
```bash
graphify update .
```
```
[graphify watch] Rebuilt: 10242 nodes, 18378 edges, 897 communities
Code graph updated.
```
