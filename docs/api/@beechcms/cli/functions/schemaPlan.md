[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/cli](../index.md) / schemaPlan

# Function: schemaPlan()

> **schemaPlan**(`args?`): `Promise`&lt;`void`&gt;

Computes — and only prints — what applying `beech.schema.ts` would do.

Nothing is written: every plan is the server's own dry run (`POST /api/seeds/:slug/mcp-plan`), so
the DDL displayed here is literally the DDL `beech schema apply` would execute. Exits 1 when any
seed is not applicable, so CI can gate on it exactly like `beech schema diff`.

## Parameters

### args?

[`SchemaPlanOptions`](../interfaces/SchemaPlanOptions.md) = `{}`

## Returns

`Promise`&lt;`void`&gt;
