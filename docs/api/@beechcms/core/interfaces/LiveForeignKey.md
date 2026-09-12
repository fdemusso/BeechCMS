[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / LiveForeignKey

# Interface: LiveForeignKey

One foreign-key constraint on a physical table.

## Properties

### column

> **column**: `string`

Local column carrying the reference.

***

### onDelete

> **onDelete**: `string`

Upper-cased, e.g. `SET NULL`.

***

### onUpdate

> **onUpdate**: `string`

Upper-cased, e.g. `NO ACTION`.

***

### targetColumn

> **targetColumn**: `string`

Referenced column, e.g. `id`.

***

### targetTable

> **targetTable**: `string`

Referenced table, e.g. `content_team`.
