[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / generateDropTable

# Function: generateDropTable()

> **generateDropTable**(`seed`): `string`[]

Returns every `DROP TABLE IF EXISTS` needed to fully remove a content type:
the main table, the drafts table (if drafts enabled), full-text search table/triggers, and junction tables.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

The seed definition.

## Returns

`string`[]

An array of DROP TABLE / DROP TRIGGER SQL statements.
