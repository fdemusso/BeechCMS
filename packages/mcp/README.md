# @beechcms/mcp

BeechCMS AI Control Plane — a Stdio MCP server that lets IDE agents inspect and safely evolve
BeechCMS content schemas through the Botanical Engine's Admin API. It never touches D1 directly:
every write goes through `POST /api/seeds/:slug/mcp-plan` and `POST /api/seeds/:slug/mcp-apply`.

## Install & configure

```bash
pnpm --filter @beechcms/mcp build
```

Add it to your MCP client config (e.g. `.mcp.json`, `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "beechcms": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp/dist/index.js"],
      "env": {
        "BEECH_API_URL": "http://localhost:8787"
      }
    }
  }
}
```

On first use, the server opens your system browser to `/oauth/authorize`, you log in and
approve the "BeechCMS MCP Server" consent screen, and the resulting token pair is cached at
`~/.beechcms/mcp-tokens.json` (mode `0600`). Every later tool call reuses or silently refreshes
that token — no password ever touches the MCP client config.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `BEECH_API_URL` | No | `.dev.vars` → `http://localhost:8787` | Token endpoint + REST API origin. |
| `BEECH_AUTH_URL` | No | `BEECH_API_URL` | Origin the browser opens for `/oauth/authorize`. Must be the **dashboard** origin in local dev (Vite, `:5173`). |
| `BEECH_OAUTH_CLIENT_ID` | No | `beech-mcp` | Must match the client row from migration `0039`. |
| `BEECH_OAUTH_SCOPE` | No | `schema:read schema:write` | Set to `schema:read` for a read-only agent. |
| `BEECH_OAUTH_TIMEOUT_MS` | No | `180000` | Browser round-trip budget. |
| `BEECH_TOKEN_CACHE` | No | `~/.beechcms/mcp-tokens.json` | Cache override (tests, containers). |

**Local dev**: set `BEECH_AUTH_URL=http://localhost:5173` (the dashboard's Vite origin) alongside
`BEECH_API_URL=http://127.0.0.1:8789` (`wrangler dev --port 8789`) — the Worker cannot serve the
consent screen itself in dev.

To revoke access, open **Settings → Connected apps** in the dashboard and revoke
"BeechCMS MCP Server"; the next tool call re-opens the browser to re-authorize.

### Troubleshooting

| Symptom | Cause |
|---|---|
| `400 invalid_client` | Migration `0039_oauth_client_beech_mcp.sql` not applied — run `pnpm beech db:migrate`. |
| `403 insufficient_scope` | Cached token is narrower than the tool needs — revoke and re-authorize with a wider `BEECH_OAUTH_SCOPE`. |
| Authorization timed out | Browser consent was not completed within `BEECH_OAUTH_TIMEOUT_MS` — re-run the tool. |

## Tools

| Tool | Input | Output | Errors |
|---|---|---|---|
| `beech_list_seeds` | `{}` | `{ seeds: { slug, label, status, branchCount, updatedAt }[], schemaVersion }` | 401 |
| `beech_get_seed` | `{ slug }` | Full `SeedRecord` | 404 |
| `beech_schema_export` | `{}` | Full registry snapshot (definitions + layouts) | 401 |
| `beech_schema_validate` | `{ candidate }` | `{ issues: { slug, fatal, messages }[] }` | — (local, no D1 write) |
| `beech_schema_plan` | `{ slug, candidate }` | `{ planId, classification, requiresConfirmation, applicable, blockedReasons, statements, ftsRebuildNeeded, expectedVersion, issues, expiresInSeconds }` | 400, 401, 403 |
| `beech_schema_apply` | `{ planId }` | `{ slug, newVersion, ftsRebuilt, warning? }` | unknown/expired/used planId, destructive classification, 409 drift, 401, 403 |

## Permission model

Every route lives behind `apiProtected` (JWT Bearer, `authMiddleware()`) and `seedsApp`'s
`requireAdmin` gate. **Known limitation**: read-only tools (`beech_list_seeds`, `beech_get_seed`)
currently need the same `admin` role as the write tools, because `seedsApp` is admin-gated as a
whole — there are no finer-grained read/plan/apply scopes yet. A scoped service-token subsystem
is tracked as a follow-up (Issue #328), not part of this release.

## Failure semantics

| Status | Meaning | Agent action |
|---|---|---|
| 400 | Bad input (bad slug, non-object candidate, non-integer `expectedVersion`) | Fix the input, do not retry blindly |
| 401 | Auth failed after one refresh-and-retry attempt | Re-run any Beech tool to re-authorize in the browser |
| 403 | Account lacks `admin` role | Ask the developer for an admin account |
| 409 | Registry drift — another writer moved `registry_version` | Re-run `beech_schema_plan` |
| 422 | Validation failure, destructive intent, or DDL failure | Show the developer the detail; do not retry the same candidate |
| connection refused | API unreachable | `pnpm beech dev` |

## Worked agent session

```
1. beech_schema_validate({ candidate: { slug: "products", label: "Product", branches: [...] } })
   → { issues: [] }

2. beech_schema_plan({ slug: "products", candidate: { ... } })
   → { planId: "b3f1...", classification: "create", applicable: true,
       statements: ["CREATE TABLE content_products (...)", ...],
       expectedVersion: 4, expiresInSeconds: 600 }

3. beech_schema_apply({ planId: "b3f1..." })
   → { slug: "products", newVersion: 5, ftsRebuilt: false }

4. beech_schema_plan({ slug: "products", candidate: { ...same, branches: [...prev, { alias: "price", type: "number" }] } })
   → { planId: "9a02...", classification: "additive", applicable: true,
       statements: ["ALTER TABLE content_products ADD COLUMN price REAL"],
       expectedVersion: 5, expiresInSeconds: 600 }

5. beech_schema_apply({ planId: "9a02..." })
   → { slug: "products", newVersion: 6, ftsRebuilt: false }
```
