[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / findTagOrphans

# Function: findTagOrphans()

> **findTagOrphans**(`executor`, `plan`, `originals`): `Promise`&lt;[`TagOrphan`](../interfaces/TagOrphan.md)[]&gt;

Reads, before anything is changed, the stored values the new vocabulary would not contain. They are
reported, never deleted or rewritten: the operator decides whether to add an option or fix the rows.
Read-only (`SELECT` through the injected executor).

## Parameters

### executor

[`SchemaQueryExecutor`](../interfaces/SchemaQueryExecutor.md)

### plan

[`TagMigrationPlan`](../interfaces/TagMigrationPlan.md)

### originals

readonly [`Seed`](../interfaces/Seed.md)[]

## Returns

`Promise`&lt;[`TagOrphan`](../interfaces/TagOrphan.md)[]&gt;
