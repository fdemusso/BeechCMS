[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / activeCondition

# Function: activeCondition()

> **activeCondition**(`seed`, `mode?`, `tableAlias?`): `string` \| `null`

Returns the SQL condition (e.g. `ce.deleted_at IS NULL`), or `null` if the
seed does not use soft delete or mode is 'any'.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

The seed schema definition.

### mode?

[`TrashedMode`](../type-aliases/TrashedMode.md) = `'active'`

'active' (default), 'trashed', or 'any'.

### tableAlias?

`string`

Optional table or alias qualifier prefix.

## Returns

`string` \| `null`
