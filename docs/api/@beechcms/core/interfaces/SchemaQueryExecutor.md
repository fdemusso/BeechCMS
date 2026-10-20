[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / SchemaQueryExecutor

# Interface: SchemaQueryExecutor

The one capability the introspection primitive needs from a database connection.

Implementations MUST: execute the statement as-is, return one object per row with column names
as keys, and reject/throw on failure. They MUST NOT cache, batch, rewrite or retry — a stale
answer here becomes a wrong fingerprint, which becomes a false "your types are stale" error in
someone else's production client.

## Methods

### all()

> **all**&lt;`T`&gt;(`sql`): `Promise`&lt;`T`[]&gt;

#### Type Parameters

##### T

`T` *extends* `Record`&lt;`string`, `unknown`&gt;

#### Parameters

##### sql

`string`

#### Returns

`Promise`&lt;`T`[]&gt;
