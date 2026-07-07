[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / generateJunctionDraftTable

# Function: generateJunctionDraftTable()

> **generateJunctionDraftTable**(`seed`, `branch`): `string` \| `null`

Generates the drafts junction table `rel_<seed>_<alias>_drafts` for a many-to-many relation branch.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

The parent seed definition.

### branch

[`Branch`](../interfaces/Branch.md)

The multi-relation branch definition.

## Returns

`string` \| `null`

The CREATE TABLE SQL statement, or null if drafts are disabled.
