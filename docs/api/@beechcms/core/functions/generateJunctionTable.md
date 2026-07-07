[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / generateJunctionTable

# Function: generateJunctionTable()

> **generateJunctionTable**(`seed`, `branch`): `string`

Generates `CREATE TABLE IF NOT EXISTS rel_<seed>_<alias>` statement for a multi-relation branch.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

The parent seed definition.

### branch

[`Branch`](../interfaces/Branch.md)

The multi-relation branch definition.

## Returns

`string`

The CREATE TABLE SQL statement.

## Throws

If called on a non-multi-relation branch or if `targetSeed` is missing.
