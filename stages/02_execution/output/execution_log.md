# Execution log — KeyRoleRuntime

## SECTION 6 — Acceptance criteria

- [x] `authorizePublicKey` sole key comparison; header read only in `api-key-middleware.ts` and `public-add.ts`, both pass it straight through.
- [x] `apps/api/src` has no `PUBLIC_READ_API_KEY` / `PUBLIC_WRITE_API_KEY` (grep 1 empty; grep 2 = the one "legacy bindings alone" test).
- [x] Publishable key: GET/HEAD pass; writes (incl. `POST /:seed/add`, `PUT /edit`) 403 `public-api-secret-key-required`.
- [x] Secret key: every method passes; `categories` add → 403 `operation-not-allowed`.
- [x] Wrong key 401; no secret → write 403 `public-api-not-configured`; nothing configured → read 403 (unit matrix).
- [x] `beech_sk_dev` with `ENV` ≠ development/unset → 403 `public-api-dev-secret-key`, one `console.warn`, no key value; no publishable guard.
- [x] `timingSafeEqual` kept; only `ENV` branch is the dev-secret guard.
- [x] Zero-secret paths unchanged (unit + anonymous 422 `time-trap-missing` integration).
- [x] Client: only `publishableKey` / `secretKey` shapes; `apiKey` type error + runtime error naming parameter; browser rejects `beech_sk_`.
- [x] Browser resource `create`/`update` fail type-check (`@ts-expect-error` holds under client `type-check`).
- [x] One server instance does `list`, `first`, `create` (integration green).
- [x] `BeechClientConfig` not exported; `HttpConfig` not exported from `index.ts`.
- [x] Secret key creates and edits canonical `posts`: 201 / 200; malformed `category_id` → 400 `validation_failed`.
- [x] `sanitizePublicPayload` requires `idGenerator`; add and edit pass `context.get('idGenerator')`.
- [x] Every SECTION 5 command passes; greps 1 and 3 empty, grep 2 exactly one hit.
- [x] `@beechcms/core` unchanged (`git diff --stat -- packages/core` empty).

## Validation

- `@beechcms/client` type-check, test (130 passed), build: pass.
- `@beechcms/testing` type-check, build: pass.
- `@beechcms/api` type-check: pass.
- `@beechcms/api` test:unit: 163 files, 2124 passed.
- `@beechcms/api` test:integration: 104 files, 784 passed (includes 3 new T8 cases: malformed relation id, two edit cases).
- `pnpm beech test --diff` (Docker started): PASS, all selected runs; changed-line coverage met for all 10 changed files.
- `pnpm lint:tests`: test placement OK.
- `pnpm lint`: pass (removed unused `path` import in `scripts/check-design-tokens.mjs`, pre-existing error, user-approved).
- `graphify update .`: 33058 nodes, 48352 edges.

## Notes

- Manual `curl` check (after `pnpm beech dev`) not run. The integration tests cover the same three cases (publishable GET 200, publishable POST 403, secret POST 201).
- Nothing committed (stage contract).
