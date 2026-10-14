[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / kanbanColumnFilter

# Function: kanbanColumnFilter()

> **kanbanColumnFilter**(`branch`, `value`): [`FilterGroup`](../interfaces/FilterGroup.md)

Pure: the FilterGroup selecting one kanban column's entries for a given axis branch.
`value: null` ⇒ "Senza valore" — entries where the axis field is NULL or empty (KB-U25).
On a tags axis with options it also holds entries whose stored value is no longer an option
(removed or renamed in the seed): `not_in` the option values matches both, so no entry
falls outside every column.
Boolean descriptor values 'true'/'false' are coerced to actual booleans for the engine.

## Parameters

### branch

[`Branch`](../interfaces/Branch.md)

### value

`string` \| `null`

## Returns

[`FilterGroup`](../interfaces/FilterGroup.md)
