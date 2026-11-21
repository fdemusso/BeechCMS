# Execution Log — McpDocs (sprint 09)

Branch: `feature/mcp-docs` (cut from `feature/mcp2`). No commit made.

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `mapElicitResult` and `ElicitAnswer` exported from `agent-tools.ts` with the Task 1 signatures; `elicitDecision()` returns `mapElicitResult(result)`; unknown `action` → `cancel`.
- [x] `agent-tools.ts` imports only `./constants.js` (`grep "^import"` → one import, from `./constants.js`; `@beechcms/core` not needed by the new code).
- [x] Misnamed test renamed (`a cancelled dialog sends no decision request`); 7 `mapElicitResult` tests exist and pass; `pnpm --filter @beechcms/mcp test` green (63/63).
- [x] `docs-fact-check.mjs` check 5 exists; fails on missing/unknown tool name (negative check below); passes on final tree.
- [x] `docs/reference/mcp-server.md`: 13 tools, "13 tools" sentence, 2.0 default scope, `beech_confirm` statuses and 8 item outcomes, two OAuth clients, 1.x upgrade path; no claim that destructive operations are impossible through the agent (danger-zone table states they are intents).
- [x] `docs/build/local-agent.md` exists with the 8 Task 5 sections, is in the sidebar, and is in `packages/mcp/resources/manifest.json`.
- [x] `docs/start/mcp.md` leads with `npx beech agent setup`; no "copy `SKILL.md` into project rules" advice.
- [x] `packages/mcp/README.md` lists 13 tools.
- [x] Approval only via `beech_confirm` or the dashboard in every doc; residual-risk sentence present in `mcp-server.md` and `local-agent.md`.
- [x] Spot-check against sources: tool names/annotations (`tool-definitions.ts`), scope strings and `CONFIRM_*` limits (`constants.ts`), CLI scopes (`OAUTH_SCOPES` minus `agent:approve`), stderr line (`client.ts` `dropLegacyGrant`), intent log rows (`agent-intents.handler.ts:L112,L145`, `agent-intent-gate.middleware.ts:L131`), SDK methods `content.list`, `content.delete` (`purge: 'true'`), `media.uploadFile` (`packages/cli/src/sdk/types.ts`), `latest-entries.ts` quoted verbatim from `EXAMPLE_SCRIPT_TEMPLATE`.
- [x] No change to any `package.json`, `SKILL.md`, `tool-definitions.ts`, `constants.ts`, core, api, dashboard or cli source.
- [x] No `any` in changed TypeScript; SPDX headers intact.
- [x] SECTION 5 commands pass (coverage caveat below).

## SECTION 5 — VALIDATION

```
pnpm --filter @beechcms/mcp type-check   → tsc --noEmit, exit 0
pnpm --filter @beechcms/mcp test         → Test Files 9 passed (9), Tests 63 passed (63)
pnpm --filter @beechcms/mcp build        → bundle-resources: wrote 860 resources; dist/index.js 59.5kb
grep -c "local-agent.md" packages/mcp/resources/manifest.json   → 2
pnpm docs:check                          → checks 1-5 pass, exit 0
  ✓ 5. All 13 MCP tools are documented; no unknown beech_* tool names in MCP docs.
pnpm lint                                → Tasks: 19 successful, 19 total
pnpm beech test --diff                   → Test Files 101 passed, Tests 761 passed (integration); PASS: every selected test run passed
graphify update .                        → 20392 nodes, 48337 edges, 1053 communities
```

Coverage-gate caveat (sprints 07-08 rule: `devs` lacks sprints 05-08, report without fixing): LOW files are outside this sprint's diff — `apps/api/src/features/agent-intents/agent-intents.handler.ts` (3.4%) and `agent-intents.view.ts` (25.0%). Gate exit 2 comes from them only.

## Negative check — fact-check 5 (not committed)

Renamed every `` `beech_whoami` `` → `` `beech_whoamii` `` in `docs/reference/mcp-server.md`, ran `pnpm docs:check`:

```
✖ MCP tool "beech_whoami" is registered in tool-definitions.ts but missing from reference/mcp-server.md
✖ docs/reference/mcp-server.md mentions unknown MCP tool "beech_whoamii"
✖ DOCUMENTATION FACT-CHECK FAILED with 2 issue(s).   → exit 1
```

Reverted from backup; `pnpm docs:check` → exit 0. `grep -c whoamii` → 0.

## Read-through

Anchors linked from the new docs exist: `mcp-server.md#upgrading-from-1-x`, `#approval-lifecycle-beech-confirm`, `#environment-variables`, `#permission-model-known-limitations`, `cli-workflows.md#runreport`, `local-agent.md#setup`. Not rendered with `pnpm docs:dev`; checked by heading grep.

## Notes

- Reverse check in fact-check 5 dedupes per file + token (one error per unknown token per file), so the negative run yields exactly one forward and one reverse error.
- Docs state `beech_confirm` timeout maps to `fallback` / `elicitation_failed` (elicit promise rejects); not exercised by a test.
