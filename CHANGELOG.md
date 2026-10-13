# Changelog

## Unreleased — BREAKING

### `tags` options contract

- `options` is valid only on `tags` branches. The shape is `[{ value, color }]` with a mandatory `#RRGGBB` color. The list is binding: a write is rejected with `400` when a value is outside the list, duplicated, or exceeds the cardinality.
- `multiple: false` on a `tags` branch means single choice. The stored value is always an array.
- `text` + `options` and `options: string[]` are rejected at boot (seed validation and `SeedRegistry` hydration). Use `type: 'tags'` with `multiple: false` for a single choice.
- No migration. Start from a fresh database (`pnpm beech db:reset`) and rewrite seeds in the new shape. Data migration is deferred to 0.9.
- `X-Schema-Revision` now starts with `v2:` (the projection of `tags` changed). Regenerate client types.
- `GET /api/v1/public/:seed/schema` exposes `options: { label, value, color }[]` and `multiple` on `tags` branches.

### Dashboard

- Choice editor for `tags` with options: a menu with a color dot per option, replacing the value in single-choice mode and adding chips in multiple mode.
- Colored chips in the form, table, kanban cards and gallery; values no longer among the options are shown as dashed chips.
- Seed builder edits the options, their colors and the choice mode of `tags` branches.
- `json` branches with an alias containing `tag` are no longer rendered as chips.

### Views (kanban, sort, group)

- Kanban axis: only single-choice `tags` with options (and `boolean`); columns follow the option order and color.
- `PATCH /api/content/:seed/:id/kanban-move`: `axis` is now `{ value }` (`kind`, `oldValue`, `newValue` removed); a tags move writes `[value]` / `[]`.
- Sort and group-by on `tags` only when single choice, in option order (alphabetical without options), empty values last; `sortBy` on a multiple-choice `tags` field is ignored.
- `POST/PATCH /api/content/:seed/views` answer `422 content-invalid-view` for sort, group-by, kanban axis or kanban sort on a `tags` field that does not allow it; stored views are cleaned on read.
- Filters on `tags`: `eq`/`contains`/`in` test membership, `neq`/`not_contains`/`not_in` their negation (Public API included). Automation conditions compare `tags` arrays by membership.

### Schema plan / apply

- `beech schema plan` and MCP `beech_schema_plan` report definition-only changes (`definitionChanged`, `changedBranches`) even when they produce no DDL.
- `beech schema apply` skips seeds whose definition already matches instead of rewriting every seed on each run.
- `beech schema diff` treats omitted `multiple` on `tags` branches as `true`.
- The `mcp-apply` audit trail records `changedBranches`.
