# Execution Log — Mcp2 (sprint 08)

Branch: `feature/mcp2` (cut from `feature/beech-run`; `devs` lacks sprints 05-07, per plan). No commits made.

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `GET /api/agent/session` answers 200 with `AgentSessionView` for OAuth and JWT callers; catalog has 147 operations (111 `agent`); `factory.operations-parity.test.ts` and `sdk-parity.test.ts` green.
- [x] `beech.intents.session()` exists; `SDK_OMITTED_OPERATIONS` unchanged (still exactly two entries).
- [x] MCP lists 13 tools; every tool has `annotations`; only `beech_confirm` has `destructiveHint: true`.
- [x] `beech_mcp_status` and the `initialize` answer report the `package.json` version (no `'0.1.0'` left in `packages/mcp/src`).
- [x] The MCP requests `MCP_OAUTH_SCOPE`; a cached grant without `agent:read` is dropped once, with one stderr line and nothing on stdout.
- [x] `beech_confirm` approve executes each shown intent once (flow: seed deleted, row `executed`); reject keeps the data (row `rejected`).
- [x] Decline, cancel, unsupported client and elicitation failure send **no** approve or reject request; the result carries `instruction` with the dashboard URL.
- [x] The dialog text contains only server-stored intent data; expired, foreign and non-pending ids never reach the dialog.
- [x] The elicitation round-trips through the supervisor (integration `it` green).
- [x] `beech_search` never returns an `excluded` operation and is deterministic.
- [x] `agent-tools.ts` and `catalog-search.ts` import neither `client.ts` nor `@modelcontextprotocol/sdk`.
- [x] `SKILL.md` rewritten per Task 7; generated CLI skill points at `beech_confirm`.
- [x] No `any` in new source or new tests; SPDX headers on every new file.
- [x] No new runtime dependency; no `package.json` version change; no migration.
- [ ] Every command in SECTION 5 passes — see last row below.

## SECTION 5 — VALIDATION

| Command | Result |
|---|---|
| `pnpm --filter @beechcms/core build` | pass |
| `pnpm --filter @beechcms/core test` | 76 files, 1456 tests pass |
| `pnpm --filter @beechcms/cli type-check` | pass |
| `pnpm --filter @beechcms/cli test` | 37 files, 235 tests pass |
| `pnpm --filter @beechcms/mcp type-check` | pass |
| `pnpm --filter @beechcms/mcp build` | pass (`dist/index.js` 59.4kb) |
| `pnpm --filter @beechcms/mcp test` | 9 files pass (integration incl. supervisor elicitation round-trip) |
| `cd apps/api && npx tsc --noEmit` | pass |
| `vitest run --project unit src/factory.operations-parity.test.ts` | 7 tests pass |
| `vitest run --project flow flow-agent-intents flow-mcp-agent-tools flow-script-sdk` | 3 files, 29 tests pass |
| `pnpm lint` | 19/19 tasks pass |
| `pnpm beech test --diff` | **tests pass; coverage gate exits 2** (see below) |
| `graphify update .` | done: 20374 nodes, 48329 edges |

`pnpm beech test --diff` coverage gate (diff vs `devs`, so it also scores sprint 05-07 files):
LOW `agent-intents.handler.ts` / `agent-intents.view.ts` (covered by the flow tier, which the unit coverage run does not execute),
`packages/cli/src/lib/cli-version.ts`, `packages/cli/src/sdk/define-script.ts` (not touched this sprint).
`packages/mcp/src/client.ts` was LOW (76.9%) before four extra unit tests were added; not re-run since.
Manual smoke (browser consent + Claude Code) not run: human step.
