# Verdict
PASS

# Findings
No blocking findings. Non-blocking notes (no rework needed):

1. `packages/mcp/src/agent-tools.test.ts` — `an accepted dialog without a decision is treated as cancelled and sends no decision request`: the test feeds `{ action: 'cancel' }` straight into `beechConfirm`, so it proves "cancel sends no POST", not the mapping its name claims. That mapping (`accept` without a valid `decision` → `cancel`) lives in `elicitDecision()` (`packages/mcp/src/index.ts`), which no test reaches. The plan prescribed this test name, so this is a plan-level gap, not an executor deviation. The behaviour is fail-closed (`cancel` → nothing runs). Suggest renaming the test to `a cancelled dialog sends no decision request`, and, if wanted, covering `elicitDecision` in a later sprint (sprint 09).
2. `packages/mcp/src/agent-tools.ts` `decide()`: for an approve answered `200` with a non-JSON body, `readJson` throws `AgentToolError` mid-loop. Intents already executed in the same call are then not reported and the remaining ones are never decided. The plan explicitly allows this exception ("Never throws after step 1 except `AgentToolError` for a non-JSON 2xx"), and the server never emits such a body, so it is not a defect. Noted only because it is the one path where "a failure on one id never hides the others" does not hold.
3. `pnpm beech test --diff` exits 2 on `FAIL Coverage: 5 / 45 file(s)`. The LOW files are `agent-intents.handler.ts` (3.4 %), `agent-intents.view.ts` (25 %) and `packages/cli/src/lib/cli-version.ts` / `sdk/define-script.ts` (not touched this sprint). The handler and view are LOW because the coverage run does not execute the `flow` tier, which is where `GET /api/agent/session` is tested (3 flow tests, green). The gate also scores sprint 05-07 code because `devs` lacks it. Every file this sprint changed in `packages/mcp` and `packages/core` is PASS. Same situation as the previous sprint's review (`docs/Sprints/BeechRun/review_report.md`, note 3). Disappears once the stack is merged into `devs`.
4. Not verified by me: the manual smoke of SECTION 5 (browser consent, real Claude Code elicitation dialog, dashboard fallback). It needs an interactive OAuth consent and an MCP client UI. Covered instead by the supervisor elicitation round-trip integration test and the flow tier. The human still owns the smoke.

# Verification Evidence

Diff reviewed: sprint-only range `git diff feature/beech-run...HEAD` (one commit, `e374bcb8`, 25 files). The plan's `git diff devs...HEAD` also contains sprints 05-07 because `devs` lacks them (the plan says so).

SECTION 5 commands, re-run by me (not copied from `execution_log.md`):
- `pnpm --filter @beechcms/core build` → exit 0.
- `pnpm --filter @beechcms/core test` → exit 0.
- `pnpm --filter @beechcms/cli type-check` → exit 0.
- `pnpm --filter @beechcms/cli test` → Tests 235 passed (235).
- `pnpm --filter @beechcms/mcp type-check` → exit 0.
- `pnpm --filter @beechcms/mcp build` → `dist/index.js 59.4kb`, exit 0.
- `pnpm --filter @beechcms/mcp test` → Tests 56 passed (56), includes the integration suite that spawns `dist/index.js`.
- `cd apps/api && npx tsc --noEmit` → exit 0.
- `npx vitest run --project unit src/factory.operations-parity.test.ts` → 7 passed.
- Docker up (`docker info` ok). `npx vitest run --project flow flow-agent-intents flow-mcp-agent-tools flow-script-sdk` → Test Files 3 passed, Tests 29 passed (incl. the 3 `GET /api/agent/session` tests and the 8 `flow-mcp-agent-tools` tests).
- `pnpm lint` → 19 successful, 19 total.
- `pnpm beech test --diff` → all selected tests pass (integration tier: 101 files, 761 tests), coverage gate exit 2 (note 3). `packages/mcp` changed-line coverage: `agent-tools.ts` 87.6 %, `catalog-search.ts` 100 %, `client.ts` 100 %, `constants.ts` 100 %, `version.ts` 85.7 %; `tool-definitions.ts` is declarative (covered by the integration test, which the unit coverage run does not count).
- `graphify update .` not re-run (read-only review).

Static audit (commands run on the sprint diff):
- Node import of built core: `OPERATION_CATALOG.length` = 147, `exposure === 'agent'` = 111 (acceptance criterion 1).
- `SDK_OMITTED_OPERATIONS` in `packages/cli/src/sdk/operations.ts` still has exactly two entries (`intents.approve`, `media.upload`); `SCRIPT_UNAVAILABLE_OPERATIONS` in `catalog-search.ts` mirrors them.
- `grep -E ': any|as any|<any>|any\[\]'` on added lines → no matches. `grep` for `.only`, `.skip`, `useFakeTimers`, `setTimeout` on added lines → no matches.
- SPDX header present on every added file (MIT in `packages/mcp`, BUSL in `apps/api`).
- `grep -rn "0\.1\.0" packages/mcp/src` (non-test) → none left.
- `git diff --stat -- '*package.json' '*.sql' pnpm-lock.yaml` → empty: no dependency, version or migration change. `LICENSE` untouched.
- Imports of `agent-tools.ts` and `catalog-search.ts`: only `./constants.js` and `@beechcms/core`; neither imports `client.ts` nor `@modelcontextprotocol/sdk`.

Invariant audit (ponytail):
- Botanical: no D1 access, no SQL, no field name in the sprint's source. The new route reads `seedRepository.getRegistryVersion()` through the context. The MCP only speaks HTTP.
- VSA: `agent-intents.handler.ts` imports only `@beechcms/core`, `types`, `public/`, `shared/`, and its own slice. No cross-slice import. No dashboard file touched.
- SECTION 7: no `docs/reference/mcp-server.md` rewrite (one table row only), no version bump, no server-side `planId`, no `outputSchema`, no intent-gate/TTL/api-client/supervisor change.
- Security: `agent:approve` stays on `beech-mcp` only; the script client and the SDK gained no approve method. The dialog text is built only from `GET /api/agent/intents/:id` records. In `beechConfirm`, decline, cancel, unsupported and elicit rejection return before any `POST`, as the flow and unit tests assert.

Plan conformance:
- Building blocks match verbatim: catalog row, `AgentSessionView`, RBAC row, `intents.session` SDK entry, every constant in `constants.ts`, the 13 tool definitions (descriptions and annotation table), dialog message and fallback instruction wording, `CONFIRM_DECISION_SCHEMA`.
- Decisions: file placement and the SECTION 3 deliverables list match; nothing beyond it.
- Behaviour: legacy-grant drop writes one line on stderr and keeps a grant that has `agent:read`; `beech_search` rules (scoring, ordering, `excluded` never returned, scope filter) and `beechConfirm` data flow steps 1-6 hold.

Test audit (testing_conventions §8) over: `flow-mcp-agent-tools.test.ts`, `flow-agent-intents.test.ts` (3 new `it`), `agent-tools.test.ts`, `catalog-search.test.ts`, `version.test.ts`, `client.test.ts`, `integration.test.ts`, `catalog.test.ts`:
- One tier per file, SPDX present on new files, `describe`/`it` names state subject and outcome, four zones respected, one ACT per `it`, status asserted before body, rejections assert nothing changed (seed still active, intent row still `pending`), no weak or conditional assertions. Hand-rolled intent bodies in `agent-tools.test.ts` are the plan's allowed exception (MCP package has no canonical builders) and use UUIDv4 ids. The only `try/finally` (`client.test.ts`) restores `process.env` as the plan specifies. No MUST violation found. See note 1 for the one misnamed test.

Runtime verification:
- `integration.test.ts` runs the real built `dist/index.js` behind the supervisor over stdio against a mock HTTP API: lists 13 tools with annotations (only `beech_confirm` destructive), reports the `package.json` version, returns the `elicitation_unsupported` fallback for a client without elicitation (zero approve calls), and round-trips a real `ElicitRequest` through the supervisor to an `executed` outcome (one approve call). Re-run by me: green.
- The flow tier drives `beechWhoami`, `beechIntents`, `beechConfirm` against the real `createBeechApp` with real OAuth tokens and real D1: approve deletes the seed and marks the row `executed`; reject keeps the seed (`rejected`); decline and fallback leave the row `pending`; an expired or another user's intent never reaches the dialog and nothing runs.
- Not run: `pnpm beech dev` with a real browser consent and Claude Code (note 4).

# Sprint Documentation
Sprint 08 Mcp2 turns `@beechcms/mcp` into the 2.0 agent control plane: 13 tools, the four new ones being `beech_whoami`, `beech_search`, `beech_intents` and `beech_confirm`. `beech_confirm` shows one elicitation dialog built only from server-stored intents and, on an explicit approve or reject, calls the existing intent endpoints. Decline, cancel, an unsupported client or an elicitation failure send no request, leave intents pending and return the dashboard address (`/admin/?settings=connected-apps&section=agent-actions`) as an `instruction` for the agent to relay.
The only server change is `GET /api/agent/session` (`agent:read`, any authenticated caller): client id, frozen scopes, `ENV` class, confirmation policy and schema version. It adds catalog operation `intents.session` (147 operations, 111 agent) and `beech.intents.session()` in the script SDK.
The MCP now requests `schema:read schema:write settings:read agent:read agent:approve`; a cached 1.x grant without `agent:read` is dropped once with a stderr line, so the user consents again once. The server version is read from `package.json` instead of the hardcoded `'0.1.0'`. `beech_search` ranks the agent operations deterministically (OR over tokens) and reports SDK method, route, scope, risk and approval rule; excluded operations never appear.
Decision logic lives in `agent-tools.ts` and `catalog-search.ts` with injected I/O and no import of the client singleton or the MCP SDK, so the flow tier runs it over the real app. `SKILL.md` was rewritten and the generated CLI skill now points at `beech_confirm`.
Known limitations: no deviation from the plan. `elicitDecision()` in `index.ts` (the `accept`-without-decision and "does not support" mapping) is covered only by the integration round-trip; a non-JSON `200` on approve aborts the confirm loop; the manual smoke with a real Claude Code client is still a human step. Docs rewrite and the v1 vs v2 evals are sprint 09 (DocsEvals).
