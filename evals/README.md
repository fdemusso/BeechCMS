# Agent evals — v1 vs v2

## What it measures

ROADMAP row 10: the same tasks run headless through `claude -p` against `@beechcms/mcp@1.2.0` (v1, 9 schema tools) and
the working tree (v2, 13 tools + `beech run`). The report records success, turns, tokens, tool calls, duration and cost.
Success is checked by deterministic code over API state, never by a judge model.

| Task | Area | v1 can do it |
|------|------|:-:|
| `schema-add-branch` | schema | yes |
| `schema-create-seed` | schema | yes |
| `content-create-many` | content | no |
| `content-bulk-tag` | content | no |
| `content-author-report` | content | no |
| `trash-restore` | trash | no |
| `content-purge-intent` | intent | no |
| `seed-delete-intent` | intent | no |

## Prerequisites

- `pnpm build` (CLI, MCP, api-client and dashboard `dist/` must exist).
- `claude` on PATH and signed in.
- Node >= 22.18.
- Port 8798 free.
- Network for `npm cache add @beechcms/mcp@1.2.0`.

## Run

```bash
pnpm eval:agent                                          # 8 tasks x 2 variants
pnpm eval:agent --task schema-add-branch --variant v2    # one run
```

Flags: `--variant v1|v2` (repeatable), `--task <id>` (repeatable), `--model <alias>` (default `sonnet`),
`--timeout-min <n>` (default 10), `--budget-usd <n>` (default 2), `--keep-workspaces`.
Reports are written to `evals/reports/<stamp>/report.{json,md}`; transcripts to `evals/.runs/<stamp>/` (gitignored).

## Cost

Each run uses your own Claude usage. A full suite is 16 runs. `--budget-usd` caps API-key usage per run.

## Isolation

- Throwaway D1 and `wrangler dev` on port 8798, recreated for every run.
- OAuth grants are minted headlessly for a throwaway admin into a run-scoped token cache in the OS temp dir. `~/.beechcms` is never touched.
- The agent's working directory is outside the repo; `--strict-mcp-config` loads only the eval MCP server.
- The harness never approves an intent. Destructive tasks pass only when the intent is still pending and the target is intact.

## Reading the report

- **Summary**: successes per variant, median turns, median input and output tokens, total cost.
- **Per task**: `Result` is `pass`, `fail`, or the run status (`timeout`, `agent_error`, `harness_error`). A v1 `fail (not expected)` is a task the 1.x surface cannot complete.
- **Tokens**: input includes cache creation and cache reads; billed usage differs.
- **Tool calls**: sum of `tool_use` blocks.
