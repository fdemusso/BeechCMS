[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / toCsvCells

# Function: toCsvCells()

> **toCsvCells**(`record`, `columns`): (`string` \| `null`)[]

Projects an API-shaped record onto `columns` as CSV cells.
`null`/`undefined` become an empty field; booleans become `true`/`false`; everything else
is stringified. The record is expected to have already passed through `dbToApi`, so a
`date` branch arrives as a number and is written as its unix-seconds integer.

## Parameters

### record

[`TransferRecord`](../type-aliases/TransferRecord.md)

### columns

`string`[]

## Returns

(`string` \| `null`)[]
