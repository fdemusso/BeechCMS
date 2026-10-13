[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / resolveKanbanColumns

# Function: resolveKanbanColumns()

> **resolveKanbanColumns**(`branch`): [`KanbanColumnDescriptor`](../interfaces/KanbanColumnDescriptor.md)[]

Deterministic, stable column order for a chosen axis (Q2). The "Senza valore"
(value: null) column is always appended last. Values out of `options` are NOT
given their own column (KB-U25) — the board folds them into "Senza valore".
A tags axis yields one column per option, in declared order, carrying the option color.

## Parameters

### branch

[`Branch`](../interfaces/Branch.md)

## Returns

[`KanbanColumnDescriptor`](../interfaces/KanbanColumnDescriptor.md)[]
