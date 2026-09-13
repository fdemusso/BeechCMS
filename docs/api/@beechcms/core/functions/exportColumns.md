[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / exportColumns

# Function: exportColumns()

> **exportColumns**(`seed`): `string`[]

The ordered column projection for exporting `seed`: system columns, then one column per
scalar branch in declaration order. Non-flat branches are omitted — this projection is
only ever used for CSV, and `checkFormatCompatibility` has already refused a seed that
has any. NDJSON export emits the record whole and does not call this.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

## Returns

`string`[]
