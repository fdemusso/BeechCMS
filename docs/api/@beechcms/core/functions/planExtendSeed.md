[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / planExtendSeed

# Function: planExtendSeed()

> **planExtendSeed**(`seed`, `existingColumns`, `existingDraftColumns?`): [`ExtendPlan`](../interfaces/ExtendPlan.md)

Additive extension: given the columns that already exist on content_\{slug\}
(from PRAGMA table_info, passed in by the caller), return ONLY the statements
needed to add new branches — ADD COLUMN + indexes, plus junction tables for
new multi-relation branches. Never drops or renames.

FTS: SQLite cannot ALTER an fts5 table's columns. If a new text/richtext
searchable branch was added, ftsRebuildNeeded=true signals the caller
(sprint 03) to handle it — no DROP is emitted.

Draft tables: pass `existingDraftColumns` (PRAGMA table_info on content_\{slug\}_drafts) to have the
`live_snapshot_at` system column added retroactively; omit it to skip that check entirely.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

### existingColumns

`Set`&lt;`string`&gt;

### existingDraftColumns?

`Set`&lt;`string`&gt; \| `null`

## Returns

[`ExtendPlan`](../interfaces/ExtendPlan.md)
