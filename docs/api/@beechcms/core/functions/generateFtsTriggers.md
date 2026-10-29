[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / generateFtsTriggers

# Function: generateFtsTriggers()

> **generateFtsTriggers**(`seed`): `string`[]

Generates FTS5 triggers (insert, update, delete) to keep the FTS virtual table synchronized.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

The seed definition.

## Returns

`string`[]

An array of CREATE TRIGGER SQL statements.
