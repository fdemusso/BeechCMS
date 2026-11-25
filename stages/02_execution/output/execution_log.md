# Execution log — AgentEvals

## SECTION 6 — Acceptance criteria

- [x] `evals/` private workspace `@beechcms/agent-evals`, listed in `pnpm-workspace.yaml`; `pnpm eval:agent` runs it.
- [x] `src/types.ts` exports the T1 types verbatim; `EvalReport.version` is `1`.
- [x] No `any`, `enum`, `namespace`; relative imports end in `.ts`; `node src/cli.ts --task nope` exits 2 naming `--task`, nothing booted.
- [x] Harness never calls `/approve` (`grep approve evals/src`: report note text, `agent:approve` filter, consent `approved: true`).
- [x] No `~/.beechcms` access: guard in `mintGrants`; `mcp-tokens.json` mtime stayed `Nov 21 12:07` (before all runs). No before-checksum existed.
- [x] Agent cwd under `os.tmpdir()`; `--strict-mcp-config`, `--setting-sources project,local`; v1 `--tools ""`.
- [x] Fresh DB per run on 8798; `lsof -i :8798` empty after exit.
- [x] Eight tasks match T9 (ids, order, verbatim prompts, same prompt for v1/v2).
- [x] Every check pure, pass + fail tested; tasks 7-8 fail with `destroyed without approval`.
- [x] `SCRIPT_GRANT_SCOPE === CLI_OAUTH_SCOPE` pinned in `grants.test.ts`; MCP scope imported.
- [x] Unit tests follow `testing_conventions.md`.
- [x] type-check, test, `pnpm lint` pass.
- [x] `evals/reports/20261121-1757/report.{json,md}` from a real full run: 16 results, none `harness_error`, all with turns, tokens, verdict. Not committed (stage contract: no own commits).
- [x] No change under `apps/`, `packages/`, `docs/`, `scripts/`, `e2e/` (`docs/Sprints/McpDocs/` was untracked before this stage).

## SECTION 5 — Validation output

- `pnpm install` → ok, lockfile has `evals` importer.
- `pnpm --filter @beechcms/agent-evals type-check` → clean.
- `pnpm --filter @beechcms/agent-evals test` → 6 files, 50 tests passed.
- `pnpm lint` → 20/20 tasks successful.
- `pnpm exec knip` → no finding in `evals/`.
- `pnpm beech test --diff` → `PASS Tests: every selected test run passed`. `FAIL Coverage: 5/45 files below threshold`: files are `apps/api` agent-intents code from earlier sprints (diff is against `devs`, which lacks sprints 05-09), none from this sprint.
- Smoke (`--task schema-add-branch`): both variants pass, v2 init lists `beechcms` `connected`.
- Full baseline: v1 2/8, v2 8/8 (median turns 5 vs 15, median input tokens 21 199 vs 223 111, cost 0.294 vs 0.8394 USD).
- `graphify update .` → graph rebuilt.

## Deviations from the plan (planning should absorb)

1. `@beechcms/testing` dist cannot load under Node ESM (extensionless re-exports). `stack.ts`/`tasks.ts` import `packages/testing/src/seeds/canonical.{seeds,data}.ts` by relative path; `@beechcms/testing` devDependency dropped.
2. Preflight checks `apps/dashboard/dist/admin/index.html` (not `dist/index.html`); `preflight` is `async` (uses `fetch`).
3. `wrangler.log` path comes from env `BEECH_EVAL_RUN_DIR` set by `cli.ts` (signature `startFreshStack(repoRoot)` unchanged).
4. `grants.test.ts` imports `cli-control-plane`, a vitest alias to `packages/cli/src/lib/control-plane.ts` plus a `.d.ts` stub for tsc (strict flags fire inside `packages/cli` otherwise).
5. Entry slugs shortened (`bulk-tag-<n>`, `author-rpt-<n>`, `trash-rst-<n>`, `purge-<n>`): `slugify` truncates to 15 chars, so `eval-<task>-<n>` collided.
6. `GET /api/content/:slug` items are `{ id, slug, status, data: {alias: …} }`, not flat; `listEntries` flattens `data`.
7. knip: un-exported constants nothing imports (`V1_GRANT_SCOPE`, stack constants, `defineTask`, `PreparedTask`); removed redundant `src/cli.ts` entry from the `evals` knip block.
8. The rejection entry in `stages/01_sprint_planning/output/rejections.md` (2026-11-21) was resolved by items 1-2 and 4.

## Findings (product, out of scope)

- v1 fails all six non-schema tasks (no tool for content, trash or intents), as `expectV1: no` predicted.
- On the two schema tasks both variants pass: v2 used 1.5x-2.8x the input tokens of v1 (67k vs 45k, 143k vs 52k) with similar turns (5 vs 6, 11 vs 9).
