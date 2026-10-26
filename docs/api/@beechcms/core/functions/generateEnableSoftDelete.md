[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / generateEnableSoftDelete

# Function: generateEnableSoftDelete()

> **generateEnableSoftDelete**(`seed`): `string`[]

Additive statements that upgrade a table predating universal soft delete.

On a pre-existing table the inline `slug … UNIQUE` survives as a sqlite_autoindex that
SQLite cannot drop via ALTER; there the partial index is redundant, and the `_old_<ms>`
slug rename on soft delete is what frees the slug. Callers decide when to emit these.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

## Returns

`string`[]
