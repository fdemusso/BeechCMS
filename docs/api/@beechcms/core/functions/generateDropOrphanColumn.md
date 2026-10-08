[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / generateDropOrphanColumn

# Function: generateDropOrphanColumn()

> **generateDropOrphanColumn**(`seed`, `column`, `inDraftTable`): `string`[]

Returns the SQL statements that drop an orphan column: one left in the physical table after its
branch was removed from the definition. Removes the conventional filter indexes first, since
SQLite refuses to drop an indexed column.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

The seed definition (the column must not belong to it).

### column

`string`

The orphan column name.

### inDraftTable

`boolean`

Whether the draft table also holds the column.

## Returns

`string`[]

An array of SQL statements.
