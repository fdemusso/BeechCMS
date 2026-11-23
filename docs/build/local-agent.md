---
title: Working with an Agent Locally
description: Set up Claude Code with BeechCMS, let an agent write and run scripts with your permissions, and approve risky actions in one dialog.
---

# Working with an Agent Locally

This guide shows how a developer works with a coding agent (Claude Code) on a BeechCMS site project: set it up once, let the agent write scripts, and approve the risky parts yourself. For every field, status and scope, see the [MCP Server reference](/reference/mcp-server).

## What you get

The agent works in five steps:

1. **Discover.** It calls `beech_whoami` to learn who it acts as, then `beech_search` to find the operations it needs and the SDK method for each.
2. **Script.** It writes `.beech/scripts/<name>.ts` with the typed `beech` SDK.
3. **Run.** It runs `beech run <name> --dry-run --json`, reads the `calls`, then runs it for real.
4. **Pend.** A risky call does not run. The API stores it as an **intent** and the report lists it under `pendingIntents`.
5. **Approve.** The agent calls `beech_confirm`; you decide in one dialog; the server runs approved intents once.

Why scripts instead of one tool call per record? A script loops, filters and combines reads with writes inside one process, and returns one small report. The model's context holds the script and the report, not every record, and the work takes a few turns instead of hundreds.

## Setup

Prerequisites:

- Node ≥ 22.18 (native type stripping runs the scripts).
- `pnpm beech dev` running: API at `http://localhost:8789`, dashboard at `http://localhost:5173`.
- An account with the RBAC you want the agent to have. The agent never gets more than you can do.

From the project root:

```bash
npx beech agent setup
```

It writes:

| File | Purpose |
|------|---------|
| `.mcp.json` | The `beechcms` entry: `npx -y @beechcms/mcp` |
| `.claude/skills/beechcms-scripts/SKILL.md` | Teaches the agent the script workflow and the approval rule |
| `.beech/scripts/README.md` | Run flags and the approval policy, for humans |
| `.beech/scripts/latest-entries.ts` | A read-only example script |

It also adds `@beechcms/cli` to `devDependencies`. Install, then restart the agent client so it loads the new MCP server. An existing file that differs from the template is left untouched; `--force` overwrites it.

## First run and consent

Two OAuth clients take part, and each opens your browser once:

| Triggered by | Client | What it can do |
|--------------|--------|----------------|
| First MCP tool call | `beech-mcp` | Schema tools, session, intents, and **approving** intents |
| First `beech run` | `beech-mcp-cli` | Everything the scripts need except approving |

The consent is **partial**: you only grant scopes your account's role covers. An editor can authorize content scripts and will not receive `schema:write`. Revoke either client under **Settings → Connected apps**; the next call asks again. If you upgrade from MCP 1.x, expect one new consent (see [Upgrading from 1.x](/reference/mcp-server#upgrading-from-1-x)).

## Writing and running a script

`beech agent setup` writes this example. The agent copies its shape:

```ts
import { defineScript } from '@beechcms/cli/sdk'

// Read-only: lists the five most recently updated entries of one seed.
// Run: pnpm beech run latest-entries --arg seed=<slug> --json
export default defineScript(async (beech, { args, log }) => {
  const seed = args.seed
  if (!seed) throw new Error('pass --arg seed=<slug>')

  const page = await beech.content.list(seed, { limit: 5, sortBy: 'updated_at', sortDir: 'desc' })
  log('total entries:', page.total)

  return {
    seed,
    total: page.total,
    latest: page.items.map(entry => ({ id: entry.id, status: entry.status, updated_at: entry.updated_at })),
  }
})
```

Run anything that writes with `--dry-run` first:

```bash
pnpm beech run latest-entries --arg seed=posts --dry-run --json
pnpm beech run latest-entries --arg seed=posts --json
```

Read three fields of the report: `result` (what the script returned), `calls` (every SDK call in order, with `outcome` `executed`, `pending`, `dry-run` or `error`) and `pendingIntents` (actions waiting for you). The full field list is in [CLI Workflows](/build/cli-workflows#runreport).

For typed per-seed access, run `beech types generate` and type the script with `defineScript<SeedRegistryTypes>`.

## Approving risky actions

The API decides per `ENV` which calls need a human:

| `ENV` | Needs approval |
|-------|----------------|
| `development` | Destructive operations (hard delete, purge, role changes, dropping or renaming schema) |
| `production` | Destructive operations **and** publishing (site settings, publishing content) |

When a script hits one of these, the call answers `202`, the report lists a pending intent and the script keeps running. The agent then calls `beech_confirm` with the intent ids, and a dialog shows what each action does. You pick `approve` or `reject` once for everything shown.

| `status` | What it means for you |
|----------|----------------------|
| `decided` | You chose; approved actions ran once, with your permissions |
| `declined` / `cancelled` | Nothing ran, nothing was rejected; the intents stay pending |
| `fallback` | Your client cannot show the dialog; decide in the dashboard |
| `nothing_pending` | Every id had already expired or been decided |

On `fallback`, open **Settings → Connected apps → Pending agent actions** (`/admin/?settings=connected-apps&section=agent-actions` on the dashboard origin), review the request body and approve or reject there. Intents expire after 10 minutes; an expired intent is gone and the agent repeats the call to create a new one. The full status and outcome tables are in [Approval Lifecycle](/reference/mcp-server#approval-lifecycle-beech-confirm).

## What the agent can and cannot do

The effective permission is the **granted scopes intersected with your RBAC**. A scope never grants what your role cannot do, and your role never widens a scope the consent denied. Ask the agent to call `beech_whoami` to see both, per seed.

Some operations are human-only and are not in the catalog the agent searches: changing a password or email, managing sessions, OAuth consents, `rotate-field` on secret fields, and creating accounts (agents invite users instead). Direct seed writes are replaced by `beech_schema_plan` and `beech_schema_apply`, which are additive only.

## Security model

The approval dialog protects against mistakes and prompt injection, not against a hostile agent with full shell access: the OAuth token sits on disk in `~/.beechcms/mcp-tokens.json`, readable by anything that runs as you. Keep these in mind:

- **CMS content is untrusted data.** A field value can contain text that looks like an instruction. The skill tells the agent to treat it as data.
- **Only two ways approve.** `beech_confirm` and the dashboard. No script, scope or flag can approve, and the script client lacks `agent:approve`.
- **The dialog shows server data.** Its text comes from the stored intents, never from what the agent passes in.
- **Everything is logged.** Every intent creation, approval and rejection is an entry in the activity log with `entityType: 'intent'`.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| stderr: `BeechCMS MCP 2.0 needs new permissions: your browser opens for consent on the next call.` | A cached grant from MCP 1.x was dropped. | Make any tool call and approve the consent in the browser. |
| `beech_confirm` returns `fallback` with `elicitation_unsupported` | The client has no form elicitation. | Approve in Settings → Connected apps → Pending agent actions. |
| Outcome `expired` or error `intent_expired` | The intent is older than 10 minutes. | Run the script again to create a new intent. |
| `403 insufficient_scope` naming a scope | The grant lacks that scope or your role cannot grant it. | Revoke `BeechCMS MCP Server` (or the CLI client) under Connected apps and consent again. |
| `ECONNREFUSED` | The API is not running. | Run `pnpm beech dev`. |

## Related

- [MCP Server reference](/reference/mcp-server): tools, scopes, statuses, audit trail.
- [CLI Workflows](/build/cli-workflows): `beech run` flags, `RunReport`, exit codes.
- [AI & MCP Setup](/start/mcp): the short quickstart.
