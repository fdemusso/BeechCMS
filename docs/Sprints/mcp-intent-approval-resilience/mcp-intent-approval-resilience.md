# Sprint Plan: MCP Intent Approval Resilience & Dashboard Fallback (#1027)

### Pre-Computation Analysis

a) **God Nodes identified via `graphify` CLI:**
- `beechConfirm()` (`packages/mcp/src/agent-tools.ts:L366`, degree 10) — orchestrates `loadIntent()`, `buildDialogMessage()`, `buildFallbackInstruction()`, `decide()`, and `parseIntentIds()`.
- `agentIntentsApp` (`apps/api/src/features/agent-intents/agent-intents.handler.ts:L33`, degree 3) — exposes `/session`, `/intents`, `/intents/:id`, `/intents/:id/approve`, `/intents/:id/reject`.

b) **Architectural boundaries affected:**
- `@beechcms/core`: **None** (`AgentIntentStatus`, `AgentIntentRecord`, and `IAgentIntentRepository.findForUser` already support all required states and readback).
- `apps/api`: **None** (`GET /api/agent/intents/:id` already returns `status` and `result`, and `POST /api/agent/intents/:id/approve` already persists `approved` before dispatch and `executed`/`failed` afterward).
- `packages/mcp`: `src/agent-tools.ts`, `src/tool-definitions.ts`, `src/index.ts`, `SKILL.md`, `src/agent-tools.test.ts`, `src/integration.test.ts`.
- `packages/cli`: `src/commands/run.ts` (pending-intent human output only; no scope or token changes).

c) **`graphify affected` impact analysis:**
- `graphify affected "beechConfirm" --depth 2`:
  - `apps/api/test/flow/flow-mcp-agent-tools.test.ts` (imports `beechConfirm`)
  - `packages/mcp/src/agent-tools.test.ts` (imports `beechConfirm`)
  - `packages/mcp/src/index.ts` (`handleTool()` at `L213` calls `beechConfirm`)
- `graphify affected "agentIntentsApp" --depth 2`:
  - `apps/api/src/features/agent-intents/index.ts`
  - `apps/api/src/routes.ts`
  - `apps/api/src/factory.ts`
  - (Zero changes planned in `apps/api`, so zero API-side regressions.)

---

### VETO Audit

- **Botanical Invariant:** Pass — No D1 queries or schema changes are introduced; all intent persistence remains behind `IAgentIntentRepository` in `@beechcms/core` and `apps/api`.
- **Vertical Slice Architecture (VSA):** Pass — All changes are confined to `packages/mcp` (control-plane tools) and `packages/cli` (CLI report formatting), with zero cross-feature imports in `apps/api` or `apps/dashboard`.
- **Cloudflare Purity & YAGNI:** Pass — Reuses existing `GET /api/agent/intents/:id` instead of adding new API endpoints, polling daemons, or DB columns. Preserves `ROADMAP §4.5` security boundary: `beech-mcp-cli` never receives `agent:approve` scope.

HANDOFF -> caveman_coder

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
This sprint addresses GitHub issue #1027 and the recovery edge cases raised in its discussion in a single, self-contained pass across `packages/mcp` and `packages/cli`.

When an MCP client lacks form elicitation, `beech_confirm` falls back to the BeechCMS dashboard. Today, two gaps break the loop:
1. `beech_intents` only lists `pending` intents (`GET /api/agent/intents`). Once a human approves or rejects in the dashboard, the intent disappears from that list, leaving the agent blind to the outcome.
2. `beechConfirm` collapses every non-`pending` status into `'not_pending'` and turns any transport failure on `POST /api/agent/intents/:id/approve` into a generic `'error'`, without reading `GET /api/agent/intents/:id` back. Because `agent-intents.handler.ts:L83-L111` records `approved` before dispatch and persists `result` afterward, a lost response or mid-flight interruption leaves either a recorded `executed`/`failed` result or `status: 'approved'` with `result: null`.

Because `apps/api` and `@beechcms/core` already expose `GET /api/agent/intents/:id` with full `status` and `result`, this sprint requires zero backend or schema changes and can land independently.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
- `apps/api/src/features/agent-intents/agent-intents.handler.ts`:
  - `GET /intents/:id` (`L61-L67`) calls `repository.findForUser(id, userId)` for any status and returns `toIntentDetailView(record)` (`agent-intents.view.ts:L75-L82`), where `result` is `null` until `recordResult` runs.
  - `POST /intents/:id/approve` (`L69-L125`) transitions `pending -> approved` (`L83`), dispatches via `intentDispatcher` (`L106`), then calls `repository.recordResult(...)` (`L111`).
- `packages/mcp/src/agent-tools.ts`:
  - `ConfirmOutcome` (`L85-L87`): `'executed' | 'failed' | 'rejected' | 'pending' | 'expired' | 'not_pending' | 'not_found' | 'error'`.
  - `beechIntents` (`L220-L234`): takes only `deps`, calls `GET /api/agent/intents` (pending only).
  - `loadIntent` (`L334-L356`): maps any `intent.status !== 'pending'` to `'not_pending'`.
  - `decide` (`L281-L313`): on `deps.send('POST', ...)` throw (`L286`), returns `'error'` without readback.
  - `buildFallbackInstruction` (`L316-L319`): tells the agent to call `beech_intents` (which cannot see decided intents).
- `packages/mcp/src/tool-definitions.ts`: `beech_intents` (`L120-L124`) has `properties: {}`.
- `packages/mcp/src/index.ts`: `handleTool()` (`L315-L316`) invokes `beechIntents(agentDeps())`.
- `packages/cli/src/commands/run.ts`: `L125-L129` prints `pendingIntents` with a static `"Waiting for human approval: Dashboard → Agent actions"` line.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
Modified files only (no new files):
- `packages/mcp/src/agent-tools.ts` — add `'awaiting_result'` outcome, readback-by-ids in `beechIntents`, status-preserving `loadIntent`, transport-failure readback in `decide`, updated `buildFallbackInstruction`.
- `packages/mcp/src/tool-definitions.ts` — add optional `intentIds` array to `beech_intents` schema and update descriptions.
- `packages/mcp/src/index.ts` — forward optional `args.intentIds` to `beechIntents`.
- `packages/mcp/SKILL.md` — document `beech_intents({ intentIds })` readback and `awaiting_result` rule (never resubmit).
- `packages/cli/src/commands/run.ts` — print `intentIds` and `beech_confirm` / dashboard recovery hint clearly when `pendingIntents` exist.
- `packages/mcp/src/agent-tools.test.ts` — unit tests for readback, `awaiting_result`, lost response, and interruption before persistence.
- `packages/mcp/src/integration.test.ts` — integration tests for `beech_intents` with `intentIds` and updated fallback instruction.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — Distinguish `awaiting_result` and support readback in `beech_intents` & `beechConfirm`
**Chosen approach:** Extend `beech_intents` with an optional `intentIds` parameter (reusing `parseIntentIds`) instead of adding a new `beech_intent_status` tool — keeps the MCP tool surface minimal (YAGNI).

- **Files:** `packages/mcp/src/agent-tools.ts`, `packages/mcp/src/tool-definitions.ts`, `packages/mcp/src/index.ts`, `packages/mcp/SKILL.md`
- **Building blocks (verbatim):**
```ts
export type ConfirmOutcome =
  | 'executed' | 'failed' | 'rejected' | 'pending' | 'awaiting_result'
  | 'expired' | 'not_pending' | 'not_found' | 'error'

export interface IntentStatusItem {
  id: string
  outcome: ConfirmOutcome
  operationId: string | null
  risk: 'publish' | 'destructive' | null
  summary: string | null
  status: string | null
  expiresAt: number | null
  expiresInSeconds: number | null
  resultStatus: number | null
  resultBody: unknown
  message: string | null
}

export interface IntentsResult {
  intents: PendingIntentSummary[]
  /** Present when `intentIds` was supplied; one entry per distinct requested id in request order. */
  checked?: IntentStatusItem[]
  pendingActionsUrl: string
}
```
  - `beech_intents` input schema in `packages/mcp/src/tool-definitions.ts:L123`:
```ts
inputSchema: {
  type: 'object',
  properties: {
    intentIds: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 20 },
  },
  additionalProperties: false,
}
```
  - Signature in `packages/mcp/src/agent-tools.ts:L220`:
```ts
export async function beechIntents(
  deps: AgentToolDeps,
  input?: { intentIds?: unknown },
): Promise<IntentsResult>
```
- **Behaviour & invariants:**
  - Extract a pure helper `mapIntentToOutcome(intent: IntentBody, now: number): ConfirmOutcome` (copying the `expiresAt <= now` guard from `loadIntent` at `agent-tools.ts:L354`):
    - `status === 'pending'` and `expiresAt <= now` -> `'expired'`
    - `status === 'pending'` -> `'pending'`
    - `status === 'approved'` and `result === null` -> `'awaiting_result'`
    - `status === 'approved'` with `result` present -> `result.status < 400 ? 'executed' : 'failed'`
    - `status === 'executed' | 'failed' | 'rejected' | 'expired'` -> same literal
    - any unknown status -> `'not_pending'`
  - Update `IntentBody` (`agent-tools.ts:L132`) to include optional `result?: { status: number; body: unknown } | null`.
  - In `loadIntent` (`agent-tools.ts:L334-L356`): use `mapIntentToOutcome`; only populate `shown` when outcome is `'pending'`. Populate `resultStatus` and `resultBody` (via `previewResultBody`) when `intent.result` is present, and set `message` for `'awaiting_result'` stating that the intent is approved on the server with no recorded result yet and must not be resubmitted.
  - In `decide` (`agent-tools.ts:L281-L313`): when `decision === 'approve'` and `deps.send('POST', path)` throws, perform one best-effort readback via `GET /api/agent/intents/${item.id}`.
    - If readback returns `executed` or `failed` (lost response after recorded result): return that outcome with `resultStatus` and `resultBody`.
    - If readback returns `awaiting_result` (`approved` with `result: null`, interruption before persistence): return `outcome: 'awaiting_result'` with a non-retry message.
    - If readback fails or still shows `pending`: return `outcome: 'error'` with the original transport error message.
    - Never retry `POST .../approve`.
  - In `beechIntents(deps, input)`: if `input?.intentIds !== undefined`, validate via `parseIntentIds`, fetch each via `GET /api/agent/intents/${id}` (never throwing on 404 or transport failure for individual items), map with `mapIntentToOutcome`, and return `{ intents: [], checked, pendingActionsUrl: deps.pendingActionsUrl }`. When `input?.intentIds` is omitted, preserve existing `GET /api/agent/intents` behaviour.
  - In `buildFallbackInstruction` (`agent-tools.ts:L316-L319`): include the `shown` intent IDs and instruct the agent to call `beech_intents` with `intentIds` after the human acts in the dashboard (never resubmit).
  - In `packages/mcp/src/index.ts:L315`: pass `args.intentIds !== undefined ? { intentIds: args.intentIds } : undefined` to `beechIntents`.
  - Update `packages/mcp/SKILL.md:L30-L38` to document `beech_intents({ intentIds })` after dashboard fallback and `awaiting_result` handling.

### Task 2 — Improve CLI pending-intent fallback output
**Chosen approach:** Update `formatRunSummary` in `packages/cli/src/commands/run.ts:L125-L129` to surface the exact `intentIds` and recovery guidance without changing `beech-mcp-cli` scopes.

- **Files:** `packages/cli/src/commands/run.ts`
- **Behaviour & invariants:**
  - When `report.pendingIntents.length > 0`, list each intent (`id`, `risk`, `summary`) and print clear next steps for both MCP (`beech_confirm` / `beech_intents` with those IDs) and manual dashboard approval (`Dashboard → Agent actions`).
  - Keep `--json` output shape (`RunReport`) unchanged so existing consumers (`packages/cli/src/test/run.test.ts`) do not break.

### Task 3 — Unit & Integration Tests
- **Unit tests (`packages/mcp/src/agent-tools.test.ts`, tier: unit, injected `AgentToolDeps` + `FixedClock` / fixed `nowSeconds`):**
  - `it('decide readback returns executed with resultStatus when POST approve loses connection after server recorded result', ...)`
  - `it('decide readback returns awaiting_result without retrying when POST approve is interrupted after approved but before result persistence', ...)`
  - `it('decide returns error when POST approve fails and readback still sees pending or fails', ...)`
  - `it('beechConfirm on an already approved intent without result returns awaiting_result instead of not_pending', ...)`
  - `it('beechIntents with intentIds returns awaiting_result, executed, rejected, expired and not_found accurately', ...)`
- **Integration tests (`packages/mcp/src/integration.test.ts`, tier: integration, real MCP server + mocked HTTP upstream):**
  - `it('beech_confirm without elicitation support returns dashboard fallback naming the intentIds and beech_intents readback', ...)`
  - `it('beech_intents with intentIds reads back approved-without-result as awaiting_result', ...)`

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
- `pnpm --filter @beechcms/mcp test`
- `pnpm --filter @beechcms/cli test`
- `pnpm --filter @beechcms/mcp build`
- `pnpm --filter @beechcms/cli build`
- `pnpm beech test --diff`

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] `beech_intents` accepts optional `intentIds` and returns `checked` with exact `outcome` (`awaiting_result`, `executed`, `failed`, `rejected`, `expired`, `not_found`).
- [ ] `beech_confirm` never retries `POST .../approve` on transport failure; readback distinguishes lost-response-after-result from interruption-before-persistence (`awaiting_result`).
- [ ] `beech_confirm` fallback instruction includes the retained `intentIds` and directs the agent to `beech_intents({ intentIds })`.
- [ ] `beech-mcp-cli` remains without `agent:approve` scope (`sdk-parity.test.ts` continues to pass).
- [ ] All unit and integration tests in `packages/mcp` and `packages/cli` pass, and TypeScript builds succeed.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- Granting `agent:approve` to `beech-mcp-cli` or adding a CLI `beech approve` command that bypasses human OAuth/dashboard approval (violates `ROADMAP §4.5`).
- Modifying `apps/api/src/features/agent-intents/*` or `@beechcms/core` intent schemas/repositories (existing `GET /api/agent/intents/:id` already provides all required data).
- Modifying `apps/dashboard` UI.
