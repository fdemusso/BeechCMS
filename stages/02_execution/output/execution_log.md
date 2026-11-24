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

## Rework (review_report REWORK_CODE)

- [x] F1 `scripts/dev-cli/orchestrator.ts`: `ensureDevSecretKey()` uses `\r?\n`, `'\n'` escapes; esbuild parse OK.
- [x] F1 new `scripts/dev-cli/__tests__/dev-secret-key.test.ts`: absent key appended, blank replaced, existing untouched, missing file false (4 passed); `orchestrator.test.ts` passes again (11 total passed).
- [x] F4 `rate-limit-middleware.ts` import now `./public-key-auth.js`.
- Skipped F5 (non-blocking), F3 kept, F6 manual curl not run.
- `pnpm lint`, `pnpm lint:tests`, `@beechcms/api` type-check: pass. `graphify update .`: done.
- `scripts/dev-cli/__tests__/endpoints.test.ts` fails (`Settings` group); file untouched by sprint, pre-existing.

## Rework 2 (review_report REWORK_CODE, findings 1-9)

- [x] F1 `dev-secret-key.test.ts`: BUSL-1.1 SPDX header added.
- [x] F2 `api-key-middleware.test.ts`: method matrix split into three `it()` (publishable reads, publishable writes, secret all six); no `if` around assertions.
- [x] F3 `dev-secret-key.test.ts`: comment says why a real `.dev.vars` file is used.
- [x] F4 `public-key-roles.integration.test.ts`: categories state read back via publishable-key HTTP list, no `content_categories` SQL.
- [x] F5 kept: `check-design-tokens.mjs` unused `path` import stays (user-approved).
- [x] F6 `forms-react` `ClientiTestPage.tsx` default key and `clienti-form-e2e.test.tsx` now `beech_sk_dev`.
- [x] F7 manual check on `pnpm beech dev` (API :8789): no key 401, wrong key 401, publishable GET passes auth, publishable PUT 403 `public-api-secret-key-required`, secret PUT passes auth. The dev DB has no `posts` seed (404 seed-not-found), so the 201 add case is covered only by the integration suite.
- [ ] F8 not touched: `endpoints.test.ts` (`Settings` group) fails on untouched `factory.ts`/`endpoints.ts`; outside sprint scope.
- [ ] F9 not done: stage contract forbids committing; the human commits.

Validation: `@beechcms/api` type-check pass; `test:unit` 163 files, 2126 passed; `test:integration` 104 files, 784 passed; `forms-react` test 43 passed, type-check pass; dev-cli orchestrator + dev-secret-key 11 passed; `pnpm beech test --diff` PASS (12 changed files meet coverage); `pnpm lint`, `pnpm lint:tests` pass; `graphify update .` done.
