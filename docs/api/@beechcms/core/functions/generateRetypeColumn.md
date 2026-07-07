[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / generateRetypeColumn

# Function: generateRetypeColumn()

> **generateRetypeColumn**(`seed`, `branch`): `string`[]

Returns the statements that change a column's SQL type in place using CAST, bypassing SQLite rebuild limitations.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

The seed definition.

### branch

[`Branch`](../interfaces/Branch.md)

The target branch definition (carrying the new type).

## Returns

`string`[]

An array of SQL statements.

## Throws

If called on a multi-relation branch.
