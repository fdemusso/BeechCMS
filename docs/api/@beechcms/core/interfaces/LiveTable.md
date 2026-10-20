[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / LiveTable

# Interface: LiveTable

The physical state of one table. `exists: false` means SQLite reports no such table.

## Properties

### columns

> **columns**: [`LiveColumn`](LiveColumn.md)[]

Physical order, as returned by `PRAGMA table_info` (cid order).

***

### exists

> **exists**: `boolean`

***

### foreignKeys

> **foreignKeys**: [`LiveForeignKey`](LiveForeignKey.md)[]

Sorted by `column`, then `targetTable`, for deterministic output.

***

### indexes

> **indexes**: [`LiveIndex`](LiveIndex.md)[]

Sorted by `name`.

***

### name

> **name**: `string`
