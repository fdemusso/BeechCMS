[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / auditRelationStorage

# Function: auditRelationStorage()

> **auditRelationStorage**(`executor`, `seeds`): `Promise`&lt;[`RelationStorageFinding`](../interfaces/RelationStorageFinding.md)[]&gt;

Compares every relation branch of the given (active) seeds against the physical tables.

Seeds whose `content_<slug>` table is missing are skipped: that is plain schema drift and is
reported by the schema diff, not a relation-storage mismatch. Findings are ordered by seed, then
branch order, so the report is deterministic.

## Parameters

### executor

[`SchemaQueryExecutor`](../interfaces/SchemaQueryExecutor.md)

### seeds

[`Seed`](../interfaces/Seed.md)[]

## Returns

`Promise`&lt;[`RelationStorageFinding`](../interfaces/RelationStorageFinding.md)[]&gt;
