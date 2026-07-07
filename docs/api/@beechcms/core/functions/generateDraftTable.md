[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / generateDraftTable

# Function: generateDraftTable()

> **generateDraftTable**(`seed`): `string` \| `null`

Generates the SQL `CREATE TABLE IF NOT EXISTS content_{slug}_drafts` statement
for seeds that allow drafts.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

The seed definition.

## Returns

`string` \| `null`

The draft table CREATE TABLE SQL statement, or null if drafts are disabled.
