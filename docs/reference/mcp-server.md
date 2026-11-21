---
title: MCP Server (@beechcms/mcp)
group: Official SDKs
category: MCP Server
---

# MCP Server (`@beechcms/mcp`)

`@beechcms/mcp` is the official **Model Context Protocol (MCP)** server for BeechCMS and the stdio half of its **AI Control Plane**. Version 2.0 adds three things to the schema tools of 1.x: **session and discovery tools** (`beech_whoami`, `beech_search`) that tell an agent who it acts as and which operations exist, **approval tools** (`beech_intents`, `beech_confirm`) that put a human in front of risky actions, and a **script-first workflow**: an agent's bulk work runs as TypeScript scripts through `beech run`, not as one tool call per record.

For the task-oriented walkthrough, read [Working with an Agent Locally](/build/local-agent). This page is the reference.

---

## Architecture

```text
Agent ──write──► .beech/scripts/<name>.ts ──► beech run ──(OAuth, scripts client)──► BeechCMS API
  │                                                                                  auth → scope → RBAC → intent gate
  │                                                                                          │
  │                                                                       risky call ────────┴──► pending intent (202)
  │                                                                                                    │
  └──(stdio JSON-RPC)──► @beechcms/mcp ──beech_confirm──► human dialog ──approve──► server replays the stored request once
                              │
                              └──(OAuth, MCP client)──► BeechCMS API (schema tools, session, intents)
```

The agent reads the catalog with `beech_search`, writes a script, and runs it with `beech run`. A request the intent gate classifies as risky does not run: the API stores it as an **intent** and answers `202`. The agent calls `beech_confirm`; the human decides in one dialog; the server replays the stored request as its owner.

### 1. Botanical Dialect Invariant
The MCP server never accesses Cloudflare D1, SQLite, or Wrangler directly. It contains zero database driver dependencies. All operations are performed exclusively over authenticated HTTP requests to the BeechCMS Admin API. Handlers delegate all DDL planning and execution to the `@beechcms/core` Botanical Engine.

### 2. Physical-State DDL Planning
Database migration statements cannot be planned accurately from abstract schema definitions alone. The API inspects the **physical columns** of the SQLite table (`PRAGMA table_info(content_{slug})`) to determine the exact DDL statements required (`ALTER TABLE ... ADD COLUMN`, junction tables, index creation).

### 3. Compare-and-Swap (OCC) Atomicity
To prevent race conditions between concurrent agents or dashboard administrators, schema mutations are guarded by **Optimistic Concurrency Control (OCC)**. Every plan records an `expectedVersion`. When applying, the API executes a single atomic SQLite batch (`db.batch()`) containing a compare-and-swap guard against `seed_meta.registry_version`. If another writer modified the schema in the interim, the guard trips, rolls back the entire batch, and returns `409 Conflict`.

### 4. Strictly Additive Safety Gate
The MCP apply endpoint (`mcp-apply`) is **strictly additive**. Any candidate schema that omits existing branch IDs, renames aliases, alters field data types, or changes an existing relation's `multiple`, `targetSeed`, or effective `onDelete` rule is detected as destructive intent and rejected with HTTP `422`. Relation storage or FK policy changes require a separate data migration; the plan reports them as blocked and emits no DDL.

### 5. Human approval for risky calls
With an OAuth token, a risky request (always for `destructive`, and for `publish` in `production`) is **not executed**. The API stores it as an intent, answers `202`, and runs it exactly once, server-side, after a human approves it through `beech_confirm` or the dashboard. An intent expires after 10 minutes. See [Approval Lifecycle](#approval-lifecycle-beech-confirm) and [Permission Model](#permission-model-known-limitations).

---

## Installation

**Site project (recommended).** From the root of a project that uses BeechCMS:

```bash
npx beech agent setup
```

This writes the `beechcms` entry of `.mcp.json` (`npx -y @beechcms/mcp`), the agent skill `.claude/skills/beechcms-scripts/SKILL.md`, `.beech/scripts/README.md` and an example script `latest-entries.ts`, and adds `@beechcms/cli` to `devDependencies`. See [Working with an Agent Locally](/build/local-agent#setup).

**Monorepo contributor.** `@beechcms/mcp` is a Node.js ESM package located in `packages/mcp`:

```bash
# Build the bundle (dist/index.js)
pnpm --filter @beechcms/mcp build
```

This type-checks the source, regenerates the bundled doc resources, and bundles a Node ESM entry point via `esbuild` to `packages/mcp/dist/index.js`. The bundle is built with `--packages=external`, so dependencies (`@modelcontextprotocol/sdk`, `@beechcms/core`) are **not** inlined: `node_modules` must remain installed for `node dist/index.js` to run.

---

## Client Configuration

Configure your MCP client (Claude Code, Claude Desktop, Cursor, Antigravity) to launch the server over `stdio`.

### Site project (`.mcp.json`, written by `beech agent setup`)

```json
{
  "mcpServers": {
    "beechcms": {
      "command": "npx",
      "args": ["-y", "@beechcms/mcp"],
      "env": {
        "BEECH_API_URL": "http://localhost:8789"
      }
    }
  }
}
```

### Monorepo checkout (`.mcp.json` or `claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "beechcms": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp/dist/index.js"],
      "env": {
        "BEECH_API_URL": "http://127.0.0.1:8789",
        "BEECH_AUTH_URL": "http://localhost:5173"
      }
    }
  }
}
```

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `BEECH_API_URL` | No | `http://localhost:8789` | Target BeechCMS API origin (token endpoint + REST API). Matches the port `beech dev` runs Wrangler on. If unset and `.dev.vars` exists in `process.cwd()`, the server extracts `BEECH_API_URL` from that file. |
| `BEECH_AUTH_URL` | No | `BEECH_API_URL` | Origin the *browser* opens for `/oauth/authorize`. In local dev this must be the **dashboard** origin (`http://localhost:5173`), since the Worker does not serve the consent screen. |
| `BEECH_OAUTH_CLIENT_ID` | No | `beech-mcp` | Must match the OAuth client seeded in D1 (`apps/api/migrations/0000_v040_base.sql`). |
| `BEECH_OAUTH_SCOPE` | No | `schema:read schema:write settings:read agent:read agent:approve` | Scopes requested at consent. Narrowing it disables the tools that need the dropped scope: without `agent:approve`, `beech_confirm` can only fall back to the dashboard. |
| `BEECH_OAUTH_TIMEOUT_MS` | No | `180000` | Browser round-trip budget, in milliseconds. |
| `BEECH_TOKEN_CACHE` | No | `~/.beechcms/mcp-tokens.json` | Token cache path override (tests, containers). |

> [!NOTE]
> The server authenticates with the **OAuth 2.1 authorization-code flow with PKCE** (RFC 7636, no client secret) — there is no password-based configuration. On first use it starts a loopback listener and opens your system browser at `/oauth/authorize`; after login and consent, it exchanges the code against `POST /oauth/token` for an access token plus refresh token, cached at `~/.beechcms/mcp-tokens.json` (file mode `0600`, directory mode `0700`). Subsequent calls reuse the cached grant and refresh it transparently; a `401` triggers a single silent refresh-and-retry before failing. Revoke access from **Settings → Connected apps** in the dashboard.

Watch mode (supervisor restart on rebuild) is on in development; pass `--no-watch` or run with `NODE_ENV=production` to turn it off.

---

## OAuth Clients and Scopes

Two OAuth clients take part in the control plane. Each triggers its own browser consent.

| Client id | Used by | Requested scopes | Can approve intents |
|---|---|---|---|
| `beech-mcp` | This MCP server | `schema:read schema:write settings:read agent:read agent:approve` | **Yes**: the only client granted `agent:approve` |
| `beech-mcp-cli` | `beech run` and the script SDK | Every scope except `agent:approve`: `schema:read schema:write content:read content:write content:delete media:read media:write automations:read automations:write users:read users:write settings:read settings:write analytics:read agent:read` | **Never** |

The consent is **partial**: each requested scope is granted only if the account holds the authority behind it, and the rest are listed as `deniedScopes`. See [Permission Model](#permission-model-known-limitations).

### Upgrading from 1.x

A grant cached by a 1.x server lacks `agent:read`. On start, 2.0 drops that grant once and prints one line on stderr:

```text
BeechCMS MCP 2.0 needs new permissions: your browser opens for consent on the next call.
```

The next tool call opens the browser for **one new consent** with the 2.0 scopes. The schema tools behave as before. A `planId` still lives in the memory of the running server process: restarting the server discards open plans.

---

## Tools Reference

The server registers 13 tools prefixed with `beech_`:

| Tool | Annotation | Purpose |
|---|---|---|
| `beech_whoami` | read-only | Who the agent acts as, its permissions, scopes, `ENV` and approval policy |
| `beech_search` | read-only | Search the operation catalog and docs; returns the SDK method for each operation |
| `beech_docs_search` | read-only | Full-text search over the bundled `beechcms-docs://` resources |
| `beech_intents` | read-only | List your pending intents |
| `beech_confirm` | destructive | Ask the human to approve or reject pending intents in one dialog |
| `beech_list_seeds` | read-only | List seed summaries and the schema version |
| `beech_get_seed` | read-only | Fetch one seed definition |
| `beech_schema_export` | read-only | Export the full schema registry |
| `beech_schema_validate` | read-only | Validate a candidate seed offline |
| `beech_schema_plan` | read-only | Compute DDL and safety classification on the server |
| `beech_schema_apply` | additive write | Apply a planned, additive change |
| `beech_mcp_status` | read-only | Inspect the running server |
| `beech_mcp_reload` | read-only | Refresh bundled resources and notify the client |

`beech_confirm` is the only tool annotated `destructiveHint: true`, because approved intents can delete data. `beech_schema_apply` is annotated as a non-destructive write: it is additive by construction.

### Session and discovery

#### `beech_whoami`

Reports who the agent acts as and what the server enforces for it. Call it once at the start of a task.

- **Parameters**: None (`{}`)
- **Transport**: `GET /api/agent/session` and `GET /api/settings/me`
- **Returns**:
  ```json
  {
    "user": { "id": "usr_admin_01", "email": "admin@example.com", "name": "Ada", "surname": "Admin" },
    "permissions": { "global": ["manage_seeds"], "byScope": { "posts": ["read", "create", "update"] } },
    "environment": "development",
    "confirmation": { "publish": false, "destructive": true },
    "schemaVersion": 12,
    "mcp": { "clientId": "beech-mcp", "scopes": ["schema:read", "schema:write", "settings:read", "agent:read", "agent:approve"] },
    "scripts": { "clientId": "beech-mcp-cli", "scopes": ["content:read", "content:write", "agent:read"] },
    "apiUrl": "http://localhost:8789",
    "pendingActionsUrl": "http://localhost:5173/admin/?settings=connected-apps&section=agent-actions"
  }
  ```
- `mcp` and `scripts` are the scope lists of the two OAuth clients. `scripts.scopes` is `null` until `beech run` has been authorized once.
- **Errors**: a `403 insufficient_scope` names the missing scope (for example `settings:read`).

#### `beech_search`

Searches the operation catalog and the bundled docs, so an agent writes scripts against real operations instead of guessing endpoints.

- **Parameters**:
  - `query` (string, required): free text, split on whitespace, dots, slashes, underscores, colons and dashes. A hit needs at least one token (OR), ordered by score then operation id, so results are deterministic.
  - `detail` (`name` | `signature` | `full`, optional): defaults to `signature`.
  - `limit` (number, optional): defaults to `10`, maximum `50`.
- **Transport**: In-process search over the operation catalog and the bundled resources.
- **Returns**: `{ query, detail, scriptScopesKnown, operations[], docs[] }`. `docs` holds up to 3 hits (`uri`, `title`, `snippet`). Each operation carries:
  - `name`: `id`, `summary`.
  - `signature` adds `method`, `path`, `scope`, `risk` (`read`, `write`, `publish`, `destructive` or `request-dependent`), `approval` (`never`, `in-production`, `always` or `depends-on-request`), `sdk` (`beech.<id>`) and, when `sdk` is `null`, a `note`.
  - `full` adds `pathParams` and `docs` (a `beechcms-docs://reference/<file>` URI or `null`).
  ```json
  {
    "query": "purge posts",
    "detail": "signature",
    "scriptScopesKnown": true,
    "operations": [
      {
        "id": "content.delete",
        "summary": "Trash an entry, or purge it with purge=true",
        "method": "DELETE",
        "path": "/api/content/:slug/:id",
        "scope": "content:delete",
        "risk": "request-dependent",
        "approval": "depends-on-request",
        "sdk": "beech.content.delete"
      }
    ],
    "docs": [
      { "uri": "beechcms-docs://reference/internal-content.md", "title": "Content API", "snippet": "…purge=true…" }
    ]
  }
  ```
- **Filtering**: operations the catalog marks `excluded` (password, sessions, profile, secret rotation, direct seed writes, user creation) are never returned. When the `beech-mcp-cli` grant is cached, only operations inside its scopes are returned. The tool does **not** filter by per-seed RBAC: the server still enforces it, and `beech_whoami` shows it.
- `intents.approve` and `media.upload` have `sdk: null`: scripts never approve (call `beech_confirm`), and uploads go through the SDK helper `beech.media.uploadFile`.
- **Errors**: an empty `query` or an unknown `detail` returns an `isError` result.

#### `beech_docs_search`

Full-text search over the bundled `beechcms-docs://` resources (API reference, field types, branch policies, guides). Cheaper than listing every resource and guessing a URI when the agent is unsure about a field type, policy, or workflow.

- **Parameters**:
  - `query` (string, required): Search terms. Tokenized on whitespace; a document must match **every** token (in its title, description, or body) to be returned.
  - `limit` (number, optional): Maximum results. Defaults to `10`.
- **Transport**: In-process search over the bundled resource manifest.
- **Returns**:
  ```json
  {
    "query": "richtext policies",
    "results": [
      {
        "uri": "beechcms-docs://build/field-policies.md",
        "title": "Field Policies",
        "description": "Per-branch policy flags and ALE encryption.",
        "score": 122,
        "snippet": "…policies: { search: true, encrypted: true }…"
      }
    ]
  }
  ```

### Approval

#### `beech_intents`

Lists your pending intents: actions a script or agent requested that wait for human approval.

- **Parameters**: None (`{}`)
- **Transport**: `GET /api/agent/intents`
- **Returns**: `{ intents, pendingActionsUrl }`. Each intent has `id`, `operationId`, `risk` (`publish` or `destructive`), `summary`, `expiresAt` (Unix seconds) and `expiresInSeconds`.
- **Errors**: `401`, `403` (token without `agent:read`).

#### `beech_confirm`

Asks the human to approve or reject pending intents in one dialog. See [Approval Lifecycle](#approval-lifecycle-beech-confirm).

- **Parameters**:
  - `intentIds` (string[], required): 1 to 20 intent ids. Duplicates are collapsed.
- **Transport**: `GET /api/agent/intents/:id`, then `POST /api/agent/intents/:id/approve` or `/reject`.
- **Returns**: `{ status, decision, results, pendingActionsUrl, instruction, reason }`.
  ```json
  {
    "status": "decided",
    "decision": "approve",
    "results": [
      {
        "id": "3f2b8c1e-5a47-4d0e-9b6a-1c2d3e4f5a6b",
        "outcome": "executed",
        "operationId": "content.delete",
        "summary": "Trash an entry, or purge it with purge=true: DELETE /api/content/posts/9d1c…",
        "resultStatus": 200,
        "resultBody": { "success": true, "softDeleted": false },
        "message": null
      }
    ],
    "pendingActionsUrl": "http://localhost:5173/admin/?settings=connected-apps&section=agent-actions",
    "instruction": null,
    "reason": null
  }
  ```
- **Errors**: invalid `intentIds` (empty, more than 20, empty strings, not an array) returns an `isError` result before any request. A `403 insufficient_scope` names the missing scope.

### Schema

#### `beech_list_seeds`

Lists active and deleted seeds registered in the database, along with the current global schema registry version.

- **Parameters**: None (`{}`)
- **Transport**: `GET /api/seeds`
- **Returns**:
  ```json
  {
    "seeds": [
      {
        "slug": "posts",
        "label": "Posts",
        "status": "active",
        "branchCount": 4,
        "updatedAt": 1709670000
      }
    ],
    "schemaVersion": 4
  }
  ```
  *(Returns compact summaries to minimize LLM context window consumption; `schemaVersion` is extracted from the `X-Schema-Version` response header).*

#### `beech_get_seed`

Retrieves the complete canonical seed definition for a given slug.

- **Parameters**:
  - `slug` (string, required): The unique identifier of the content type.
- **Transport**: `GET /api/seeds/:slug`
- **Returns**: Full `SeedRecord` object containing the `definition` (with all branches, rules, policies, and layouts), `status`, `source`, `createdAt`, and `updatedAt`.
- **Errors**: `404 Not Found` if the seed does not exist.

#### `beech_schema_export`

Exports the entire active schema registry, including all seed blueprints, branch configurations, and layout metadata.

- **Parameters**: None (`{}`)
- **Transport**: `GET /api/schema`
- **Returns**: JSON dictionary of all active seed definitions enriched with layout configurations.

#### `beech_schema_validate`

Performs an offline structural and relational validation of a candidate seed definition against the live set of active seeds.

- **Parameters**:
  - `candidate` (Seed object, required): The proposed seed structure.
- **Transport**: Local execution in `@beechcms/core` (`validateSeedDefinitions`) after retrieving active seeds via `beech_list_seeds`.
- **Returns**:
  ```json
  {
    "issues": [
      {
        "slug": "posts",
        "fatal": false,
        "messages": ["Validation passed with no errors."]
      }
    ]
  }
  ```
  *(Validates relation targets, reserved alias collisions like `id` or `created_at`, slug formatting, and branch rules).*

#### `beech_schema_plan`

Computes a dry-run migration plan on the server against the physical D1 table structure. Stores the resulting plan in memory and returns a short-lived `planId`.

- **Parameters**:
  - `slug` (string, required): Content type slug.
  - `candidate` (Seed object, required): Proposed seed definition.
- **Transport**: `POST /api/seeds/:slug/mcp-plan`
- **Returns**:
  ```json
  {
    "planId": "b3f14892-d610-4d82-8a9e-05a8b792345e",
    "slug": "products",
    "classification": "create",
    "requiresConfirmation": false,
    "applicable": true,
    "blockedReasons": [],
    "statements": [
      "CREATE TABLE IF NOT EXISTS content_products (...);",
      "CREATE INDEX IF NOT EXISTS idx_products_sku ON content_products (sku);"
    ],
    "definitionChanged": true,
    "changedBranches": [],
    "ftsRebuildNeeded": false,
    "expectedVersion": 4,
    "expiresInSeconds": 600,
    "issues": []
  }
  ```

##### Safety Classifications
- **`create`**: The table does not exist; provisions new tables and indexes.
- **`additive`**: Only new branches or harmless metadata changes were added. Definition-only changes (tag options, option colors, `multiple`) produce no DDL and are listed in `changedBranches`; `definitionChanged: false` means applying changes nothing.
- **`destructive`**: Dropped branches, alias renames, or type alterations detected. `applicable` is set to `false` and `blockedReasons` explains what was blocked.

#### `beech_schema_apply`

Executes an atomic, OCC-guarded migration using a previously planned `planId`.

- **Parameters**:
  - `planId` (string, required): The UUID returned by `beech_schema_plan`.
- **Transport**: `POST /api/seeds/:slug/mcp-apply`
- **Returns**:
  ```json
  {
    "slug": "products",
    "newVersion": 5,
    "ftsRebuilt": false
  }
  ```
- **Error Conditions**:
  - `unknown` / `expired` plan ID (TTL of 10 minutes exceeded).
  - `already used` plan ID (single-use enforcement).
  - `destructive` classification: Refused immediately with `422`.
  - `409 Conflict`: Registry version drift. The response instructs the agent to re-run `beech_schema_plan`.
  - `403 insufficient_scope`: the grant lacks `schema:write`.

### Server

#### `beech_mcp_status`

Inspects the running MCP server instance, process ID, uptime, active bundle SHA-256 hash, and loaded resource count.

- **Parameters**: None (`{}`)
- **Transport**: In-process execution.
- **Returns**:
  ```json
  {
    "name": "beechcms-mcp",
    "version": "2.0.0",
    "pid": 54120,
    "uptime": 120,
    "bundleHash": "7b8f9a...",
    "resourceCount": 532
  }
  ```
  *(`version` is the version in the package's `package.json`.)*

#### `beech_mcp_reload`

Forces an immediate in-memory cache refresh of bundled resources and broadcasts `notifications/tools/list_changed` and `notifications/resources/list_changed` to the MCP client without requiring a manual `/mcp` reconnect.

- **Parameters**: None (`{}`)
- **Transport**: In-process cache invalidation and MCP notification broadcast.
- **Returns**:
  ```json
  {
    "reloaded": true,
    "bundleHash": "7b8f9a...",
    "resourceCount": 532
  }
  ```

---

## Approval Lifecycle (`beech_confirm`)

`beech_confirm` is the only way an agent gets a risky action approved. Data flow:

1. The `intentIds` are validated (1 to 20, duplicates collapsed).
2. Each intent is read from `GET /api/agent/intents/:id`.
3. Intents that are expired, belong to someone else, are no longer pending, or do not exist never reach the dialog; they are reported per item.
4. One dialog is shown. Its text is built **only from the intents stored on the server** (operation, summary, a body preview of 300 characters), never from the tool arguments, so an agent cannot dress up what the human approves.
5. The dialog asks one question, `decision` = `approve` or `reject`, and the answer applies to **all** intents shown.
6. The server calls `POST /api/agent/intents/:id/approve` or `/reject` for each intent. An approved intent is replayed once, with the owner's RBAC checked again.
7. The tool returns one result per distinct requested id, in request order.

The dialog times out after 10 minutes, equal to the intent lifetime: waiting longer cannot succeed.

### Status

| `status` | Meaning | What ran | What the agent must do |
|---|---|---|---|
| `decided` | The human chose `approve` or `reject` | Approved intents ran once; rejected intents were discarded | Read `results`; report the outcome |
| `declined` | The human declined the dialog | Nothing | Relay `instruction` verbatim; do not retry in a loop |
| `cancelled` | The dialog was dismissed, or accepted without a valid decision | Nothing | Relay `instruction` verbatim; do not retry in a loop |
| `fallback` | The dialog could not be shown; `reason` is `elicitation_unsupported` (the client has no form elicitation) or `elicitation_failed` (transport error or timeout) | Nothing | Relay `instruction`: the human decides at `pendingActionsUrl` |
| `nothing_pending` | No requested id was still pending | Nothing | Report it; check `results` for why |

Decline, cancel, a client without elicitation and an elicitation error approve nothing **and** reject nothing: the intents stay pending until approved in the dashboard or expired. `fallback` is not an HTTP error; it is a normal result. Claude Code supports form elicitation; clients without it receive the fallback.

The fallback address is `<auth origin>/admin/?settings=connected-apps&section=agent-actions`, the dashboard's **Pending agent actions** section.

### Item outcome

| `outcome` | Meaning |
|---|---|
| `executed` | Approved; the stored request ran and answered a status below `400` (`resultStatus`, `resultBody`) |
| `failed` | Approved; the stored request ran and answered `400` or above (`resultStatus`, `resultBody`) |
| `rejected` | The human rejected it; it was discarded and did not run |
| `pending` | Left pending (declined, cancelled or fallback) |
| `expired` | The intent is older than 10 minutes |
| `not_pending` | Already approved, rejected or run |
| `not_found` | No such intent for this user |
| `error` | The decision request failed; `message` says why. The remaining intents are still processed |

`resultBody` is the parsed replay body, or its text cut to 2000 characters.

---

## Resources & Auto-Reload

In addition to tools, `@beechcms/mcp` exposes a curated snapshot of `docs/` as MCP **resources** — read-only reference material an agent can list and fetch without calling a tool.

- **URI scheme**: `beechcms-docs://<path>`, e.g. `beechcms-docs://features/analytics.md`.
- **Discovery**: `resources/list` returns `{ uri, name, description, mimeType }` for every bundled document; `resources/read` returns the full Markdown text for a given `uri`.
- **Bundled subset**: `docs/api`, `docs/build` (including [Working with an Agent Locally](/build/local-agent), as `beechcms-docs://build/local-agent.md`), `docs/features`, `docs/manage`, `docs/reference`, and `docs/start/first-project.md`. Internal/CI/example/personal docs, sprint notes, and the MCP quickstart itself are excluded.
- **Auto-restart & Hot-reload**: When running in development, `@beechcms/mcp` runs via an integrated stdio supervisor (`McpSupervisor`). Upon every `pnpm build`, changes to `packages/mcp/dist/index.js` and `resources/manifest.json` are automatically detected: the supervisor restarts the child server, replays the initialization handshake, and broadcasts `notifications/tools/list_changed` and `notifications/resources/list_changed` to the client without dropping the stdio stream. To disable watch mode, pass `--no-watch` or run in `NODE_ENV=production`.

---

## Plan Lifecycle & Security

```text
[ Agent ] ──beech_schema_plan──► [ In-Memory Store ] ──(planId, TTL 10m)──► [ Agent ]
                                         │
                                   takePlan(planId)
                                  [Destructive Read]
                                         │
                                         ▼
                               [ beech_schema_apply ]
```

### In-Memory TTL & Single-Use Consumption
Plans are stored in a process-local `Map<string, StoredPlan>` inside the running MCP server instance:
- **10-Minute TTL**: Plans expire automatically after 600 seconds. Expired plans are purged lazily on subsequent plan requests.
- **Replay Protection**: Reading a plan via `takePlan(planId)` is **destructive**. The plan is deleted from memory as soon as it is retrieved for application. It cannot be executed twice.

### Optimistic Concurrency Control (OCC)
The API prevents blind overwrites using a compare-and-swap primary key trick in Cloudflare D1:

```sql
INSERT INTO seed_meta (id, value)
SELECT 'registry_version', 'occ-conflict'
WHERE (SELECT value FROM seed_meta WHERE id = 'registry_version') <> CAST(? AS TEXT);
```

1. If `expectedVersion` matches the live version in `seed_meta`, the `SELECT` returns zero rows and the statement succeeds silently as a no-op.
2. If `expectedVersion` does not match, SQLite attempts to insert a duplicate primary key `'registry_version'` row, triggering a `UNIQUE constraint failed: seed_meta.id` error.
3. Because all statements run inside a single `db.batch([guard, ...ddl, upsert, bump])`, the entire batch rolls back, preserving database integrity.
4. The API returns HTTP `409 Conflict` with the latest live version.

---

## Additive Invariant & Danger Zone Endpoints

`beech_schema_apply` enforces strict additive safety. If an agent attempts destructive modifications, the plan is classified `destructive`, is not applicable, and apply refuses it:

| Proposed Change | Classification | Blocked Reason | Dedicated Endpoint to Use Instead |
|---|---|---|---|
| Dropping a branch | `destructive` | `branch 'br_XX' would be dropped` | `DELETE /api/seeds/:slug/branches/:branchId` |
| Renaming an alias | `destructive` | `branch 'br_XX' alias rename` | `PATCH /api/seeds/:slug/branches/:branchId/rename` |
| Changing a field type | `destructive` | `branch 'br_XX' type change` | `PATCH /api/seeds/:slug/branches/:branchId/retype` |
| Deleting a seed | `destructive` | Not applicable through `beech_schema_apply` | `DELETE /api/seeds/:slug` or `.../hard` |

These dedicated endpoints are catalog operations with risk `destructive` (`seeds.branchDrop`, `seeds.branchRename`, `seeds.branchRetype`, `seeds.delete`, `seeds.hardDelete`). A `beech run` script holding `schema:write` can call them, and because they are `destructive` in every `ENV`, each call becomes an **intent** that a human must approve. `beech_schema_apply` itself stays additive-only.

---

## FTS5 Rebuild Handling

SQLite virtual tables (`fts5`) cannot be modified using standard `ALTER TABLE ADD COLUMN` statements. When a new branch with search indexing (`policies: { search: true }`) is added to an existing table:

1. `beech_schema_plan` flags `ftsRebuildNeeded: true`.
2. The additive DDL and seed upsert commit in the primary atomic batch.
3. Immediately after commitment, the server runs `planFtsRebuild` via `execDestructive` to recreate virtual tables and triggers.
4. If the rebuild encounters a failure, `beech_schema_apply` returns `200 OK` with a `warning` property directing the user to trigger `POST /api/seeds/:slug/fts/rebuild`.

---

## Permission Model & Known Limitations

Every route used by `@beechcms/mcp` sits behind `authMiddleware({ acceptOAuth: true })`, which accepts both the dashboard access JWT and OAuth 2.1 access tokens. Immediately after it, `oauthScopeMiddleware()` applies a **fail-closed** scope gate driven by `OPERATION_CATALOG`:

- A request the catalog does not list, or lists as `excluded` (password, sessions, profile, secret rotation, direct seed writes, user creation), is refused `403 insufficient_scope` whatever the token holds.
- Otherwise the token must carry the operation's scope (`schema:*`, `content:*`, `media:*`, `automations:*`, `users:*`, `settings:*`, `analytics:read`, `agent:*`).
- Risk is enforced **after RBAC**, by the agent intent gate: with an OAuth token, a `destructive` request (hard delete, purge, role changes) always, and a `publish` request (site settings, publishing content) in `production`, answers `202` with a pending intent instead of running. The stored request runs once when it is approved via `POST /api/agent/intents/:id/approve` (scope `agent:approve`, granted to the `beech-mcp` client only) or from the dashboard (**Settings → Connected apps → Pending agent actions**, `?settings=connected-apps&section=agent-actions`), as its owner and with RBAC checked again. An intent expires after 10 minutes. In `development` a `publish` request runs immediately.

The intent endpoints act on the caller's own intents only:

| Method | Route | Scope | Purpose |
|---|---|---|---|
| `GET` | `/api/agent/session` | `agent:read` | Your token's client, scopes, environment, confirmation policy and schema version |
| `GET` | `/api/agent/intents` | `agent:read` | List your pending intents |
| `GET` | `/api/agent/intents/:id` | `agent:read` | Read one intent, with its stored request body |
| `POST` | `/api/agent/intents/:id/approve` | `agent:approve` | Run the stored request once; the request body is ignored |
| `POST` | `/api/agent/intents/:id/reject` | `agent:read` | Discard the intent without running it |

The gate protects against mistakes and prompt injection, not against a hostile agent with full shell access: the OAuth token sits on disk in `~/.beechcms/mcp-tokens.json`, readable by anything that runs as you.

The scope never replaces RBAC: the effective permission of a token is the granted scopes **intersected with the owner's RBAC**, and `permissionMiddleware()` still answers `403 forbidden` for what the owner cannot do. The consent screen issues a **partial grant** (`PermissionRoleGuard`): each requested scope is granted only if the owner holds the authority behind it (`SCOPE_GRANT_REQUIREMENTS`); the rest are listed as `deniedScopes` and never issued. For example, `schema:write` needs `manage_seeds`, so an editor can authorize an agent for content without ever receiving `schema:write`. Every `/api/seeds` route still requires `manage_seeds` at `*` from the route gate.

The five routes used by the schema tools keep their scopes:

| Method | Route | Required scope | Tools |
|---|---|---|---|
| `GET` | `/api/seeds` | `schema:read` | `beech_list_seeds` |
| `GET` | `/api/seeds/:slug` | `schema:read` | `beech_get_seed` |
| `GET` | `/api/schema` | `schema:read` | `beech_schema_export`, `beech_schema_validate` |
| `POST` | `/api/seeds/:slug/mcp-plan` | `schema:read` | `beech_schema_plan` (dry-run — computes but writes nothing) |
| `POST` | `/api/seeds/:slug/mcp-apply` | `schema:write` | `beech_schema_apply` |

A genuinely **read-only agent** drops `schema:write` and `agent:approve` from `BEECH_OAUTH_SCOPE` (for example `schema:read settings:read agent:read`): it can inspect, validate and plan, `beech_schema_apply` fails with `403 insufficient_scope`, and `beech_confirm` can only fall back to the dashboard. Other catalogued routes are reachable with their own scope, subject to the rules above.

---

## Failure Semantics Matrix

| HTTP Status | Error Type | Cause | Agent Remediation |
|---|---|---|---|
| **400** | `invalid-json` | Malformed JSON, invalid slug characters, or non-integer `expectedVersion`. | Fix payload syntax. Do not retry identical request. |
| **401** | `unauthorized` | Cached grant expired and the silent refresh retry also failed. | Re-authorize in the browser; clear `~/.beechcms/mcp-tokens.json` if it persists. |
| **403** | `forbidden` / `insufficient_scope` | The account lacks the RBAC permission (for schema routes `manage_seeds` at `*`), or the OAuth token's scope does not cover the route (e.g. `schema:read` calling `mcp-apply`). | Authorize with an account whose role carries the permission, or re-authorize with a wider `BEECH_OAUTH_SCOPE`. |
| **403** | `insufficient_scope` (tool error) | A tool reports `Token lacks the '<scope>' scope.` naming the missing scope. | Revoke `BeechCMS MCP Server` under Settings → Connected apps and re-authorize. |
| **202** | `intent pending` | The call is a destructive operation (or a publish in production): it was stored as an intent and did not run. | Call `beech_confirm` with the intent id. |
| — | `fallback` (`beech_confirm`) | Not an HTTP error: status `fallback`. The client cannot show the dialog. | Relay `instruction`; the human decides in the dashboard. |
| **409** | `intent_expired` / `intent_not_pending` | The intent is older than 10 minutes, or was already approved, rejected or run. | Repeat the original request to create a new intent. |
| **413** | `intent_body_too_large` | The request body of a risky call exceeds the 256 KiB an intent may store. | Send a smaller body. |
| **409** | `conflict` | Registry version mismatch (`expectedVersion` ≠ current database version). | Discard old plan, call `beech_schema_plan` again, and review new diff. |
| **422** | `destructive-change-not-supported` | Candidate attempts to drop, rename, or retype a field. | Reject request or guide developer to dedicated endpoints. |
| **422** | `validation-failed` | Syntax or relational schema validation error. | Correct candidate structure according to `@beechcms/core` rules. |
| **422** | `ddl-failed` | SQLite syntax or execution error during batch DDL. | Inspect DDL statements in server logs. |
| **ECONNREFUSED** | Connection Refused | API server is not running on target `BEECH_API_URL`. | Run `pnpm beech dev` in your local project directory. |

---

## Audit Trail & Observability

Every successful or attempted `mcp-apply` invocation is logged to the BeechCMS `activity_log` table:

```json
{
  "action": "create",
  "entityType": "seed",
  "entityId": "products",
  "details": {
    "op": "mcp-apply",
    "planId": "b3f14892-d610-4d82-8a9e-05a8b792345e",
    "classification": "create",
    "expectedVersion": 4,
    "newVersion": 5,
    "ddlCount": 2,
    "ftsRebuilt": false,
    "outcome": "ok"
  },
  "actor": {
    "id": "usr_admin_01",
    "email": "admin@example.com",
    "name": "Ada Admin"
  }
}
```

Every intent event is written with `entityType: 'intent'` and the intent id as `entityId`:

| Event | `action` | `details` |
|---|---|---|
| A risky call was stored as an intent | `create` | `{ op: 'intent', operationId, risk, clientId }` |
| The intent was approved and replayed | `authorize` | `{ op: 'approve', operationId, resultStatus }` |
| The intent was rejected | `revoke` | `{ op: 'reject', operationId }` |

---

## Worked Agent Session

An agent is asked to purge the posts that are older than a year. The abbreviated JSON below shows each step.

**1. Who am I.**

```typescript
await beech_whoami({})
// => { user: { email: "admin@example.com", ... }, environment: "development",
//      confirmation: { publish: false, destructive: true },
//      scripts: { clientId: "beech-mcp-cli", scopes: ["content:read", "content:delete", ...] }, ... }
```

**2. Find the operations.**

```typescript
await beech_search({ query: "trash posts older than" })
// => { operations: [
//        { id: "content.list",   sdk: "beech.content.list",   risk: "read", approval: "never", ... },
//        { id: "content.delete", sdk: "beech.content.delete", risk: "request-dependent", approval: "depends-on-request", ... }
//      ], docs: [ ... ] }
```

**3. Write `.beech/scripts/purge-old-posts.ts`** with `defineScript` from `@beechcms/cli/sdk`: list the entries with `beech.content.list`, then call `beech.content.delete('posts', id, { purge: 'true' })` for each one older than the cutoff.

**4. Dry run.** Nothing is sent; every write is recorded in `calls`.

```bash
pnpm beech run purge-old-posts --dry-run --json
# => { "status": "ok", "dryRun": true, "calls": [ { "operationId": "content.delete", "outcome": "dry-run", "risk": "destructive" } ], "pendingIntents": [] }
```

**5. Real run.** The purge is destructive, so the API stores it as an intent.

```bash
pnpm beech run purge-old-posts --json
# => { "status": "ok", "dryRun": false,
#      "calls": [ { "operationId": "content.delete", "outcome": "pending", "status": 202 } ],
#      "pendingIntents": [ { "id": "3f2b8c1e-5a47-4d0e-9b6a-1c2d3e4f5a6b", "operationId": "content.delete", "risk": "destructive", "status": "pending", "expiresAt": 1800000600 } ] }
```

**6. Ask the human.**

```typescript
await beech_confirm({ intentIds: ["3f2b8c1e-5a47-4d0e-9b6a-1c2d3e4f5a6b"] })
// => { status: "decided", decision: "approve",
//      results: [ { outcome: "executed", operationId: "content.delete", resultStatus: 200, resultBody: { success: true, softDeleted: false } } ],
//      instruction: null, reason: null }
```

The schema tools follow the same shape. To create a `products` seed: `beech_schema_validate` → `beech_schema_plan` (classification `create`, `planId`) → `beech_schema_apply({ planId })` → `{ slug: "products", newVersion: 11, ftsRebuilt: false }`; adding a `price` branch later is a second plan with classification `additive`.

---

## Related Documentation

- [Working with an Agent Locally](/build/local-agent) — Setup, scripts, approvals and troubleshooting.
- [AI & MCP Setup Guide](/start/mcp) — Getting started with Claude Code, Claude Desktop, Cursor, and IDE assistants.
- [CLI Workflows](/build/cli-workflows) — `beech run`, `beech agent setup` and the `RunReport` fields.
- [Schema Modeling & Evolution](/build/schema-modeling) — Botanical Engine mental model and field specifications.
- [Seed Builder & Schema Mutation API](/reference/seed-builder) — Low-level REST API contracts and endpoints.
- [Auth Endpoints](/reference/auth-endpoints) — OAuth authorization, token and consent endpoints.
