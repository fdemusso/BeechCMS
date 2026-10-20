[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / tagMigrationStatements

# Function: tagMigrationStatements()

> **tagMigrationStatements**(`plan`, `originals`): `string`[]

The statements that carry the plan out, in execution order: stored values first, then the seed
definitions, then the registry-version bump that tells every isolate to rebuild its cached registry.
Value wrapping touches the live table and, when drafts are on, the drafts table.

`originals` are the definitions the plan was computed from (the physical tables are named after them).

## Parameters

### plan

[`TagMigrationPlan`](../interfaces/TagMigrationPlan.md)

### originals

readonly [`Seed`](../interfaces/Seed.md)[]

## Returns

`string`[]
