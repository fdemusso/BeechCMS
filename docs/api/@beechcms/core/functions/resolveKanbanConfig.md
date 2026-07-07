[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / resolveKanbanConfig

# Function: resolveKanbanConfig()

> **resolveKanbanConfig**(`seed`): [`KanbanCompatibility`](../interfaces/KanbanCompatibility.md)

Determines whether a seed can be displayed as a Kanban board, and which
branches may serve as the column axis. Pure — no I/O. (KB-S01)

Q3: seeds with `allowDrafts: true` are NOT kanban-compatible.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

## Returns

[`KanbanCompatibility`](../interfaces/KanbanCompatibility.md)
