# Sprint Plan — McpDocs (`@beechcms/mcp` 2.0 documentation, sprint 09)

Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md`, §6 row 09 (split by this run into **09 McpDocs** and
**10 AgentEvals**, see the "Decisioni della pianificazione dello sprint 09" note under §3), §4.2 (flow), §4.5
("Chi può approvare", "Fallback senza elicitation"), §4.6, §4.7, §5. Feature brief:
`stages/00_ideation/output/feature_brief.md` is empty on purpose; the ROADMAP is the source. Previous sprints shipped
(all review PASS): **03 OperationCatalog**, **04 OAuthScopesV2**, **05 AgentIntents** (`975aaab2`), **05b
AgentIntentsDashboard** (`0bbd6848`), **06 ScriptSdk** (`a738e680`), **07 BeechRun** (`e0bf0d77`), **08 Mcp2**
(`e374bcb8`, `docs/Sprints/Mcp2/`). This sprint depends on 07 (`beech run`, `beech agent setup`) and 08 (13 tools,
`beech_confirm`, `GET /api/agent/session`). Branch: cut `feature/mcp-docs` from `feature/mcp2` HEAD (`e374bcb8`):
`devs` lacks sprints 05-08.

---

### Pre-Computation Analysis

Graph as of `e374bcb8` (sprint 08 ran `graphify update .`: 20 374 nodes, 48 329 edges). Known limit: edges across a
package specifier (`from '@beechcms/core'`) are not extracted; Markdown files are `document` nodes with few edges, so
doc-to-doc links were confirmed with `grep` and `node scripts/docs-fact-check.mjs` (passes today: 4 757 links,
66 sidebar links).

**a) God nodes on the path**

| Node | Source | Role here |
|------|--------|-----------|
| `beechConfirm()` | `packages/mcp/src/agent-tools.ts:L333` (degree 15) | **Not edited.** Documented verbatim from its result types (`ConfirmResult`, `ConfirmItemResult`, `ConfirmOutcome`, `agent-tools.ts:L66-94`). Consumers: `handleTool()` (`index.ts:L319`), `agent-tools.test.ts`, `apps/api/test/flow/flow-mcp-agent-tools.test.ts`. |
| `elicitDecision()` | `packages/mcp/src/index.ts:L140` (degree 2) | **Edited**: its answer mapping moves to a pure exported function in `agent-tools.ts` so a unit test reaches it (review note 1 of sprint 08). Called only from `agentDeps()` (`index.ts:L160`). |
| `TOOLS` | `packages/mcp/src/tool-definitions.ts` (13 entries) | **Not edited.** Source of truth the new fact-check reads (names) and the reference documents (descriptions, annotations, inputs). Only importer: `index.ts:L52`. |
| `OPERATION_CATALOG` | `packages/core/src/operations/catalog.ts:L92` | **Not edited.** 10 rows point at `DOCS_MCP = 'mcp-server.md'` (`catalog.ts:L16`; oauth `L104-110`, intents `L254-258`): the file name stays, so `beech_search` docs links (`catalog-search.ts:L104`) keep resolving. |
| `docs-fact-check.mjs` | `scripts/docs-fact-check.mjs` (checks 1-4, `L32/L103/L173/L240`, summary `L278`) | **Edited**: new check 5 (MCP tool parity). Runs in `pnpm docs:check` and `pnpm docs:build`. |
| `mcp-server.md` | `docs/reference/mcp-server.md` (514 lines, `document` node, community "Seed Builder & Schema Mutation API") | **Rewritten** for 2.0. Linked from `docs/reference/index.md:L150`, `docs/build/schema-modeling.md:L36,L260`, `docs/reference/seed-builder.md:L418`, sidebar `docs/.vitepress/config.mts:L200`. |

**b) Architectural boundaries affected**

| Boundary | Change |
|----------|--------|
| `@beechcms/core` | **None.** |
| `apps/api` | **None.** (Docs describe its routes; no source file changes.) |
| `apps/dashboard` | **None.** (Docs point at the existing "Pending agent actions" section, `?settings=connected-apps&section=agent-actions`.) |
| `packages/mcp` | `src/agent-tools.ts` (+1 exported function, +1 exported type), `src/index.ts` (`elicitDecision` delegates), `src/agent-tools.test.ts` (1 rename, new `it`s), `README.md` rewrite, `SKILL.md` untouched. Bundled `resources/` regenerate on build (new `build/local-agent.md` is picked up by the existing `INCLUDE` dir entry `bundle-resources.mjs:L18`). |
| `packages/cli` | **None** (`SKILL_TEMPLATE`, `agent-setup.ts` already 2.0 since sprint 08). |
| `docs/` | `reference/mcp-server.md` rewrite, `start/mcp.md` rewrite, new `build/local-agent.md`, `build/cli-workflows.md` (one table row, one paragraph), `reference/index.md` card text, `.vitepress/config.mts` one sidebar item. |
| `scripts/` | `docs-fact-check.mjs` check 5. |

**c) `graphify affected` impact analysis**

```
$ graphify affected "elicitDecision" --depth 2
- agentDeps() [indirect_call] packages/mcp/src/index.ts:L160
- handleTool() [calls] packages/mcp/src/index.ts:L313

$ graphify affected "beechConfirm()" --depth 2
- handleTool() [calls] packages/mcp/src/index.ts:L319
- flow-mcp-agent-tools.test.ts [imports] apps/api/test/flow/flow-mcp-agent-tools.test.ts:L16
- agent-tools.test.ts [imports] packages/mcp/src/agent-tools.test.ts:L5
- mcp/src/index.ts [imports] packages/mcp/src/index.ts:L35
  (+ 4 references from the archived Mcp2.md plan)

$ graphify affected "packages_mcp_src_tool_definitions_tools" --depth 2
- mcp/src/index.ts [imports] packages/mcp/src/index.ts:L52

$ graphify path "beechConfirm()" "packages_mcp_src_index_server"
No directed path found   → agent-tools.ts does not reach the MCP SDK Server (sprint 08 invariant holds)
```

Conclusion: the only code change (`mapElicitResult` extracted from `elicitDecision`) is reached by `agentDeps()` and
`handleTool()` alone. `beechConfirm` and its `ElicitOutcome` contract are unchanged, so the flow suite and the
integration round-trip are not affected. `TOOLS` is read, not changed. No breaking change.

---

### VETO Audit

- **YAGNI.** Every deliverable answers ROADMAP row 09 ("`docs/reference/mcp-server.md`, guida agente in locale") or
  closes a gap a review named (`elicitDecision` unreached, misnamed test). The fact-check is one `header()` block in
  an existing script, the same pattern as check 3 (CLI matrix): it is what keeps a 13-tool reference from rotting the
  way the 9-tool one did. The v1 vs v2 evals are **not** in this sprint (split to sprint 10, see Scope Gate). No new
  package, dependency, route, migration or UI.
- **Botanical invariant.** No D1 access, no SQL, no field names in any changed source. The docs describe the existing
  OCC SQL already in `mcp-server.md`; they introduce no new storage claim.
- **VSA.** No file under `apps/api/src/features/` or `apps/dashboard/src/features/` is touched. In `packages/mcp`,
  `agent-tools.ts` keeps importing only `./constants.js` and `@beechcms/core`: the new function takes a structural
  input type declared locally, never the SDK's `ElicitResult` (sprint 08 rule "neither imports `client.ts` nor
  `@modelcontextprotocol/sdk`" stays true and is re-checked in SECTION 6).
- **Cloudflare purity.** Unaffected.
- **Security.** The docs must state the residual risk exactly as ROADMAP §4.5 and the current `SKILL.md` §6 do (the
  dialog protects against mistakes and prompt injection, not a hostile agent with shell access; token on disk in
  `~/.beechcms/mcp-tokens.json`). No doc may suggest a way to approve an intent outside `beech_confirm` or the
  dashboard, nor granting `agent:approve` to `beech-mcp-cli`.

Verdict: approved. HANDOFF -> caveman_coder.

### Scope Gate

ROADMAP row 09 bundled two deliverables with different validation: (1) documentation, validated by
`pnpm docs:check` and a read-through; (2) a v1 vs v2 task suite whose acceptance is a measured report (turns, tokens,
success), which needs live headless agent runs, a running stack and an interactive OAuth consent by the human. They
span independent boundaries and (2) benefits from (1): v2 agents read the new docs through `beech_docs_search`. So:
**09 McpDocs** (this plan) → **10 AgentEvals** (roadmap entry only). Everything about evals is in SECTION 7.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 08 shipped `@beechcms/mcp` 2.0 behaviour, but every public description of it is 1.x: `mcp-server.md` says
"The server registers 9 tools", lists `BEECH_OAUTH_SCOPE` default `schema:read schema:write`, and its worked session
is schema-only; `docs/start/mcp.md` teaches building the bundle by hand and copying `SKILL.md` into `.cursorrules`;
`packages/mcp/README.md` (the npm page) has the same 1.x tool list. Those pages are also **agent input**: `docs/build`
and `docs/reference` are bundled as `beechcms-docs://` resources (`bundle-resources.mjs:L15-22`) and returned by
`beech_docs_search` and `beech_search`. A v2 agent that reads "destructive operations are rejected via MCP" today is
told the opposite of what the intent gate does. The docs must be correct before `pnpm release` bumps the package to
`2.0.0` and before sprint 10 measures agents that read them.

The one code change is test reachability: the `accept`-without-decision → `cancel` mapping lives in `elicitDecision()`
inside `index.ts`, which imports the MCP SDK and the client singleton, so no unit test can reach it (sprint 08 review,
note 1). Extracting the mapping into `agent-tools.ts` keeps the sprint 08 invariant (decision logic in modules with
injected I/O) and makes the fail-closed rule testable.

VSA / Botanical: no slice, no core, no D1. The only `packages/mcp` change keeps `agent-tools.ts` free of
`@modelcontextprotocol/sdk` and `client.ts`.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**MCP 2.0 facts the docs must state (source of truth, do not restate from memory):**

| Fact | Source |
|------|--------|
| 13 tools, names, descriptions, input schemas | `packages/mcp/src/tool-definitions.ts` (`TOOLS`) |
| Annotations: `READ_ONLY` for 11 tools, `ADDITIVE_WRITE` for `beech_schema_apply`, `CONFIRM` (`destructiveHint: true`) for `beech_confirm` only | `tool-definitions.ts:L10-13` |
| Requested scope `schema:read schema:write settings:read agent:read agent:approve`; `BEECH_OAUTH_SCOPE` overrides | `constants.ts` `MCP_OAUTH_SCOPES`; `client.ts` `resolveApiConfig` call |
| Cached grant without `agent:read` is dropped once; stderr line `BeechCMS MCP 2.0 needs new permissions: your browser opens for consent on the next call.` | `client.ts` `dropLegacyGrant()` |
| Two OAuth clients: `beech-mcp` (this server, the only one with `agent:approve`), `beech-mcp-cli` (`beech run`) | `constants.ts` `MCP_OAUTH_CLIENT_ID`, `SCRIPT_OAUTH_CLIENT_ID`; `packages/cli/src/lib/control-plane.ts` |
| Env vars: `BEECH_API_URL`, `BEECH_AUTH_URL`, `BEECH_OAUTH_CLIENT_ID`, `BEECH_OAUTH_SCOPE`, `BEECH_OAUTH_TIMEOUT_MS`, `BEECH_TOKEN_CACHE` (`BEECH_MCP_CHILD` is internal to the supervisor: do not document) | `@beechcms/api-client` `resolveApiConfig`; `supervisor.ts:L238` |
| Watch mode off with `--no-watch` or `NODE_ENV=production` | `index.ts:L415-421` |
| `beech_whoami` result | `WhoamiResult`, `agent-tools.ts:L40-50` |
| `beech_intents` result | `IntentsResult`, `PendingIntentSummary`, `agent-tools.ts:L52-64` |
| `beech_confirm` result, statuses, per-item outcomes, fallback reasons | `ConfirmResult`, `ConfirmItemResult`, `ConfirmOutcome`, `agent-tools.ts:L66-94` |
| Confirm limits: ≤ 20 ids, dialog timeout 10 min (= intent TTL), body preview 300 chars, result preview 2 000 chars | `constants.ts` `CONFIRM_*` |
| Dialog form: single `decision` enum `approve`/`reject`, one decision for all shown intents | `constants.ts` `CONFIRM_DECISION_SCHEMA`; `agent-tools.ts` `buildDialogMessage` |
| Fallback address `<auth origin>/admin/?settings=connected-apps&section=agent-actions` | `constants.ts` `PENDING_ACTIONS_PATH`; `client.ts` `apiUrls` |
| `beech_search` hit fields, `detail` levels, limits 10/50, 3 docs hits, `excluded` never returned, `intents.approve`/`media.upload` have `sdk: null` | `catalog-search.ts`; `constants.ts` `SEARCH_*` |
| `GET /api/agent/session` and the four intent routes (already in `mcp-server.md` "Permission Model") | `catalog.ts:L254-258`; `agent-intents.handler.ts` |
| Intent activity log rows (`entityType: 'intent'`) | `agent-intents.handler.ts:L114,L147`; `agent-intent-gate.middleware.ts:L131` |
| Policy per `ENV`: development gates destructive; production gates publish + destructive | ROADMAP §4.5; `mcp-server.md` "Permission Model" paragraph 3 (already correct) |
| `beech agent setup` writes `.mcp.json` entry `beechcms` → `npx -y @beechcms/mcp`, skill `.claude/skills/beechcms-scripts/SKILL.md`, `.beech/scripts/README.md`, `latest-entries.ts` | `packages/cli/src/commands/agent-setup.ts`; `packages/cli/src/lib/agent-templates.ts` (`SKILL_TEMPLATE` L9, `SCRIPTS_README_TEMPLATE` L62, `EXAMPLE_SCRIPT_TEMPLATE` L93) |
| `RunReport` fields and exit codes | `docs/build/cli-workflows.md` §7 (already correct; link to it, do not duplicate) |

**Docs state.**
- `docs/reference/mcp-server.md`: sections at L13 (principles), L37 (install), L50 (client config), L71 (env vars,
  stale scope default), L87 (tools, "9 tools"), L284 (resources, correct), L295 (plan lifecycle, correct), L328
  (danger zone, says seed delete "Not supported via MCP"), L341 (FTS, correct), L352 (permission model, already 2.0),
  L388 (failure matrix, mostly 2.0), L406 (audit, `mcp-apply` only), L435 (worked session, 1.x), L510 (related).
- `docs/start/mcp.md` (182 lines): monorepo-only build path, Claude Desktop/Cursor configs pointing at
  `dist/index.js`, `## 4. Install the Agent Skill` (L131) tells to copy `SKILL.md` and shows the 4-step schema flow
  only. Not bundled as a resource.
- `docs/build/cli-workflows.md` §7 "Agent Scripts" (L231-262): correct, but the `pendingIntents` row says "wait for
  approval in Dashboard → Agent actions" only.
- Sidebar `docs/.vitepress/config.mts`: `/start/` group L65-72 has "AI & MCP Setup"; `/build/` "Tooling &
  Architecture" group L113-119 has "CLI Workflows" and "Vertical Slice Architecture".
- `docs/reference/index.md:L149-154`: MCP card text says "inspect, validate, plan, and apply schema changes".
- `packages/mcp/README.md` (122 lines; `## Tools` L66 lists 1.x tools).
- `packages/mcp/SKILL.md`: already 2.0 (sprint 08 Task 7). **Untouched.**

**`docs-fact-check.mjs` pattern to copy.** Check 3 (`L173-238`): reads a source file, extracts names with a regex,
asserts each appears in a doc, calls `error()` per miss and `success()` once. `getMarkdownFiles()` (`L36`) skips
`Sprints`, `.vitepress`, `examples`. Exit code from `failureCount` (`L278-285`).

**Test pattern.** `packages/mcp/src/agent-tools.test.ts` (unit tier, `describe('agent tools')` L29, hand-rolled
`send`/`elicit` fakes, UUIDv4 ids). Misnamed `it` at L87.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Code:
1. `packages/mcp/src/agent-tools.ts` — edit: export `ElicitAnswer` type and `mapElicitResult()`.
2. `packages/mcp/src/index.ts` — edit: `elicitDecision()` delegates its answer mapping to `mapElicitResult()`.
3. `packages/mcp/src/agent-tools.test.ts` — edit: rename one `it`, add a `describe('mapElicitResult')` block.
4. `scripts/docs-fact-check.mjs` — edit: check 5 "MCP tools vs docs".

Docs:
5. `docs/reference/mcp-server.md` — rewrite (same path and frontmatter keys).
6. `docs/build/local-agent.md` — **new**: "Working with an Agent Locally" guide.
7. `docs/start/mcp.md` — rewrite (same path).
8. `docs/build/cli-workflows.md` — edit §7: one table row, one sentence.
9. `docs/reference/index.md` — edit the MCP card paragraph only.
10. `docs/.vitepress/config.mts` — add one sidebar item.
11. `packages/mcp/README.md` — rewrite (npm page; short, links to the docs site).

Generated (by `pnpm --filter @beechcms/mcp build`, commit them as the repo already does): `packages/mcp/resources/**`
including `manifest.json` and `build/local-agent.md`.

No change to: `SKILL.md`, `tool-definitions.ts`, `constants.ts`, `client.ts`, any `package.json`, core, api,
dashboard, cli.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

## Task 1 — `mapElicitResult` (packages/mcp)

**Approach:** move the pure part of `elicitDecision()` (`index.ts:L140-156`) into `agent-tools.ts`; `index.ts` keeps
the capability check, the `elicitInput` call, the timeout and the `does not support` catch. Reason: the mapping is
the fail-closed rule; it must be unit-testable without the SDK.

Exported building blocks (add next to `ElicitOutcome`, `agent-tools.ts:L19`):

```ts
/** Structural subset of the MCP SDK ElicitResult; declared here so this module never imports the SDK. */
export interface ElicitAnswer {
  action: string
  content?: Record<string, unknown>
}

/** Maps a client's elicitation answer to the only outcomes beechConfirm acts on. Never throws. */
export function mapElicitResult(answer: ElicitAnswer): ElicitOutcome
```

Rules:
- `action === 'accept'` and `content.decision` is exactly `'approve'` or `'reject'` → `{ action: 'accept', decision }`.
- `action === 'accept'` with a missing, non-string or other `decision` → `{ action: 'cancel' }`.
- `action === 'decline'` → `{ action: 'decline' }`; `action === 'cancel'` → `{ action: 'cancel' }`.
- Any other `action` string → `{ action: 'cancel' }`. Fail closed: nothing runs, nothing is rejected. The SDK types
  `action` as `accept | decline | cancel` today; the input type is `string` on purpose so a future protocol value
  cannot widen what `beechConfirm` acts on.
- Never returns `unsupported` (that stays in `index.ts`: capability check + `does not support` catch).

`index.ts`: `elicitDecision()` returns `mapElicitResult(result)` after `elicitInput`; import it from
`./agent-tools.js` alongside the existing imports (`index.ts:L35-42`). Keep its TSDoc, update the sentence on mapping.

## Task 2 — tests (packages/mcp)

File: `packages/mcp/src/agent-tools.test.ts`, **unit** tier (same file, same tier; pure function, no I/O). Fixture
source: inline literals (no builders exist in `packages/mcp`; sprint 08 allowed exception).

- Rename `it` at L87 to `a cancelled dialog sends no decision request` (body unchanged).
- New `describe('mapElicitResult', …)` inside the top `describe('agent tools')`:
  - `an accepted approve maps to accept with decision approve` → `{ action: 'accept', decision: 'approve' }`.
  - `an accepted reject maps to accept with decision reject` → `{ action: 'accept', decision: 'reject' }`.
  - `an accepted answer without a decision maps to cancel` → `{ action: 'cancel' }` (no `content`).
  - `an accepted answer with an unknown decision maps to cancel` → `content: { decision: 'yes' }` → `cancel`.
  - `a non-string decision maps to cancel` → `content: { decision: true }` → `cancel`.
  - `decline maps to decline` → `{ action: 'decline' }`.
  - `an unknown action maps to cancel` → `{ action: 'later' }` → `cancel`.
- Use `toEqual` on the whole outcome object (strict shape, testing_conventions §5).

## Task 3 — fact-check 5 (scripts/docs-fact-check.mjs)

**Approach:** append a block after check 4 (before the summary at `L278`), copying the shape of check 3 (`L173-238`).
Header text: `5. Fact-Checking MCP Tools vs docs/reference/mcp-server.md`. Reason: the tool list is the fact most
likely to drift; the script already gates `pnpm docs:build`.

Rules:
- Source: read `packages/mcp/src/tool-definitions.ts` as text; tool names = every match of
  `/name:\s*'(beech_[a-z_]+)'/g`. If zero names are found, `error()` once ("could not read MCP tool names") — never pass
  silently.
- Forward check: each name must appear wrapped in backticks (`` `beech_x` ``) in `docs/reference/mcp-server.md`;
  one `error()` per missing name.
- Reverse check over exactly three files — `docs/reference/mcp-server.md`, `docs/start/mcp.md`,
  `docs/build/local-agent.md` — every token matching `/\bbeech_[a-z_]*[a-z]\b/g` must be a known tool name; one
  `error()` per unknown token with file and token. Tokens that end in `_` (wildcards like `beech_schema_*`) are not
  matched by that regex on purpose. A missing file is an `error()` (all three are required by this sprint).
- On success, one `success()` line with the count: `All 13 MCP tools are documented; no unknown beech_* tool names in
  MCP docs.` (count computed, not hardcoded).
- Plain Node + `picocolors` only, as the rest of the script. No new dependency.

## Task 4 — `docs/reference/mcp-server.md` rewrite

**Approach:** full rewrite in place; keep the path (10 catalog rows and 4 pages link to it) and the frontmatter keys
(`title`, `group`, `category`). English, same tone as the other reference pages. Every number, name and field comes
from the SECTION 2 source table. Target ≈ 450-550 lines. Reuse the correct existing sections (marked "keep") with
light edits; do not invent behaviour.

Section order (H2), content rules:

1. **Intro** (no heading): what 2.0 is in three sentences — schema tools (1.x, unchanged), session/discovery tools,
   approval tools; the agent's bulk work runs as `beech run` scripts, not tool calls; link `/build/local-agent`.
2. **Architecture** — replace the 1.x diagram with the ROADMAP §4.2 flow (agent → script → `beech run` → API
   `auth → scope → RBAC → intent gate`; risky calls become intents; `beech_confirm` → dialog → server replay). Then the
   four principles from L23-35 kept, plus one: **5. Human approval for risky calls** (intent gate, server-side replay,
   one execution, 10-minute TTL).
3. **Installation** — two paths: *site project* (`npx beech agent setup`, what it writes, link
   `/build/local-agent#setup`), *monorepo contributor* (keep L37-48 build text).
4. **Client configuration** — `.mcp.json` example with `"command": "npx", "args": ["-y", "@beechcms/mcp"]` (what
   `agent setup` writes) and the monorepo variant (`node …/dist/index.js`, keep L54-69). Env var table from L71-80 with
   `BEECH_OAUTH_SCOPE` default set to the 2.0 scope string and a note that narrowing it disables the tools that need
   the dropped scope (e.g. without `agent:approve`, `beech_confirm` can only fall back). Keep the PKCE note (L82-83).
5. **OAuth clients and scopes** — table: client id, used by, requested scopes, can approve. `beech-mcp` → this
   server → MCP_OAUTH_SCOPES → yes. `beech-mcp-cli` → `beech run` / SDK → what `control-plane.ts` requests → **never**.
   Consent is partial (link the Permission Model section). Subsection **Upgrading from 1.x**: legacy grant drop, the
   exact stderr line, one new consent, schema tools unchanged, `planId` still in memory.
6. **Tools reference** — opening sentence "The server registers 13 tools prefixed with `beech_`" (count must match
   `TOOLS`), then a summary table: tool, annotation (`readOnly` / `additive write` / `destructive`), one-line purpose.
   Then H3 per tool grouped by H3-level group intro lines: *Session and discovery* (`beech_whoami`, `beech_search`,
   `beech_docs_search`), *Approval* (`beech_intents`, `beech_confirm`), *Schema* (`beech_list_seeds`,
   `beech_get_seed`, `beech_schema_export`, `beech_schema_validate`, `beech_schema_plan`, `beech_schema_apply`),
   *Server* (`beech_mcp_status`, `beech_mcp_reload`). Per tool: input (from `inputSchema`), output fields (from the
   result interfaces; a JSON example only for `beech_whoami`, `beech_search` and `beech_confirm`), errors. Keep the 1.x
   schema tool sections (L91-282) with edits only where 2.0 changed them (status reports the `package.json` version).
   - `beech_search`: `detail` levels `name`/`signature`/`full` (default `signature`), limit default 10 max 50, up to 3
     docs hits, OR over tokens and deterministic order, `excluded` operations never returned, filtered by the agent
     exposure and the cached script grant scopes (not by per-seed RBAC: the server still enforces it, `beech_whoami`
     shows it), `sdk: null` for `intents.approve` and `media.upload` with the reason.
   - `beech_whoami`: both `mcp` and `scripts` scope lists, `null` scripts scopes when scripts never authorized.
7. **Approval lifecycle (`beech_confirm`)** — numbered data flow: ids validated (1-20, duplicates collapsed) → each
   intent read from `GET /api/agent/intents/:id` → expired, foreign, non-pending, missing ids never reach the dialog →
   one dialog whose text is built **only** from server-stored intents (never from tool arguments) → one decision for
   all → approve/reject calls → per-item results. Then two tables: **status** (`decided`, `declined`, `cancelled`,
   `fallback` with `reason` `elicitation_unsupported` | `elicitation_failed`, `nothing_pending`) with "what ran" and
   "what the agent must do" (relay `instruction` verbatim, never retry in a loop); **item outcome** (the 8
   `ConfirmOutcome` values). State: decline, cancel, no elicitation or an elicitation error approve nothing and reject
   nothing; intents stay pending until approved in the dashboard or expired. Dialog timeout = TTL = 10 min.
   Client support: Claude Code supports form elicitation; clients without it get the fallback (ROADMAP §4.5 names
   Claude Desktop and older clients — say "clients without form elicitation", do not promise a client list).
8. **Resources & Auto-Reload** — keep L284-293; add that `docs/build/local-agent.md` is bundled.
9. **Plan Lifecycle & Security** — keep L295-326.
10. **Additive Invariant & Danger Zone** — keep the table L328-339 but replace the last row and add one paragraph:
    destructive schema endpoints (drop/rename/retype branch, delete seed) are reachable from `beech run` scripts with
    `schema:write` and become **intents** (destructive in every `ENV`); `beech_schema_apply` itself stays
    additive-only. Verify each row's risk in `catalog.ts` before writing it.
11. **FTS5 Rebuild Handling** — keep L341-350.
12. **Permission Model & Known Limitations** — keep L352-386 (already 2.0); replace the last paragraph about
    `BEECH_OAUTH_SCOPE=schema:read` with the 2.0 equivalent (read-only agent = drop `schema:write` and
    `agent:approve`). Add the residual risk sentence verbatim from SECTION VETO "Security".
13. **Failure Semantics Matrix** — keep L388-404; add rows for `beech_confirm` fallback (not an HTTP error: status
    `fallback`) and the `403 insufficient_scope` naming the missing scope (`agent-tools.test.ts:L137`).
14. **Audit Trail & Observability** — keep the `mcp-apply` example; add a short table of intent events written with
    `entityType: 'intent'` (read the three `logActivity` calls listed in SECTION 2 for the exact `action` values).
15. **Worked Agent Session** — replace with a 2.0 session: `beech_whoami` → `beech_search` ("trash posts older than")
    → agent writes `.beech/scripts/<name>.ts` → `beech run --dry-run --json` → `beech run --json` with one
    `pendingIntents` entry → `beech_confirm` → `decided`/`executed`. Show abbreviated JSON for each step; SDK method
    names must exist in `packages/cli/src/sdk/` (check by grep, do not invent).
16. **Related Documentation** — links: `/build/local-agent`, `/start/mcp`, `/build/cli-workflows`,
    `/build/schema-modeling`, `/reference/seed-builder`, `/reference/auth-endpoints`.

## Task 5 — `docs/build/local-agent.md` (new guide)

**Approach:** task-oriented guide for a developer with a site project and Claude Code, ≈ 200-280 lines, frontmatter
`title: Working with an Agent Locally` and a one-line `description`. Lives in `docs/build/` so it is bundled as
`beechcms-docs://build/local-agent.md` and found by `beech_docs_search`. Explains *how*, links to the reference for
*what* (no duplicated tables: link `mcp-server.md` sections and `cli-workflows.md#runreport`).

Sections (H2, use these headings so the anchors below exist):
1. **What you get** — the flow in five steps (ROADMAP §4.2), one paragraph on why scripts instead of one tool per
   call (context and turns), no external claims or numbers.
2. **Setup** (`#setup`) — prerequisites (Node ≥ 22.18, `pnpm beech dev` running, an account with the RBAC you want
   the agent to have); `npx beech agent setup` and the files it writes; install; restart the agent client.
3. **First run and consent** — two consents, one per client (table: which command triggers it, what it can do);
   partial grant; where to revoke (Settings → Connected apps).
4. **Writing and running a script** — the example `latest-entries.ts` from `EXAMPLE_SCRIPT_TEMPLATE` (quote it
   verbatim from `agent-templates.ts:L93`, do not write a new one); `--dry-run` first; reading `result`, `calls`,
   `pendingIntents`; per-seed types via `beech types generate`.
5. **Approving risky actions** — the `ENV` policy table (development: destructive; production: publish +
   destructive); `beech_confirm` and the dialog; what each status means for the human; fallback to the dashboard
   section with its exact path; intents expire after 10 minutes.
6. **What the agent can and cannot do** — effective permission = scopes ∩ RBAC (ROADMAP §4.6 formula); human-only
   exceptions (password, email change, sessions, OAuth consents, `rotate-field`, account creation except invites);
   `beech_whoami` to check.
7. **Security model** — residual risk (VETO "Security" wording), CMS content is untrusted data, every intent event is
   in the activity log.
8. **Troubleshooting** — the legacy-grant stderr line; `fallback` with `elicitation_unsupported`; `intent_expired`;
   `403 insufficient_scope`; `ECONNREFUSED` (stack not running). One line cause + one line fix each.

## Task 6 — `docs/start/mcp.md` rewrite

**Approach:** short quickstart (≈ 100-140 lines), frontmatter `title` kept, `description` updated to cover scripts and
approvals. Sections: why (4 bullets, 2.0: zero DB exposure, scripts with your permissions, human approval for risky
actions, additive schema with OCC); **1. Prerequisites** (keep L25-43 minus the `manage_seeds` requirement, which now
applies only to schema tools: say so); **2. Connect your agent** — *Claude Code in a site project* →
`npx beech agent setup`; *other clients* (Claude Desktop, Cursor) → the `.mcp.json`/`claude_desktop_config.json`
snippet with `npx -y @beechcms/mcp` and a note that approvals fall back to the dashboard on clients without form
elicitation; *monorepo contributors* → build + `node dist/index.js` (keep L45-55 text); **3. Try it** — one prompt
example ("list the seeds and tell me who I am") and what the agent calls (`beech_whoami`, `beech_list_seeds`);
**4. The agent skill** — `beech agent setup` writes it; `packages/mcp/SKILL.md` is the MCP-side version; no
"copy into `.cursorrules`" advice; **Troubleshooting** (keep L121-129 items that are still true); **Next steps** →
`/build/local-agent`, `/reference/mcp-server`. Remove the 1.x "Strict Additive Safety: forbids destructive
operations" claim; replace with the intent-gate wording.

## Task 7 — small doc edits

- `docs/build/cli-workflows.md` §7: `pendingIntents` row → "Actions that did not run and wait for approval: ask the
  agent to call `beech_confirm`, or use Dashboard → Settings → Connected apps → Pending agent actions." Add one
  sentence after the numbered list linking `/build/local-agent`. Keep the CLI matrix rows L34-35 unchanged (check 3
  depends on them).
- `docs/reference/index.md:L152` card paragraph → "Stdio AI control plane: agent session and operation search,
  human approval of risky actions, and additive schema evolution through the Botanical Engine." No markup change.
- `docs/.vitepress/config.mts`: in `/build/` "Tooling & Architecture" items (L113-119) add
  `{ text: 'Working with an Agent Locally', link: '/build/local-agent' }` after "CLI Workflows".

## Task 8 — `packages/mcp/README.md` rewrite

**Approach:** npm landing page, ≈ 60-90 lines: one-paragraph description; install via `npx beech agent setup` or the
`.mcp.json` snippet; the 13-tool summary table (same rows as Task 4 section 6, names + one line); scopes line; a
"Upgrading from 1.x" paragraph (same facts as Task 4 section 5); links to the docs site pages
(`/reference/mcp-server`, `/build/local-agent`) using absolute `https://` URLs only if one is already used elsewhere
in this README, else relative repo paths to `docs/`. No duplicated failure matrix or worked session.

## Task 9 — regenerate resources and graph

`pnpm --filter @beechcms/mcp build` regenerates `packages/mcp/resources/` (manifest gains
`beechcms-docs://build/local-agent.md`). Then `graphify update .`.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repo root unless noted.

```bash
pnpm --filter @beechcms/mcp type-check
pnpm --filter @beechcms/mcp test
pnpm --filter @beechcms/mcp build            # regenerates resources/, includes build/local-agent.md
grep -c "local-agent.md" packages/mcp/resources/manifest.json   # ≥ 1
pnpm docs:check                              # checks 1-5 pass, exit 0
pnpm lint
pnpm beech test --diff
graphify update .
```

Negative check for fact-check 5 (do not commit the change): temporarily rename one tool in a backticked mention in
`docs/reference/mcp-server.md` (e.g. `` `beech_whoami` `` → `` `beech_whoamii` ``), run `pnpm docs:check`, expect
exit 1 with one forward and one reverse error; revert and re-run (exit 0). Record both runs in the execution log.

Read-through: render `pnpm docs:dev` (or read the Markdown) and confirm every anchor linked from
`local-agent.md` and `mcp-server.md` exists (check 1 validates files, not anchors).

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `mapElicitResult` and `ElicitAnswer` are exported from `agent-tools.ts` with the exact signatures in Task 1;
      `elicitDecision()` in `index.ts` uses it; an unknown `action` maps to `cancel`.
- [ ] `agent-tools.ts` imports only `./constants.js` and `@beechcms/core` (`grep "^import" packages/mcp/src/agent-tools.ts`).
- [ ] The misnamed test is renamed; the 7 `mapElicitResult` tests exist and pass; `pnpm --filter @beechcms/mcp test` green.
- [ ] `docs-fact-check.mjs` check 5 exists, fails on a missing or unknown tool name (negative check recorded), passes on the final tree.
- [ ] `docs/reference/mcp-server.md` documents all 13 tools, says "13 tools", lists the 2.0 default scope, documents
      `beech_confirm` statuses and item outcomes, the two OAuth clients, the 1.x upgrade path, and contains no claim
      that destructive operations are impossible through the agent.
- [ ] `docs/build/local-agent.md` exists with the 8 sections of Task 5, is in the sidebar, and is in
      `packages/mcp/resources/manifest.json`.
- [ ] `docs/start/mcp.md` uses `npx beech agent setup` as the primary path and no longer advises copying `SKILL.md`
      into project rules.
- [ ] `packages/mcp/README.md` lists 13 tools.
- [ ] No doc suggests approving an intent other than via `beech_confirm` or the dashboard; the residual-risk sentence is present in `mcp-server.md` and `local-agent.md`.
- [ ] Every SDK method name, env var, constant value and status string in the docs exists in the sources of SECTION 2 (spot-check recorded in the execution log).
- [ ] No change to any `package.json`, `SKILL.md`, `tool-definitions.ts`, `constants.ts`, core, api, dashboard or cli source.
- [ ] No `any` in changed TypeScript; SPDX headers intact.
- [ ] Every command in SECTION 5 passes (coverage-gate caveat of sprints 07-08 applies: `devs` lacks sprints 05-08; report LOW files outside this sprint's diff without fixing them).

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- **v1 vs v2 evals** (task suite, harness, turns/tokens/success report): ROADMAP §6 row **10 AgentEvals**.
- Version bump to `2.0.0`, changelog, npm publish: `pnpm release` (`_config/release.md`), not this sprint.
- `packages/mcp/SKILL.md`, the CLI `SKILL_TEMPLATE`, tool descriptions in `tool-definitions.ts`: already 2.0; do not
  reword them to match the docs (the docs follow the code).
- The non-JSON `200` abort in `decide()` (sprint 08 review note 2): accepted by plan, not changed.
- Remote MCP server (ROADMAP §4.8), server-side `planId`, `outputSchema`/`structuredContent`.
- Translating docs (the docs site is English only); TypeDoc regeneration (`pnpm docs:generate`).
- Any other page under `docs/` beyond the files in SECTION 3 (e.g. `schema-modeling.md`, `seed-builder.md` keep their
  links; do not edit them).
- Dashboard, API, core changes of any kind.
