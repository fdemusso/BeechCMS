[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / planTagMigration

# Function: planTagMigration()

> **planTagMigration**(`seeds`): [`TagMigrationPlan`](../interfaces/TagMigrationPlan.md)

Computes what moving `seeds` to the 0.9 tags contract takes. Seeds that already comply produce no
step and no rewritten definition, so a clean database yields an empty plan (the operation is idempotent).

## Parameters

### seeds

readonly [`Seed`](../interfaces/Seed.md)[]

## Returns

[`TagMigrationPlan`](../interfaces/TagMigrationPlan.md)
