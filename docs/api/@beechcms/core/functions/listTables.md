[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / listTables

# Function: listTables()

> **listTables**(`executor`, `prefix?`): `Promise`&lt;`string`[]&gt;

Names of the physical tables SQLite holds, optionally restricted to a `LIKE` prefix
(e.g. `content_`). Sorted, `sqlite_*` internals excluded.

## Parameters

### executor

[`SchemaQueryExecutor`](../interfaces/SchemaQueryExecutor.md)

### prefix?

`string`

## Returns

`Promise`&lt;`string`[]&gt;
