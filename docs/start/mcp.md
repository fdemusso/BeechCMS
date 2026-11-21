---
title: AI & MCP Setup
description: Connect an AI agent to BeechCMS: run scripts with your own permissions, get human approval for risky actions, and evolve schemas safely through the MCP server.
---

# AI & MCP Setup

BeechCMS ships an **AI Control Plane**: an MCP server (`@beechcms/mcp`) plus a script runner (`beech run`). Agents such as **Claude Code**, **Claude Desktop** and **Cursor** can inspect your content models, run scripts against the CMS, and plan additive schema changes, all through the **Botanical Engine**.

## Why an AI Control Plane?

- **Zero Database Exposure**: The MCP server never connects to Cloudflare D1 or SQLite. Every operation passes through API authentication and the Botanical Engine.
- **Scripts With Your Permissions**: Bulk work runs as TypeScript scripts (`beech run`) under the OAuth grant you consented to, intersected with your own RBAC.
- **Human Approval for Risky Actions**: Destructive operations (and publishing in production) do not run. They wait as intents until you approve them in one dialog or in the dashboard.
- **Additive Schema with OCC**: Schema plans are computed against the physical tables and guarded by a registry version, so concurrent edits are detected atomically.

---

## 1. Prerequisites

1. **Dependencies Installed**: Install workspace dependencies from the root of your project:
   <PackageManagerTabs
     npm="npm install"
     pnpm="pnpm install"
     yarn="yarn install"
     bun="bun install"
   />
2. **Local Stack Running**:
   ```bash
   pnpm beech dev
   # API running at http://localhost:8789, dashboard at http://localhost:5173
   ```
3. **Account**: Any account works for scripts and the session tools. The schema tools (`beech_schema_plan`, `beech_schema_apply`, `beech_get_seed`, `beech_list_seeds`) additionally need `manage_seeds` at `*`, which the first account (`SuperAdmin`) holds.

---

## 2. Connect Your Agent

### Claude Code in a site project

```bash
npx beech agent setup
```

This writes the `.mcp.json` entry, the agent skill and the `.beech/scripts/` folder. Install the new dev dependency and restart Claude Code. See [Working with an Agent Locally](/build/local-agent#setup).

### Other clients (Claude Desktop, Cursor)

Add the server to `claude_desktop_config.json` (or `.cursor/mcp.json`):

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

On first use the server opens your browser for an OAuth consent. Clients without form elicitation cannot show the approval dialog: `beech_confirm` then falls back to **Settings → Connected apps → Pending agent actions** in the dashboard.

### Monorepo contributors

```bash
pnpm --filter @beechcms/mcp build
```

This produces `packages/mcp/dist/index.js`. Point your client at it with `"command": "node"` and `"args": ["/ABSOLUTE/PATH/TO/packages/mcp/dist/index.js"]`, and set `BEECH_AUTH_URL=http://localhost:5173`: in local dev the dashboard (Vite) serves the consent screen, not the Worker. The build uses `--packages=external`, so `node_modules` must stay installed.

All environment variables are listed in the [MCP Server reference](/reference/mcp-server#environment-variables).

---

## 3. Try It

Start a conversation with your agent:

> "List the seeds and tell me who I am."

The agent calls `beech_list_seeds` for the seeds and `beech_whoami` for your user, permissions, scopes and approval policy. If it opens your browser, approve the consent once.

---

## 4. The Agent Skill

`beech agent setup` writes the skill to `.claude/skills/beechcms-scripts/SKILL.md`; your agent loads it on its own. It teaches the script workflow, the dry-run habit and the rule that only `beech_confirm` or the dashboard approves an intent. `packages/mcp/SKILL.md` is the MCP-side version of the same rules, shipped with the server.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `400 invalid_client` | OAuth client seed (`beech-mcp`) not present in D1 — run `pnpm beech db:migrate` to apply the base migration. |
| `403 insufficient_scope` | The grant is narrower than the tool needs — revoke it under Settings → Connected apps and re-authorize. |
| Authorization timed out | Browser consent was not completed within `BEECH_OAUTH_TIMEOUT_MS` — re-run the tool. |
| `ECONNREFUSED` | The API is not running — run `pnpm beech dev`. |

---

## Next Steps

- [Working with an Agent Locally](/build/local-agent): scripts, approvals and security model.
- [MCP Server Reference](/reference/mcp-server): tool schemas, statuses and architecture.
