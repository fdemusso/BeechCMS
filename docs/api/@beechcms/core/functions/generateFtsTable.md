[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / generateFtsTable

# Function: generateFtsTable()

> **generateFtsTable**(`seed`): `string` \| `null`

Generates the FTS5 virtual table definition for indexable text/richtext branches.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

The seed definition.

## Returns

`string` \| `null`

The CREATE VIRTUAL TABLE SQL statement, or null if no branches are indexable.
