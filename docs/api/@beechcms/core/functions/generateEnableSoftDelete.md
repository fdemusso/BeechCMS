[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / generateEnableSoftDelete

# Function: generateEnableSoftDelete()

> **generateEnableSoftDelete**(`seed`): `string`[]

Additive statements that turn soft delete on for a table that already exists.

The partial unique index is emitted for correctness on tables that were CREATED with
`softDelete: true`. On a pre-existing table the inline `slug … UNIQUE` survives as a
sqlite_autoindex that SQLite cannot drop via ALTER; there the partial index is redundant
and a trashed slug stays reserved until the table is rebuilt (see ROADMAP deferral).
Returns [] when the seed does not opt in.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

## Returns

`string`[]
