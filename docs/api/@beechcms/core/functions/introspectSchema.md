[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / introspectSchema

# Function: introspectSchema()

> **introspectSchema**(`executor`, `tables?`): `Promise`&lt;[`LiveSchema`](../interfaces/LiveSchema.md)&gt;

Physical state of several tables at once. With no explicit list, every `content_*` table is
introspected — the set a schema export or a drift check cares about.

## Parameters

### executor

[`SchemaQueryExecutor`](../interfaces/SchemaQueryExecutor.md)

### tables?

`string`[]

## Returns

`Promise`&lt;[`LiveSchema`](../interfaces/LiveSchema.md)&gt;
