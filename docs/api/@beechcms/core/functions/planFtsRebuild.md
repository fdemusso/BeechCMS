[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / planFtsRebuild

# Function: planFtsRebuild()

> **planFtsRebuild**(`seed`): `string`[]

Destructive FTS rebuild (sprint 06). SQLite cannot ALTER an fts5 table's
columns, so when a searchable branch is added, renamed, retyped, or dropped
the only correct fix is to drop and recreate the `fts_{slug}` virtual table
(and its insert/update/delete triggers), then backfill from `content_{slug}`.

Returns an empty array when the seed has no searchable branches — in that
case the caller should instead drop any leftover FTS table via
generateDropTable's FTS statements. The returned statements are destructive
and must run through ISchemaMutator.execDestructive, never execDdl.

Order: drop triggers → drop fts table → recreate table → recreate triggers →
backfill existing rows.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

## Returns

`string`[]
