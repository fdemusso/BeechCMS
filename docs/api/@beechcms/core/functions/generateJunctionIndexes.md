[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / generateJunctionIndexes

# Function: generateJunctionIndexes()

> **generateJunctionIndexes**(`seed`, `branch`): `string`[]

Generates the two B-tree indexes for a junction table:
one on `parent_id` (listing entries by parent) and one on `target_id` (handling cascade checks from target side).

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

The parent seed definition.

### branch

[`Branch`](../interfaces/Branch.md)

The multi-relation branch definition.

## Returns

`string`[]

An array of CREATE INDEX SQL statements.
