[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / generateRenameColumn

# Function: generateRenameColumn()

> **generateRenameColumn**(`seed`, `from`, `to`): `string`[]

Returns the `RENAME COLUMN` SQL statements for renaming a field's alias.
For a multi-relation branch, renames the junction table (+ drafts junction table) instead.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

The seed definition.

### from

`string`

The old alias.

### to

`string`

The new alias.

## Returns

`string`[]

An array of SQL statements.
