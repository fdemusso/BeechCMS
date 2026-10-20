[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / activeClause

# Function: activeClause()

> **activeClause**(`seed`, `mode?`, `tableAlias?`): `string`

Returns ` AND <activeCondition>` for a soft-delete seed, or `''` otherwise.

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

`string`
