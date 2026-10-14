[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / kanbanColumnEntryValue

# Function: kanbanColumnEntryValue()

> **kanbanColumnEntryValue**(`branch`, `columnValue`): `string` \| `boolean` \| `string`[] \| `null`

The entry value that puts an entry in the kanban column `columnValue` of `branch`:
boolean → `true`/`false` (`null` column → `null`), tags → `[columnValue]` (`null` column → `[]`),
any other type → `columnValue` unchanged. Pure.

## Parameters

### branch

[`Branch`](../interfaces/Branch.md)

### columnValue

`string` \| `null`

## Returns

`string` \| `boolean` \| `string`[] \| `null`
