[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / resolveKanbanColumns

# Function: resolveKanbanColumns()

> **resolveKanbanColumns**(`branch`, `distinctTagValues?`): [`KanbanColumnDescriptor`](../interfaces/KanbanColumnDescriptor.md)[]

Deterministic, stable column order for a chosen axis (Q2). The "Senza valore"
(value: null) column is always appended last. Values out of `options` are NOT
given their own column (KB-U25) — the board folds them into "Senza valore".

## Parameters

### branch

[`Branch`](../interfaces/Branch.md)

### distinctTagValues?

`string`[] = `[]`

unique tag values observed in data (tags axis without options).

## Returns

[`KanbanColumnDescriptor`](../interfaces/KanbanColumnDescriptor.md)[]
