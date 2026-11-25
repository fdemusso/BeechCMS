# @beechcms/mcp

BeechCMS Agent Control Plane (2.0): a stdio MCP server that tells an agent who it acts as and which operations exist
(`beech_whoami`, `beech_search`), gets human approval for risky actions in one dialog (`beech_intents`,
`beech_confirm`) and lets it evolve content schemas additively through the Botanical Engine (`beech_schema_*`).
Bulk work runs as `beech run` scripts, not as tool calls. The server never touches D1: every request goes through
the authenticated BeechCMS API.

## Install

In a site project:

```bash
npx beech agent setup
```

It writes the `.mcp.json` entry, the agent skill and the `.beech/scripts/` folder. Or add the server by hand to your
MCP client config (`.mcp.json`, `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "beechcms": {
      "command": "npx",
      "args": ["-y", "@beechcms/mcp@latest"],
      "env": { "BEECH_API_URL": "http://localhost:8789" }
    }
  }
}
```

On first use the server opens your browser for an OAuth consent (PKCE, no password in the config). The token is
cached at `~/.beechcms/mcp-tokens.json`; revoke it under **Settings → Connected apps**. In local dev set
`BEECH_AUTH_URL=http://localhost:5173` (the dashboard origin) next to `BEECH_API_URL`.

## Tools

13 tools, all prefixed `beech_`:

| Tool | Purpose |
|---|---|
| `beech_whoami` | User, permissions, scopes, `ENV` and approval policy |
| `beech_search` | Search the operation catalog and docs; returns the SDK method per operation |
| `beech_docs_search` | Full-text search over the bundled `beechcms-docs://` resources |
| `beech_intents` | List your pending intents |
| `beech_confirm` | Ask the human to approve or reject pending intents in one dialog |
| `beech_list_seeds` | List seed summaries and the schema version |
| `beech_get_seed` | Fetch one seed definition |
| `beech_schema_export` | Export the full schema registry |
| `beech_schema_validate` | Validate a candidate seed offline |
| `beech_schema_plan` | Compute DDL and safety classification on the server |
| `beech_schema_apply` | Apply a planned, additive change |
| `beech_mcp_status` | Inspect the running server |
| `beech_mcp_reload` | Refresh bundled resources and notify the client |

## Scopes

The server requests `schema:read schema:write settings:read agent:read agent:approve` (override with
`BEECH_OAUTH_SCOPE`). It is the only OAuth client that can approve intents; `beech run` uses `beech-mcp-cli`, which
never can.

## Upgrading from 1.x

A grant cached by a 1.x server lacks `agent:read`. 2.0 drops it once, prints
`BeechCMS MCP 2.0 needs new permissions: your browser opens for consent on the next call.` on stderr, and asks for
one new consent. The schema tools behave as before.

## Documentation

- [MCP Server reference](../../docs/reference/mcp-server.md): tools, scopes, approval lifecycle, failure matrix.
- [Working with an Agent Locally](../../docs/build/local-agent.md): setup, scripts, approvals, security model.
