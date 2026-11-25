# Verdict
PASS

# Findings
None. The one finding of the previous review (REWORK_PLAN, `LlmPromptNode.vue:56` still said `apiKey`) is fixed, and fact-check section 6 now scans the theme sources, so the gap cannot reopen unnoticed.

# Verification Evidence
Scope: the sprint lives in the working tree (sprints 02/03 and 04 are uncommitted), so I reviewed the working-tree diff, not only `git diff devs...HEAD`.

SECTION 5 commands, re-run by me (the execution log was not trusted):
- `pnpm --filter @beechcms/client build` -> `tsc`, OK.
- `node --test scripts/lib/legacy-key-names.test.mjs` -> tests 18, pass 18, fail 0.
- `node --test scripts/lib/*.test.mjs` -> tests 51, pass 51, fail 0.
- `pnpm docs:check` -> section 6: "No legacy key names in 901 files (migration sections excepted)"; `DOCUMENTATION FACT-CHECK PASSED`.
- `pnpm --filter @beechcms/cli test` -> Test Files 34 passed, Tests 251 passed.
- `pnpm --filter @beechcms/mcp build` -> "bundle-resources: wrote 874 resources".
- `pnpm docs:build` -> typedoc "Found 0 errors and 2 warnings", fact-check passed, "build complete in 35.70s". An md5 over `docs/api` before and after the run is identical, so the tracked folder is exactly the TypeDoc output.
- `pnpm lint` -> 20 successful, 20 total.
- `graphify update .` not re-run: it changes no tracked file and does not affect the verdict.

Closing greps (all empty): the legacy-name grep over `docs` (minus `Sprints`, `cli-workflows.md`); the same pattern over `packages/mcp/resources` (minus `build/cli-workflows.md`); `git grep -w BeechClientConfig -- docs ':!docs/Sprints'`; `git grep -w apiKey -- docs/.vitepress ':!docs/.vitepress/dist'`.

Acceptance criteria, walked one by one:
- Hand check 1: `apiKey` put back on `LlmPromptNode.vue:56` -> `docs/.vitepress/theme/components/LlmPromptNode.vue:56: legacy key name "apiKey"`, `FACT-CHECK FAILED with 1 issue(s)`. Reverted.
- Hand check 2: `PUBLIC_READ_API_KEY` appended to `docs/start/index.md` -> `docs/start/index.md:102: legacy key name "PUBLIC_READ_API_KEY"`, FAILED. Reverted; the next `docs:check` passed and `git diff --stat` shows the original one-line changes.
- `LlmPromptNode.vue:56` now reads "with baseUrl and publishableKey (browser) or secretKey (server)". The diff for the component is that single line.
- `scripts/lib/legacy-key-names.mjs` matches SECTION 4 verbatim (`LEGACY_KEY_PATTERNS`, `LEGACY_KEY_SITE_PATTERNS`, `LEGACY_KEY_ALLOWED_SECTIONS`, `findLegacyKeyMentions`). It does no I/O. The site pattern is applied only under `docs/.vitepress/`.
- Test file: BUSL header, `node:test` + `node:assert/strict`, inline fixtures, no conditionals, randomness, skips or timers (checked against `testing_conventions.md` section 7 and the section 8 checklist). It has the three REWORK cases and the plan's other cases.
- Guides: `git diff` of all 8 framework guides, `first-project.md` and `start/index.md` shows the shared vocabulary, with no key fallback. The server guides use `secretKey`/`BEECH_SECRET_KEY`. React and Vue use `publishableKey`. Nuxt switched to `createBeechBrowserClient` with `runtimeConfig.public.beechPublishableKey`.
- Doc claims checked against code: `apps/api/src/public/middleware/public-key-auth.ts:45-73` (roles, the four denials, dev-secret guard and its warning), `api-key-middleware.ts:8-22` (zero-secret paths), `public-add.ts:170-177` (key on `POST /add` goes through `authorizePublicKey`), `packages/client/src/http.ts:20-47` (error texts, `beech_sk_` refusal). All match `client-sdk.md`, `public-api.md`, `error-model.md`, `environments.md` and `CHANGELOG.md`.
- `CHANGELOG.md`: `## Publishable and secret keys — unreleased` with `### Upgrading from 0.10.x` (command, rotation warning, deploy-then-secret order). No page says the publishable key is generated in production.
- `docs/api/@beechcms/client/interfaces/BeechClientConfig.md` is gone. `BeechBrowserClientConfig.md`, `BeechClientBaseConfig.md` and `BeechServerClientConfig.md` are present.

Invariant audit: no change under `apps/` or `packages/forms-react`. The `packages/*/src` and `bin/` diffs are only the sprint 02/03 files (cli init, forms, setup-cloudflare, wrangler, index, their tests, `bin/create.mjs`, `bin/template.mjs`). There is no D1 access, hardcoded field name or cross-slice import. SECTION 7 is respected: the only theme edit is `LlmPromptNode.vue:56`.

Runtime verification: the sprint ships docs and repo tooling, with no API or dashboard behaviour change. Runtime evidence is the full `docs:build` (VitePress build complete), the two live fact-check failure/recovery runs above, and the code-to-docs comparison. I did not start `pnpm beech dev`, since nothing in it changed.

# Sprint Documentation
- Shipped: the docs now describe the publishable/secret key model. That covers 8 framework guides, `first-project.md`, `start/index.md`, `client-sdk.md` ("Keys and roles"), `public-api.md`, `error-model.md`, `environments.md`, `forms.md`, `backrefs.md`, a `keys:migrate` row in `cli-workflows.md`, and a `CHANGELOG.md` section with upgrade steps. `docs/api` was regenerated with TypeDoc, so the removed `BeechClientConfig` is gone, and the MCP resources are rebuilt from it.
- Guard: `pnpm docs:check` and `docs:build` fail when a page or docs-site source names a 0.10.x key. Matcher: `scripts/lib/legacy-key-names.mjs` (pure, unit-tested). Only the `cli-workflows.md` migration subsection and the changelog "Upgrading from 0.10.x" section may name the old keys.
- Decisions: the key is read from the env var only (no fallback). Nuxt moved to the browser client with the publishable key, because its plugin runs in the browser. Forms need no key.
- Deviation: the first execution missed `docs/.vitepress/theme/components/LlmPromptNode.vue:56` (the copyable LLM prompt said `apiKey`). A re-plan lifted the theme exclusion for that line and made section 6 scan `docs/.vitepress/theme/**/*.{vue,ts,mts}` and `config.mts` with an extra `apiKey` pattern. The extra pattern applies only under `docs/.vitepress/`.
- Known limits: `@beechcms/forms-react` still has an `apiKey` prop and `examples/ClientiTestPage.tsx` a `beech_sk_dev` default (code follow-up, out of scope). No production publishable key is generated: new projects serve `beech_pk_dev`, which is safe because it is read-only. Writing with the secret key still needs `allowPublicPost` on the seed (#1022).
