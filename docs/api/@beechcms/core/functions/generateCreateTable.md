[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / generateCreateTable

# Function: generateCreateTable()

> **generateCreateTable**(`seed`): `string`

Generates the SQL `CREATE TABLE IF NOT EXISTS content_{slug}` statement
with system columns and one column per branch.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

The seed definition.

## Returns

`string`

The CREATE TABLE SQL statement.
