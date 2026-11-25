# Execution Log — KeyModelDocs (re-plan: LlmPromptNode + theme scan)

## Acceptance criteria

- [x] `pnpm docs:check` prints section 6 green. Hand check (first run): `PUBLIC_READ_API_KEY` appended to `docs/start/index.md` → `docs/start/index.md:102: legacy key name "PUBLIC_READ_API_KEY"`, exit 1. Reverted.
- [x] `findLegacyKeyMentions`, `LEGACY_KEY_PATTERNS`, `LEGACY_KEY_ALLOWED_SECTIONS` verbatim; `LEGACY_KEY_SITE_PATTERNS` added, applied only under `docs/.vitepress/`. Module has no I/O. Test file: BUSL header, four zones, no conditionals or randomness.
- [x] 8 framework guides, `first-project.md`, `start/index.md` use the shared vocabulary. No key fallback, no secret in a public variable.
- [x] `client-sdk.md`: "Keys and roles" table, browser warning, `apiKey` migration note.
- [x] `public-api.md` + `error-model.md`: four denials with statuses and problem types. Reads send `beech_pk_dev`, writes send `beech_sk_dev`.
- [x] `environments.md`: `BEECH_PUBLISHABLE_KEY` / `BEECH_SECRET_KEY`; production block covers `BEECH_SECRET_KEY`, `PUBLIC_TIME_TRAP_SECRET`, `PRIVACY_MASTER_KEY`.
- [x] No page claims the publishable key is generated in production.
- [x] `CHANGELOG.md`: `## Publishable and secret keys — unreleased` with `### Upgrading from 0.10.x`.
- [x] `docs/api` is the unedited `pnpm docs:generate` output; `BeechClientConfig.md` gone.
- [x] `packages/mcp/resources` has no legacy key name outside `build/cli-workflows.md` (after mcp build).
- [x] **[REWORK]** `LlmPromptNode.vue:56` names `publishableKey` / `secretKey`, no `apiKey`; `git grep -w apiKey -- docs/.vitepress ':!docs/.vitepress/dist'` empty.
- [x] **[REWORK]** Section 6 scans theme sources (`.vue`/`.ts`/`.mts` under `docs/.vitepress/theme`, plus `config.mts`). Hand check: `apiKey` put back in `LlmPromptNode.vue` → `docs/.vitepress/theme/components/LlmPromptNode.vue:56: legacy key name "apiKey"`, `FACT-CHECK FAILED with 1 issue(s)`. Reverted; next `docs:check` passed.
- [x] Every SECTION 5 command passes; closing greps clean.
- [x] No change in `apps/`, `packages/*/src`, `bin/`, `packages/forms-react` from this sprint. (`git diff --stat -- apps packages bin` shows only sprint 02/03 files.)

## Validation

```
node --test scripts/lib/legacy-key-names.test.mjs   tests 18, pass 18, fail 0
node --test scripts/lib/*.test.mjs                  tests 51, pass 51, fail 0
pnpm docs:check                        ✔ DOCUMENTATION FACT-CHECK PASSED (6. No legacy key names in 901 files)
pnpm --filter @beechcms/cli test       Test Files 34 passed, Tests 251 passed
pnpm --filter @beechcms/mcp build      OK
pnpm docs:build                        typedoc 0 errors 2 warnings, fact-check passed, build complete in 37.48s
pnpm lint                              ESLint: No issues found
graphify update .                      OK
```

Closing greps 1, 3 and 4: no output.
