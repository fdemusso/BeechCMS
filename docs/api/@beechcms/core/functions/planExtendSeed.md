[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / planExtendSeed

# Function: planExtendSeed()

> **planExtendSeed**(`seed`, `existingColumns`): [`ExtendPlan`](../interfaces/ExtendPlan.md)

Additive extension: given the columns that already exist on content_\{slug\}
(from PRAGMA table_info, passed in by the caller), return ONLY the statements
needed to add new branches — ADD COLUMN + indexes, plus junction tables for
new multi-relation branches. Never drops or renames.

FTS: SQLite cannot ALTER an fts5 table's columns. If a new text/richtext
searchable branch was added, ftsRebuildNeeded=true signals the caller
(sprint 03) to handle it — no DROP is emitted.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

### existingColumns

`Set`&lt;`string`&gt;

## Returns

[`ExtendPlan`](../interfaces/ExtendPlan.md)
