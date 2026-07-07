[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / nextBranchId

# Function: nextBranchId()

> **nextBranchId**(`seed`): `string`

Returns the next free branch id for a seed in the form `br_NN` (zero-padded to 2,
growing as needed). Scans existing ids, never reuses a number already present —
even if a branch was removed, its id is not recycled (ids must be globally stable
for the life of the seed so layouts/automations/FTS triggers never collide).

## Parameters

### seed

`Pick`&lt;[`Seed`](../interfaces/Seed.md), `"branches"`&gt;

## Returns

`string`
