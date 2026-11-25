# Verdict
PASS

# Findings
None blocking.

Non-blocking observations (no action required for this sprint):
1. `packages/forms-react` (`apiKey` prop, `beech_sk_dev` default in `examples/ClientiTestPage.tsx:19`) is still the known follow-up with no roadmap row. It is out of scope here (SECTION 7) and was left untouched.
2. `keys:migrate` normalises commas on every member line of `vars`, not only the edited ones. On a config with a trailing comma after the last member (valid JSONC), the trailing comma disappears. The result stays valid and the postcondition guards the parsed content, so this is cosmetic.
3. The sprint's code is uncommitted in the working tree (sprint 02 changes sit beside it). `git diff devs...HEAD` therefore does not contain it; the review ran against the working tree (`git diff HEAD`, untracked files read directly).

# Verification Evidence

Commands re-run by the reviewer (not taken from execution_log.md), repo root:

- `pnpm --filter @beechcms/cli type-check` -> `tsc --noEmit`, 0 errors.
- `pnpm --filter @beechcms/cli test` -> Test Files 34 passed (34), Tests 251 passed (251).
- `pnpm --filter @beechcms/cli build` -> OK.
- `node packages/cli/bin/beech.mjs --help` -> line 7: `keys:migrate    Move a 0.10.x project to publishable/secret keys (rotates committed secrets)` under section 1.
- `pnpm docs:check` -> DOCUMENTATION FACT-CHECK PASSED.
- `pnpm lint` -> ESLint: No issues found.
- `pnpm lint:tests` -> test placement OK.
- `pnpm beech test --diff` -> PASS Tests; PASS Coverage (14 changed files).
- `pnpm build` -> 12 successful, 12 total.
- Closing greps:
  1. Legacy key names outside tests: only `packages/cli/src/lib/key-model.ts:9`.
  2. `findWranglerConfig` in `keys-migrate.ts`: 0 hits.
  3. `PRIVACY_MASTER_KEY` in `keys-migrate.ts`: 3 hits (report copy L300, L328; missing-`.dev.vars` hint L365). No read or write of the entry.
  4. `git diff HEAD --stat -- apps packages/core packages/client packages/forms-react`: empty. `-- bin scripts`: only the five sprint 02 files (`bin/create.mjs`, `bin/template.mjs`, `scripts/dev-cli/endpoints.ts`, `scripts/lib/template.test.mjs`, `scripts/smoke-release.mjs`).

Runtime verification (built CLI, scratchpad projects outside the repo; the 0.10.x layout was generated from `git show 5f5df752:bin/template.mjs`, with `a`/`b`/`c`/`d` x N committed values):
- `beech init` on the legacy project: yellow warning naming the four legacy names, no values, "Run: npx beech keys:migrate", exit code 0.
- `beech keys migrate` (space form): `git diff --stat` shows `wrangler.jsonc | 5 +----` and `.dev.vars | 4 ++++`; the config diff holds only `vars` lines. `.dev.vars` kept every original line and gained `JWT_SECRET`, `BEECH_SECRET_KEY`, `PUBLIC_TIME_TRAP_SECRET`. The output shows no value except `beech_pk_dev`. `npm run deploy` comes before the three `wrangler secret put` lines, the git-history and session warnings are present, and `PRIVACY_MASTER_KEY` is never offered.
- Second run (`keys:migrate`): "nothing to change"; `cmp` shows `.dev.vars` and `wrangler.jsonc` byte-identical.
- `beech init` after migration: publishable key reported, secret key reported as set, no legacy warning.
- JSONC edge case (line/block comments, a `"vars": {` inside a comment, trailing comma, removed line carrying a `//` comment): only the legacy members are removed, comments on kept lines stay, output is valid JSONC.

Invariant audit: no D1, SQL, seed or Branch ID code; no `apps/api` or `apps/dashboard` change; no cross-slice import; the CLI does not import `bin/` or `apps/api`; no `wrangler` process is spawned by the command. Nothing from SECTION 7 was touched.

Test audit (§8 of testing_conventions.md): new files `key-model.test.ts` and `keys-migrate.test.ts` and the `findTopLevelObjectSpan` block in `wrangler.test.ts` are one tier (unit), carry the MIT header of their siblings (packages/cli is MIT), use `vi.mock` at the top with `vi.clearAllMocks()`, have one act per `it()` with a named result, assert `CliError` identity rather than copy, contain no `any`, no conditional assertions, no skip/only, no timers, no randomness (deterministic `sequentialSecrets`). Regression-guard comment present. `init.ts` has no new test, as the plan states.

Plan conformance: building blocks (`key-model.ts` constants and `legacyVarNames`, `findTopLevelObjectSpan` signature, `KeyMigrationInput`/`KeyMigrationPlan`, `planKeyMigration`, `keyMigrationReport`, `keysMigrate`) match SECTION 4 verbatim. Decisions honoured: no `findWranglerConfig`, `.dev.vars` written before the config, only `keysMigrate` re-exported, wiring in `bin/beech.mjs` (`keys` space form, `COMMANDS`, help line, `cmdKeysMigrate`), docs row and subsection in `cli-workflows.md`. Behaviour rules 1-7 hold (probed above plus the planner tests).

Acceptance criteria (SECTION 6): all 11 verified, see evidence above.

# Sprint Documentation
- Shipped: `beech keys:migrate` (also `beech keys migrate`) moves a 0.10.x project to publishable/secret keys. It removes `PUBLIC_READ_API_KEY`, `PUBLIC_WRITE_API_KEY`, `JWT_SECRET` and `PUBLIC_TIME_TRAP_SECRET` from `wrangler.jsonc` vars, adds `BEECH_PUBLISHABLE_KEY=beech_pk_dev`, and writes fresh `JWT_SECRET` / `PUBLIC_TIME_TRAP_SECRET` plus `BEECH_SECRET_KEY=beech_sk_dev` to `.dev.vars`. `PRIVACY_MASTER_KEY` is never touched.
- Design: pure planner (`planKeyMigration`) plus thin I/O command, same split as `agent-setup`. The `vars` edit is line-based inside the span found by the new `findTopLevelObjectSpan`, and a re-parse postcondition refuses any edit that changes anything else.
- Committed secrets are never copied: their old values are in the git history, so they are rotated. The command prints, and never runs, the production steps: `npm run deploy` first (Cloudflare error 10053 on a name shared by a var and a secret), then three `wrangler secret put`.
- `beech init` now warns (names only) about legacy names and points to `keys:migrate`; its exit code is unchanged.
- Refusals (exit 1, nothing written): no config in the current folder, TOML only, missing `.dev.vars`, invalid JSONC, no top-level `vars`, legacy names in `env.<name>.vars`, an unsafe `vars` layout.
- Deviation: the execution log's manual check used a template regenerated from commit `5f5df752` instead of `npx @beechcms/cms@0.10.1`; the reviewer used the same approach.
- Known limitations: no `wrangler.toml` support, no `--dry-run`, no history rewrite, no production secret writes. `packages/forms-react` still defaults to `beech_sk_dev` (follow-up, no roadmap row). Sprint 04 owns the upgrade guide and changelog.
