[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / generateRetypeIncompatibleCount

# Function: generateRetypeIncompatibleCount()

> **generateRetypeIncompatibleCount**(`seed`, `branch`): `string`[]

Returns `SELECT COUNT(*)` statements counting rows whose current value would be silently altered
(zeroed or truncated) by the `CAST` in [generateRetypeColumn](generateRetypeColumn.md). Empty when the target type
is lossless for any input (`TEXT`).

A text value is convertible only if it is a complete JSON number; `CAST` alone accepts trailing garbage.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

The seed definition.

### branch

[`Branch`](../interfaces/Branch.md)

The target branch definition (carrying the new type).

## Returns

`string`[]

An array of SQL statements, each yielding a single `count` column.

## Throws

If called on a multi-relation branch.
