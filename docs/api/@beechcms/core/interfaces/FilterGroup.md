[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / FilterGroup

# Interface: FilterGroup

## Properties

### column

> **column**: `string`

Column name: system column (id/slug/status/created_at/updated_at) or branch alias.

***

### conditions

> **conditions**: [`FilterCondition`](FilterCondition.md)[]

Conditions applied to this column, ANDed together.

***

### type

> **type**: [`FilterType`](../type-aliases/FilterType.md)

Declared type of the column, used to normalize condition values.
