[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / generateIndexes

# Function: generateIndexes()

> **generateIndexes**(`seed`): `string`[]

Generates SQL index statements for system fields (status, created_at)
and indexable branch columns.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

The seed definition.

## Returns

`string`[]

An array of CREATE INDEX SQL statements.
