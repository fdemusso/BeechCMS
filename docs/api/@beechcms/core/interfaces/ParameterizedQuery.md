[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / ParameterizedQuery

# Interface: ParameterizedQuery

SQL string paired with its ordered parameter bindings, ready for a D1 `.bind(...)` call.

## Properties

### bindings

> **bindings**: (`string` \| `number` \| `boolean` \| `null`)[]

Values bound to the `?` placeholders, in order.

***

### sql

> **sql**: `string`

Parameterized SQL statement, using `?` placeholders.
