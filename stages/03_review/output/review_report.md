# Verdict
PASS

# Findings

No blocking findings. Non-blocking notes:

1. `pnpm beech test --diff` exited 1 on my run, unlike the execution log ("PASS: every selected test run passed"). Two `apps/api` unit tests failed in the `related` batch: `src/features/rbac/assignments.test.ts` ("a seed-scoped manage_users holder cannot create an assignment at GLOBAL_SCOPE") and `src/features/rbac/invitations.test.ts` ("refuses inviting an email that already has an account"). Both files are outside this sprint's diff, and both pass in isolation (13/13). The batch took ~69s wall and ~129s of test time, so these look like load-dependent flakes (not proven). Treat the executor's "all pass" claim as unreliable. Human decides whether to re-run before merge.
2. Coverage gate also fails (13 / 45 files below threshold or untested). The files listed are the agent-intents API files outside the diff (known caveat from sprints 07-08: `devs` lacks sprints 05-08). Not this sprint's code.
3. `docs/reference/mcp-server.md` Danger Zone paragraph lists five destructive seed ops but omits `seeds.orphanDrop` (also `destructive`, `catalog.ts:167`). Not a violation: the plan's table is not exhaustive and nothing claims destructive ops are impossible.
4. `packages/mcp/README.md` links docs via relative repo paths (`../../docs/...`). They break on the npm page. The plan allowed this fallback.
5. The plan's "commit the generated `packages/mcp/resources/**`" does not apply: the directory is gitignored (`packages/mcp/.gitignore`). Build still regenerates it and `manifest.json` contains `local-agent.md`.
6. Nothing is committed. `git diff devs...HEAD` is polluted by sprints 05-08 (141 files), so I reviewed the working tree against `HEAD` (`e374bcb8`), which is exactly this sprint's change.

# Verification Evidence

Commands run by me (repo root unless noted):

- `pnpm --filter @beechcms/mcp type-check` → `tsc --noEmit`, clean.
- `pnpm --filter @beechcms/mcp test` → 9 files, 63 tests passed.
- `pnpm --filter @beechcms/mcp build` → `bundle-resources: wrote 860 resources`, `dist/index.js 59.5kb`.
- `grep -c "local-agent.md" packages/mcp/resources/manifest.json` → `2`.
- `pnpm docs:check` → checks 1-5 pass; `✓ All 13 MCP tools are documented; no unknown beech_* tool names in MCP docs.`
- Negative check (file backed up in scratchpad, restored after): renamed `` `beech_whoami` `` → `` `beech_whoamii` `` in `mcp-server.md` → `pnpm docs:check` printed exactly 2 errors (one forward, one reverse) and `FAILED`; after restore `docs:check` exit 0, `grep -c whoamii` → 0.
- `pnpm lint` → 19/19 tasks successful (turbo cache hit, exit 0).
- `pnpm beech test --diff` → exit 1; see Finding 1. Rerun of the two failing files: `pnpm exec vitest run src/features/rbac/assignments.test.ts src/features/rbac/invitations.test.ts` (in `apps/api`) → 13/13 passed.
- `graphify update .` not re-run (graph refresh, no verdict impact).

Code review (read the full diff of `packages/mcp/src`, `scripts/docs-fact-check.mjs`):
- `mapElicitResult` / `ElicitAnswer` match the plan's building blocks. Logic: decline → decline; non-accept → cancel; accept with decision exactly `approve`/`reject` → accept; else cancel. `index.ts` `elicitDecision()` returns `mapElicitResult(result)`; capability check, timeout and `does not support` catch remain there.
- `agent-tools.ts` has one import (`./constants.js`) and no SDK import. No `any`. SPDX headers intact.
- Check 5 follows the plan: reads names via the specified regex, errors on zero names, forward check on backticked names in `mcp-server.md`, reverse check on the three files, missing file is an error, count computed.
- Test audit (§8): one tier (unit), SPDX present, 7 `mapElicitResult` tests with plan names, `toEqual` on full outcome, inline literals for a pure function (sprint-08-allowed exception), no weak or conditional assertions, no `beforeEach` dependence. Misnamed test renamed to `a cancelled dialog sends no decision request`. No MUST violations.

Invariant audit: no change under `apps/`, `packages/core`, `packages/cli`, `package.json`, `SKILL.md`, `tool-definitions.ts` or `constants.ts` (`git diff HEAD --stat` on those paths: empty). No D1, field names or cross-slice imports. SECTION 7 items (evals, version bump, SKILL.md, `decide()` abort) untouched.

Doc facts verified against sources: tool names, annotations and result shapes (`agent-tools.ts` types); `MCP_OAUTH_SCOPES`, `CONFIRM_*`, `SEARCH_*`, `PENDING_ACTIONS_PATH` (`constants.ts`); `CLI_OAUTH_SCOPE` = `OAUTH_SCOPES` minus `agent:approve` (`control-plane.ts:27`, `scopes.ts:12`), matching the 16-scope list in the doc; intent log rows `create`/`authorize`/`revoke` with the documented `details` (`agent-intent-gate.middleware.ts:131`, `agent-intents.handler.ts:112,145`); 413 `intent_body_too_large` at 262 144 bytes (256 KiB); `intent_expired`/`intent_not_pending`; `intents.reject` scope `agent:read`, `intents.approve` `agent:approve`; destructive seeds ops and `content.delete` `destructiveWhenPurge`; roles/assignments destructive; excluded ops (password, sessions, profile, rotate-field, direct seed writes, `users.create`); `RunReport` call outcomes (`types.ts:34`); `beech types generate` and `SeedRegistryTypes` (`cli-workflows.md`); Node ≥ 22.18 (`run.ts:145`); `elicit` rejection → `fallback`/`elicitation_failed` (`agent-tools.ts:375`); `beech_search`/`beech_docs_search` tokenization (`catalog-search.ts:116`, `resources.ts:107`); `latest-entries.ts` block identical to `EXAMPLE_SCRIPT_TEMPLATE`; OAuth client name `BeechCMS MCP Server` (migration `0000_v040_base.sql`). Anchors linked from the new docs exist by heading check (`#upgrading-from-1-x`, `#approval-lifecycle-beech-confirm`, `#permission-model-known-limitations`, `#environment-variables`, `#setup`, `#runreport`).

Runtime verification: not applicable. No API response or UI changed; the one code change is a pure function covered by unit tests. Docs were not rendered with `pnpm docs:dev` (anchors checked by grep).

SECTION 6 walk: all 13 criteria verified true (function exports, imports, tests, check 5 + negative run, `mcp-server.md` content incl. "13 tools", 2.0 default scope, statuses, 8 outcomes, two clients, upgrade path, no impossibility claim; `local-agent.md` 8 sections, sidebar entry, manifest; `mcp.md` leads with `npx beech agent setup`, no `SKILL.md` copy advice; README 13 tools; approval only via `beech_confirm`/dashboard; residual-risk sentence in `mcp-server.md` and `local-agent.md`; no forbidden-path change; SECTION 5 commands pass except the flaky/out-of-diff failures in Findings 1-2).

# Sprint Documentation
Sprint 09 McpDocs: documented `@beechcms/mcp` 2.0 so human docs and the bundled agent-readable docs match the shipped behaviour.
- Rewrote `docs/reference/mcp-server.md` (13 tools, `beech_confirm` status/outcome tables, two OAuth clients, 1.x upgrade path, intent audit events, 2.0 worked session) and `docs/start/mcp.md` (`npx beech agent setup` first); rewrote `packages/mcp/README.md`.
- Added `docs/build/local-agent.md` ("Working with an Agent Locally"), added it to the sidebar; it is bundled as `beechcms-docs://build/local-agent.md` for `beech_docs_search`.
- Code: `mapElicitResult()` extracted from `elicitDecision()` into `agent-tools.ts` (fail closed: unknown action or accept without valid decision → cancel), with 7 unit tests; one misnamed test renamed.
- `scripts/docs-fact-check.mjs` check 5 fails `pnpm docs:check` when a registered tool is missing from `mcp-server.md` or an unknown `beech_*` name appears in the three MCP docs.
- Deviations: none from the plan. Generated `packages/mcp/resources/` is gitignored, so it is not committed.
- Limits: v1-vs-v2 evals deferred to sprint 10 AgentEvals; version bump to 2.0.0 left to `pnpm release`; destructive-ops list in the danger-zone note omits `seeds.orphanDrop`; README docs links are repo-relative; two `apps/api` rbac unit tests flaked under the full diff run (pass alone).
