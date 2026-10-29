[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/cli](../index.md) / schemaExport

# Function: schemaExport()

> **schemaExport**(`args?`): `Promise`&lt;`void`&gt;

Writes a `beech.schema.ts` snapshot of the live schema.

The source is LIVE D1, never an existing manifest file: a snapshot derived from another snapshot
can be arbitrarily stale, which is the exact failure mode `beech schema diff` exists to catch
(feature brief, business rule 1).

## Parameters

### args?

[`SchemaExportOptions`](../interfaces/SchemaExportOptions.md) = `{}`

## Returns

`Promise`&lt;`void`&gt;
