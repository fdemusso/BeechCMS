[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / generateAddDraftSnapshotColumn

# Function: generateAddDraftSnapshotColumn()

> **generateAddDraftSnapshotColumn**(`seed`): `string`

Generates the `ALTER TABLE content_{slug}_drafts ADD COLUMN live_snapshot_at INTEGER` statement
for a draft table provisioned before the column existed.

System column, not a branch — `generateAddColumn` iterates `seed.branches` and can never emit it.
NOT idempotent: `ADD COLUMN` fails when the column is already present and `ISchemaMutator.execDdl`
aborts the whole batch on the first failing statement, so the caller MUST check the physical
columns first (see `planExtendSeed`).

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

The seed definition. Caller must have verified `seed.allowDrafts`.

## Returns

`string`

The ALTER TABLE statement.
