[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / KanbanConfig

# Interface: KanbanConfig

Per-seed, dashboard-side kanban view preferences. Persisted in
 seed_views.config.kanban (one per Kanban view instance). NOT part of FormLayout.

## Properties

### axisBranchId

> **axisBranchId**: `string` \| `null`

Chosen axis branch id, or null when the user has not configured one (KB-U02).

***

### hiddenColumnValues?

> `optional` **hiddenColumnValues?**: `string`[]

Axis values the user chose to hide when columns exceed the cap (KB-U06c).

***

### sort

> **sort**: \{ `branchId`: `string`; `dir`: `"ASC"` \| `"DESC"`; \} \| `null`

Card sort inside columns. null ⇒ manual order via kanban_positions (KB-U22b).
