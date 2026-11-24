# Verdict
REWORK_CODE

# Findings

This is the complete list from a full audit of the working tree (runtime diff, every test file in the diff, client SDK, config, out-of-diff consumers). Blocking items are 1 and 2. Fix them in one pass.

**Blocking**

1. **Rule 1.2 MUST: `scripts/dev-cli/__tests__/dev-secret-key.test.ts:1` has no SPDX header.** The file opens with `import fs from 'node:fs'`. Add the three-line BUSL-1.1 header from `_config/testing_conventions.md` Rule 1.2. `pnpm lint:tests` checks placement only, so it does not catch this. The sibling dev-cli tests lack the header too, but §8 makes a MUST violation blocking and the plan does not exempt `scripts/`.
2. **§7.4 forbidden (conditional assertion): `apps/api/src/public/middleware/api-key-middleware.test.ts:67-68`.** The method matrix asserts `toBe(readMethods.has(method) ? 200 : 403)` and then guards the problem-type check with `if (!readMethods.has(method)) { ... }`. The branch means the test decides what to expect at run time. Expected: drive the matrix from two arrays (read methods → publishable 200; write methods → publishable 403 `public-api-secret-key-required`), or split it into two `it()` blocks, so no assertion sits behind an `if`. The secret key passing all six methods stays as it is.

**Non-blocking (fix in the same pass if cheap)**

3. `scripts/dev-cli/__tests__/dev-secret-key.test.ts`: uses a real temp directory (Rule 0.2 reserves the filesystem for the integration tier; `scripts/dev-cli` has no such tier) and carries no comment saying why. Add a one-line comment, or accept it as a deliberate exception. The model `ensurePrivacyMasterKey` has no test at all.
4. `public-key-roles.integration.test.ts:109`: `SELECT COUNT(*) AS n FROM content_categories` names a physical table. The assertion is correct. An HTTP read of `/api/v1/public/categories` with the publishable key (categories has `allowPublicRead`) would match the plan's "read state back through the HTTP surface". The executor skipped this on purpose.
5. `scripts/check-design-tokens.mjs`: drops an unused `path` import. It is outside the plan's deliverables and SECTION 7. The user approved it. Keep it, or move it to its own commit.
6. **Plan gap, not an executor defect:** `packages/forms-react/src/examples/ClientiTestPage.tsx:19` still defaults to `'dev-public-write-key-changeme'`, and `packages/forms-react/src/test/clienti-form-e2e.test.tsx:202` passes the same value. The key no longer exists in `wrangler.jsonc`, so the example page would get 401 against the monorepo dev API. The e2e test uses a mocked fetch and still passes. The plan's census and the closing greps skip `packages/forms-react`, and SECTION 7 does not mention it. Decide: replace the value with `beech_sk_dev` now (two lines), or add `forms-react` to the scaffolder sprint (02). It does not justify REWORK_PLAN on its own.
7. **Open check:** the manual `curl` run from SECTION 5 was not run by the executor or by me. Integration tests cover the same three cases (publishable GET 200, publishable POST 403, secret POST 201). Run it once after `pnpm beech dev` before the merge, or accept the integration coverage.
8. **Pre-existing, not this sprint:** `scripts/dev-cli/__tests__/endpoints.test.ts` ("parses real routes from apps/api/src/factory.ts") fails. I confirmed that the sprint touches neither `factory.ts` nor `scripts/dev-cli/endpoints.ts`. Leave it, but do not read it as green when you run `vitest run scripts/dev-cli`.
9. **Housekeeping:** the rework is uncommitted. Commit it with the fixes for 1 and 2. Until then `git diff devs...HEAD` still contains the unparseable `orchestrator.ts` from commit `3ad0b738`.

Resolved since the first review: the `orchestrator.ts` parse error (`ensureDevSecretKey()` now uses `?
` and `'
'`, with 4 passing tests) and the `.js` extension on the `rate-limit-middleware.ts` import.

# Verification Evidence

Branch `feature/key-role-runtime`: one commit, `3ad0b738`, ahead of `devs`. The working tree also holds the rework: `orchestrator.ts` and `rate-limit-middleware.ts` modified, `dev-secret-key.test.ts` untracked. I reviewed the working tree, not only the commit.

Commands I ran (repo root), all this session:

- `pnpm --filter @beechcms/client type-check` → exit 0 (includes `*.test.ts`, so the `@ts-expect-error` directives hold).
- `pnpm --filter @beechcms/client test` → 130 passed. `... build` → exit 0.
- `pnpm --filter @beechcms/testing type-check` and `build` → exit 0.
- `pnpm --filter @beechcms/api type-check` → exit 0.
- `pnpm --filter @beechcms/api test:unit` → 163 files, 2124 passed.
- `pnpm --filter @beechcms/api test:integration` → 104 files, 784 passed (real D1).
- `pnpm beech test --diff` (Docker up) → exit 0, "every selected test run passed", changed-line coverage met for all 11 changed files. `public-key-auth.ts` 28/28, `public-add.ts` 6/6, `api-key-middleware.ts` 2/2.
- `pnpm lint` → "ESLint: No issues found". `pnpm lint:tests` → "test placement — OK".
- `pnpm exec esbuild scripts/dev-cli/orchestrator.ts --format=esm` → exit 0. This was the failure in the previous review.
- `pnpm exec vitest run scripts/dev-cli/__tests__/orchestrator.test.ts scripts/dev-cli/__tests__/dev-secret-key.test.ts` → 2 files, 11 passed. `orchestrator.test.ts` loads again, and the 4 new cases cover appended key, blank value replaced in place, existing value untouched, and missing file returns false.
- Closing greps: #1 (legacy names, non-test) → no hits. #2 (legacy names, tests) → exactly one hit, `api-key-middleware.test.ts:164`, the "legacy bindings alone" case. #3 (`apiKey\s*:` in client sources and `client-sdk-e2e.test.ts`) → no hits.
- `git diff --stat devs...HEAD -- packages/core` and `git diff --stat devs -- packages/core` → empty. `@beechcms/core` is unchanged.
- I read `ensureDevSecretKey()` (`orchestrator.ts:200-218`) again. It now uses `/\r?\n/`, `'\n'` escapes and the plan's `BEECH_SECRET_KEY=beech_sk_dev` entry. It is called once, at `orchestrator.ts:422`.

Code review: the runtime diff matches my first review, which found no defect. The plan's building blocks are intact: `public-key-auth.ts` (constants, types, `authorizePublicKey` rule order, `publicKeyProblem` with inferred return type, one `console.warn` with no key), `public-errors.ts` (T3), `api-key-middleware.ts` and `public-add.ts` (T4), `sanitize.ts` requires `idGenerator` (T8), and the client resolvers and config shapes (T5). The header is read only in `api-key-middleware.ts` and `public-add.ts`, and `timingSafeEqual` on keys appears only in `public-key-auth.ts`.

Invariant audit: no D1 access outside core, no `apps/api/src/features/**` import of the public slice, no hardcoded field names. SECTION 7 is untouched except the approved `check-design-tokens.mjs` import (Finding 3).

Runtime verification: I did not run `pnpm beech dev` plus `curl`. The new integration suite covers publishable GET 200, publishable POST 403 `public-api-secret-key-required`, secret POST 201 and PUT 200 on relation-bearing `posts`, against real D1. `orchestrator.ts` now parses and loads, so the dev launcher is no longer blocked. `apps/dashboard` has no diff.

Extra audit this round: read every file of the runtime diff and the new/changed test files against §8; `git grep` of the legacy names across the whole repo outside `docs/` and `stages/` (hits: `bin/template.mjs`, `packages/cli/src/commands/{init,forms}.ts` are declared out of scope; `packages/forms-react` is Finding 6); `pnpm exec vitest run scripts/dev-cli` → 74 passed, 1 failed (`endpoints.test.ts`, Finding 8).

SECTION 6 walk: all 15 criteria hold. "Every command in SECTION 5 passes" is now true, apart from the manual `curl` step. Open items are Findings 1 and 2, both in test files.

# Sprint Documentation
Sprint 01 KeyRoleRuntime (publishable and secret keys): replaces `PUBLIC_READ_API_KEY` / `PUBLIC_WRITE_API_KEY` with two key roles, `BEECH_PUBLISHABLE_KEY` (GET/HEAD/OPTIONS) and `BEECH_SECRET_KEY` (all methods), behind one shared decision, `authorizePublicKey()`, used by both `apiKeyMiddleware` and `publicAddHandler`.
- Denials: a publishable key on a write gets 403 `public-api-secret-key-required`, a wrong key 401, unconfigured 403 `public-api-not-configured`, and `beech_sk_dev` outside `ENV=development` 403 `public-api-dev-secret-key` with one stable warning that never carries the key. There is no guard on the publishable key and no legacy name support.
- Client SDK: `createBeechBrowserClient({ publishableKey })` (read-only, rejects `beech_sk_`) and `createBeechServerClient({ secretKey })` (one instance lists, reads and writes). `apiKey` is a type error and a runtime error naming the replacement.
- Also fixed (T8): `sanitizePublicPayload` now requires `idGenerator`. Public add and edit on seeds with relation branches (canonical `posts`) returned 500 before. A malformed relation id now gives 400 `validation_failed`.
- Monorepo dev: `BEECH_PUBLISHABLE_KEY=beech_pk_dev` in `wrangler.jsonc` `vars`, `BEECH_SECRET_KEY=beech_sk_dev` in `.dev.vars.example`, written into existing `.dev.vars` by `pnpm beech dev` through `ensureDevSecretKey()` (unit-tested), and passed to the e2e worker.
- Deviation: review 1 found `ensureDevSecretKey()` committed with raw line breaks inside a regex and string literals, so `orchestrator.ts` did not parse. The rework fixed it and added a test. Neither is committed yet.
- Known limits: a secret key still needs `allowPublicPost` on the seed (#1022). The scaffolder (02), `beech keys:migrate` (03) and docs (04) are later sprints, and the error messages already name the not-yet-existing migrate command. The manual `curl` check was not run.
