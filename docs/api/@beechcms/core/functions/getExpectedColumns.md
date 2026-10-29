[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / getExpectedColumns

# Function: getExpectedColumns()

> **getExpectedColumns**(`seed`): [`SchemaColumn`](../interfaces/SchemaColumn.md)[]

Returns the list of expected columns for a Seed's table.
Used to compare current vs expected schema (diffing).

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

The seed definition.

## Returns

[`SchemaColumn`](../interfaces/SchemaColumn.md)[]

The array of expected schema columns.
