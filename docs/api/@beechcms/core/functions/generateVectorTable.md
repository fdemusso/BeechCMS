[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / generateVectorTable

# Function: generateVectorTable()

> **generateVectorTable**(`seed`): `string` \| `null`

Generates the SQL `CREATE TABLE IF NOT EXISTS vector_{slug}` statement
for indexable text/richtext branches.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

The seed definition.

## Returns

`string` \| `null`

The CREATE TABLE SQL statement, or null if no branches are indexable.
