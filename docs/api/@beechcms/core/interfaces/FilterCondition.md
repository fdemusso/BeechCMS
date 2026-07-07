[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / FilterCondition

# Interface: FilterCondition

A single operator + value pair applied to a FilterGroup's column.

## Properties

### op

> **op**: [`FilterOperator`](../type-aliases/FilterOperator.md)

Operator to apply.

***

### value

> **value**: `string` \| `number` \| `boolean` \| `string`[] \| `number`[] \| `null`

Comparison value(s). Arrays are only meaningful for `in`/`not_in`/`has_any_tag`/`has_all_tags`.
