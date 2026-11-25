# Sprint Plan — AgentIntentsDashboard (`@beechcms/mcp` 2.0 Agent Control Plane, sprint 05b)

Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md`, §6 row 05b, §4.5 ("Fallback senza elicitation"), the
"Decisioni della pianificazione dello sprint 05" and "… 05b" notes under §3.
Feature brief: `stages/00_ideation/output/feature_brief.md` is empty on purpose; the ROADMAP is the source.
Previous sprints shipped (review PASS): **03 OperationCatalog**, **04 OAuthScopesV2**, **05 AgentIntents**
(`docs/Sprints/AgentIntents/`, committed as `975aaab2` on `feature/agent-intents`). This sprint builds on that branch.

---

### Pre-Computation Analysis

Graph refreshed with `graphify update .` (19 864 nodes, 47 105 edges) before mapping.

**a) God nodes on the path**

| Node | Source | Role here |
|------|--------|-----------|
| `SettingsDialog()` / `TabContent()` | `apps/dashboard/src/features/settings/components/settings-dialog.tsx:L59-77, L360` | Shell that composes every tab; `case "connected-apps"` renders `ConnectedAppsTab` (L63-64) through the `@/features/oauth-consent` barrel (L28). **Not edited.** |
| `ConnectedAppsTab()` | `apps/dashboard/src/features/oauth-consent/components/connected-apps-tab.tsx:L112` | Degree 18. **Edited**: renders the new pending-actions section above its existing section. |
| `SETTINGS_ENTRIES` | `apps/dashboard/src/features/settings/lib/settings-registry.ts:L81-146` | Sidebar + command palette source. **Edited**: `connected-apps` entry (L99-104) gains two bookmarks and keywords. |
| `describeActivity()` | `apps/dashboard/src/features/settings/lib/activity-presentation.ts:L92` | One function for every activity row. **Edited**: a `case "intent"`. |
| `rpc` / `AppType` | `apps/dashboard/src/lib/rpc.ts:L16`, `apps/api/src/routes.ts:L70` | `agentIntentsApp` is a single method chain (handler L32-139), so `rpc.api.agent.intents.*` is already typed. **Not edited.** |
| `agentIntentsApp` | `apps/api/src/features/agent-intents/agent-intents.handler.ts:L32` | The four routes this sprint consumes with the dashboard JWT. **Not edited.** |

**b) Architectural boundaries affected**

- `@beechcms/core` — **no edit** (`EntityType` already has `'intent'`, `activity-logger.ts:L32`).
- `apps/api` — **no edit**. Routes, permission rows (`permission.middleware.ts:L201-205`, all `AUTHED`), JWT approve and
  replay exist and are covered by `test/flow/flow-agent-intents.test.ts:L127` ("the dashboard JWT can approve…").
- `apps/dashboard`
  - slice `features/oauth-consent/`: `api/oauth.api.ts`, `hooks/use-oauth-consent.ts`, `types/oauth.types.ts`,
    `components/connected-apps-tab.tsx`, new `components/pending-agent-actions-section.tsx`, new
    `components/agent-intent-review-dialog.tsx`, tests.
  - slice `features/settings/`: `lib/settings-registry.ts`, `lib/activity-presentation.ts`, tests.
  - `locales/{en,it,de,fr,es}.json`.
- `docs/reference/mcp-server.md`, `docs/start/mcp.md` — say where the dashboard fallback lives.
- `packages/mcp`, `packages/cli`, `packages/api-client`: **no edit**.

**c) `graphify affected` impact analysis**

```
graphify affected "ConnectedAppsTab()" --depth 2
- renderTab() connected-apps-tab.test.tsx:L36; connected-apps-tab.structure.test.tsx:L21; connected-apps-tab.test.tsx:L9
- TabContent() / settings-dialog.tsx:L28,L64; oauth-consent/index.ts:L6 (re_export)
- SettingsDialog() settings-dialog.tsx:L360 → settings/index.ts:L5, settings-dialog-host.tsx:L7,
  settings-dialog.test.tsx:L8, App.tsx:L37
  → the two oauth-consent tab tests render the whole tab: they must mock the new list call (Task 7).
    settings-dialog.test.tsx renders the shell; check it still passes (it mocks tab contents or the api — run it).

graphify affected "describeActivity()" --depth 2
- ActivityRow() security-tab.tsx:L117 → ActivitySection() L177 → account-tab.tsx:L6, security-tab.test.tsx:L19
- activity-presentation.test.ts:L10
  → additive case; existing entity types unchanged.

graphify affected "SETTINGS_ENTRIES" --depth 1
- settings-registry.test.ts:L6 and the *.structure.test.tsx files of appearance/people/site/storage (they read the
  registry for their own tab only)
  → bookmarks added to `connected-apps` only; the "unique bookmarks" test (L23) must still pass.

graphify explain "agentIntentsApp" → degree 9; consumed only by routes.ts:L39. No edit.
graphify path "ConnectedAppsTab()" "describeActivity()" → no path: the two dashboard edits are independent.
```

Breaking-change result: **none**. API and core untouched; dashboard changes are additive UI, two bookmarks and
locale keys. The only existing tests that change are the two that render the whole Connected apps tab (new call to mock)
and the activity coverage test (one more entity).

**Facts established during research (the executor does not need to re-check these):**

1. Routes (all `AUTHED`, caller = `jwtPayload.sub`, so the dashboard JWT works): `GET /api/agent/intents` →
   `{ intents: AgentIntentView[] }` (pending, unexpired, newest first, max 50); `GET /api/agent/intents/:id` →
   `{ intent: AgentIntentDetailView }` (adds `body`: parsed JSON, raw text, or `null`); `POST …/:id/approve` →
   `{ intent, result: { status, body } }`, **200 even when the replay failed** (outcome in `result.status`);
   `POST …/:id/reject` → `{ intent }`. Errors are problem details with `type` ∈ `intent_not_found` (404),
   `intent_expired` (409), `intent_not_pending` (409). Shapes: `agent-intents.view.ts:L19-37`.
2. `rpc` exposes only 2xx types; every non-2xx throws `ApiError` (`lib/rpc.ts:L13-16`). `problemCode(error)`
   (`lib/http/api-error.ts:L51-55`) returns the last segment of `type`, so it yields `intent_expired` etc.
3. `hc` does not encode path params: wrap ids in `encodeURIComponent` (`oauth.api.ts:L34-35`).
4. Times are Unix **seconds**. `<RelativeTime value>` (`components/ui/relative-time.tsx:L31`) accepts seconds and
   renders future times ("in 8 minutes") with a tooltip.
5. `?settings=<tab>&section=<id>` scrolls to `settings-section-<id>` (`components/ui/settings-section-ids.ts:L5`,
   `hooks/use-settings-dialog.ts:L12-25`). `SettingsSection({ id, title, description, action, children })` is at
   `components/ui/settings-section.tsx:L31`. A tab made of several sections returns a fragment of them (pattern
   `account-tab.tsx`).
6. Activity rows written by sprint 05: gate `{ action: 'create', entityType: 'intent', details: { op: 'intent',
   operationId, risk, clientId } }` (`agent-intent-gate.middleware.ts:L134-139`); approve `{ action: 'authorize',
   details: { op: 'approve', operationId, resultStatus } }` (handler L94-99); reject `{ action: 'revoke', details:
   { op: 'reject', operationId } }` (L127-132). Tones already fit (`activity-presentation.ts:L22-27`): create default,
   authorize default, revoke destructive. Today they fall to the `default` branch and show the raw word `intent`.
7. `Badge` variants (`components/ui/badge.tsx:L11-21`): `destructive` = `bg-status-danger-soft
   text-status-danger-foreground`; `outline` = neutral. `StatusBadge` is for content/job status only (risk is not one).
8. Design system (`_config/design_system.html#rules`, `#lookup`): one filled primary Button per view; destructive
   action = `<Button variant="destructive">` inside a confirm surface; error text `text-status-danger-foreground`;
   metadata `text-xs text-muted-foreground`; row titles `font-medium`; no `font-semibold`, no raw colours.
   `font-mono` is already used in the dashboard (`automations/.../set-variable-form.tsx:L337`).
9. Locales: five files; `locales/locale-keys.test.ts` checks that every key used in production code exists in
   `en.json`; `locales.test.ts` checks the files agree. `oauth` block at `en.json:L2401` (`oauth.apps` L2463).
10. VSA in the dashboard: `settings` is the shell and may import other slices' barrels (it already imports
    `@/features/oauth-consent` and `@/features/rbac`); slices never import each other otherwise.

---

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

| Rule | Verdict | Evidence |
|------|---------|----------|
| 1. YAGNI | PASS (adjusted) | Every deliverable is on ROADMAP row 05b. Cut: **(a)** no new slice: intents are an OAuth-agent concern shown in the Connected apps tab, so they live in `oauth-consent` (a new slice would force a cross-slice import or a shell rewrite). **(b)** no new settings tab: a section inside Connected apps. **(c)** no unread badge/count in the sidebar or top bar. **(d)** no history of decided intents (the API lists only pending). **(e)** no API change. **(f)** polling only while the section is mounted (30 s), no push/WebSocket. |
| 2. Botanical invariant | PASS | No DB access; the dashboard calls the existing API only. Content changes made by an approval run through the server replay and the engine. |
| 3. VSA | PASS | New files stay in `features/oauth-consent/`; `features/settings` edits touch its own registry and presentation. Client names come from `useConnectedApps` in the same slice. No new cross-slice import (fact 10). |
| 4. Cloudflare purity | PASS | No backend change, no migration. |
| 5. Minimal blueprint | PASS | dashboard only: 2 components, 4 api methods, 4 hooks, 3 types, registry + presentation case, locale keys. |

**Deliberate divergence from the ROADMAP text:** the section is called "Pending agent actions" and lives under
**Settings → Connected apps** (bookmark `agent-actions`), not as its own page. Recorded in the ROADMAP note.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 05 made risky OAuth requests wait as intents, but the only way to approve one today is to call
`POST /api/agent/intents/:id/approve` by hand. Sprint 08 (`beech_confirm` with elicitation) needs a **fallback** for
clients without elicitation or when the dialog is auto-declined (ROADMAP §4.5): "open the dashboard and approve it
there". That fallback must exist, with a stable address, before 08 can point to it.

- **VSA:** all new UI sits in the `oauth-consent` slice, which already owns the agent's access (consent screen,
  Connected apps). The `settings` shell is untouched except for its own registry and activity presentation.
- **Botanical invariants:** nothing touches D1 or the engine; the server replays the stored request through the full
  stack (auth → scope → RBAC → gate), as shipped in 05.
- **Order:** needs 05's routes and RPC types (done); 08 needs the address
  `?settings=connected-apps&section=agent-actions` this sprint fixes.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

- **Settings composition:** `SettingsDialog` → `TabContent` switch (`settings-dialog.tsx:L59-77`). Tab and bookmarks
  come from `SETTINGS_ENTRIES` (`settings-registry.ts:L81`); `connected-apps` has `sections: []` (L99-104), so it has
  no sidebar bookmarks and its only `SettingsSection` id is `connected-apps` (`connected-apps-tab.tsx:L118`).
- **Connected apps tab** (`connected-apps-tab.tsx`): `SettingsSection` → loading `Skeleton`s → empty `<p>` → a
  `SettingsScroll` + `Table` with sticky header (L119-150); rows are `AppRow` (L43-106) with a ghost icon button and an
  `AlertDialog`; toasts through `sonner` (L51-54).
- **Data layer of the slice:** `oauthApi` object (`api/oauth.api.ts:L12-37`) over `rpc`; React Query hooks with a local
  key factory `OAUTH_QUERY_KEYS` (`hooks/use-oauth-consent.ts:L8-12`), mutation + invalidate pattern L38-44; types
  inferred from `rpc` with `InferResponseType` (`types/oauth.types.ts:L5-15`).
- **Activity log:** `describeActivity` (`activity-presentation.ts:L92-183`) switches on `entity_type`; `'intent'` has no
  case and no `settings.activity.entities.intent` key, so a row shows "Created · intent".
- **API (unchanged):** `apiProtected` order `authMiddleware` → `oauthScopeMiddleware` → `permissionMiddleware` →
  `agentIntentGate` → routes (`apps/api/src/factory.ts`). JWT requests skip the scope gate and never create intents;
  JWT approve replays as the intent's OAuth client (sprint 05 Task 13 step 4).
- **Docs:** `docs/reference/mcp-server.md:L358` says approval can happen "from the dashboard" without saying where;
  `docs/start/mcp.md:L113` names Settings → Connected apps for revocation only.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Created (BUSL headers):
- `apps/dashboard/src/features/oauth-consent/components/pending-agent-actions-section.tsx`
- `apps/dashboard/src/features/oauth-consent/components/agent-intent-review-dialog.tsx`
- `apps/dashboard/src/features/oauth-consent/components/pending-agent-actions-section.test.tsx`
- `apps/dashboard/src/features/oauth-consent/components/agent-intent-review-dialog.test.tsx`

Modified:
- `apps/dashboard/src/features/oauth-consent/api/oauth.api.ts` (+4 methods) and `api/oauth.api.test.ts`
- `apps/dashboard/src/features/oauth-consent/hooks/use-oauth-consent.ts` (+4 hooks, +2 keys)
- `apps/dashboard/src/features/oauth-consent/types/oauth.types.ts` (+3 types)
- `apps/dashboard/src/features/oauth-consent/components/connected-apps-tab.tsx` (two sections)
- `apps/dashboard/src/features/oauth-consent/components/connected-apps-tab.test.tsx`,
  `connected-apps-tab.structure.test.tsx` (mock the new list; structure of two sections)
- `apps/dashboard/src/features/settings/lib/settings-registry.ts` and `settings-registry.test.ts`
- `apps/dashboard/src/features/settings/lib/activity-presentation.ts` and `activity-presentation.test.ts`
- `apps/dashboard/src/locales/{en,it,de,fr,es}.json`
- `docs/reference/mcp-server.md`, `docs/start/mcp.md`
- `stages/01_sprint_planning/output/backlog/ROADMAP.md` (already updated by this planning run: header, rows 05/05b,
  05b note under §3)

Explicitly excluded: any file under `apps/api`, `packages/*`; `settings-dialog.tsx`; `oauth-consent/index.ts` (the
barrel keeps exporting only `ConsentPage`, `ConnectedAppsTab` and types).

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — Types (`features/oauth-consent/types/oauth.types.ts`)

Append, inferred from `rpc` like `ConnectedApp` (L15); no hand-written DTO:

```ts
/** One row of `GET /api/agent/intents`. Times are Unix seconds. */
export type AgentIntent = InferResponseType<typeof rpc.api.agent.intents.$get>['intents'][number]

/** `GET /api/agent/intents/:id`: the row plus the stored request body (JSON, raw text, or null). */
export type AgentIntentDetail = InferResponseType<(typeof rpc.api.agent.intents)[':id']['$get']>['intent']

/** `POST /api/agent/intents/:id/approve`: the decided intent and the replay outcome. */
export type AgentIntentApproval = InferResponseType<(typeof rpc.api.agent.intents)[':id']['approve']['$post']>
```

If TypeScript resolves the indexed access differently, keep the exported names and meaning; fix the expression.

### Task 2 — API methods (`features/oauth-consent/api/oauth.api.ts`)

Add to `oauthApi` (same object: one slice, one client), each over `rpc.api.agent.intents`, ids through
`encodeURIComponent` (fact 3):

```ts
listAgentIntents: () => Promise<AgentIntent[]>                       // GET  /api/agent/intents → body.intents
getAgentIntent: (id: string) => Promise<AgentIntentDetail>           // GET  /api/agent/intents/:id → body.intent
approveAgentIntent: (id: string) => Promise<AgentIntentApproval>     // POST /api/agent/intents/:id/approve, no body
rejectAgentIntent: (id: string) => Promise<AgentIntent>              // POST /api/agent/intents/:id/reject → body.intent
```

Errors are not caught here: `ApiError` propagates (fact 2).

### Task 3 — Hooks (`features/oauth-consent/hooks/use-oauth-consent.ts`)

Keys appended to `OAUTH_QUERY_KEYS` (L8-12): `agentIntents: () => [...all, 'agent-intents']` and
`agentIntent: (id: string) => [...all, 'agent-intents', id]`.

```ts
/** Poll interval of the pending list while the section is on screen. Intents live 10 minutes. */
export const AGENT_INTENTS_REFETCH_MS = 30_000

export function usePendingAgentIntents(): UseQueryResult<AgentIntent[]>
export function useAgentIntent(id: string | null): UseQueryResult<AgentIntentDetail>
export function useApproveAgentIntent(): UseMutationResult<AgentIntentApproval, Error, string>
export function useRejectAgentIntent(): UseMutationResult<AgentIntent, Error, string>
```

Rules:
- `usePendingAgentIntents`: `staleTime: 0`, `refetchInterval: AGENT_INTENTS_REFETCH_MS` (React Query stops it when
  unmounted), default focus refetch kept.
- `useAgentIntent`: `enabled: id !== null`, `staleTime: 0`, `retry: false` (a 404 must show at once).
- Both mutations, `onSettled` (success **and** error): invalidate `agentIntents()` — any outcome (run, expired,
  already decided, gone) changes the list.
- `useApproveAgentIntent`, `onSuccess` when `result.status < 400`: also `qc.invalidateQueries()` with no key — the
  replayed request may have changed any domain (content, seeds, users) the open pages show. Reason: one line, and the
  operation is not known to the client.
- No optimistic update: the server decides.

### Task 4 — Pending actions section (`components/pending-agent-actions-section.tsx`, new)

```ts
/** "Pending agent actions": the caller's waiting intents, each opening the review dialog. No props. */
export function PendingAgentActionsSection(): JSX.Element
```

Copy the shape of `ConnectedAppsTab` (`connected-apps-tab.tsx:L112-153`): `SettingsSection` with
`id="agent-actions"`, title `oauth.intents.title`, description `oauth.intents.description`; loading = three
`Skeleton` rows with a `role="status"` + sr-only `common.loading`; empty = the same bordered `<p>` with
`oauth.intents.empty`; otherwise `SettingsScroll` (label `oauth.intents.list.label`, `SETTINGS_TABLE_ROW_REM`,
`SETTINGS_TABLE_HEAD_REM`) + `Table` (`containerClassName="overflow-visible"`, same `aria-label`) + sticky header copied
from L130. A failed list query shows `oauth.intents.loadError` in `text-sm text-status-danger-foreground` in place of
the table.

Columns (`TableHead` keys `oauth.intents.columns.*`): **action**, **app**, **risk**, **expires**, and the actions
column reusing `content.actions.label` (as L136).
- action: `summary` in `font-medium`, truncated with `title`; under it `{method} {path}` in
  `text-xs text-muted-foreground font-mono`, truncated with `title`.
- app: the connected app's `name` from `useConnectedApps()` matched on `clientId`; falls back to the raw `clientId`
  while loading or when unknown. `text-muted-foreground`.
- risk: `<Badge variant="destructive">` + `oauth.intents.risk.destructive` for `destructive`; `<Badge variant="outline">`
  + `oauth.intents.risk.publish` for `publish`. Never `StatusBadge` (fact 7).
- expires: `<RelativeTime value={intent.expiresAt} />`.
- actions: one `<Button variant="outline" size="sm">` labelled `oauth.intents.review`, `aria-label`
  `oauth.intents.reviewFor` with `{ action: summary }`. No filled button anywhere in the tab (design rule 2).

Row class `SETTINGS_TABLE_ROW_CLASS`. Clicking Review sets local state `reviewingId`; one
`<AgentIntentReviewDialog>` instance is rendered by the section with `intentId={reviewingId}` and the row's app name.

### Task 5 — Review dialog (`components/agent-intent-review-dialog.tsx`, new)

```ts
export interface AgentIntentReviewDialogProps {
  /** Intent to review; `null` keeps the dialog closed. */
  readonly intentId: string | null
  /** Display name of the OAuth client that asked (already resolved by the section). */
  readonly appName: string
  readonly onOpenChange: (open: boolean) => void
}
export function AgentIntentReviewDialog(props: AgentIntentReviewDialogProps): JSX.Element
```

Built on `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter`
(`components/ui/dialog.tsx:L161`), `open={intentId !== null}`. Data from `useAgentIntent(intentId)`.

Content, top to bottom:
- Title: the intent `summary`. Description: `oauth.intents.dialog.description` with `{ app: appName }`
  ("{{app}} asked to run this action. It runs once, as you, only if you approve it.").
- Facts, as label/value rows in `text-sm` (labels `text-muted-foreground`): `oauth.intents.dialog.request` →
  `{method} {path}` in `font-mono`; `oauth.intents.columns.risk` → the same badge as Task 4; `oauth.intents.dialog.requestedAt`
  → `RelativeTime createdAt`; `oauth.intents.columns.expires` → `RelativeTime expiresAt`.
- Body preview, heading `oauth.intents.dialog.body`: `body === null` → `oauth.intents.dialog.noBody` in
  `text-muted-foreground`; string → shown as is; anything else → `JSON.stringify(body, null, 2)`. Rendered in a `<pre>`
  with `max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs font-mono whitespace-pre-wrap break-all`. Text only:
  never `dangerouslySetInnerHTML`.
- Loading: `Skeleton` blocks; detail error: `problemCode === 'intent_not_found'` → `oauth.intents.toast.notFound` text,
  else `oauth.intents.dialog.loadError`, both `text-sm text-status-danger-foreground`; buttons disabled.

Footer: `<Button variant="outline">` `oauth.intents.reject`; approve button `oauth.intents.approve`, variant
`destructive` when `risk === 'destructive'`, else `default` (the dialog is its own view: one filled button). Both
disabled while either mutation is pending or the detail is not loaded; the clicked one shows `Loader` (as L89).

Outcomes (toasts via `sonner`; after every outcome except a network/unknown error the dialog closes through
`onOpenChange(false)`):

| Outcome | Toast |
|---|---|
| approve 200, `result.status < 400` | `toast.success(oauth.intents.toast.executed)` |
| approve 200, `result.status >= 400` | `toast.error(oauth.intents.toast.failed, { status })` |
| reject 200 | `toast.success(oauth.intents.toast.rejected)` |
| `problemCode` `intent_expired` | `toast.error(oauth.intents.toast.expired)` |
| `problemCode` `intent_not_pending` | `toast.error(oauth.intents.toast.notPending)` |
| `problemCode` `intent_not_found` | `toast.error(oauth.intents.toast.notFound)` |
| anything else | `toast.error(oauth.intents.toast.error)`, dialog stays open |

The approve click is the confirmation: no second `ConfirmDialog` on top.

### Task 6 — Tab composition (`components/connected-apps-tab.tsx`)

`ConnectedAppsTab` returns a fragment: `<PendingAgentActionsSection />` first (it is what needs attention), then the
existing `SettingsSection id="connected-apps"` unchanged. Update the docblock (L108-111) to describe both sections.
No change to `AppRow`, the barrel or `settings-dialog.tsx`.

### Task 7 — Registry and activity (`features/settings`)

- `settings-registry.ts` L99-104, `connected-apps` entry: `sections: [section("agent-actions",
  "settings.sections.agentActions", "Pending agent actions"), section("connected-apps", "settings.sections.connectedApps",
  "Connected apps")]` in page order; append keywords `"agente", "agent", "azioni", "approva", "approve", "conferma",
  "confirm", "intent"`. Stable address for sprint 08: **`?settings=connected-apps&section=agent-actions`**.
- `activity-presentation.ts`: new `case "intent"` next to `case "app"` (L158): `title` = `text(details.operationId)`
  ?? `entry.entity_id`; `detail` = `join([entityLabel, opLabel, resultStatus])` where `resultStatus` is
  `t("settings.activity.detail.resultStatus", { status })` only when `details.resultStatus` is a number. `TONES`
  unchanged (fact 6).

### Task 8 — Locales (all five; `en` verbatim below, `it` written with care, `de/fr/es` translated)

Under `oauth.intents` (new block after `oauth.apps`, `en.json:L2463`):

| Key | en |
|---|---|
| `title` / `list.label` | Pending agent actions |
| `description` | Actions an AI agent asked to run on your behalf. Nothing runs until you approve it; a request expires 10 minutes after it was made. |
| `empty` | No actions are waiting for you |
| `loadError` | Could not load the pending actions |
| `columns.action` / `columns.app` / `columns.risk` / `columns.expires` | Action / Application / Risk / Expires |
| `risk.publish` / `risk.destructive` | Publishes / Destructive |
| `review` / `reviewFor` | Review / Review {{action}} |
| `approve` / `reject` | Approve and run / Reject |
| `dialog.description` | {{app}} asked to run this action. It runs once, as you, only if you approve it. |
| `dialog.request` / `dialog.requestedAt` / `dialog.body` / `dialog.noBody` / `dialog.loadError` | Request / Requested / Request body / No request body / Could not load this request |
| `toast.executed` | Action approved and run |
| `toast.failed` | The action ran but failed (HTTP {{status}}) |
| `toast.rejected` | Action rejected |
| `toast.expired` | This request has expired. Ask the agent to try again. |
| `toast.notPending` | This request was already approved or rejected. |
| `toast.notFound` | This request no longer exists. |
| `toast.error` | Could not complete the action |

Elsewhere: `settings.sections.agentActions` "Pending agent actions", `settings.sections.connectedApps` "Connected apps";
`settings.activity.entities.intent` "Agent action"; `settings.activity.ops.intent` "Requested by an agent",
`ops.approve` "Approved", `ops.reject` "Rejected"; `settings.activity.detail.resultStatus` "Result: HTTP {{status}}".
`it`: "Azioni dell'agente in attesa", "Approva ed esegui", "Rifiuta", "Azione dell'agente", "Richiesta da un agente".

### Task 9 — Docs

- `docs/reference/mcp-server.md:L358`: "or from the dashboard" → "or from the dashboard (**Settings → Connected apps →
  Pending agent actions**, `?settings=connected-apps&section=agent-actions`)".
- `docs/start/mcp.md` near L113: one sentence: an action the agent may not run on its own waits under **Settings →
  Connected apps → Pending agent actions**, where you can review its request body and approve or reject it within
  10 minutes.
- Do not edit `docs/api/**` or `docs/Sprints/**`.

### Task 10 — Tests (behaviour lists; bodies follow `_config/testing_conventions.md`, double quotes)

All dashboard **unit** tier, next to the source. Fixtures: literal `AgentIntent`/`AgentIntentDetail` objects typed
with the Task 1 types, fixed seconds (`1_700_000_000`), never `Date.now()`. Mock only the boundary: `../api/oauth.api`
(component tests) or global `fetch` (api test), plus `sonner`. `beforeEach(() => vi.clearAllMocks())`.

**`api/oauth.api.test.ts`** (node env, existing `fetchMock` pattern L14-24) — add:
- `it("listAgentIntents calls GET /api/agent/intents and returns the intents array")`
- `it("getAgentIntent encodes the id in the path and returns the intent")` — id `a/b` → `/api/agent/intents/a%2Fb`.
- `it("approveAgentIntent posts to …/approve and returns intent and result")`
- `it("rejectAgentIntent posts to …/reject and returns the intent")`
- `it("a 409 intent_expired rejects with an ApiError whose problem code is intent_expired")`

**`components/pending-agent-actions-section.test.tsx`** (jsdom, real `QueryClient` with `retry: false`, pattern
`connected-apps-tab.test.tsx:L31-40`):
- `it("shows the empty message when no action is waiting")`
- `it("lists each intent with its summary, method and path, risk badge and the app name of its client")`
- `it("falls back to the client id when the client is not among the connected apps")`
- `it("marks a destructive intent with the destructive badge and a publish intent with the outline badge")`
- `it("shows the load error when the list request fails")`
- `it("Review opens the dialog for that intent")` — dialog title = summary; `getAgentIntent` called with its id.

**`components/agent-intent-review-dialog.test.tsx`** (jsdom, real `QueryClient`):
- `it("shows the request line and the stored body as indented JSON")`
- `it("says there is no request body when the body is null")`
- `it("uses the destructive variant for approving a destructive intent and the default variant for a publish one")` —
  `data-variant` attribute.
- `it("approving an intent that ran shows the success toast, closes, and refetches the list")`
- `it("approving an intent whose replay failed shows the failure toast with the HTTP status")`
- `it("rejecting calls rejectAgentIntent and shows the rejected toast")`
- `it("an expired intent shows the expired toast and refetches the list")` — approve rejects with
  `new ApiError(409, { type: "intent_expired" })`.
- `it("an intent already decided shows the already-decided toast")` — `intent_not_pending`.
- `it("a network error keeps the dialog open with the generic error toast")`
- `it("buttons are disabled while the detail is loading")`

**`components/connected-apps-tab.test.tsx`**: add `listAgentIntents: () => Promise.resolve([])` (and the other three
as `vi.fn()`) to the `oauthApi` mock (L14-19); existing `it()`s unchanged. Add
`it("renders the pending agent actions section above the connected apps")`.

**`components/connected-apps-tab.structure.test.tsx`**: add `usePendingAgentIntents`, `useAgentIntent`,
`useApproveAgentIntent`, `useRejectAgentIntent` to the hook mock (L15-18). Add
`it("is two titled sections, pending actions first, each with the id its bookmark scrolls to")` —
`settings-section-agent-actions` then `settings-section-connected-apps`.

**`features/settings/lib/settings-registry.test.ts`**: add
`it("Connected apps bookmarks pending agent actions, then the apps, for every caller")`.

**`features/settings/lib/activity-presentation.test.ts`**: add `"intent"` to the entities array of the coverage test
(L91); add `it("names an agent action by its operation, says what happened to it and, once run, its result")` —
create (`op: "intent"`) → title `seeds.delete`, detail `Agent action · Requested by an agent`; approve with
`resultStatus: 200` → detail ends `Result: HTTP 200`; reject → `Rejected`, no result.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
pnpm --filter @beechcms/core build            # dashboard resolves core (and api types) through dist
pnpm --filter @beechcms/dashboard type-check
pnpm --filter @beechcms/dashboard test:unit
node scripts/check-design-tokens.mjs --format agent \
  apps/dashboard/src/features/oauth-consent/components/pending-agent-actions-section.tsx \
  apps/dashboard/src/features/oauth-consent/components/agent-intent-review-dialog.tsx \
  apps/dashboard/src/features/oauth-consent/components/connected-apps-tab.tsx
pnpm --filter @beechcms/api exec vitest run --project flow flow-agent-intents.test.ts   # API contract the UI relies on, unchanged
pnpm beech lint
pnpm beech test --diff
```

Manual smoke (recommended, not blocking): `pnpm beech dev`, create an intent with an OAuth token (a `destructive`
request such as `DELETE /api/seeds/:slug` sent with the `beech-mcp-cli` token), open `?settings=connected-apps&section=agent-actions`, review,
approve; then repeat and reject. Record what was or was not run in the execution log.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] Settings → Connected apps shows "Pending agent actions" above "Connected apps"; both are sidebar bookmarks and
      `?settings=connected-apps&section=agent-actions` scrolls to the first.
- [ ] Each pending intent shows summary, method + path, app name (or client id), risk badge and relative expiry.
- [ ] Review shows the stored request body (JSON indented, raw text as is, "No request body" for null) as text only.
- [ ] Approve and Reject call the existing endpoints with the dashboard JWT; every outcome in the Task 5 table shows
      its toast; list refetched after every outcome; a successful run invalidates all queries.
- [ ] Destructive approve uses `variant="destructive"`; no filled primary button in the tab; risk never shown with
      `StatusBadge`; `check-design-tokens` clean on the three components.
- [ ] Activity rows for `entity_type: 'intent'` read "Agent action" with operation id, op label and result status.
- [ ] All new keys in the five locales; `locale-keys.test.ts` and `locales.test.ts` pass.
- [ ] Types inferred from `rpc` only; no `any`; no hand-written DTO of the intent shape.
- [ ] No file changed under `apps/api`, `packages/*`; no new cross-slice import in the dashboard.
- [ ] Every Section 5 command exits 0.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- `beech_confirm`, `beech_intents`, elicitation, and the MCP instruction that points to this page →
  **ROADMAP sprint 08 (Mcp2)**; it uses the address fixed here.
- Any API change: history of decided intents, richer per-operation summaries, try/catch around the dispatcher
  (review note of sprint 05) → not planned; raise in a future sprint if needed.
- Unread count or badge for pending intents in the sidebar, top bar or notifications → not planned (YAGNI).
- Push updates (WebSocket/SSE) → not planned; 30 s polling while mounted.
- SDK `IntentPending` handling → **ROADMAP sprint 06 (ScriptSdk)**; `beech run` output of pending intents →
  **sprint 07 (BeechRun)**.
- User docs beyond the two sentences in Task 9 → **ROADMAP sprint 09 (DocsEvals)**.
