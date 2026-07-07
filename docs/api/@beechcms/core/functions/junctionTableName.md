[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / junctionTableName

# Function: junctionTableName()

> **junctionTableName**(`seedSlug`, `branchAlias`): `string`

Returns the junction table name for a many-to-many relation branch.
Format: `rel_<seedSlug>_<branchAlias>`.

## Parameters

### seedSlug

`string`

The slug of the parent Seed.

### branchAlias

`string`

The alias of the relation branch.

## Returns

`string`

The junction table name.
