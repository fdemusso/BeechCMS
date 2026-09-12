[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / introspectTable

# Function: introspectTable()

> **introspectTable**(`executor`, `table`): `Promise`&lt;[`LiveTable`](../interfaces/LiveTable.md)&gt;

Physical state of one table. A table SQLite does not know returns `{ exists: false }` with empty
lists rather than throwing: "missing" is a legitimate diff outcome, not an error.

`PRAGMA table_info` answers an unknown table with zero rows on the SQLite path and raises on some
wrangler paths, so both outcomes collapse to the same result.

## Parameters

### executor

[`SchemaQueryExecutor`](../interfaces/SchemaQueryExecutor.md)

### table

`string`

## Returns

`Promise`&lt;[`LiveTable`](../interfaces/LiveTable.md)&gt;
