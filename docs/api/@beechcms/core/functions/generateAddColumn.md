[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / generateAddColumn

# Function: generateAddColumn()

> **generateAddColumn**(`seed`, `branch`): `string`

Generates the SQL `ALTER TABLE content_{slug} ADD COLUMN {alias} {type}` statement.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

The seed definition.

### branch

[`Branch`](../interfaces/Branch.md)

The branch definition for the new column.

## Returns

`string`

The ALTER TABLE SQL statement.
