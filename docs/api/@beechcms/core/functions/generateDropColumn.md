[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / generateDropColumn

# Function: generateDropColumn()

> **generateDropColumn**(`seed`, `alias`): `string`[]

Returns the `DROP COLUMN` SQL statements for removing a single field.
Drops the junction table for multi-relations, or alters the tables to drop the column.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

The seed definition.

### alias

`string`

The alias of the branch to drop.

## Returns

`string`[]

An array of SQL statements.
