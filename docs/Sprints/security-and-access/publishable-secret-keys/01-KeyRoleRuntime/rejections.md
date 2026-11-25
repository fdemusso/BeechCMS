## 2026-11-24 — KeyRoleRuntime.md (stage 02 rejection)

State: every SECTION 3 deliverable is implemented on `feature/key-role-runtime` (uncommitted). Blocked at SECTION 5 validation.

1. **Public `POST /:seed/add` returns 500 for any seed with a relation branch, and canonical `posts` has several.**
   `apps/api/src/public/validation/sanitize.ts:38` calls `validateAndSanitizeSeedPayload` without `idGenerator`; core throws
   `IIdGenerator must be provided in ValidateSeedPayloadOptions when validating seeds with relation branches`
   (`packages/core/src/engine/validation/schema-builders.ts:340`). Stack: `public-add.ts:322` -> `sanitizePublicPayload`.
   It exists at `HEAD`, independent of this sprint (the key check runs earlier and passes).
   Two T6 tests in `public-key-roles.integration.test.ts` cannot pass as written, because they add to canonical `posts` with the secret key:
   - "the secret key creates a posts entry without a Time-Trap token"
   - "an instance built with only secretKey creates an entry that its own list and first then return"
   The plan must decide: (a) fix `sanitize.ts` to pass an `IIdGenerator` (it is not in SECTION 3 and SECTION 7 forbids touching
   adjacent public behaviour), or (b) name a seed without relation branches for these two tests (Rule 3.5 allows a hand-rolled
   seed only for malformed input, so the plan must say so; `public-idempotency.integration.test.ts:17` is a precedent).
2. **SECTION 5 closing grep cannot return "no hits".** `apiKey:` matches the unrelated Resend email code
   (`features/automations/executors/send-mail.executor.ts:44`, `features/password-reset/{request,reset}.ts`,
   `features/rbac/invitations.ts`, `shared/email/**`). It also matches the T6 tests that assert the legacy `apiKey` is rejected.
   The pattern must be scoped (for example `apiKey:` only under `packages/client/src` outside `*.test.ts`, plus
   `apps/api/test/client-sdk-e2e.test.ts`).
3. **Not run yet** (blocked behind 1): `pnpm beech test --diff`, `pnpm lint`, `pnpm lint:tests`, the manual `curl` check, `graphify update .`.
   Passed: client `type-check`/`test`/`build`, api and testing `type-check`, api `test:unit` (2124), api `test:integration` (779 pass, the 2 failures above).
4. **Environment note:** `apps/api` resolves `@beechcms/testing` through `packages/testing/dist`, so `pnpm --filter @beechcms/testing build`
   must run before the api type-check after the fixture rename. Add it to SECTION 5.
