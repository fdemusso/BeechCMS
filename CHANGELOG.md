# Changelog

## Unreleased — BREAKING

### `tags` options contract

- `options` is valid only on `tags` branches. The shape is `[{ value, color }]` with a mandatory `#RRGGBB` color. The list is binding: a write is rejected with `400` when a value is outside the list, duplicated, or exceeds the cardinality.
- `multiple: false` on a `tags` branch means single choice. The stored value is always an array.
- `text` + `options` and `options: string[]` are rejected at boot (seed validation and `SeedRegistry` hydration). Use `type: 'tags'` with `multiple: false` for a single choice.
- No migration. Start from a fresh database (`pnpm beech db:reset`) and rewrite seeds in the new shape. Data migration is deferred to 0.9.
- `X-Schema-Revision` now starts with `v2:` (the projection of `tags` changed). Regenerate client types.
- `GET /api/v1/public/:seed/schema` exposes `options: { label, value, color }[]` and `multiple` on `tags` branches.

### Schema plan / apply

- `beech schema plan` and MCP `beech_schema_plan` report definition-only changes (`definitionChanged`, `changedBranches`) even when they produce no DDL.
- `beech schema apply` skips seeds whose definition already matches instead of rewriting every seed on each run.
- `beech schema diff` treats omitted `multiple` on `tags` branches as `true`.
- The `mcp-apply` audit trail records `changedBranches`.
