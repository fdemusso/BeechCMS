# Execution Log — BeechRun (sprint 07)

Branch: `feature/beech-run`, cut from `feature/script-sdk` @ `a738e680` (plan says so; `devs` lacks sprint 06). No commit made.

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `beech run <name>` resolves `.beech/scripts/<name>.ts`, runs it with an authenticated SDK (`beech-mcp-cli`) and prints a `RunReport`; `--json` stdout is exactly one JSON document even when the script calls `console.log`. *(unit: `script-runner.test.ts` console capture; `run()` writes only the report to stdout. Not exercised end to end: needs browser OAuth.)*
- [x] `RunReport` keys and order match Task 1d; `version` is `1`; all seven symbols exported from `@beechcms/cli/sdk`.
- [x] `--dry-run` sends zero non-read requests (unit + flow) and the flow table stays empty.
- [x] A destructive call under `ENV=development` appears in `pendingIntents`, exit code 0, entry still present (flow).
- [x] Every failure after path resolution yields a report with `status: 'error'`, exit code 1, and prior calls; usage errors exit 1 via `exitWithError`, nothing on stdout (smoke: `beech run`, `beech run ghost` → exit 1).
- [x] `e instanceof BeechSdkError` holds across bundles (brand test green).
- [x] Invalid-JSON answer journaled as `outcome: 'error'`.
- [x] `beech agent setup` idempotent (smoke: second run all `unchanged`), never overwrites a differing file without `--force`, never touches a malformed `.mcp.json`, never changes an existing `@beechcms/cli` dependency (unit).
- [~] Example script passes type stripping (unit green). **Not run against `pnpm beech dev`**: needs interactive browser OAuth consent. Manual smoke below left to the human.
- [x] No SDK method, scope or flag lets a script approve an intent (`CLI_OAUTH_SCOPE`, `SDK_OMITTED_OPERATIONS` untouched).
- [x] `cli-docs-parity.test.ts` green with `beech run` and `beech agent setup` documented.
- [x] No `any` in new source or tests; SPDX headers present; no new runtime dependency.
- [x] `pnpm lint`, `npx tsc --noEmit` in `apps/api`, `pnpm --filter @beechcms/cli build` clean.

## SECTION 5 — VALIDATION

```
pnpm --filter @beechcms/cli type-check   → tsc --noEmit, no errors
pnpm --filter @beechcms/cli test         → Test Files 37 passed (37), Tests 235 passed (235)
pnpm --filter @beechcms/cli build        → dist/index.js 163.9kb, dist/sdk/index.js 1.8kb, sdk declarations OK
grep -c "defineScript" packages/cli/dist/sdk/index.d.ts   → 2
grep -r "api-client" packages/cli/dist/sdk/*.d.ts         → no match (exit 1)
cd apps/api && npx tsc --noEmit          → no errors
cd apps/api && npx vitest run --project flow flow-beech-run flow-script-sdk
                                         → Test Files 2 passed (2), Tests 11 passed (11)
pnpm lint                                → Tasks: 19 successful, 19 total
pnpm beech test --diff                   → PASS: every selected test run passed.
graphify update .                        → 20268 nodes, 48057 edges
```

`pnpm beech test --diff` also prints `FAIL Coverage: 2 / 32 files below threshold`. Both files
(`apps/api/src/features/agent-intents/agent-intents.handler.ts` 3.7 %, `agent-intents.view.ts` 25 %) are sprint 05 code
outside this diff: the diff base `devs` lacks sprints 05, 06. No file of this sprint is flagged. Exit code 2 comes from
that coverage gate.

## Manual smoke (temp project, `bin/cli.mjs`)

```
agent setup #1 → created .mcp.json, SKILL.md, README.md, latest-entries.ts; updated package.json (devDependencies "@beechcms/cli": "^0.10.0")
agent setup #2 → all five files "= unchanged"
run            → "✗ Usage: beech run <name|path> …", exit 1
run ghost      → "✗ Script not found: .beech/scripts/ghost.ts / Available scripts: latest-entries", exit 1
```

Left for the human (needs browser OAuth against `pnpm beech dev`): `beech run latest-entries --arg seed=<slug> --out/--json`,
human-mode error run, and the throwaway `smoke-write.ts` dry-run check.
