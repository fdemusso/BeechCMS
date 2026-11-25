# Execution Log — KeysMigrate

## SECTION 6 — Acceptance Criteria

- [x] `beech keys:migrate` (and `beech keys migrate`) registered, listed in `--help` section 1, documented in `cli-workflows.md`. `cli-docs-parity.test.ts` and `pnpm docs:check` green.
- [x] On a 0.10.x project `vars` ends as `ENV, CORS_ORIGINS, BEECH_PUBLISHABLE_KEY, APP_URL`; every line outside `vars` byte-identical (unit test + `git diff wrangler.jsonc` in the manual check shows only `vars` lines).
- [x] `.dev.vars` ends with fresh `JWT_SECRET` and `PUBLIC_TIME_TRAP_SECRET` (never the committed values) and `BEECH_SECRET_KEY=beech_sk_dev`; every pre-existing line, `PRIVACY_MASTER_KEY` included, unchanged.
- [x] A second run changes nothing and writes nothing ("nothing to change", `.dev.vars` identical, `git status` identical).
- [x] Missing config, TOML-only, missing `.dev.vars`, invalid JSONC, absent `vars`, legacy names in `env.<name>.vars` and unsafe `vars` layout all stop with exit 1 and write nothing.
- [x] Output never contains a value from either file except `beech_pk_dev`; `npm run deploy` precedes the three `wrangler secret put` lines; `PRIVACY_MASTER_KEY` never offered; git-history warning present. The command runs no `wrangler` process.
- [x] `beech init` warns about legacy names (names only) and points to `beech keys:migrate`; exit code unchanged.
- [x] `planKeyMigration`, `keyMigrationReport`, `keysMigrate`, `findTopLevelObjectSpan`, `legacyVarNames` and the `key-model.ts` constants match SECTION 4. Only `keysMigrate` re-exported from `src/index.ts`.
- [x] New/edited test files carry the MIT/BUSL header of their siblings; no conditional assertions, no `any`, no randomness in fixtures.
- [x] Every SECTION 5 command passes; closing greps as stated (see below).
- [x] `apps/api`, `apps/dashboard`, `packages/core`, `packages/client`, `bin/`, `scripts/`: no change from this sprint.

## Validation

```
pnpm --filter @beechcms/cli type-check   -> tsc --noEmit, 0 errors
pnpm --filter @beechcms/cli test         -> Test Files 34 passed (34), Tests 251 passed (251)
pnpm --filter @beechcms/cli build        -> OK
node packages/cli/bin/beech.mjs --help   -> keys:migrate listed under "1. Local Management & Onboarding"
pnpm docs:check                          -> DOCUMENTATION FACT-CHECK PASSED
pnpm lint                                -> ESLint: No issues found
pnpm lint:tests                          -> test placement — OK
pnpm beech test --diff                   -> PASS Tests; PASS Coverage (14 changed files)
pnpm build                               -> Tasks: 12 successful, 12 total
graphify update .                        -> 33087 nodes, 48288 edges, 3182 communities
```

Closing greps:
1. `PUBLIC_READ_API_KEY|PUBLIC_WRITE_API_KEY` outside tests: only `lib/key-model.ts` (the planner takes the read-key name from `LEGACY_KEY_VARS`).
2. `findWranglerConfig` in `keys-migrate.ts`: no hits.
3. `PRIVACY_MASTER_KEY` in `keys-migrate.ts`: report copy and the missing-`.dev.vars` hint only.
4. `git diff HEAD --stat -- apps packages/core packages/client packages/forms-react`: empty. `-- bin scripts`: only the sprint 02 files (`bin/create.mjs`, `bin/template.mjs`, `scripts/dev-cli/endpoints.ts`, `scripts/lib/template.test.mjs`, `scripts/smoke-release.mjs`), no new hunk.

## Manual check

Deviation: `npx @beechcms/cms@0.10.1 legacy-app --yes --no-install` produced no folder (npx cache cleanup errors, no output). The project was instead generated from `git show 5f5df752:bin/template.mjs` (`buildWranglerJsonc` + `buildDevVars`, the 0.10.x layout) in the session scratchpad, committed in a temp git repo, and driven with the built CLI.

1. `beech init`: warning names the four keys, prints no value.
2. `beech keys:migrate`: no value on screen except `beech_pk_dev`; `git diff wrangler.jsonc` shows only `vars` lines.
3. `beech keys migrate` again: "nothing to change"; `.dev.vars` and `git status` identical.
4. `beech init`: no legacy warning; publishable key reported, secret key reported as set.

## Notes

- T4: no new test. `commands/init.ts` is excluded from coverage, detection is `legacyVarNames` (tested in `key-model.test.ts`), the wiring is one `if`.
- `memberLinePattern` only deletes a member line that holds exactly one scalar member. Two members on one line are left in place and the postcondition refuses.
- Follow-up still open, not touched: `packages/forms-react` (`apiKey` prop, `beech_sk_dev` default in `examples/ClientiTestPage.tsx:19`).
